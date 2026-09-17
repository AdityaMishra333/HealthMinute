function toMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000;
  return null;
}

function severityBucket(score) {
  if (score == null) return null;
  if (score < 34) return 'low';
  if (score < 67) return 'medium';
  return 'high';
}

// Resolved via CSS custom properties (see --chart-severity-* in App.css) so
// no hex is hardcoded here, and the dark dispatch console re-themes them
// automatically through the cascade.
const SEVERITY_COLOR_VARS = {
  low: 'var(--chart-severity-low)',
  medium: 'var(--chart-severity-medium)',
  high: 'var(--chart-severity-high)',
};

function Analytics({ alerts }) {
  const mine = alerts.filter((a) => a.acceptedHospitalId);
  const resolvedCount = mine.filter((a) => a.status === 'resolved').length;

  const responseTimes = mine
    .map((a) => {
      const created = toMs(a.createdAt);
      const accepted = toMs(a.driverAcceptedAt);
      return created && accepted ? (accepted - created) / 60000 : null;
    })
    .filter((v) => v != null);

  const avgResponseMinutes = responseTimes.length
    ? responseTimes.reduce((sum, v) => sum + v, 0) / responseTimes.length
    : null;

  const severityCounts = { low: 0, medium: 0, high: 0 };
  mine.forEach((a) => {
    const bucket = severityBucket(a.severity);
    if (bucket) severityCounts[bucket] += 1;
  });
  const maxSeverityCount = Math.max(1, ...Object.values(severityCounts));

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const dayCounts = days.map((d) => {
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return mine.filter((a) => {
      const ms = toMs(a.createdAt);
      return ms != null && ms >= dayStart && ms < dayEnd;
    }).length;
  });
  const maxDayCount = Math.max(1, ...dayCounts);

  return (
    <div className="card">
      <p className="card-title">Analytics</p>

      <div className="stat-grid">
        <div className="stat-tile">
          <p className="stat-value tnum">{mine.length}</p>
          <p className="stat-label">Cases handled</p>
        </div>
        <div className="stat-tile">
          <p className="stat-value tnum">{resolvedCount}</p>
          <p className="stat-label">Resolved</p>
        </div>
        <div className="stat-tile">
          <p className="stat-value tnum">{avgResponseMinutes != null ? avgResponseMinutes.toFixed(1) : '—'}</p>
          <p className="stat-label">Avg. response (min)</p>
        </div>
      </div>

      <p className="chart-label">Severity distribution</p>
      <svg width="100%" height="90" viewBox="0 0 300 90" role="img" aria-label="Severity distribution">
        {['low', 'medium', 'high'].map((bucket, i) => {
          const value = severityCounts[bucket];
          const barWidth = (value / maxSeverityCount) * 210;
          return (
            <g key={bucket} transform={`translate(0, ${i * 28})`}>
              <text x="0" y="14" fontSize="11" style={{ fill: 'var(--chart-axis-text)' }}>
                {bucket}
              </text>
              <rect
                x="55"
                y="4"
                width={barWidth}
                height="16"
                rx="3"
                style={{ fill: SEVERITY_COLOR_VARS[bucket] }}
              />
              <text x={63 + barWidth} y="16" fontSize="11" className="tnum" style={{ fill: 'var(--chart-value-text)' }}>
                {value}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="chart-label">Cases — last 7 days</p>
      <svg width="100%" height="90" viewBox="0 0 300 90" role="img" aria-label="Cases in the last 7 days">
        {dayCounts.map((count, i) => {
          const barHeight = (count / maxDayCount) * 60;
          const x = i * 42 + 6;
          return (
            <g key={i}>
              <rect x={x} y={70 - barHeight} width="24" height={barHeight} rx="3" style={{ fill: 'var(--chart-bar)' }} />
              <text
                x={x + 12}
                y="84"
                fontSize="10"
                textAnchor="middle"
                style={{ fill: 'var(--chart-axis-text)' }}
              >
                {days[i].toLocaleDateString(undefined, { weekday: 'short' })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default Analytics;
