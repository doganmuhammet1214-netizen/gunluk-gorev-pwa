import { TrendingUp, Target, Zap, CheckCircle2, Clock, Flame } from 'lucide-react';
import { PRIORITY_CONFIG } from '../types';

type StatsViewProps = {
  stats: {
    total: number;
    completed: number;
    active: number;
    highPriority: number;
    completionRate: number;
  };
};

export function StatsView({ stats }: StatsViewProps) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (stats.completionRate / 100) * circumference;

  return (
    <div className="px-4 pb-4">
      {/* Circular progress */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-3xl p-6 mb-4 flex flex-col items-center">
        <div className="relative w-36 h-36 mb-4">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="rgb(30 41 59)" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="url(#progressGrad)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
            <defs>
              <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-white text-3xl font-bold">{stats.completionRate}%</p>
            <p className="text-slate-500 text-xs">Tamamlama</p>
          </div>
        </div>
        <p className="text-slate-400 text-sm text-center">
          {stats.total > 0
            ? `${stats.completed} / ${stats.total} görev tamamlandı`
            : 'Henüz görev eklenmedi'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Clock size={18} className="text-violet-400" />}
          bgColor="bg-violet-500/10"
          label="Bekleyen"
          value={stats.active}
          sub="görev"
        />
        <StatCard
          icon={<CheckCircle2 size={18} className="text-emerald-400" />}
          bgColor="bg-emerald-500/10"
          label="Tamamlanan"
          value={stats.completed}
          sub="görev"
        />
        <StatCard
          icon={<Flame size={18} className="text-rose-400" />}
          bgColor="bg-rose-500/10"
          label="Yüksek Öncelik"
          value={stats.highPriority}
          sub="bekliyor"
        />
        <StatCard
          icon={<Target size={18} className="text-amber-400" />}
          bgColor="bg-amber-500/10"
          label="Toplam"
          value={stats.total}
          sub="görev"
        />
      </div>

      {/* Priority breakdown */}
      {stats.total > 0 && (
        <div className="mt-4 bg-slate-800/60 border border-slate-700/50 rounded-3xl p-5">
          <h3 className="text-white text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-violet-400" />
            Öncelik Dağılımı
          </h3>
          <div className="space-y-3">
            {(['high', 'medium', 'low'] as const).map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className={`text-xs font-medium w-12 ${cfg.textColor}`}>{cfg.label}</span>
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${cfg.color} rounded-full transition-all duration-700`} style={{ width: '30%' }} />
                  </div>
                  <span className="text-slate-500 text-xs w-8 text-right">-</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type StatCardProps = {
  icon: React.ReactNode;
  bgColor: string;
  label: string;
  value: number;
  sub: string;
};

function StatCard({ icon, bgColor, label, value, sub }: StatCardProps) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
      <p className="text-slate-600 text-[10px]">{sub}</p>
    </div>
  );
}
