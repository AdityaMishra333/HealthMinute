// Loading placeholder that mirrors the shape of the content it stands in
// for, so lists don't jump when real data arrives.
function Skeleton({ variant = 'text', width, height, className = '', style }) {
  const variantClass = variant === 'circle' ? 'skeleton-circle' : variant === 'block' ? 'skeleton-block' : variant === 'title' ? 'skeleton-title' : 'skeleton-text';

  return (
    <span
      className={`skeleton ${variantClass} ${className}`}
      style={{ display: 'block', width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export default Skeleton;
