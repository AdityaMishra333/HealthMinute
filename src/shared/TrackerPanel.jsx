import { useState } from 'react';
import { IconAmbulance, IconCheck, IconPhone, IconShare } from './Icons';
import TrackingTimeline from './TrackingTimeline';
import ElapsedTime from './ElapsedTime';
import AmbulanceTracker from './AmbulanceTracker';
import { getProgressPercent, getStatusCaps, getStatusTone, getTrackingSteps, formatShortDate } from './trackingStatus';
import './TrackerPanel.css';

// hideMap/etaOverride let a caller host its own, more prominent map instead
// of the compact one this renders inline (see UserDashboard's Uber/Ola-style
// tracking sheet) without losing the ETA shown in the hero above — the
// caller just feeds it back in once its own map computes it.
function TrackerPanel({ id, accident, onCopyLink, linkCopied, hideMap = false, etaOverride = null }) {
  const [internalEta, setInternalEta] = useState(null);
  const eta = hideMap ? etaOverride : internalEta;

  const steps = getTrackingSteps(accident);
  const progress = getProgressPercent(accident);
  const statusCaps = getStatusCaps(accident);
  const tone = getStatusTone(accident);
  const isResolved = accident.status === 'resolved';
  const hasAmbulance =
    !!accident.ambulanceLocation && (accident.status === 'accepted_by_driver' || accident.status === 'arrived');

  return (
    <div className="dt-panel">
      <div className={`dt-hero dt-hero-${tone}`}>
        <div className="dt-hero-top">
          <span className="dt-hero-id">#{id.slice(0, 8).toUpperCase()}</span>
          {onCopyLink && (
            <button type="button" className="dt-hero-icon-btn" onClick={onCopyLink} aria-label="Copy tracking link">
              {linkCopied ? <IconCheck size={14} /> : <IconShare size={14} />}
            </button>
          )}
        </div>

        <p className="dt-hero-status">{statusCaps}</p>
        <ElapsedTime
          className="dt-hero-elapsed"
          since={accident.createdAt}
          until={isResolved ? accident.resolvedAt : null}
        />

        <div className="dt-progress-track">
          <span className="dt-progress-fill" style={{ width: `${progress}%` }} />
          <span className="dt-progress-dot" style={{ left: `${progress}%` }} />
        </div>

        <div className="dt-hero-dates">
          <div>
            <p className="dt-hero-label">Reported</p>
            <p className="dt-hero-value">{formatShortDate(accident.createdAt)}</p>
          </div>
          <div className="dt-hero-right">
            <p className="dt-hero-label">{isResolved ? 'Resolved' : 'ETA'}</p>
            <p className="dt-hero-value tnum">{isResolved ? formatShortDate(accident.resolvedAt) : eta || '—'}</p>
          </div>
        </div>
      </div>

      {hasAmbulance && (
        <>
          <div className="dt-courier-row">
            <span className="dt-courier-avatar">
              <IconAmbulance size={19} />
            </span>
            <div className="dt-courier-info">
              <p className="dt-courier-label">Ambulance</p>
              <p className="dt-courier-name">
                {accident.status === 'arrived' ? 'Arrived at the accident site' : 'En route to the accident site'}
              </p>
            </div>
            <a className="dt-call-btn" href="tel:112" aria-label="Call for emergency help">
              <IconPhone size={15} />
            </a>
          </div>

          {!hideMap && <AmbulanceTracker accident={accident} onEtaChange={setInternalEta} />}
        </>
      )}

      <p className="dt-section-title">Tracking history</p>
      <TrackingTimeline steps={steps} />
    </div>
  );
}

export default TrackerPanel;
