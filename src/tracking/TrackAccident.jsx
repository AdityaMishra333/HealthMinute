import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import LiveRouteMap from '../shared/LiveRouteMap';
import TrackerPanel from '../shared/TrackerPanel';
import EmptyState from '../shared/EmptyState';
import { IconArrowLeft, IconShare, IconCheck, IconLocationOff } from '../shared/Icons';
import './TrackAccident.css';

function TrackAccident() {
  const { accidentId } = useParams();
  const navigate = useNavigate();
  const [accident, setAccident] = useState(null);
  const [notFound, setNotFound] = useState(false);
  // TrackerPanel now computes its own ETA internally from its embedded
  // AmbulanceTracker; this page's own top-level route map still reports one
  // via onEtaChange, just no longer displayed anywhere on this page.
  const [, setEta] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'accidents', accidentId),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          return;
        }
        setAccident(snap.data());
      },
      () => setNotFound(true)
    );
    return () => unsubscribe();
  }, [accidentId]);

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  if (notFound) {
    return (
      <div className="tracking-page tracking-page-empty">
        <EmptyState
          icon={IconLocationOff}
          title="Link not found"
          description="This tracking link is invalid or has expired."
        />
      </div>
    );
  }

  if (!accident) {
    return (
      <div className="tracking-page tracking-page-empty">
        <span className="spinner spinner-lg" />
        <p className="tracking-loading-label">Loading tracking info…</p>
      </div>
    );
  }

  const hasDriver = !!accident.driverLocation;

  return (
    <div className="tracking-page">
      <div className="tracking-map-layer">
        {hasDriver ? (
          <LiveRouteMap
            origin={accident.driverLocation}
            destination={{ latitude: accident.latitude, longitude: accident.longitude }}
            onEtaChange={setEta}
            className="tracking-live-map"
            showRecenter
          />
        ) : (
          <div className="tracking-static-map">
            <iframe
              title="Accident location"
              src={`https://www.google.com/maps?q=${accident.latitude},${accident.longitude}&z=15&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
      </div>

      <div className="tracking-topbar">
        <button className="tracking-round-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <IconArrowLeft size={18} />
        </button>
        <span className="tracking-brand-chip">HealthMinute</span>
        <button className="tracking-round-btn" onClick={handleShare} aria-label="Copy tracking link">
          {linkCopied ? <IconCheck size={16} /> : <IconShare size={16} />}
        </button>
      </div>

      <div className="tracking-sheet">
        <div className="tracking-sheet-handle" />
        <TrackerPanel id={accidentId} accident={accident} />
      </div>
    </div>
  );
}

export default TrackAccident;
