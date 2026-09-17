function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  return null;
}

export function formatRelativeTime(ts) {
  const date = toDate(ts);
  if (!date) return null;

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function formatShortDate(ts) {
  const date = toDate(ts);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function getTrackingSteps(accident) {
  const hospitalDone = !!accident.acceptedHospitalId;
  const dispatched =
    accident.status === 'accepted_by_driver' || accident.status === 'arrived' || accident.status === 'resolved';
  const arrived = accident.status === 'arrived' || accident.status === 'resolved';
  const resolved = accident.status === 'resolved';

  const raw = [
    { key: 'reported', label: 'Accident reported', done: true, ts: accident.createdAt },
    { key: 'hospital', label: 'Hospital notified', done: hospitalDone || resolved, ts: accident.hospitalAcceptedAt },
    { key: 'dispatched', label: 'Ambulance dispatched', done: dispatched, ts: accident.driverAcceptedAt },
    { key: 'arrived', label: 'Ambulance arrived', done: arrived, ts: accident.arrivedAt },
    { key: 'resolved', label: 'Case resolved', done: resolved, ts: accident.resolvedAt },
  ];

  const doneCount = raw.filter((s) => s.done).length;

  return raw.map((step, i) => {
    const active = !step.done && i === doneCount;
    // Display colour only: the very first pending step (nobody has
    // accepted the case yet) is the one true "critical, unaccepted
    // emergency" moment. Once a hospital has accepted, later in-progress
    // steps read as "active" (in hand), not critical.
    const tone = step.done ? 'resolved' : active ? (step.key === 'hospital' ? 'critical' : 'active') : 'neutral';
    return {
      ...step,
      active,
      tone,
      time: step.done ? formatRelativeTime(step.ts) : null,
    };
  });
}

// Single source of truth for "what colour is this case right now",
// shared by the reporter's tracker, the hospital list and the driver list.
export function getStatusTone(accident) {
  if (accident.status === 'resolved') return 'resolved';
  if (accident.status === 'arrived') return 'active';
  if (accident.status === 'accepted_by_driver') return 'active';
  if (accident.acceptedHospitalId) return 'active';
  return 'critical';
}

export function getProgressPercent(accident) {
  const steps = getTrackingSteps(accident);
  const doneCount = steps.filter((s) => s.done).length;
  return Math.max(6, Math.round((doneCount / steps.length) * 100));
}

export function getStatusCaps(accident) {
  if (accident.status === 'resolved') return 'RESOLVED';
  if (accident.status === 'arrived') return 'AMBULANCE ARRIVED';
  if (accident.status === 'accepted_by_driver') return 'AMBULANCE EN ROUTE';
  if (accident.acceptedHospitalId) return 'HOSPITAL NOTIFIED';
  return 'REPORTED';
}

