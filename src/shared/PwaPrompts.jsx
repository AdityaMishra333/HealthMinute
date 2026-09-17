import { useSyncExternalStore } from 'react';
import {
  applyUpdate,
  dismissInstall,
  getSnapshot,
  getServerSnapshot,
  promptInstall,
  subscribe,
} from './pwa';
import { IconClose, IconInstall, IconRefresh } from './Icons';
import './PwaPrompts.css';

// Two non-blocking pills pinned under the topbar: "install this app" when the
// browser offers it, and "a new version is ready" when a worker is waiting.
// Mounted once from App.jsx so every route gets them.

function PwaPrompts() {
  const { needRefresh, canInstall, installed } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // canInstall is only ever true when beforeinstallprompt actually fired and
  // the app is not already running standalone.
  const showInstall = canInstall && !installed;

  if (!needRefresh && !showInstall) return null;

  return (
    <div className="pwa-prompts">
      {needRefresh && (
        <div className="toast pwa-prompt" role="status">
          <IconRefresh size={15} />
          <span>New version available</span>
          <button
            type="button"
            className="toast-action"
            onClick={applyUpdate}
          >
            Reload
          </button>
        </div>
      )}

      {showInstall && (
        <div className="toast pwa-prompt" role="status">
          <IconInstall size={15} />
          <span>Install HealthMinute</span>
          <button
            type="button"
            className="toast-action"
            onClick={promptInstall}
          >
            Install
          </button>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss install prompt"
            onClick={dismissInstall}
          >
            <IconClose size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default PwaPrompts;
