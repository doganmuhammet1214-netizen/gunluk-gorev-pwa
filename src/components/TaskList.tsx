import type { Task } from '../types';
import { TaskCard } from './TaskCard';
import { EmptyState } from './EmptyState';
import { Trash2 } from 'lucide-react';

type TaskListProps = {
  tasks: Task[];
  type: 'active' | 'completed';
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClearCompleted?: () => void;
};

export function TaskList({ tasks, type, onToggle, onDelete, onClearCompleted }: TaskListProps) {
  if (tasks.length === 0) {
    return <EmptyState type={type} />;
  }

  return (
    <div className="px-4 pb-4">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-app-muted text-xs font-semibold uppercase tracking-wider">
          {type === 'active'
            ? `${tasks.length} Bekleyen Görev`
            : `${tasks.length} Tamamlanan`
          }
        </p>

        {type === 'completed' && onClearCompleted && tasks.length > 0 && (
          <button
            onClick={onClearCompleted}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-200 active:scale-95"
            style={{
              color: '#f87171',
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}
          >
            <Trash2 size={11} />
            Tümünü temizle
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
