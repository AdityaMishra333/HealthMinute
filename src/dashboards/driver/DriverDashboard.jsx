import { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { pickBestHospital, offsetPointRandomDirection } from '../../shared/geo';
import { playBuzzer } from '../../shared/buzzer';
import { useAmbulanceDispatch } from '../../shared/useAmbulanceDispatch';
import CallPanel from '../../shared/CallPanel';
import ElapsedTime from '../../shared/ElapsedTime';
import StatusPill from '../../shared/StatusPill';
import Skeleton from '../../shared/Skeleton';
import EmptyState from '../../shared/EmptyState';
import {
  IconAlert,
  IconAmbulance,
  IconHospital,
  IconLogout,
  IconNavigate,
  IconCheck,
  IconPin,
  IconClock,
} from '../../shared/Icons';
import './DriverDashboard.css';

function DriverDashboard() {
  const [cases, setCases] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const prevCaseIdsRef = useRef(null);
  const prevBookingIdsRef = useRef(null);

  // Presentational only, mirrors the hospital console's same pattern: which
  // case/booking ids just landed, purely to drive a brief "just arrived"
  // highlight.
  const [newCaseIds, setNewCaseIds] = useState(() => new Set());
  const [newBookingIds, setNewBookingIds] = useState(() => new Set());

  useAmbulanceDispatch(cases, 'accidents', auth.currentUser.uid);
  useAmbulanceDispatch(bookings, 'bookings', auth.currentUser.uid);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'accidents'), (snapshot) => {
      setCases(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.status !== 'cancelled')
      );
    });
    return () => unsubscribe();
  }, []);

  // A buzzer + brief highlight for every brand-new unaccepted case — never
  // fires on the initial load (prevCaseIdsRef starts null), only for cases
  // that genuinely appear after this dashboard is already open.
  useEffect(() => {
    const currentIds = new Set(cases.map((c) => c.id));
    const prevIds = prevCaseIdsRef.current;

    if (prevIds) {
      const justArrived = cases.filter((c) => !prevIds.has(c.id) && c.status === 'reported');
      if (justArrived.length) {
        playBuzzer();
        setNewCaseIds((prev) => new Set([...prev, ...justArrived.map((c) => c.id)]));
        justArrived.forEach((c) => {
          setTimeout(() => {
            setNewCaseIds((prev) => {
              const next = new Set(prev);
              next.delete(c.id);
              return next;
            });
          }, 2200);
        });
      }
    }
    prevCaseIdsRef.current = currentIds;
  }, [cases]);

  // Same pattern for bookings, but a single (calmer) beep rather than the
  // emergency double-beep — a booking is a paid ride, not an emergency.
  useEffect(() => {
    const currentIds = new Set(bookings.map((b) => b.id));
    const prevIds = prevBookingIdsRef.current;

    if (prevIds) {
      const justArrived = bookings.filter((b) => !prevIds.has(b.id) && b.status === 'reported');
      if (justArrived.length) {
        playBuzzer(1);
        setNewBookingIds((prev) => new Set([...prev, ...justArrived.map((b) => b.id)]));
        justArrived.forEach((b) => {
          setTimeout(() => {
            setNewBookingIds((prev) => {
              const next = new Set(prev);
              next.delete(b.id);
              return next;
            });
          }, 2200);
        });
      }
    }
    prevBookingIdsRef.current = currentIds;
  }, [bookings]);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'hospital'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHospitals(
        snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((h) => h.latitude != null && h.longitude != null)
      );
    });
    return () => unsubscribe();
  }, []);

  const handleAcceptCase = async (item) => {
    // A plausible starting point for the simulated ambulance — 3-5km out in
    // a random direction — so the live tracker has somewhere to start from.
    const ambulanceLocation = offsetPointRandomDirection(
      { latitude: item.latitude, longitude: item.longitude },
      3,
      5
    );

    await updateDoc(doc(db, 'accidents', item.id), {
      status: 'accepted_by_driver',
      assignedDriverId: auth.currentUser.uid,
      driverAcceptedAt: serverTimestamp(),
      ambulanceLocation,
    });
  };

  const handleAcceptBooking = async (item) => {
    const ambulanceLocation = offsetPointRandomDirection(
      { latitude: item.latitude, longitude: item.longitude },
      3,
      5
    );

    await updateDoc(doc(db, 'bookings', item.id), {
      status: 'accepted_by_driver',
      assignedDriverId: auth.currentUser.uid,
      driverAcceptedAt: serverTimestamp(),
      ambulanceLocation,
    });
  };

  const handleNavigate = (latitude, longitude) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
  };

  const activeCount = cases.filter((c) => c.status === 'reported').length;
  const openBookingCount = bookings.filter((b) => b.status === 'reported').length;

  // Presentational: the same "is this my active case" check the location
  // watcher above already makes, reused here to feature that one case with
  // a persistent, thumb-reachable action bar (one screen, one decision).
  // Includes 'arrived' so the driver's own card doesn't revert to a generic
  // unaccepted-looking state once the simulated ambulance gets there.
  const myActiveCase = cases.find(
    (c) =>
      (c.status === 'accepted_by_driver' || c.status === 'arrived') &&
      c.assignedDriverId === auth.currentUser.uid
  );
  const myActiveHospital = myActiveCase ? pickBestHospital(hospitals, myActiveCase) : null;

  // Same "is this my active job" pattern as accidents, for a booking. A
  // driver could in principle have one of each running at once — both bars
  // render if so, there's no attempt to force a single "active job" slot.
  const myActiveBooking = bookings.find(
    (b) =>
      (b.status === 'accepted_by_driver' || b.status === 'arrived') && b.assignedDriverId === auth.currentUser.uid
  );

  return (
    <div className={`page driver-page ${myActiveCase || myActiveBooking ? 'has-active-bar' : ''}`}>
      <div className="topbar">
        <h1>
          <span className="topbar-brand-mark">
            <IconAmbulance size={15} />
          </span>
          Driver dashboard
        </h1>
        <button className="btn btn-ghost" onClick={() => signOut(auth)}>
          <IconLogout size={15} /> Log out
        </button>
      </div>

      <div className="container">
        <div className="summary-bar">
          {activeCount} open case{activeCount !== 1 ? 's' : ''} of {cases.length} total
        </div>

        {loading ? (
          <div className="driver-skeleton-list" aria-hidden="true">
            {[0, 1].map((i) => (
              <div className="driver-card" key={i}>
                <Skeleton variant="text" width="35%" />
                <Skeleton variant="title" width="65%" />
                <Skeleton variant="block" height={44} />
              </div>
            ))}
          </div>
        ) : cases.length === 0 ? (
          <EmptyState icon={IconAmbulance} title="No cases right now" description="New accident reports will appear here." />
        ) : (
          cases.map((item) => {
            const recommended = pickBestHospital(hospitals, item);
            const pill = statusPillFor(item);
            const isMine = item.id === myActiveCase?.id;

            return (
              <div
                key={item.id}
                className={`driver-card driver-card-${pill.tone} ${isMine ? 'driver-card-mine' : ''} ${
                  newCaseIds.has(item.id) ? 'driver-card-incoming' : ''
                }`}
              >
                <div className="driver-card-top">
                  <StatusPill {...pill} />
                  <ElapsedTime since={item.createdAt} until={item.status === 'resolved' ? item.resolvedAt : null} />
                </div>

                <p className="driver-card-coords tnum">
                  <IconPin size={14} /> {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </p>
                <p className="driver-card-reporter">Reported by {item.userEmail}</p>

                {recommended && (
                  <div className="hospital-recommendation">
                    <IconHospital size={15} />
                    {recommended.hospitalName || 'Unnamed hospital'} · {recommended.availableBeds ?? 0} beds ·{' '}
                    {recommended.distanceKm.toFixed(1)} km
                  </div>
                )}

                {!isMine && (
                  <div className="driver-card-actions">
                    {item.status === 'reported' && (
                      <button className="btn btn-success btn-lg btn-block" onClick={() => handleAcceptCase(item)}>
                        <IconCheck size={17} /> Accept case
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-lg btn-block"
                      onClick={() => handleNavigate(item.latitude, item.longitude)}
                    >
                      <IconNavigate size={17} /> Navigate to accident
                    </button>
                  </div>
                )}

                {isMine && (
                  <p className="driver-card-active-note">
                    <IconCheck size={14} />
                    {item.status === 'arrived'
                      ? 'You have arrived at the accident site.'
                      : 'This is your active case — use the bar below to navigate.'}
                  </p>
                )}

                {item.assignedDriverId === auth.currentUser.uid &&
                  item.status === 'accepted_by_driver' &&
                  item.acceptedHospitalId && <CallPanel accidentId={item.id} />}
              </div>
            );
          })
        )}

        <div className="driver-section-heading">
          <IconAmbulance size={15} /> Ambulance bookings
          {openBookingCount > 0 && <span className="driver-section-badge">{openBookingCount}</span>}
        </div>

        {bookings.length === 0 ? (
          <EmptyState
            icon={IconAmbulance}
            title="No bookings right now"
            description="Non-emergency ambulance bookings will appear here."
          />
        ) : (
          bookings.map((item) => {
            const pill = bookingStatusPillFor(item);
            const isMine = item.id === myActiveBooking?.id;

            return (
              <div
                key={item.id}
                className={`driver-card driver-card-${pill.tone} ${isMine ? 'driver-card-mine' : ''} ${
                  newBookingIds.has(item.id) ? 'driver-card-incoming' : ''
                }`}
              >
                <div className="driver-card-top">
                  <StatusPill {...pill} />
                  <ElapsedTime since={item.createdAt} until={item.status === 'resolved' ? item.resolvedAt : null} />
                </div>

                <p className="driver-card-coords tnum">
                  <IconPin size={14} /> {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </p>
                <p className="driver-card-reporter">Booked by {item.userEmail}</p>

                <div className="hospital-recommendation">
                  <IconHospital size={15} />
                  {item.destinationHospitalName || 'Unnamed hospital'} · {item.distanceKm?.toFixed(1)} km
                </div>

                <p className="driver-card-fare tnum">Fare: ₹{item.fare}</p>

                {!isMine && (
                  <div className="driver-card-actions">
                    {item.status === 'reported' && (
                      <button className="btn btn-success btn-lg btn-block" onClick={() => handleAcceptBooking(item)}>
                        <IconCheck size={17} /> Accept booking
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-lg btn-block"
                      onClick={() => handleNavigate(item.latitude, item.longitude)}
                    >
                      <IconNavigate size={17} /> Navigate to pickup
                    </button>
                  </div>
                )}

                {isMine && (
                  <p className="driver-card-active-note">
                    <IconCheck size={14} />
                    {item.status === 'arrived'
                      ? 'You have arrived at the pickup location.'
                      : 'This is your active booking — use the bar below to navigate.'}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {myActiveCase && (
        <div className="driver-active-bar">
          <button
            type="button"
            className="btn btn-primary btn-xl btn-block"
            onClick={() => handleNavigate(myActiveCase.latitude, myActiveCase.longitude)}
          >
            <IconNavigate size={20} /> Navigate to accident
          </button>
          {myActiveHospital && (
            <button
              type="button"
              className="btn btn-secondary btn-lg btn-block"
              onClick={() => handleNavigate(myActiveHospital.latitude, myActiveHospital.longitude)}
            >
              <IconHospital size={17} /> Navigate to {myActiveHospital.hospitalName || 'hospital'}
            </button>
          )}
        </div>
      )}

      {myActiveBooking && (
        <div className="driver-active-bar">
          <button
            type="button"
            className="btn btn-primary btn-xl btn-block"
            onClick={() => handleNavigate(myActiveBooking.latitude, myActiveBooking.longitude)}
          >
            <IconNavigate size={20} /> Navigate to pickup
          </button>
        </div>
      )}
    </div>
  );
}

// Driver-perspective status: unlike the hospital view, what matters here is
// whether a DRIVER has taken the case, not whether a hospital has — a case a
// hospital already accepted is still "Pending" for every driver until one of
// them accepts it. Mirrors the original `item.status === 'reported'` check.
function statusPillFor(item) {
  if (item.status === 'resolved') return { tone: 'resolved', label: 'Resolved', icon: IconCheck };
  if (item.status === 'arrived') return { tone: 'active', label: 'Arrived', icon: IconAmbulance };
  if (item.status === 'accepted_by_driver') return { tone: 'active', label: 'Accepted', icon: IconCheck };
  return { tone: 'critical', label: 'Pending', icon: IconAlert };
}

// A booking is a paid, non-emergency ride, not an accident — its pending
// state deliberately never uses the critical-red tone reserved elsewhere in
// the app exclusively for an active, unaccepted emergency. Amber ("active")
// reads as "needs attention" without claiming to be one.
function bookingStatusPillFor(item) {
  if (item.status === 'resolved') return { tone: 'resolved', label: 'Completed', icon: IconCheck };
  if (item.status === 'arrived') return { tone: 'active', label: 'Arrived', icon: IconAmbulance };
  if (item.status === 'accepted_by_driver') return { tone: 'active', label: 'En route', icon: IconAmbulance };
  return { tone: 'active', label: 'Awaiting driver', icon: IconClock };
}

export default DriverDashboard;
