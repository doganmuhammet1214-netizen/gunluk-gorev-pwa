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
    <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/80 px-2 pb-6 pt-2 safe-area-bottom">
      <div className="flex">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          const count = getCount(id);
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`
                flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-200 active:scale-90 relative
                ${isActive ? 'text-violet-400' : 'text-slate-600 hover:text-slate-400'}
              `}
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2 : 1.5}
                  className={`transition-all duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}
                />
                {count !== null && count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium transition-all duration-200 ${
                  isActive ? 'opacity-100' : 'opacity-60'
                }`}
              >
                {label}
              </span>
              {isActive && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-violet-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
