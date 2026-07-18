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
      {type === 'completed' && onClearCompleted && tasks.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-500 text-xs">
            {tasks.length} görev tamamlandı
          </p>
          <button
            onClick={onClearCompleted}
            className="flex items-center gap-1.5 text-rose-400 text-xs font-medium hover:text-rose-300 transition-colors active:scale-95 py-1 px-2 rounded-lg hover:bg-rose-500/10"
          >
            <Trash2 size={12} />
            Tümünü temizle
          </button>
        </div>
      )}

      {type === 'active' && (
        <p className="text-slate-500 text-xs mb-3">
          {tasks.length} bekleyen görev
        </p>
      )}

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
