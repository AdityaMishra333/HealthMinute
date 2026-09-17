import { useEffect, useState } from 'react';

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000;
  return null;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Counts up live from `since` ("4:12 since reported"), escalating through
// the semantic status scale as the wait grows. If `until` is given (the case
// is resolved) it stops ticking and shows the final, frozen duration instead.
//
// Default thresholds (5 / 10 minutes) are a judgment call, not a spec'd
// value — tune per real dispatch-time data if you have it.
function ElapsedTime({ since, until, warnAfterMinutes = 5, criticalAfterMinutes = 10, className = '' }) {
  const [now, setNow] = useState(() => Date.now());
  const startMs = toMillis(since);
  const endMs = until ? toMillis(until) : null;
  const frozen = endMs != null;

  useEffect(() => {
    if (frozen || startMs == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [frozen, startMs]);

  if (startMs == null) {
    return <span className={`elapsed-time elapsed-time-neutral tnum ${className}`}>—</span>;
  }

  const elapsedMs = (frozen ? endMs : now) - startMs;
  const minutes = elapsedMs / 60000;
  const tone = frozen
    ? 'resolved'
    : minutes >= criticalAfterMinutes
    ? 'critical'
    : minutes >= warnAfterMinutes
    ? 'active'
    : 'neutral';

  const label = frozen
    ? `Resolved in ${formatDuration(elapsedMs)}`
    : `${formatDuration(elapsedMs)} since reported`;

  return (
    <span
      className={`elapsed-time elapsed-time-${tone} tnum ${className}`}
      title={frozen ? undefined : 'Time since this case was reported'}
    >
      {label}
    </span>
  );
}

export default ElapsedTime;
