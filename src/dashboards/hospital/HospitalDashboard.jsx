import { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import CallPanel from '../../shared/CallPanel';
import Analytics from './Analytics';
import ElapsedTime from '../../shared/ElapsedTime';
import AmbulanceTracker from '../../shared/AmbulanceTracker';
import StatusPill from '../../shared/StatusPill';
import Skeleton from '../../shared/Skeleton';
import EmptyState from '../../shared/EmptyState';
import { getStatusTone } from '../../shared/trackingStatus';
import {
  IconAlert,
  IconBed,
  IconChart,
  IconHospital,
  IconLogout,
  IconCheck,
  IconAmbulance,
  IconInbox,
  IconPin,
  IconList,
  IconMapPin,
  IconClock,
} from '../../shared/Icons';
import './HospitalDashboard.css';

// How long a newly-arrived unaccepted alert keeps its "just landed"
// attention animation — the one deliberate motion moment on this screen.
const NEW_ALERT_HIGHLIGHT_MS = 2200;

// An alert nobody has accepted within this window drops out of the live
// queue and into History — it's presentational triage only, not a status
// change written to Firestore, so the reporter's own tracker, the driver
// list, etc. are completely unaffected by it.
const UNACCEPTED_TIMEOUT_MS = 10 * 60 * 1000;

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000;
  return null;
}

function isStaleUnaccepted(alert, now) {
  if (alert.acceptedHospitalId) return false;
  const createdMs = toMillis(alert.createdAt);
  if (createdMs == null) return false;
  return now - createdMs >= UNACCEPTED_TIMEOUT_MS;
}

function statusPillProps(alert, { stale = false } = {}) {
  if (stale) return { tone: 'neutral', label: 'Missed', icon: IconClock };

  const tone = getStatusTone(alert);
  if (tone === 'critical') return { tone, label: 'Unaccepted', icon: IconAlert };
  if (tone === 'active') {
    if (alert.status === 'arrived') return { tone, label: 'Arrived', icon: IconAmbulance };
    return alert.status === 'accepted_by_driver'
      ? { tone, label: 'En route', icon: IconAmbulance }
      : { tone, label: 'Accepted', icon: IconCheck };
  }
  return { tone: 'resolved', label: 'Resolved', icon: IconCheck };
}

// One incident row, reused by both the live Alerts list and History.
function AlertRow({ alert, stale, selectable, isSelected, isNew, onSelect, onAccept, onResolve }) {
  const pill = statusPillProps(alert, { stale });
  const isCritical = pill.tone === 'critical';

  const interactiveProps = selectable
    ? {
        role: 'button',
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        },
      }
    : {};

  return (
    <div
      className={`dispatch-row ${isCritical ? 'dispatch-row-critical' : ''} ${isSelected ? 'is-selected' : ''} ${
        isNew ? 'dispatch-row-incoming' : ''
      } ${!selectable ? 'dispatch-row-static' : ''}`}
      {...interactiveProps}
    >
      <div className="dispatch-row-top">
        <StatusPill {...pill} size="sm" />
        <ElapsedTime
          since={alert.createdAt}
          until={alert.status === 'resolved' ? alert.resolvedAt : null}
          className="dispatch-row-elapsed"
        />
      </div>

      <p className="dispatch-row-coords tnum">
        <IconPin size={12} /> {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
      </p>
      <p className="dispatch-row-reporter">{alert.userEmail}</p>

      {alert.severity != null && (
        <p className="dispatch-row-meta">
          Severity {alert.severity}/100 ·{' '}
          {alert.genuine === 'yes' ? 'Confirmed genuine' : alert.genuine === 'no' ? 'Possibly false' : 'Unverified'}
        </p>
      )}

      {alert.photoURL && <img src={alert.photoURL} alt="Accident" className="photo-preview" />}

      {(alert.status === 'accepted_by_driver' || alert.status === 'arrived') && alert.ambulanceLocation && (
        <div onClick={(e) => e.stopPropagation()}>
          <AmbulanceTracker accident={alert} />
        </div>
      )}

      <div className="dispatch-row-actions" onClick={(e) => e.stopPropagation()}>
        {!alert.acceptedHospitalId ? (
          <button className="btn btn-success btn-sm" onClick={onAccept}>
            <IconCheck size={13} /> Accept
          </button>
        ) : alert.status !== 'resolved' ? (
          <button className="btn btn-ghost btn-sm" onClick={onResolve}>
            Mark resolved
          </button>
        ) : null}
      </div>

      {alert.acceptedHospitalId === auth.currentUser.uid && alert.status === 'accepted_by_driver' && (
        <div onClick={(e) => e.stopPropagation()}>
          <CallPanel accidentId={alert.id} />
        </div>
      )}
    </div>
  );
}

function HospitalDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableBeds, setAvailableBeds] = useState('');
  const [savingBeds, setSavingBeds] = useState(false);
  const [view, setView] = useState('alerts');
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [mobilePane, setMobilePane] = useState('list');
  const [now, setNow] = useState(() => Date.now());

  // Presentational only: tracks which alert ids just arrived, purely to
  // drive the one "new incoming alert" attention animation. Reads the
  // already-set `alerts` state after the fact — it never touches the
  // Firestore subscription below.
  const [newAlertIds, setNewAlertIds] = useState(() => new Set());
  const prevAlertIdsRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'accidents'), (snapshot) => {
      setAlerts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      const beds = snap.data()?.availableBeds;
      if (beds != null) setAvailableBeds(String(beds));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    const prevIds = prevAlertIdsRef.current;

    if (prevIds) {
      const justArrived = alerts.filter((a) => !prevIds.has(a.id) && !a.acceptedHospitalId);
      if (justArrived.length) {
        setNewAlertIds((prev) => new Set([...prev, ...justArrived.map((a) => a.id)]));
        justArrived.forEach((a) => {
          setTimeout(() => {
            setNewAlertIds((prev) => {
              const next = new Set(prev);
              next.delete(a.id);
              return next;
            });
          }, NEW_ALERT_HIGHLIGHT_MS);
        });
      }
    }
    prevAlertIdsRef.current = currentIds;
  }, [alerts]);

  // Nothing in Firestore changes when an unaccepted alert times out — it's
  // purely the passage of time — so this just nudges a re-render often
  // enough for that 10-minute cutoff to actually move rows between lists.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAcceptAlert = async (alertId) => {
    await updateDoc(doc(db, 'accidents', alertId), {
      acceptedHospitalId: auth.currentUser.uid,
      hospitalAcceptedAt: serverTimestamp(),
    });
  };

  const handleResolveAlert = async (alertId) => {
    await updateDoc(doc(db, 'accidents', alertId), {
      status: 'resolved',
      resolvedAt: serverTimestamp(),
    });
  };

  const handleUpdateBeds = async () => {
    setSavingBeds(true);
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      availableBeds: Number(availableBeds) || 0,
    });
    setSavingBeds(false);
  };

  // Live queue: still-fresh unaccepted alerts, newest first, pinned above
  // whatever this hospital already has in progress.
  const unaccepted = alerts
    .filter((a) => !a.acceptedHospitalId && !isStaleUnaccepted(a, now))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  const inProgress = alerts.filter((a) => a.acceptedHospitalId && a.status !== 'resolved');
  const activeAlerts = [...unaccepted, ...inProgress];

  // History: resolved cases, plus anything left unaccepted past the
  // timeout — still acceptable from here if a hospital wants to pick it up
  // late, just no longer competing for attention in the live queue.
  const missed = alerts.filter((a) => isStaleUnaccepted(a, now));
  const resolved = alerts.filter((a) => a.status === 'resolved');
  const historyAlerts = [...missed, ...resolved].sort(
    (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
  );

  const pendingCount = unaccepted.length;
  const selectedAlert =
    activeAlerts.find((a) => a.id === selectedAlertId) ?? unaccepted[0] ?? activeAlerts[0] ?? null;

  return (
    <div className="dispatch-shell">
      <div className="dispatch-header">
        <h1 className="dispatch-title">
          <span className="topbar-brand-mark">
            <IconHospital size={15} />
          </span>
          Dispatch console
        </h1>
        <button className="btn btn-ghost btn-sm" onClick={() => signOut(auth)}>
          <IconLogout size={14} /> Log out
        </button>
      </div>

      <div className="dispatch-toolbar">
        <div className="dispatch-beds">
          <IconBed size={15} />
          <span>Beds available</span>
          <div className="bed-input-row">
            <input
              className="input"
              type="number"
              min="0"
              value={availableBeds}
              onChange={(e) => setAvailableBeds(e.target.value)}
              placeholder="0"
            />
            <button className="btn btn-primary btn-sm" onClick={handleUpdateBeds} disabled={savingBeds}>
              {savingBeds ? 'Saving…' : 'Update'}
            </button>
          </div>
        </div>

        <div className="tab-row">
          <button
            className={`btn btn-ghost btn-sm ${view === 'alerts' ? 'active' : ''}`}
            onClick={() => setView('alerts')}
          >
            <IconAlert size={13} /> Alerts
          </button>
          <button
            className={`btn btn-ghost btn-sm ${view === 'history' ? 'active' : ''}`}
            onClick={() => setView('history')}
          >
            <IconClock size={13} /> History
            {historyAlerts.length > 0 && <span className="dispatch-tab-badge">{historyAlerts.length}</span>}
          </button>
          <button
            className={`btn btn-ghost btn-sm ${view === 'analytics' ? 'active' : ''}`}
            onClick={() => setView('analytics')}
          >
            <IconChart size={13} /> Analytics
          </button>
        </div>
      </div>

      {view === 'analytics' && (
        <div className="dispatch-analytics">
          <Analytics alerts={alerts} />
        </div>
      )}

      {view === 'history' && (
        <div className="dispatch-history">
          {historyAlerts.length === 0 ? (
            <EmptyState
              icon={IconInbox}
              title="No history yet"
              description="Resolved cases and unaccepted alerts older than 10 minutes will appear here."
            />
          ) : (
            historyAlerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                stale={isStaleUnaccepted(alert, now)}
                selectable={false}
                onAccept={() => handleAcceptAlert(alert.id)}
                onResolve={() => handleResolveAlert(alert.id)}
              />
            ))
          )}
        </div>
      )}

      {view === 'alerts' && (
        <>
          <div className="dispatch-summary">
            <span className={pendingCount > 0 ? 'dispatch-summary-critical' : ''}>
              {pendingCount} unaccepted
            </span>{' '}
            · {inProgress.length} in progress
          </div>

          <div className="dispatch-mobile-tabs">
            <button
              className={`btn btn-ghost btn-sm ${mobilePane === 'list' ? 'active' : ''}`}
              onClick={() => setMobilePane('list')}
            >
              <IconList size={13} /> List
            </button>
            <button
              className={`btn btn-ghost btn-sm ${mobilePane === 'map' ? 'active' : ''}`}
              onClick={() => setMobilePane('map')}
            >
              <IconMapPin size={13} /> Map
            </button>
          </div>

          <div className="dispatch-body">
            <div className={`dispatch-list dispatch-pane ${mobilePane === 'list' ? 'is-active' : ''}`}>
              {loading ? (
                <div className="dispatch-skeleton-list" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div className="dispatch-row" key={i}>
                      <Skeleton variant="text" width="40%" />
                      <Skeleton variant="title" width="70%" />
                      <Skeleton variant="text" width="55%" />
                    </div>
                  ))}
                </div>
              ) : activeAlerts.length === 0 ? (
                <EmptyState
                  icon={IconInbox}
                  title="No active incidents"
                  description="New reports will appear here instantly."
                />
              ) : (
                activeAlerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    selectable
                    isSelected={selectedAlert?.id === alert.id}
                    isNew={newAlertIds.has(alert.id)}
                    onSelect={() => setSelectedAlertId(alert.id)}
                    onAccept={() => handleAcceptAlert(alert.id)}
                    onResolve={() => handleResolveAlert(alert.id)}
                  />
                ))
              )}
            </div>

            <div className={`dispatch-map-pane dispatch-pane ${mobilePane === 'map' ? 'is-active' : ''}`}>
              {selectedAlert ? (
                <iframe
                  key={selectedAlert.id}
                  title="Incident location"
                  className="dispatch-map-frame"
                  src={`https://www.google.com/maps?q=${selectedAlert.latitude},${selectedAlert.longitude}&z=15&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <EmptyState icon={IconMapPin} title="No incident selected" description="Select a row to see it on the map." />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default HospitalDashboard;
