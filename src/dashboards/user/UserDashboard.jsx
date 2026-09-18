import { useState, useRef, useEffect, useMemo } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../../firebase';
import { analyzeAccidentPhoto } from '../../shared/geminiVision';
import { getFirstAidGuidance } from '../../shared/chatbot';
import { listenForSOS } from '../../shared/speechRecognition';
import { normalizePhoneE164 } from '../../shared/phone';
import { haversineKm } from '../../shared/geo';
import { playBuzzer } from '../../shared/buzzer';
import TrackerPanel from '../../shared/TrackerPanel';
import AmbulanceTracker from '../../shared/AmbulanceTracker';
import ElapsedTime from '../../shared/ElapsedTime';
import Skeleton from '../../shared/Skeleton';
import MapBackdrop from '../../shared/MapBackdrop';
import {
  IconPin,
  IconCamera,
  IconMic,
  IconChat,
  IconAlert,
  IconCheck,
  IconLogout,
  IconHome,
  IconBell,
  IconLocationOff,
  IconWifiOff,
  IconUsers,
  IconClose,
  IconChevronDown,
  IconNavigate,
  IconAmbulance,
  IconHospital,
  IconArrowLeft,
} from '../../shared/Icons';
import './UserDashboard.css';

const PHOTO_MAX_WIDTH = 600;
const PHOTO_JPEG_QUALITY = 0.6;

// A simple single-tier fare estimate — base fare plus a flat per-km rate on
// top of the haversine pickup-to-hospital distance. Deliberately not a real
// pricing engine (no surge, no vehicle tiers): this is a prototype estimate,
// clearly labelled as such wherever it's shown.
const BOOKING_BASE_FARE_INR = 150;
const BOOKING_PER_KM_RATE_INR = 25;

function estimateFare(distanceKm) {
  return Math.round(BOOKING_BASE_FARE_INR + distanceKm * BOOKING_PER_KM_RATE_INR);
}

// How close another user's unaccepted report has to be before this device
// gets buzzed about it — a bystander-alert radius, not a medical response
// radius, so it's kept fairly tight.
const NEARBY_RADIUS_KM = 3;

// Resizes to at most PHOTO_MAX_WIDTH wide (never upscales a smaller image)
// and re-encodes as JPEG at PHOTO_JPEG_QUALITY, entirely client-side via
// canvas. Small enough to store directly on the Firestore document instead
// of a separate Storage upload.
function compressImageToDataUrl(file, maxWidth = PHOTO_MAX_WIDTH, quality = PHOTO_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load the image for compression'));
    };

    img.src = objectUrl;
  });
}

// The `sms:` URI's recipient/body separator differs by platform — iOS wants
// `&body=`, everything else wants `?body=`. Best-effort; there's no way for
// a webpage to detect this with certainty, only guess from the UA string.
function smsUriFor(numbers, message) {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';
  return `sms:${numbers.join(',')}${separator}body=${encodeURIComponent(message)}`;
}

