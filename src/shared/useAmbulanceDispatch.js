import { useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { haversineKm, lerpPoint } from './geo';

// Simulated ambulance movement: every tick, close a fraction of the
// remaining gap to the destination (linear interpolation), until within
// ARRIVAL_RADIUS_KM (~50m), at which point the job is marked arrived.
const AMBULANCE_TICK_MS = 3000;
const AMBULANCE_LERP_FRACTION = 0.15;
const ARRIVAL_RADIUS_KM = 0.05;

// The driver-side dispatch mechanics — broadcasting the driver's real GPS
// position onto whichever job they're actively running, and advancing the
// job's simulated ambulanceLocation toward its destination every few
// seconds until arrival. Originally written inline for the emergency
// accident flow; extracted once the ambulance-booking flow needed the exact
// same mechanics against a different Firestore collection. `jobs` is
// whatever list the caller already has (accidents or bookings), `driverUid`
// is the signed-in driver, `collectionName` says which collection to write
// updates back to.
export function useAmbulanceDispatch(jobs, collectionName, driverUid) {
  const watchIdRef = useRef(null);
  const trackedJobIdRef = useRef(null);
  const jobsRef = useRef([]);
  const simulationTimerRef = useRef(null);
  const simulatedJobIdRef = useRef(null);

  // Always-fresh snapshot of `jobs` for the simulation tick below to read,
  // so the interval never acts on a stale closure.
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    const myActiveJob = jobs.find((j) => j.status === 'accepted_by_driver' && j.assignedDriverId === driverUid);

    if (myActiveJob && trackedJobIdRef.current !== myActiveJob.id) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      trackedJobIdRef.current = myActiveJob.id;
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          updateDoc(doc(db, collectionName, myActiveJob.id), {
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

    if (!myActiveJob && watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      trackedJobIdRef.current = null;
    }
  }, [jobs, collectionName, driverUid]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Simulated ambulance movement — runs only on the assigned driver's own
  // dashboard, only while their job is accepted and not yet arrived.
  useEffect(() => {
    const myArrivingJob = jobs.find(
      (j) => j.assignedDriverId === driverUid && j.status === 'accepted_by_driver' && j.ambulanceLocation
    );

    if (myArrivingJob && simulatedJobIdRef.current !== myArrivingJob.id) {
      simulatedJobIdRef.current = myArrivingJob.id;

      simulationTimerRef.current = setInterval(() => {
        const latest = jobsRef.current.find((j) => j.id === myArrivingJob.id);
        if (!latest || latest.status !== 'accepted_by_driver' || !latest.ambulanceLocation) {
          clearInterval(simulationTimerRef.current);
          simulationTimerRef.current = null;
          simulatedJobIdRef.current = null;
          return;
        }

        const destination = { latitude: latest.latitude, longitude: latest.longitude };
        const distanceKm = haversineKm(latest.ambulanceLocation, destination);

        if (distanceKm <= ARRIVAL_RADIUS_KM) {
          updateDoc(doc(db, collectionName, latest.id), { status: 'arrived', arrivedAt: serverTimestamp() });
        } else {
          updateDoc(doc(db, collectionName, latest.id), {
            ambulanceLocation: lerpPoint(latest.ambulanceLocation, destination, AMBULANCE_LERP_FRACTION),
          });
        }
      }, AMBULANCE_TICK_MS);
    }

    if (!myArrivingJob && simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
      simulatedJobIdRef.current = null;
    }
  }, [jobs, collectionName, driverUid]);

  useEffect(() => {
    return () => {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    };
  }, []);
}
