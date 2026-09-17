// Frontend twin of functions/phone.js — kept in sync intentionally rather
// than shared via import, since the two run in different module systems
// (this is bundled ESM, the function is CommonJS). Used both to validate a
// contact's number before it's saved to Firestore and to normalize numbers
// for the client-side `sms:` fallback link.
export function normalizePhoneE164(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const rest = trimmed.slice(1).replace(/\D/g, '');
    return /^\d{10,15}$/.test(rest) ? `+${rest}` : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}
