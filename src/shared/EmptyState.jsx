// Consistent empty/error placeholder, used wherever a list or panel has
// nothing to show yet (or failed to load).
function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={28} />}
      {title && <p className="empty-state-title">{title}</p>}
      {description && <p>{description}</p>}
    </div>
  );
}

export default EmptyState;
