import { useEffect } from 'react';
import { IconClose } from './Icons';

// Reusable dialog primitive for the design system. Not currently wired into
// any flow in the app — added because the design system asked for it, ready
// for the first screen that needs a confirm/detail dialog.
function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <p className="modal-title">{title}</p>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
