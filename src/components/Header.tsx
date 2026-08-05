import { useState } from 'react';
import { CheckCircle2, Clock, Sun, Moon, LogOut, User } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';

type HeaderProps = {
  activeCount: number;
  completedCount: number;
  theme: Theme;
  onToggleTheme: () => void;
  userEmail: string;
  onSignOut: () => void;
};

export function Header({ activeCount, completedCount, theme, onToggleTheme, userEmail, onSignOut }: HeaderProps) {
  const [spinning, setSpinning] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // E-posta kısalt
  const shortEmail = userEmail.length > 22
    ? userEmail.slice(0, 19) + '...'
    : userEmail;

  // Avatar harf
  const avatarLetter = userEmail[0]?.toUpperCase() ?? '?';

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 6)  return 'İyi geceler';
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
      className="px-5 pb-5 transition-colors duration-300 select-none"
      style={{
        /* ✅ safe-area-inset-top: iPhone notch için kritik */
        paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
        background: isDark
          ? 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(10,15,30,0.0) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(240,244,255,0.0) 100%)',
      }}
    >
      {/* Top row: greeting + controls */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-app-muted text-xs font-semibold uppercase tracking-wider">{today}</p>
          <h1 className="text-app-primary text-2xl font-bold mt-1 tracking-tight">{greeting()} 👋</h1>
          <p className="text-app-secondary text-sm mt-0.5 font-medium">Bugün ne yapacaksın?</p>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {/* Theme toggle button */}
          <button
            id="theme-toggle-btn"
            onClick={handleToggle}
            aria-label={isDark ? 'Gündüz moduna geç' : 'Gece moduna geç'}
            className={`
              w-10 h-10 rounded-2xl flex items-center justify-center
              transition-all duration-200 active:scale-90
              ${isDark
                ? 'text-amber-400 hover:opacity-80'
                : 'text-slate-600 hover:opacity-80 shadow-sm'
              }
            `}
            style={{
              background: isDark ? 'var(--surface-2)' : 'var(--surface)',
              border: `1px solid var(--border-strong)`,
            }}
          >
            {isDark
              ? <Sun size={18} className={spinning ? 'animate-theme-toggle' : ''} />
              : <Moon size={18} className={spinning ? 'animate-theme-toggle' : ''} />
            }
          </button>

          {/* Kullanıcı avatar butonu */}
          <div className="relative">
            <button
              id="user-menu-btn"
              onClick={() => setShowUserMenu((v) => !v)}
              aria-label="Kullanıcı menüsü"
              className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm text-white transition-all duration-200 active:scale-90"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                boxShadow: '0 4px 14px rgba(124,58,237,0.40)',
              }}
            >
              {avatarLetter}
            </button>

            {/* Dropdown menü */}
            {showUserMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div
                  className="absolute right-0 top-12 z-20 rounded-2xl border shadow-2xl p-2 min-w-[190px] animate-scale-in"
                  style={{
                    background: 'var(--sheet-bg)',
                    borderColor: 'var(--border-strong)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,58,237,0.08)',
                  }}
                >
                  {/* E-posta */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1">
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs text-white"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
                    >
                      {avatarLetter}
                    </div>
                    <p className="text-app-secondary text-xs truncate font-medium">{shortEmail}</p>
                  </div>
                  <div
                    className="my-1 mx-2"
                    style={{ height: '1px', background: 'var(--border)' }}
                  />
                  {/* Çıkış Yap */}
                  <button
                    onClick={() => { setShowUserMenu(false); onSignOut(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all duration-150 text-sm font-semibold active:scale-[0.97]"
                  >
                    <LogOut size={14} />
                    Çıkış Yap
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3">
        {/* Bekleyen görevler */}
        <div
          className="flex-1 rounded-2xl p-3.5 flex items-center gap-3 border transition-all duration-300"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(124,58,237,0.15)' }}
          >
            <Clock size={17} className="text-violet-400" />
          </div>
          <div>
            <p className="text-app-primary text-xl font-bold leading-none">{activeCount}</p>
            <p className="text-app-muted text-xs mt-0.5 font-medium">Bekleyen</p>
          </div>
        </div>

        {/* Tamamlanan görevler */}
        <div
          className="flex-1 rounded-2xl p-3.5 flex items-center gap-3 border transition-all duration-300"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.15)' }}
          >
            <CheckCircle2 size={17} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-app-primary text-xl font-bold leading-none">{completedCount}</p>
            <p className="text-app-muted text-xs mt-0.5 font-medium">Tamamlanan</p>
          </div>
        </div>
      </div>
    </div>
  );
}