function buildSosMessage(location) {
  const base = 'SOS — I may have been in an accident and need help.';
  if (!location) return base;
  return `${base} My location: https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

// Twilio error codes worth naming specifically — the rest just fall back to
// whatever message Twilio sent, which is usually readable enough on its own.
const TWILIO_ERROR_MESSAGES = {
  21608: 'not verified with Twilio (trial accounts can only message verified numbers)',
  21211: 'invalid phone number format',
  21610: 'unsubscribed from messages (replied STOP)',
  21614: 'not a valid mobile number',
};

function describeTwilioFailure(detail) {
  if (detail.code && TWILIO_ERROR_MESSAGES[detail.code]) return TWILIO_ERROR_MESSAGES[detail.code];
  return detail.error || 'delivery failed';
}

function FirstAidCard({ innerRef, question, onQuestionChange, answer, loading, onSubmit }) {
  return (
    <div className="card dt-card" ref={innerRef}>
      <p className="card-title">
        <IconChat size={16} /> First-aid assistant
      </p>
      <form onSubmit={onSubmit} className="dt-assist-form">
        <input
          type="text"
          className="input"
          placeholder="e.g. bleeding won't stop, what do I do?"
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          <IconChat size={15} /> {loading ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {answer && <p className="status-line" style={{ marginTop: '10px' }}>{answer}</p>}
    </div>
  );
}

function EmergencyContactsCard({
  innerRef,
  contacts,
  name,
  onNameChange,
  phone,
  onPhoneChange,
  phoneError,
  saving,
  onAdd,
  onRemove,
}) {
  return (
    <div className="card dt-card dt-card-contacts" ref={innerRef}>
      <p className="card-title">
        <IconUsers size={16} /> Emergency contacts
      </p>
      <p className="dt-contacts-hint">
        The people below get an SOS text — with your location — whenever you tap the SOS button.
      </p>

      {contacts.length > 0 && (
        <ul className="dt-contacts-list">
          {contacts.map((c) => (
            <li key={c.id} className="dt-contacts-item">
              <span className="dt-contacts-item-name">{c.name}</span>
              <span className="dt-contacts-item-phone tnum">{c.phone}</span>
              <button
                type="button"
                className="dt-contacts-remove"
                onClick={() => onRemove(c.id)}
                aria-label={`Remove ${c.name}`}
              >
                <IconClose size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="dt-contacts-form">
        <input
          type="text"
          className="input"
          placeholder="Name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <input
          type="tel"
          className={`input${phoneError ? ' input-invalid' : ''}`}
          placeholder="Phone number"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          aria-invalid={phoneError ? 'true' : undefined}
          aria-describedby={phoneError ? 'contact-phone-error' : undefined}
        />
        {phoneError && (
          <p id="contact-phone-error" className="dt-contacts-phone-error">
            {phoneError}
          </p>
        )}
        <button className="btn btn-ghost btn-block" type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add contact'}
        </button>
      </form>
    </div>
  );
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

// A booking's lifecycle is simpler than an accident's — no hospital-
// acceptance step — so it gets its own small label helper rather than
// forcing it through trackingStatus.js's accident-shaped step list.
function bookingStatusLabel(booking) {
  if (booking.status === 'arrived') return 'AMBULANCE ARRIVED';
  if (booking.status === 'accepted_by_driver') return 'AMBULANCE EN ROUTE';
  return 'AWAITING DRIVER';
}

// A stack of nearby-bystander alerts — someone else's unaccepted report
// close enough that this user could plausibly help or should just be
// aware. Deliberately uses the reserved critical-red tone: this is exactly
// the "active, unaccepted emergency" meaning that colour is reserved for.
function NearbyAlertBanner({ alerts, onDismiss, onNavigate }) {
  if (alerts.length === 0) return null;

  return (
    <div className="dt-nearby-alerts-wrap">
      {alerts.map((a) => (
        <div key={a.id} className="dt-nearby-alert" role="alert">
          <div className="dt-nearby-alert-head">
            <IconAlert size={16} />
            <span className="dt-nearby-alert-title">Accident reported nearby</span>
            <button
              type="button"
              className="dt-nearby-alert-dismiss"
              onClick={() => onDismiss(a.id)}
              aria-label="Dismiss"
            >
              <IconClose size={12} />
            </button>
          </div>
          <p className="dt-nearby-alert-distance tnum">{formatDistance(a.distanceKm)}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm btn-block"
            onClick={() => onNavigate(a.latitude, a.longitude)}
          >
            <IconNavigate size={15} /> Navigate to accident
          </button>
        </div>
      ))}
    </div>
  );
}

// The Uber/Ola-style tracking sheet — pops up from the bottom the instant a
// report exists (not while just capturing location beforehand), and stays
// there through the whole tracking lifecycle: a single "your location" pin
// while waiting for a responder, upgrading to the full ambulance tracker
// (two markers, route line, live ETA) the moment one is assigned.
function TrackingSheet({ accident, collapsed, onToggleCollapse, onEtaChange }) {
  const hasAmbulance =
    !!accident.ambulanceLocation && (accident.status === 'accepted_by_driver' || accident.status === 'arrived');

  return (
    <div className={`dt-tracking-sheet ${collapsed ? 'is-collapsed' : ''}`}>
      <button
        type="button"
        className="dt-tracking-sheet-handle"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand tracking map' : 'Collapse tracking map'}
      >
        <span className="dt-tracking-sheet-grip" />
        <span className="dt-tracking-sheet-label">
          <IconPin size={13} />
          {hasAmbulance ? 'Ambulance tracking' : 'Your reported location'}
        </span>
        <IconChevronDown size={16} className={`dt-tracking-sheet-chevron ${collapsed ? 'is-flipped' : ''}`} />
      </button>

      {!collapsed && (
        <div className="dt-tracking-sheet-body">
          {hasAmbulance ? (
            <AmbulanceTracker
              accident={accident}
              onEtaChange={onEtaChange}
              className="dt-tracking-sheet-ambulance"
            />
          ) : (
            <div className="dt-tracking-sheet-waiting">
              <iframe
                className="dt-tracking-sheet-frame"
                title="Your reported location"
                src={`https://www.google.com/maps?q=${accident.latitude},${accident.longitude}&z=15&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <p className="dt-tracking-sheet-waiting-text">Waiting for a nearby hospital or driver to respond…</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserDashboard() {
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const [chatQuestion, setChatQuestion] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [sosListening, setSosListening] = useState(false);
  const [sosMessage, setSosMessage] = useState('');

  const [mapMinimized, setMapMinimized] = useState(false);
  const [trackingEta, setTrackingEta] = useState(null);

  // Which full-screen page is showing — 'home' (capture location/photo,
  // voice SOS, contacts) or 'tracking' (the ambulance-en-route view). Kept
  // as its own state rather than derived straight from activeReport so the
  // user can navigate back to 'home' via the nav bar even while a report is
  // still active, instead of being stuck on the tracking view with no way
  // back — activeReport still decides what tracking has to *show*, not
  // which page is currently open.
  const [view, setView] = useState('home');
  const initialViewSetRef = useRef(false);

  const [activeReport, setActiveReport] = useState(null);
  const [activeReportLoading, setActiveReportLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const [contacts, setContacts] = useState([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactPhoneError, setContactPhoneError] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [sosToast, setSosToast] = useState('');
  const sosToastTimerRef = useRef(null);
  // The final outcome of an SOS send (success/partial/error) — separate from
  // sosToast, which only ever carries transient "in progress" text. This one
  // persists on partial/error so a failure can never be missed or mistaken
  // for a success that just scrolled by.
  const [sosResult, setSosResult] = useState(null);
  const sosResultTimerRef = useRef(null);

  const [chatOpen, setChatOpen] = useState(false);
  const chatWidgetRef = useRef(null);

  const sosRef = useRef(null);
  const contactsRef = useRef(null);

  // Bystander alerts — other users' unaccepted reports close enough to this
  // device to be worth surfacing. reportedAccidents mirrors Firestore
  // directly; myLiveLocation is a coarse, low-power fix used only for the
  // distance check, entirely separate from the high-accuracy `location`
  // captured when this user files their own report.
  const [reportedAccidents, setReportedAccidents] = useState([]);
  const [myLiveLocation, setMyLiveLocation] = useState(null);
  const [dismissedNearbyIds, setDismissedNearbyIds] = useState(() => new Set());
  const buzzedNearbyIdsRef = useRef(new Set());

  // Non-emergency ambulance booking — a separate flow, collection, and
  // status thread from the accident-report flow above. pickupLocation
  // defaults from myLiveLocation but can be refreshed independently.
  const [bookingHospitals, setBookingHospitals] = useState([]);
  const [pickupLocation, setPickupLocation] = useState(null);
  const [pickupLocating, setPickupLocating] = useState(false);
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);
  const [activeBookingLoading, setActiveBookingLoading] = useState(true);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'accidents'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mine = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => a.status !== 'resolved')
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setActiveReport(mine[0] ?? null);
      setActiveReportLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Every currently-unaccepted report from any user — filtered down to
  // "nearby" below. Independent of activeReport above, which only ever
  // looks at this user's own reports.
  useEffect(() => {
    const q = query(collection(db, 'accidents'), where('status', '==', 'reported'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReportedAccidents(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  // A coarse, low-power location fix purely for the nearby-alert distance
  // check — deliberately separate from the high-accuracy `location` state
  // used when this user files their own report, so bystander alerts work
  // without ever requiring the user to start a report themselves. Quietly
  // does nothing if permission is denied; this is a bonus awareness feature,
  // not something the rest of the app depends on.
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setMyLiveLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Derived, not stored: recomputes whenever the raw report list, the
  // location fix, or a dismissal changes — no need to mirror it into its
  // own state.
  const nearbyAlerts = useMemo(() => {
    if (!myLiveLocation) return [];
    return reportedAccidents
      .filter((a) => a.userId !== auth.currentUser.uid && !dismissedNearbyIds.has(a.id))
      .map((a) => ({ ...a, distanceKm: haversineKm(myLiveLocation, a) }))
      .filter((a) => a.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [reportedAccidents, myLiveLocation, dismissedNearbyIds]);

  // The one genuine side effect here — buzzes once per accident the moment
  // it first qualifies as nearby, tracked in a ref so it never repeats for
  // the same accident on every subsequent location tick.
  useEffect(() => {
    const freshlyNearby = nearbyAlerts.filter((a) => !buzzedNearbyIdsRef.current.has(a.id));
    if (freshlyNearby.length > 0) {
      freshlyNearby.forEach((a) => buzzedNearbyIdsRef.current.add(a.id));
      playBuzzer();
    }
  }, [nearbyAlerts]);

  const handleDismissNearbyAlert = (id) => {
    setDismissedNearbyIds((prev) => new Set([...prev, id]));
  };

  const handleNavigateToNearby = (latitude, longitude) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
  };

  // Candidate destination hospitals for a booking — same shape and query
  // the driver dashboard already uses to recommend a hospital.
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'hospital'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookingHospitals(
        snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((h) => h.latitude != null && h.longitude != null)
      );
    });
    return () => unsubscribe();
  }, []);

  // This user's own non-final booking, mirroring the activeReport pattern
  // above but against the separate `bookings` collection.
  useEffect(() => {
    const q = query(collection(db, 'bookings'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mine = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((b) => b.status !== 'resolved' && b.status !== 'cancelled')
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setActiveBooking(mine[0] ?? null);
      setActiveBookingLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Seed pickup from the passive nearby-alert location fix the first time
  // it becomes available, so the booking form isn't blocked on its own
  // separate location prompt when a perfectly good fix already exists.
  useEffect(() => {
    if (myLiveLocation && !pickupLocation) setPickupLocation(myLiveLocation);
  }, [myLiveLocation, pickupLocation]);

  const handleCapturePickupLocation = () => {
    setPickupLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickupLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setPickupLocating(false);
      },
      () => setPickupLocating(false),
      { enableHighAccuracy: true }
    );
  };

  const bookingHospitalsWithDistance = useMemo(() => {
    if (!pickupLocation) return [];
    return bookingHospitals
      .map((h) => ({ ...h, distanceKm: haversineKm(pickupLocation, h) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [bookingHospitals, pickupLocation]);

  const selectedBookingHospital = bookingHospitalsWithDistance.find((h) => h.id === selectedHospitalId) ?? null;
  const bookingFareEstimate = selectedBookingHospital ? estimateFare(selectedBookingHospital.distanceKm) : null;

  const handleConfirmBooking = async () => {
    if (!pickupLocation || !selectedBookingHospital) return;

    setBookingSaving(true);
    setBookingError('');
    try {
      await addDoc(collection(db, 'bookings'), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        destinationHospitalId: selectedBookingHospital.id,
        destinationHospitalName: selectedBookingHospital.hospitalName || 'Unnamed hospital',
        destinationLatitude: selectedBookingHospital.latitude,
        destinationLongitude: selectedBookingHospital.longitude,
        distanceKm: selectedBookingHospital.distanceKm,
        fare: bookingFareEstimate,
        status: 'reported',
        createdAt: serverTimestamp(),
      });
      setSelectedHospitalId(null);
    } catch (err) {
      setBookingError('Could not create the booking: ' + err.message);
    }
    setBookingSaving(false);
  };

  const handleCancelBooking = async () => {
    if (!activeBooking) return;
    await updateDoc(doc(db, 'bookings', activeBooking.id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
    });
  };

  // Land on the tracking page automatically only once, the first time we
  // learn whether a report is already active (e.g. reloading mid-emergency)
  // — after that, the user's own nav-bar choice always wins.
  useEffect(() => {
    if (activeReportLoading || initialViewSetRef.current) return;
    initialViewSetRef.current = true;
    if (activeReport) setView('tracking');
  }, [activeReportLoading, activeReport]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      setContacts(snap.data()?.emergencyContacts ?? []);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (sosToastTimerRef.current) clearTimeout(sosToastTimerRef.current);
      if (sosResultTimerRef.current) clearTimeout(sosResultTimerRef.current);
    };
  }, []);

  // Close the chat popover on an outside click or Escape — standard
  // behaviour for this kind of floating toggle panel.
  useEffect(() => {
    if (!chatOpen) return undefined;

    const handleClickOutside = (e) => {
      if (chatWidgetRef.current && !chatWidgetRef.current.contains(e.target)) {
        setChatOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setChatOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [chatOpen]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const handleContactPhoneChange = (value) => {
    setContactPhone(value);
    if (contactPhoneError) setContactPhoneError('');
  };

  const scrollToRef = (target) => {
    target?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopyTrackingLink = async () => {
    const link = `${window.location.origin}/track/${activeReport.id}`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  };

  const handleGetLocation = () => {
    setLocating(true);
    setLocationDenied(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setError('');
        setLocating(false);
      },
      (err) => {
        setError('Could not get your location: ' + err.message);
        setLocationDenied(err.code === err.PERMISSION_DENIED);
        setLocating(false);
      }
    );
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPhoto(file);
    setAnalysis(null);
    setPhotoPreview(null);

    // Compressed client-side (max 600px wide, JPEG ~0.6 quality) — small
    // enough to store directly on the Firestore document, no Storage
    // upload needed. This is also what gets submitted as photoURL below.
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoPreview(compressed);
    } catch (err) {
      console.error('Photo compression failed:', err);
    }

    // Vision analysis runs on the original, uncompressed file.
    setAnalyzing(true);
    try {
      const result = await analyzeAccidentPhoto(file);
      setAnalysis(result);
    } catch (err) {
      console.error('Photo analysis failed:', err);
      setAnalysis({ severity: null, genuine: 'uncertain', summary: 'Could not analyze photo automatically.' });
    }
    setAnalyzing(false);
  };

  const handleReportAccident = async () => {
    if (!location) {
      setError('Capture your location first');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'accidents'), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        latitude: location.latitude,
        longitude: location.longitude,
        photoURL: photoPreview ?? null,
        severity: analysis?.severity ?? null,
        genuine: analysis?.genuine ?? 'not_analyzed',
        summary: analysis?.summary ?? '',
        status: 'reported',
        createdAt: serverTimestamp(),
      });

      setSuccess('Accident reported. Help is on the way.');
      setLocation(null);
      setPhoto(null);
      setPhotoPreview(null);
      setAnalysis(null);
      setError('');
      setMapMinimized(false); // the tracking sheet should start expanded
      setView('tracking'); // move to the ambulance-en-route page right away
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError('Could not submit the report: ' + err.message);
    }
    setLoading(false);
  };

  const handleAskChatbot = async (e) => {
    e.preventDefault();
    if (!chatQuestion.trim()) return;

    setChatLoading(true);
    setChatAnswer('');
    try {
      const answer = await getFirstAidGuidance(chatQuestion);
      setChatAnswer(answer);
    } catch (err) {
      console.error('First-aid assistant request failed:', err);
      setChatAnswer('Could not reach the assistant. Call emergency services: 112');
    }
    setChatLoading(false);
  };

  const handleStartSOS = () => {
    setSosMessage('');
    setSosListening(true);
    listenForSOS(
      (transcript) => {
        setSosListening(false);
        setSosMessage(`Keyword detected: "${transcript}" — sending alert...`);
        handleSendSosAlert();
      },
      (err) => {
        setSosListening(false);
        setSosMessage(err);
      }
    );
  };

  const showSosToast = (message) => {
    if (sosToastTimerRef.current) clearTimeout(sosToastTimerRef.current);
    setSosToast(message);
    sosToastTimerRef.current = setTimeout(() => setSosToast(''), 6000);
  };

  // tone: 'success' | 'partial' | 'error'. Success auto-dismisses like a
  // normal toast since there's nothing to act on; partial/error stay on
  // screen until the user dismisses them — a failed automatic send must
  // never quietly disappear and get mistaken for a success.
  const showSosResult = (result) => {
    if (sosResultTimerRef.current) clearTimeout(sosResultTimerRef.current);
    setSosToast('');
    setSosResult(result);
    if (result.tone === 'success') {
      sosResultTimerRef.current = setTimeout(() => setSosResult(null), 6000);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!contactName.trim() || !contactPhone.trim()) return;

    // Validated and normalized here, before it ever reaches Firestore, so a
    // malformed number can't sit in a contact list and only surface as a
    // Twilio 21211 the next time there's an actual emergency.
    const normalizedPhone = normalizePhoneE164(contactPhone);
    if (!normalizedPhone) {
      setContactPhoneError('Enter a valid phone number — a 10-digit Indian mobile number, or a full +country code number.');
      return;
    }
    setContactPhoneError('');

    setSavingContact(true);
    const newContact = {
      id: crypto.randomUUID(),
      name: contactName.trim(),
      phone: normalizedPhone,
    };
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      emergencyContacts: [...contacts, newContact],
    });
    setContactName('');
    setContactPhone('');
    setSavingContact(false);
  };

  const handleRemoveContact = async (id) => {
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      emergencyContacts: contacts.filter((c) => c.id !== id),
    });
  };

  // Sends automatically via the sendSosAlert Cloud Function (Twilio,
  // server-side — see functions/index.js). If that call fails for any
  // reason (function not deployed yet, Twilio trial-account restrictions,
  // offline, etc.) this falls back to handing off to the device's own SMS
  // app instead of leaving the user with nothing — the one thing no
  // website can do is force that fallback path to send without a tap.
  const handleSendSosAlert = () => {
    if (contacts.length === 0) {
      showSosToast('Add an emergency contact first.');
      scrollToRef(contactsRef);
      return;
    }

    // Re-normalize at send time too, not just at save time — covers any
    // contact saved before this validation existed.
    const numbers = contacts.map((c) => normalizePhoneE164(c.phone)).filter(Boolean);
    if (numbers.length === 0) {
      showSosToast('Your saved contacts are missing valid phone numbers.');
      return;
    }

    const fallbackToSmsApp = (loc, reason) => {
      window.location.href = smsUriFor(numbers, buildSosMessage(loc));
      showSosResult({
        tone: 'error',
        headline: 'Automatic alert failed',
        message: `We couldn't send automatically${
          reason ? ` (${reason})` : ''
        }. Your messaging app has opened with the alert pre-filled — you must tap Send there yourself, or your contacts will not be notified.`,
      });
    };

    const send = async (loc) => {
      showSosToast(`Sending SOS to ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}…`);
      // One id per press — lets the server recognize and collapse a
      // duplicate delivery of this exact call instead of sending twice.
      const alertId = crypto.randomUUID();
      try {
        const sendSosAlert = httpsCallable(functions, 'sendSosAlert');
        const result = await sendSosAlert({ latitude: loc?.latitude, longitude: loc?.longitude, alertId });
        const { sent, failed, details } = result.data;
        if (failed > 0) {
          const failedDetails = details.filter((d) => !d.ok);
          showSosResult({
            tone: 'partial',
            headline: `Sent to ${sent} of ${sent + failed} contacts`,
            message: 'Some contacts were not reached — see details below.',
            details: failedDetails,
          });
        } else {
          showSosResult({
            tone: 'success',
            headline: 'SOS sent',
            message: `Alerted ${sent} contact${sent !== 1 ? 's' : ''} with your location.`,
          });
        }
      } catch (err) {
        console.error('sendSosAlert failed, falling back to the device SMS app:', err);
        fallbackToSmsApp(loc, err?.message);
      }
    };

    if (location) {
      send(location);
      return;
    }

    showSosToast('Getting your location before sending the alert…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLocation(loc);
        send(loc);
      },
      () => send(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Derived, not stored: if the report the tracking page was showing has
  // since resolved (or vanished), there's nothing left to track there, so
  // render 'home' regardless of the last navigation choice — without a
  // second effect just to force that same correction into state.
  const effectiveView = view === 'tracking' && !activeReport ? 'home' : view;

  const initial = (auth.currentUser.email || 'U')[0].toUpperCase();

  // Purely decorative: whatever real location we already have on screen —
  // the one just captured, or the active report's — centres the backdrop
  // map. Never drives any report/tracking logic itself.
  const backdropCenter =
    location ?? (activeReport ? { latitude: activeReport.latitude, longitude: activeReport.longitude } : null);

  return (
    <div className="page dt-home">
      <MapBackdrop center={backdropCenter} />

      {sosToast && (
        <div className="dt-sos-toast-wrap">
          <div className="toast dt-sos-toast" role="status">
            <IconAlert size={15} />
            <span>{sosToast}</span>
          </div>
        </div>
      )}

      {sosResult && (
        <div className="dt-sos-result-wrap">
          <div
            className={`dt-sos-result dt-sos-result-${sosResult.tone}`}
            role="alert"
            aria-live="assertive"
          >
            <div className="dt-sos-result-head">
              {sosResult.tone === 'success' ? <IconCheck size={16} /> : <IconAlert size={16} />}
              <span className="dt-sos-result-headline">{sosResult.headline}</span>
              <button
                type="button"
                className="dt-sos-result-dismiss"
                onClick={() => setSosResult(null)}
                aria-label="Dismiss"
              >
                <IconClose size={12} />
              </button>
            </div>
            <p className="dt-sos-result-message">{sosResult.message}</p>
            {sosResult.details?.length > 0 && (
              <ul className="dt-sos-result-list">
                {sosResult.details.map((d) => (
                  <li key={d.phone}>
                    <span className="dt-sos-result-name">{d.name}</span>
                    <span className="dt-sos-result-reason">{describeTwilioFailure(d)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <NearbyAlertBanner
        alerts={nearbyAlerts}
        onDismiss={handleDismissNearbyAlert}
        onNavigate={handleNavigateToNearby}
      />

      {/* Floating first-aid chat widget — always available, any screen,
          any state. The chat logic itself is untouched; this just changes
          how it's surfaced. */}
      <div className="dt-chat-widget" ref={chatWidgetRef}>
        <button
          type="button"
          className="dt-chat-toggle"
          onClick={() => setChatOpen((v) => !v)}
          aria-label={chatOpen ? 'Close first-aid assistant' : 'Open first-aid assistant'}
          aria-expanded={chatOpen}
        >
          {chatOpen ? <IconClose size={20} /> : <IconChat size={20} />}
        </button>

        {chatOpen && (
          <div className="dt-chat-panel">
            <FirstAidCard
              question={chatQuestion}
              onQuestionChange={setChatQuestion}
              answer={chatAnswer}
              loading={chatLoading}
              onSubmit={handleAskChatbot}
            />
          </div>
        )}
      </div>

      <div className="dt-topbar">
        <div className="dt-profile">
          <span className="dt-avatar">{initial}</span>
          <div>
            <p className="dt-profile-label">Signed in as</p>
            <p className="dt-profile-value">{auth.currentUser.email}</p>
          </div>
        </div>
        <button
          type="button"
          className="dt-bell-btn"
          onClick={() => {
            if (activeReport) setView('tracking');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          aria-label={activeReport ? 'Your active report' : 'Report an accident'}
        >
          <IconBell size={18} />
          {activeReport && <span className="dt-bell-dot" />}
        </button>
      </div>

      {!isOnline && (
        <div className="dt-offline-banner">
          <IconWifiOff size={15} />
          You're offline — reports will send once you're back online.
        </div>
      )}

      <div className="container">
        {activeReportLoading ? (
          <div className="card dt-card" aria-hidden="true">
            <Skeleton variant="block" height={130} className="dt-hero-skeleton" />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="45%" />
          </div>
        ) : effectiveView === 'tracking' && activeReport ? (
          /* ============================================================
             CONFIRMATION STATE — a report already exists. This fully
             replaces the reporting form: one calm, dominant view of
             status and who has responded, nothing competing with it.
             ============================================================ */
          <>
            {success && (
              <div className="toast dt-confirm-toast">
                <IconCheck size={15} />
                <span>{success}</span>
              </div>
            )}

            <div className="card dt-card dt-card-hero">
              <TrackerPanel
                id={activeReport.id}
                accident={activeReport}
                onCopyLink={handleCopyTrackingLink}
                linkCopied={linkCopied}
                hideMap
                etaOverride={trackingEta}
              />
            </div>

            <EmergencyContactsCard
              innerRef={contactsRef}
              contacts={contacts}
              name={contactName}
              onNameChange={setContactName}
              phone={contactPhone}
              onPhoneChange={handleContactPhoneChange}
              phoneError={contactPhoneError}
              saving={savingContact}
              onAdd={handleAddContact}
              onRemove={handleRemoveContact}
            />
          </>
        ) : effectiveView === 'book' ? (
          /* ============================================================
             BOOK AMBULANCE — a separate, calmer flow from the panic SOS
             report above: pick a pickup point and a destination hospital,
             see an upfront fare estimate, confirm, then track. Shows either
             the request form or (once activeBooking exists) the live
             tracking view, mirroring how 'tracking' vs the report form
             works for accidents above.
             ============================================================ */
          <>
            <button type="button" className="dt-back-link" onClick={() => setView('home')}>
              <IconArrowLeft size={16} /> Back to home
            </button>

            {activeBookingLoading ? (
              <div className="card dt-card" aria-hidden="true">
                <Skeleton variant="block" height={100} />
                <Skeleton variant="text" width="70%" />
              </div>
            ) : activeBooking ? (
              <div className="card dt-card dt-card-hero">
                <div className="dt-hero dt-hero-active">
                  <div className="dt-hero-top">
                    <span className="dt-hero-id">#{activeBooking.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <p className="dt-hero-status">{bookingStatusLabel(activeBooking)}</p>
                  <ElapsedTime className="dt-hero-elapsed" since={activeBooking.createdAt} />
                  <div className="dt-hero-dates">
                    <div>
                      <p className="dt-hero-label">Fare estimate</p>
                      <p className="dt-hero-value tnum">₹{activeBooking.fare}</p>
                    </div>
                    <div className="dt-hero-right">
                      <p className="dt-hero-label">Destination</p>
                      <p className="dt-hero-value">{activeBooking.destinationHospitalName}</p>
                    </div>
                  </div>
                </div>

                {activeBooking.ambulanceLocation &&
                (activeBooking.status === 'accepted_by_driver' || activeBooking.status === 'arrived') ? (
                  <AmbulanceTracker accident={activeBooking} />
                ) : (
                  <p className="dt-booking-waiting-text">Waiting for a nearby driver to accept your booking…</p>
                )}

                {activeBooking.status === 'reported' && (
                  <button type="button" className="btn btn-ghost btn-block" onClick={handleCancelBooking}>
                    Cancel booking
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="dt-report-eyebrow">Book an ambulance</p>
                <p className="dt-report-sub">Non-emergency transport, with an upfront fare estimate.</p>

                <button
                  type="button"
                  className={`dt-location-status dt-location-status-${
                    pickupLocation ? 'locked' : pickupLocating ? 'acquiring' : 'idle'
                  }`}
                  onClick={handleCapturePickupLocation}
                  disabled={pickupLocating}
                >
                  {pickupLocation ? (
                    <>
                      <span className="dt-location-status-icon">
                        <IconCheck size={15} />
                      </span>
                      <span className="dt-location-status-text">
                        <strong>Pickup location set</strong>
                        <span className="tnum">
                          {pickupLocation.latitude.toFixed(4)}, {pickupLocation.longitude.toFixed(4)}
                        </span>
                      </span>
                    </>
                  ) : pickupLocating ? (
                    <>
                      <span className="spinner spinner-sm" />
                      <span className="dt-location-status-text">
                        <strong>Getting your location…</strong>
                        <span>Hold still for a second</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="dt-location-status-icon">
                        <IconPin size={15} />
                      </span>
                      <span className="dt-location-status-text">
                        <strong>Set pickup location</strong>
                        <span>Required before choosing a hospital</span>
                      </span>
                    </>
                  )}
                </button>

                {pickupLocation && (
                  <div className="dt-step-reveal is-open">
                    <div className="dt-step-reveal-inner">
                      <p className="dt-section-title">Choose a destination hospital</p>
                      {bookingHospitalsWithDistance.length === 0 ? (
                        <p className="status-line">No hospitals are registered yet.</p>
                      ) : (
                        <div className="dt-hospital-list">
                          {bookingHospitalsWithDistance.map((h) => (
                            <button
                              type="button"
                              key={h.id}
                              className={`dt-hospital-option ${selectedHospitalId === h.id ? 'is-selected' : ''}`}
                              onClick={() => setSelectedHospitalId(h.id)}
                            >
                              <IconHospital size={16} />
                              <span className="dt-hospital-option-info">
                                <strong>{h.hospitalName || 'Unnamed hospital'}</strong>
                                <span className="tnum">
                                  {h.distanceKm.toFixed(1)} km · {h.availableBeds ?? 0} beds
                                </span>
                              </span>
                              {selectedHospitalId === h.id && <IconCheck size={16} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedBookingHospital && (
                  <div className="dt-booking-fare-estimate">
                    <p className="dt-booking-fare-estimate-label">Estimated fare</p>
                    <p className="dt-booking-fare-estimate-amount tnum">₹{bookingFareEstimate}</p>
                    <p className="dt-booking-fare-estimate-note">
                      For {selectedBookingHospital.distanceKm.toFixed(1)} km · estimate only, final fare may vary.
                    </p>
                  </div>
                )}

                {bookingError && <p className="status-line status-error">{bookingError}</p>}

                {selectedBookingHospital && (
                  <button
                    type="button"
                    className="btn btn-primary btn-xl btn-block dt-reveal-step"
                    onClick={handleConfirmBooking}
                    disabled={bookingSaving}
                  >
                    <IconAmbulance size={20} /> {bookingSaving ? 'Booking…' : 'Confirm booking'}
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          /* ============================================================
             REPORT STATE — staged reveal. Only the location button shows
             at first; capturing location instantly reveals the Report
             button and the optional photo step. Nothing pops in before
             the step it depends on is actually done.
             ============================================================ */
          <>
            <p className="dt-report-eyebrow">Report an accident</p>
            <p className="dt-report-sub">One tap shares your live location with nearby hospitals &amp; drivers.</p>

            <button type="button" className="dt-book-ambulance-link" onClick={() => setView('book')}>
              <IconAmbulance size={14} /> Not an emergency? Book an ambulance instead
            </button>

            <button
              type="button"
              className={`dt-location-status dt-location-status-${
                location ? 'locked' : locationDenied ? 'denied' : locating ? 'acquiring' : 'idle'
              }`}
              onClick={handleGetLocation}
              disabled={locating}
            >
              {location ? (
                <>
                  <span className="dt-location-status-icon">
                    <IconCheck size={15} />
                  </span>
                  <span className="dt-location-status-text">
                    <strong>Location locked</strong>
                    <span className="tnum">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </span>
                  </span>
                </>
              ) : locating ? (
                <>
                  <span className="spinner spinner-sm" />
                  <span className="dt-location-status-text">
                    <strong>Getting your location…</strong>
                    <span>Hold still for a second</span>
                  </span>
                </>
              ) : locationDenied ? (
                <>
                  <span className="dt-location-status-icon dt-location-status-icon-denied">
                    <IconLocationOff size={15} />
                  </span>
                  <span className="dt-location-status-text">
                    <strong>Location blocked</strong>
                    <span>Allow location access, then tap to retry</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="dt-location-status-icon">
                    <IconPin size={15} />
                  </span>
                  <span className="dt-location-status-text">
                    <strong>Share your location</strong>
                    <span>Required before you can report</span>
                  </span>
                </>
              )}
            </button>

            {error && <p className="status-line status-error">{error}</p>}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              style={{ display: 'none' }}
            />

            {/* Same box, same size as the location step above — grows in
                smoothly the instant location locks in, pushing the Report
                button down with it rather than popping it into place. */}
            <div className={`dt-step-reveal ${location ? 'is-open' : ''}`}>
              <div className="dt-step-reveal-inner">
                <button
                  type="button"
                  className={`dt-location-status dt-location-status-${
                    analyzing ? 'acquiring' : photo ? 'locked' : 'idle'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <>
                      <span className="spinner spinner-sm" />
                      <span className="dt-location-status-text">
                        <strong>Analyzing photo…</strong>
                        <span>This only takes a moment</span>
                      </span>
                    </>
                  ) : photo ? (
                    <>
                      <span className="dt-location-status-icon">
                        <IconCheck size={15} />
                      </span>
                      <span className="dt-location-status-text">
                        <strong>Photo attached</strong>
                        <span>{photo.name} · Tap to replace</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="dt-location-status-icon">
                        <IconCamera size={15} />
                      </span>
                      <span className="dt-location-status-text">
                        <strong>Add a photo</strong>
                        <span>Optional — tap to attach</span>
                      </span>
                    </>
                  )}
                </button>

                {photoPreview && <img src={photoPreview} alt="Accident" className="photo-preview" />}

                {analysis && !analyzing && (
                  <div className="summary-bar" style={{ marginTop: '12px' }}>
                    Severity: {analysis.severity ?? 'unknown'}/100 · Genuine: {analysis.genuine}
                    <br />
                    {analysis.summary}
                  </div>
                )}
              </div>
            </div>

            {location && (
              <button
                type="button"
                className="btn btn-primary btn-xl btn-block dt-report-cta dt-reveal-step"
                onClick={handleReportAccident}
                disabled={loading}
              >
                <IconAlert size={26} />
                {loading ? 'Sending report…' : 'Report accident'}
              </button>
            )}

            <div className="card dt-card dt-card-sos" ref={sosRef}>
              <p className="card-title">
                <IconMic size={16} /> Voice SOS
              </p>
              <button className="btn btn-secondary btn-block" onClick={handleStartSOS} disabled={sosListening}>
                <IconMic size={15} /> {sosListening ? 'Listening…' : 'Speak to trigger SOS'}
              </button>
              {sosMessage && <p className="status-line" style={{ marginTop: '10px' }}>{sosMessage}</p>}
            </div>

            <EmergencyContactsCard
              innerRef={contactsRef}
              contacts={contacts}
              name={contactName}
              onNameChange={setContactName}
              phone={contactPhone}
              onPhoneChange={handleContactPhoneChange}
              phoneError={contactPhoneError}
              saving={savingContact}
              onAdd={handleAddContact}
              onRemove={handleRemoveContact}
            />
          </>
        )}
      </div>

      {effectiveView === 'tracking' && activeReport && (
        <TrackingSheet
          accident={activeReport}
          collapsed={mapMinimized}
          onToggleCollapse={() => setMapMinimized((m) => !m)}
          onEtaChange={setTrackingEta}
        />
      )}

      <nav className="dt-navbar">
        <button
          type="button"
          className="dt-navbar-item"
          onClick={() => {
            setView('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <IconHome size={19} />
          <span>Home</span>
        </button>
        <button type="button" className="dt-navbar-item" onClick={() => setChatOpen(true)}>
          <IconChat size={19} />
          <span>Assist</span>
        </button>
        <button
          type="button"
          className="dt-navbar-fab"
          onClick={handleSendSosAlert}
          aria-label="Send SOS alert to your emergency contacts"
        >
          <IconAlert size={22} />
        </button>
        <button
          type="button"
          className="dt-navbar-item"
          onClick={() => {
            setView('home');
            setTimeout(() => scrollToRef(sosRef), 0);
          }}
        >
          <IconMic size={19} />
          <span>SOS</span>
        </button>
        <button type="button" className="dt-navbar-item" onClick={() => signOut(auth)}>
          <IconLogout size={19} />
          <span>Logout</span>
        </button>
      </nav>
    </div>
  );
}

export default UserDashboard;
