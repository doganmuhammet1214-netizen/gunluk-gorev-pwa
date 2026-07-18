import { ClipboardList, CheckCircle2 } from 'lucide-react';

type EmptyStateProps = {
  type: 'active' | 'completed';
};

export function EmptyState({ type }: EmptyStateProps) {
  if (type === 'active') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-5">
          <ClipboardList size={32} className="text-violet-400" />
        </div>
        <h3 className="text-white font-semibold text-base mb-2">Görev yok</h3>
        <p className="text-slate-500 text-sm leading-relaxed">
          Yeni görev eklemek için aşağıdaki{' '}
          <span className="text-violet-400 font-medium">+ düğmesine</span> tıkla
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
        <CheckCircle2 size={32} className="text-emerald-400" />
      </div>
      <h3 className="text-white font-semibold text-base mb-2">Henüz tamamlanan yok</h3>
      <p className="text-slate-500 text-sm leading-relaxed">
        Görevleri tamamladıkça burada görünecek
      </p>
    </div>
  );
}
