// ============================================================================
// NotificationHost — the single toast surface for the whole app
// ============================================================================
// Subscribes to the shared notificationStore and renders a stack of dismissible
// toasts in the bottom-center of the viewport. Mounted once (in App). Every
// error/success/info message in the app flows through here, so the picker, the
// dropzone, and the save flow all look and behave the same.
// ============================================================================

import { useNotificationStore } from "@/core/state/notificationStore";

import "@/features/notifications/NotificationHost.css";

export default function NotificationHost() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (notifications.length === 0) return null;

  return (
    <div className="notification-host" aria-live="polite">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="notification-toast"
          data-level={n.level}
          role={n.level === "error" ? "alert" : "status"}
        >
          <div className="notification-toast-body">
            <div className="notification-toast-title">{n.title}</div>
            {n.detail !== undefined && n.detail !== "" ? (
              <pre className="notification-toast-detail">{n.detail}</pre>
            ) : null}
          </div>
          <button
            type="button"
            className="notification-toast-dismiss"
            onClick={() => {
              dismiss(n.id);
            }}
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
