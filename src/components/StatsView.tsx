import { TrendingUp, Target, CheckCircle2, Clock, Flame } from 'lucide-react';
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
    <div className="px-4 pb-4 space-y-3">
      {/* Circular progress card */}
      <div
        className="border rounded-3xl p-6 flex flex-col items-center transition-colors duration-300"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div className="relative w-40 h-40 mb-4">
          {/* Glow halo */}
          <div
            className="absolute inset-4 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, rgba(124,58,237,0.8) 0%, transparent 70%)',
              filter: 'blur(12px)',
            }}
          />
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            {/* Track */}
            <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
            {/* Progress */}
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
              <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-app-primary text-3xl font-bold tracking-tight">{stats.completionRate}%</p>
            <p className="text-app-muted text-xs font-semibold mt-0.5">Tamamlama</p>
          </div>
        </div>
        <p className="text-app-secondary text-sm text-center font-medium">
          {stats.total > 0
            ? `${stats.completed} / ${stats.total} görev tamamlandı`
            : 'Henüz görev eklenmedi'}
        </p>

        {/* Mini progress bar */}
        {stats.total > 0 && (
          <div className="w-full mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${stats.completionRate}%`,
                background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
              }}
            />
          </div>
        )}
      </div>

      {/* Stat cards — 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Clock size={18} className="text-violet-400" />}
          iconBg="rgba(124,58,237,0.15)"
          label="Bekleyen"
          value={stats.active}
          sub="görev"
          accentColor="#7c3aed"
        />
        <StatCard
          icon={<CheckCircle2 size={18} className="text-emerald-400" />}
          iconBg="rgba(16,185,129,0.15)"
          label="Tamamlanan"
          value={stats.completed}
          sub="görev"
          accentColor="#10b981"
        />
        <StatCard
          icon={<Flame size={18} className="text-rose-400" />}
          iconBg="rgba(239,68,68,0.15)"
          label="Yüksek Öncelik"
          value={stats.highPriority}
          sub="bekliyor"
          accentColor="#ef4444"
        />
        <StatCard
          icon={<Target size={18} className="text-amber-400" />}
          iconBg="rgba(245,158,11,0.15)"
          label="Toplam"
          value={stats.total}
          sub="görev"
          accentColor="#f59e0b"
        />
      </div>

      {/* Priority breakdown */}
      {stats.total > 0 && (
        <div
          className="border rounded-3xl p-5 transition-colors duration-300"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <h3 className="text-app-primary text-sm font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-violet-400" />
            Öncelik Dağılımı
          </h3>
          <div className="space-y-3.5">
            {(['high', 'medium', 'low'] as const).map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className={`text-xs font-semibold w-14 ${cfg.textColor}`}>{cfg.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div
                      className={`h-full ${cfg.color} rounded-full transition-all duration-700`}
                      style={{ width: '30%' }}
                    />
                  </div>
                  <span className="text-app-muted text-xs font-medium w-6 text-right">-</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── StatCard sub-bileşeni ────────────────────────────────────────────────────

type StatCardProps = {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number;
  sub: string;
  accentColor: string;
};

function StatCard({ icon, iconBg, label, value, sub, accentColor }: StatCardProps) {
  return (
    <div
      className="border rounded-2xl p-4 transition-all duration-200 active:scale-[0.97]"
      style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <p className="text-app-primary text-2xl font-bold tracking-tight leading-none">{value}</p>
      <p className="text-app-secondary text-xs font-semibold mt-1">{label}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color: accentColor, opacity: 0.7 }}>{sub}</p>
    </div>
  );
}
