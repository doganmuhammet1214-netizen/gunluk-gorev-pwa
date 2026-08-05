import { Bell, BellOff, Loader2, X } from 'lucide-react';
import type { SubscriptionStatus } from '../hooks/useNotifications';

type NotificationBannerProps = {
  status: SubscriptionStatus;
  onSubscribe: () => void;
  onDismiss: () => void;
};

export function NotificationBanner({ status, onSubscribe, onDismiss }: NotificationBannerProps) {
  const isLoading = status === 'subscribing' || status === 'checking';
  const isDenied = status === 'permission-denied';

  if (isDenied) {
    return (
      <div
        className="mx-4 mb-3 rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-in select-none"
        style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.18)',
        }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.15)' }}
        >
          <BellOff size={14} className="text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-rose-300 text-xs font-bold leading-none mb-0.5">İzin Reddedildi</p>
          <p className="text-xs leading-snug" style={{ color: 'rgba(248,113,113,0.70)' }}>
            Ayarlardan bildirim iznini açabilirsin.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-rose-400/60 hover:text-rose-300 transition-colors active:scale-90 flex-shrink-0 p-1"
          aria-label="Kapat"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-4 mb-3 rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-in select-none"
      style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(99,102,241,0.08))',
        border: '1px solid rgba(124,58,237,0.20)',
      }}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: 'rgba(124,58,237,0.18)',
          border: '1px solid rgba(124,58,237,0.20)',
        }}
      >
        <Bell size={15} className="text-violet-400" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-app-primary text-xs font-bold leading-none mb-0.5">
          Hatırlatıcıları Aktif Et
        </p>
        <p className="text-app-secondary text-[11px] leading-snug">
          Hiçbir görevi kaçırma.
        </p>
      </div>

      {/* CTA */}
      <button
        id="notification-enable-btn"
        onClick={onSubscribe}
        disabled={isLoading}
        className="flex-shrink-0 flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          boxShadow: '0 4px 12px rgba(124,58,237,0.35)',
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={11} className="animate-spin" />
            <span>Yükleniyor</span>
          </>
        ) : (
          <>
            <Bell size={11} />
            <span>Aç</span>
          </>
        )}
      </button>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="text-app-muted hover:text-app-secondary transition-colors active:scale-90 flex-shrink-0 -ml-1 p-1"
        aria-label="Kapat"
      >
        <X size={13} />
      </button>
    </div>
  );
}
