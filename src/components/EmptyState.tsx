import { ClipboardList, CheckCircle2 } from 'lucide-react';

type EmptyStateProps = {
  type: 'active' | 'completed';
};

export function EmptyState({ type }: EmptyStateProps) {
  if (type === 'active') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
        {/* Floating icon */}
        <div className="relative mb-6">
          {/* Glow */}
          <div
            className="absolute inset-0 rounded-3xl opacity-40"
            style={{
              background: 'radial-gradient(circle, rgba(124,58,237,0.6) 0%, transparent 70%)',
              filter: 'blur(16px)',
              transform: 'scale(1.3)',
            }}
          />
          <div
            className="relative w-24 h-24 rounded-3xl flex items-center justify-center animate-float"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.20), rgba(124,58,237,0.08))',
              border: '1px solid rgba(124,58,237,0.25)',
            }}
          >
            <ClipboardList size={36} className="text-violet-400" strokeWidth={1.5} />
          </div>
        </div>

        <h3 className="text-app-primary font-bold text-lg mb-2 tracking-tight">Görev yok</h3>
        <p className="text-app-secondary text-sm leading-relaxed max-w-[200px]">
          Yeni görev eklemek için{' '}
          <span
            className="font-bold"
            style={{ color: '#a78bfa' }}
          >
            + düğmesine
          </span>{' '}
          tıkla
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      {/* Floating icon */}
      <div className="relative mb-6">
        {/* Glow */}
        <div
          className="absolute inset-0 rounded-3xl opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(16,185,129,0.6) 0%, transparent 70%)',
            filter: 'blur(16px)',
            transform: 'scale(1.3)',
          }}
        />
        <div
          className="relative w-24 h-24 rounded-3xl flex items-center justify-center animate-float"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.20), rgba(16,185,129,0.08))',
            border: '1px solid rgba(16,185,129,0.25)',
            animationDelay: '0.5s',
          }}
        >
          <CheckCircle2 size={36} className="text-emerald-400" strokeWidth={1.5} />
        </div>
      </div>

      <h3 className="text-app-primary font-bold text-lg mb-2 tracking-tight">Henüz tamamlanan yok</h3>
      <p className="text-app-secondary text-sm leading-relaxed max-w-[200px]">
        Görevleri tamamladıkça burada görünecek
      </p>
    </div>
  );
}
