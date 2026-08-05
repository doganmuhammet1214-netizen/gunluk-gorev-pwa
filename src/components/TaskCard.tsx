import { useState } from 'react';
import { Check, Trash2, ChevronDown, ChevronUp, FileText, Bell } from 'lucide-react';
import type { Task } from '../types';
import { PRIORITY_CONFIG } from '../types';

type TaskCardProps = {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TaskCard({ task, onToggle, onDelete }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const config = PRIORITY_CONFIG[task.priority];

  const handleDelete = () => {
    setDeleting(true);
    setTimeout(() => onDelete(task.id), 280);
  };

  const formattedDate = new Date(task.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const reminderLabel = task.reminder_time
    ? new Date(task.reminder_time).toLocaleString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className={`
        relative border rounded-2xl overflow-hidden
        transition-all duration-300 ease-out animate-task-in
        active:scale-[0.98]
        ${deleting ? 'opacity-0 scale-95 translate-x-4' : 'opacity-100 scale-100 translate-x-0'}
        ${task.completed ? 'opacity-55' : ''}
      `}
      style={{
        background: 'var(--surface-alt)',
        borderColor: 'var(--border)',
        /* Subtle priority glow on the left edge */
        borderLeft: task.completed ? undefined : `3px solid ${getPriorityColor(task.priority)}`,
      }}
    >
      {/* Priority accent strip — top */}
      {!task.completed && (
        <div
          className="absolute top-0 left-0 right-0 h-px opacity-40"
          style={{ background: getPriorityGradient(task.priority) }}
        />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox — min 44px tap target */}
          <button
            onClick={() => onToggle(task.id)}
            className={`
              mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0
              transition-all duration-200 active:scale-90 -ml-0.5
              ${task.completed
                ? 'bg-emerald-500 border-emerald-500'
                : 'bg-transparent hover:border-violet-400/60'
              }
            `}
            style={!task.completed ? { borderColor: 'var(--border-strong)' } : {}}
            aria-label={task.completed ? 'Görevi geri al' : 'Görevi tamamla'}
          >
            {task.completed && <Check size={14} strokeWidth={3} className="text-white" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-sm font-semibold leading-snug transition-all duration-200 ${
                  task.completed ? 'line-through text-app-muted' : 'text-app-primary'
                }`}
              >
                {task.title}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {task.note && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-app-muted hover:text-app-secondary transition-colors active:scale-90"
                    style={{ background: 'var(--surface)' }}
                    aria-label={expanded ? 'Notu gizle' : 'Notu göster'}
                  >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-app-muted hover:text-rose-400 transition-all duration-150 active:scale-90"
                  style={{ background: 'var(--surface)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.10)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                  aria-label="Görevi sil"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${config.badgeBg} ${config.badgeText}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
                {config.label}
              </span>
              <span className="text-app-faint text-[10px] font-medium">{formattedDate}</span>
              {reminderLabel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(124,58,237,0.12)', color: '#a78bfa' }}
                >
                  <Bell size={9} strokeWidth={2.5} />
                  {reminderLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Note expansion */}
        {task.note && expanded && (
          <div
            className="mt-3 ml-9 pt-3 border-t animate-fade-in"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-start gap-2">
              <FileText size={11} className="text-app-muted mt-0.5 flex-shrink-0" />
              <p className="text-app-secondary text-xs leading-relaxed">{task.note}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':   return '#ef4444';  // rose-500
    case 'medium': return '#f59e0b';  // amber-500
    default:       return '#22c55e';  // green-500
  }
}

function getPriorityGradient(priority: string): string {
  switch (priority) {
    case 'high':   return 'linear-gradient(90deg, rgba(239,68,68,0.5), transparent)';
    case 'medium': return 'linear-gradient(90deg, rgba(245,158,11,0.5), transparent)';
    default:       return 'linear-gradient(90deg, rgba(34,197,94,0.5), transparent)';
  }
}
