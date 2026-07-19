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
      <div className="mx-4 mb-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 flex items-center gap-3 animate-fade-in">
        <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center flex-shrink-0">
          <BellOff size={15} className="text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-rose-300 text-xs font-semibold leading-none mb-0.5">İzin Reddedildi</p>
          <p className="text-rose-400/70 text-[11px] leading-snug">
            Ayarlardan bildirim iznini açabilirsin.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-rose-400/60 hover:text-rose-300 transition-colors active:scale-90 flex-shrink-0"
          aria-label="Kapat"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-2xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 px-4 py-3 flex items-center gap-3 animate-fade-in">
      {/* Icon */}
      <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
        <Bell size={16} className="text-violet-400" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold leading-none mb-0.5">
          Hatırlatıcıları Aktif Et
        </p>
        <p className="text-slate-400 text-[11px] leading-snug">
          Görev bildirimlerini al, hiçbir şeyi kaçırma.
        </p>
      </div>

      {/* CTA button */}
      <button
        id="notification-enable-btn"
        onClick={onSubscribe}
        disabled={isLoading}
        className="flex-shrink-0 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800/60 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-200 active:scale-90 shadow-md shadow-violet-900/40"
      >
        {isLoading ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            <span>Yükleniyor</span>
          </>
        ) : (
          <>
            <Bell size={12} />
            <span>Aç</span>
          </>
        )}
      </button>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="text-slate-500 hover:text-slate-400 transition-colors active:scale-90 flex-shrink-0 -ml-1"
        aria-label="Kapat"
      >
        <X size={14} />
      </button>
    </div>
  );
}
