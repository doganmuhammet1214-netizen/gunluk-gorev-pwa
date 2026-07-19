export type Priority = 'low' | 'medium' | 'high';

export type Tab = 'tasks' | 'completed' | 'stats';

export type Task = {
  id: string;
  title: string;
  note?: string;
  priority: Priority;
  completed: boolean;
  created_at: string;
  completed_at?: string;
  reminder_time?: string | null; // ISO 8601 — bildirim zamanı
  user_id?: string;
};

export type TaskFormData = {
  title: string;
  note: string;
  priority: Priority;
  reminder_time: string | null; // ISO 8601 — null ise bildirim yok
};

export const PRIORITY_CONFIG = {
  low: {
    label: 'Düşük',
    color: 'bg-emerald-500',
    borderColor: 'border-l-emerald-500',
    textColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-400',
    dotColor: 'bg-emerald-400',
  },
  medium: {
    label: 'Orta',
    color: 'bg-amber-500',
    borderColor: 'border-l-amber-500',
    textColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-400',
    dotColor: 'bg-amber-400',
  },
  high: {
    label: 'Yüksek',
    color: 'bg-rose-500',
    borderColor: 'border-l-rose-500',
    textColor: 'text-rose-400',
    badgeBg: 'bg-rose-500/20',
    badgeText: 'text-rose-400',
    dotColor: 'bg-rose-400',
  },
} as const;
