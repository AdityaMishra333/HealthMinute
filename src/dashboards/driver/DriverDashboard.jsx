import { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { pickBestHospital, offsetPointRandomDirection, lerpPoint, haversineKm } from '../../shared/geo';
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
} from '../../shared/Icons';
import './DriverDashboard.css';

// Simulated ambulance movement: every tick, close a fraction of the
// remaining gap to the accident (linear interpolation), until within
// ARRIVAL_RADIUS_KM (~50m), at which point the case is marked arrived.
const AMBULANCE_TICK_MS = 3000;
const AMBULANCE_LERP_FRACTION = 0.15;
const ARRIVAL_RADIUS_KM = 0.05;

function DriverDashboard() {
  const [cases, setCases] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef(null);
  const trackedCaseIdRef = useRef(null);
  const casesRef = useRef([]);
  const simulationTimerRef = useRef(null);
  const simulatedCaseIdRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'accidents'), (snapshot) => {
      setCases(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const myActiveCase = cases.find(
      (c) => c.status === 'accepted_by_driver' && c.assignedDriverId === auth.currentUser.uid
    );

    if (myActiveCase && trackedCaseIdRef.current !== myActiveCase.id) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      trackedCaseIdRef.current = myActiveCase.id;
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          updateDoc(doc(db, 'accidents', myActiveCase.id), {
            driverLocation: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
          });
        },
        () => {},
        { enableHighAccuracy: true }
      );
    }

    if (!myActiveCase && watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      trackedCaseIdRef.current = null;
    }
  }, [cases]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Always-fresh snapshot of `cases` for the simulation tick below to read,
  // so the interval never acts on a stale closure.
  useEffect(() => {
    casesRef.current = cases;
  }, [cases]);

  // Simulated ambulance movement — runs only on the assigned driver's own
  // dashboard, only while their case is accepted and not yet arrived.
  useEffect(() => {
    const myArrivingCase = cases.find(
      (c) =>
        c.assignedDriverId === auth.currentUser.uid &&
        c.status === 'accepted_by_driver' &&
        c.ambulanceLocation
    );

    if (myArrivingCase && simulatedCaseIdRef.current !== myArrivingCase.id) {
      simulatedCaseIdRef.current = myArrivingCase.id;

      simulationTimerRef.current = setInterval(() => {
        const latest = casesRef.current.find((c) => c.id === myArrivingCase.id);
        if (!latest || latest.status !== 'accepted_by_driver' || !latest.ambulanceLocation) {
          clearInterval(simulationTimerRef.current);
          simulationTimerRef.current = null;
          simulatedCaseIdRef.current = null;
          return;
        }

        const destination = { latitude: latest.latitude, longitude: latest.longitude };
        const distanceKm = haversineKm(latest.ambulanceLocation, destination);

        if (distanceKm <= ARRIVAL_RADIUS_KM) {
          updateDoc(doc(db, 'accidents', latest.id), { status: 'arrived', arrivedAt: serverTimestamp() });
        } else {
          updateDoc(doc(db, 'accidents', latest.id), {
            ambulanceLocation: lerpPoint(latest.ambulanceLocation, destination, AMBULANCE_LERP_FRACTION),
          });
        }
      }, AMBULANCE_TICK_MS);
    }

    if (!myArrivingCase && simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
      simulatedCaseIdRef.current = null;
    }
  }, [cases]);

  useEffect(() => {
    return () => {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    };
  }, []);

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

  const handleNavigate = (latitude, longitude) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
  };

  const activeCount = cases.filter((c) => c.status === 'reported').length;

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

  return (
    <div className={`page driver-page ${myActiveCase ? 'has-active-bar' : ''}`}>
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
              <div key={item.id} className={`driver-card driver-card-${pill.tone} ${isMine ? 'driver-card-mine' : ''}`}>
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

export default DriverDashboard;
