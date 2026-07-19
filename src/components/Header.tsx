import { useState } from 'react';
import { CheckCircle2, Clock, Sun, Moon } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';

type HeaderProps = {
  activeCount: number;
  completedCount: number;
  theme: Theme;
  onToggleTheme: () => void;
};

export function Header({ activeCount, completedCount, theme, onToggleTheme }: HeaderProps) {
  const [spinning, setSpinning] = useState(false);

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

  const handleToggle = () => {
    setSpinning(true);
    onToggleTheme();
    setTimeout(() => setSpinning(false), 420);
  };

  const isDark = theme === 'dark';

  return (
    <div
      className="px-5 pt-14 pb-5 transition-colors duration-300"
      style={{ background: isDark
        ? 'linear-gradient(to bottom, var(--bg-2), var(--bg))'
        : 'linear-gradient(to bottom, var(--surface), var(--bg))'
      }}
    >
      {/* Top row: greeting + theme toggle */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-app-secondary text-sm font-medium capitalize">{today}</p>
          <h1 className="text-app-primary text-2xl font-bold mt-0.5">{greeting()} 👋</h1>
          <p className="text-app-secondary text-sm mt-1">Bugün ne yapacaksın?</p>
        </div>

        {/* Theme toggle button */}
        <button
          id="theme-toggle-btn"
          onClick={handleToggle}
          aria-label={isDark ? 'Gündüz moduna geç' : 'Gece moduna geç'}
          className={`
            mt-1 w-10 h-10 rounded-2xl flex items-center justify-center
            transition-all duration-300 active:scale-90
            ${isDark
              ? 'bg-slate-800/80 border border-slate-700/60 text-amber-400 hover:bg-slate-700/80'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
            }
          `}
        >
          {isDark
            ? <Sun size={18} className={spinning ? 'animate-theme-toggle' : ''} />
            : <Moon size={18} className={spinning ? 'animate-theme-toggle' : ''} />
          }
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-3">
        <div
          className="flex-1 backdrop-blur-sm rounded-2xl p-3.5 flex items-center gap-3 border transition-colors duration-300"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Clock size={18} className="text-violet-400" />
          </div>
          <div>
            <p className="text-app-primary text-lg font-bold leading-none">{activeCount}</p>
            <p className="text-app-muted text-xs mt-0.5">Bekleyen</p>
          </div>
        </div>

        <div
          className="flex-1 backdrop-blur-sm rounded-2xl p-3.5 flex items-center gap-3 border transition-colors duration-300"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-app-primary text-lg font-bold leading-none">{completedCount}</p>
            <p className="text-app-muted text-xs mt-0.5">Tamamlanan</p>
          </div>
        </div>
      </div>
    </div>
  );
}
