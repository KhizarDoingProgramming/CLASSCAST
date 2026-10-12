import { useCallback, useState } from 'react';

interface NotificationState {
  type: 'success' | 'error' | 'info';
  message: string;
}

export function useNotification() {
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const showNotification = useCallback((type: NotificationState['type'], message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  return { notification, showNotification };
}

interface NotificationToastProps {
  notification: NotificationState | null;
}

export function NotificationToast({ notification }: NotificationToastProps) {
  if (!notification) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
        notification.type === 'success'
          ? 'bg-emerald-600 text-white'
          : notification.type === 'error'
          ? 'bg-red-600 text-white'
          : 'bg-primary-600 text-white'
      }`}
    >
      {notification.message}
    </div>
  );
}
