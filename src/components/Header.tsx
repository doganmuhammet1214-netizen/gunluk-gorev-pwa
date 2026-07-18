import { CheckCircle2, Clock } from 'lucide-react';

type HeaderProps = {
  activeCount: number;
  completedCount: number;
};

export function Header({ activeCount, completedCount }: HeaderProps) {
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Günaydın';
    if (hour < 18) return 'İyi günler';
    return 'İyi akşamlar';
  };

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="px-5 pt-14 pb-5 bg-gradient-to-b from-slate-900 to-slate-950">
      {/* Greeting */}
      <div className="mb-4">
        <p className="text-slate-400 text-sm font-medium capitalize">{today}</p>
        <h1 className="text-white text-2xl font-bold mt-0.5">{greeting()} 👋</h1>
        <p className="text-slate-400 text-sm mt-1">Bugün ne yapacaksın?</p>
      </div>

      {/* Stats row */}
      <div className="flex gap-3">
        <div className="flex-1 bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Clock size={18} className="text-violet-400" />
          </div>
          <div>
            <p className="text-white text-lg font-bold leading-none">{activeCount}</p>
            <p className="text-slate-500 text-xs mt-0.5">Bekleyen</p>
          </div>
        </div>

        <div className="flex-1 bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-lg font-bold leading-none">{completedCount}</p>
            <p className="text-slate-500 text-xs mt-0.5">Tamamlanan</p>
          </div>
        </div>
      </div>
    </div>
  );
}
