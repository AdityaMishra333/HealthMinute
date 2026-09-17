const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const twilio = require('twilio');
const { normalizePhoneE164 } = require('./phone');

initializeApp();

// Explicit rather than relying on the implicit default (which happens to
// also be us-central1) — the frontend's getFunctions(app, 'us-central1')
// call in src/firebase.js must always match this. Changing one without the
// other 404s silently, since httpsCallable just looks for a function that
// doesn't exist in the region it's pointed at.
const REGION = 'us-central1';
setGlobalOptions({ region: REGION, maxInstances: 10 });

// Set with, e.g.:
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
//   firebase functions:secrets:set TWILIO_FROM_NUMBER
// These live in Google Cloud Secret Manager — never in this repo, never in
// the client bundle, and never typed anywhere but your own terminal.
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioFromNumber = defineSecret('TWILIO_FROM_NUMBER');

// Callable from the client via httpsCallable(functions, 'sendSosAlert').
// Firebase verifies the caller's ID token for us — request.auth is only
// ever populated for a genuinely signed-in user.
exports.sendSosAlert = onCall(
  { secrets: [twilioAccountSid, twilioAuthToken, twilioFromNumber] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to send an SOS alert.');
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    const userSnap = await db.doc(`users/${uid}`).get();
    const userData = userSnap.data() ?? {};

    // Contacts are read server-side from Firestore, not trusted from the
    // client payload — a caller can only ever alert numbers they themselves
    // already saved to their own account.
    const contacts = Array.isArray(userData.emergencyContacts) ? userData.emergencyContacts : [];
    if (contacts.length === 0) {
      throw new HttpsError('failed-precondition', 'No emergency contacts saved.');
    }

    const { latitude, longitude, alertId } = request.data ?? {};
    if (typeof alertId !== 'string' || alertId.length < 8) {
      throw new HttpsError('invalid-argument', 'A valid alertId is required.');
    }

    // Callable functions can still be redelivered by the platform or retried
    // by a flaky client, and this call has a real-world side effect (a
    // billed SMS actually leaving Twilio) that must not repeat on a replay.
    // The client mints one alertId per SOS press; this doc is the lock —
    // whichever invocation creates it first is the one that actually sends,
    // every later delivery of the *same* alertId replays that outcome
    // instead of hitting Twilio again.
    const alertRef = db.doc(`sosAlerts/${alertId}`);
    const existing = await db.runTransaction(async (tx) => {
      const snap = await tx.get(alertRef);
      if (snap.exists) return snap.data();
      tx.set(alertRef, { uid, status: 'sending', createdAt: FieldValue.serverTimestamp() });
      return null;
    });

    if (existing) {
      if (existing.status === 'sending') {
        throw new HttpsError('aborted', 'This alert is already being sent.');
      }
      if (existing.ok) return existing.result;
      throw new HttpsError('internal', existing.result?.details?.[0]?.error || 'Twilio rejected every message.', {
        details: existing.result?.details,
      });
    }

    const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';
    const locationLine = hasLocation
      ? ` My location: https://www.google.com/maps?q=${latitude},${longitude}`
      : '';
    const reporterName = userData.fullName || userData.email || 'a HealthMinute user';
    const body = `SOS from ${reporterName} — I may have been in an accident and need help.${locationLine}`;

    const client = twilio(twilioAccountSid.value(), twilioAuthToken.value());
    const from = twilioFromNumber.value();

    // Contacts can be stored in whatever format the user typed (10-digit
    // local, 0-prefixed, already-E.164, ...) — normalize to strict E.164
    // here so Twilio doesn't reject the whole message with 21211. Anything
    // that can't be confidently normalized is skipped rather than sent
    // malformed, and still reported back as a failed contact so it's visible.
    const validContacts = contacts.filter((c) => c?.phone);
    const withE164 = validContacts.map((c) => ({ ...c, e164: normalizePhoneE164(c.phone) }));
    const sendable = withE164.filter((c) => c.e164);
    const unnormalizable = withE164.filter((c) => !c.e164);

    // On a Twilio trial account, only numbers verified in the Twilio
    // Console can actually receive a message — everything else rejects
    // with error 21608. Reporting per-contact detail (not just a total)
    // means you can see exactly which contact needs verifying, rather than
    // a single opaque failure for the whole batch.
    const settled = await Promise.allSettled(
      sendable.map((c) => client.messages.create({ to: c.e164, from, body }))
    );

    const details = [
      ...settled.map((r, i) => ({
        name: sendable[i].name,
        phone: sendable[i].phone,
        ok: r.status === 'fulfilled',
        code: r.status === 'rejected' ? r.reason?.code ?? null : null,
        error: r.status === 'rejected' ? r.reason?.message || 'Unknown error' : null,
      })),
      ...unnormalizable.map((c) => ({
        name: c.name,
        phone: c.phone,
        ok: false,
        code: null,
        error: 'Could not recognize this as a valid phone number.',
      })),
    ];

    const sent = details.filter((d) => d.ok).length;
    const failed = details.length - sent;
    const result = { sent, failed, total: details.length, details };
    const ok = sent > 0;

    await alertRef.set({ status: 'complete', ok, result, completedAt: FieldValue.serverTimestamp() }, { merge: true });

    if (!ok) {
      throw new HttpsError('internal', details[0]?.error || 'Twilio rejected every message.', { details });
    }

    return result;
  }
);
