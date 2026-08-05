import { ListTodo, CheckCircle2, BarChart3 } from 'lucide-react';
import type { Tab } from '../types';

type BottomNavProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  activeCount: number;
  completedCount: number;
};

type TabItem = {
  id: Tab;
  label: string;
  Icon: React.ElementType;
};

const TABS: TabItem[] = [
  { id: 'tasks', label: 'Görevler', Icon: ListTodo },
  { id: 'completed', label: 'Tamamlanan', Icon: CheckCircle2 },
  { id: 'stats', label: 'İstatistik', Icon: BarChart3 },
];

export function BottomNav({ activeTab, onTabChange, activeCount, completedCount }: BottomNavProps) {
  const getCount = (tab: Tab): number | null => {
    if (tab === 'tasks') return activeCount;
    if (tab === 'completed') return completedCount;
    return null;
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 border-t transition-colors duration-300 select-none"
      style={{
        background: 'var(--nav-bg)',
        borderColor: 'var(--border-strong)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        /* ✅ pb-safe: iOS home indicator */
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex px-2 pt-1.5 pb-1">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          const count = getCount(id);
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all duration-200 active:scale-90 relative"
            >
              {/* Aktif tab: iOS pill background */}
              {isActive && (
                <div
                  className="absolute inset-x-2 inset-y-1 rounded-xl"
                  style={{ background: 'rgba(124,58,237,0.12)' }}
                />
              )}

              <div className="relative z-10">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  className={`transition-all duration-200 ${isActive ? 'text-violet-400 scale-110' : 'text-app-muted'}`}
                />
                {count !== null && count > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none px-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                      boxShadow: '0 2px 6px rgba(124,58,237,0.40)',
                    }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>

              <span
                className={`text-[10px] font-semibold transition-all duration-200 z-10 ${
                  isActive ? 'text-violet-400' : 'text-app-muted opacity-70'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
