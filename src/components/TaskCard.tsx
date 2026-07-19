import { useState } from 'react';
import { Check, Trash2, ChevronDown, ChevronUp, FileText } from 'lucide-react';
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

  return (
    <div
      className={`
        relative backdrop-blur-sm border-l-4 ${config.borderColor}
        rounded-2xl transition-all duration-300 ease-out overflow-hidden
        ${deleting ? 'opacity-0 scale-95 translate-x-4' : 'opacity-100 scale-100 translate-x-0'}
        ${task.completed ? 'opacity-60' : ''}
        active:scale-[0.98]
      `}
      style={{
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderLeftWidth: 4,
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={() => onToggle(task.id)}
            className={`
              mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0
              transition-all duration-200 active:scale-90
              ${task.completed
                ? 'border-emerald-500 bg-emerald-500'
                : 'bg-transparent'
              }
            `}
            style={!task.completed ? { borderColor: 'var(--border-strong)' } : {}}
          >
            {task.completed && <Check size={13} strokeWidth={3} className="text-white" />}
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
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-app-muted hover:text-app-secondary hover:bg-surface transition-colors active:scale-90"
                  >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-app-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors active:scale-90"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.badgeBg} ${config.badgeText}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
                {config.label}
              </span>
              <span className="text-app-faint text-[10px]">{formattedDate}</span>
            </div>
          </div>
        </div>

        {/* Note expansion */}
        {task.note && expanded && (
          <div className="mt-3 ml-9 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start gap-2">
              <FileText size={12} className="text-app-muted mt-0.5 flex-shrink-0" />
              <p className="text-app-secondary text-xs leading-relaxed">{task.note}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
