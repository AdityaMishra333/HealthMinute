// Semantic status badge: colour is always paired with an icon and a label,
// so the meaning survives grayscale and red-green colour blindness.
// `tone` is one of 'critical' | 'active' | 'resolved' | 'neutral'.
function StatusPill({ tone = 'neutral', label, icon: Icon, size = 'md' }) {
  return (
    <span className={`status-pill status-pill-${tone} status-pill-${size}`}>
      {Icon && <Icon size={size === 'sm' ? 11 : 13} />}
      {label}
    </span>
  );
}

export default StatusPill;
