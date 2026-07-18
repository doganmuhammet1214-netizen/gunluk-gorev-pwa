import { useState, useRef, useEffect } from 'react';
import { X, Plus, ChevronDown, StickyNote } from 'lucide-react';
import type { TaskFormData, Priority } from '../types';
import { PRIORITY_CONFIG } from '../types';

type TaskFormProps = {
  onAdd: (data: TaskFormData) => void;
  onClose: () => void;
};

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export function TaskForm({ onAdd, onClose }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [showNote, setShowNote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title, note, priority });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-t-3xl p-5 pb-8 animate-slide-up shadow-2xl">
        {/* Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-700" />

        {/* Header */}
        <div className="flex items-center justify-between mt-3 mb-5">
          <h2 className="text-white text-lg font-bold">Yeni Görev</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Görev başlığı..."
              maxLength={120}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-4 py-3.5 text-white text-sm placeholder-slate-500 outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/30 transition-all"
            />
          </div>

          {/* Priority selector */}
          <div>
            <p className="text-slate-500 text-xs font-medium mb-2 px-1">Öncelik</p>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => {
                const cfg = PRIORITY_CONFIG[p];
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`
                      flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95
                      flex items-center justify-center gap-1.5
                      ${active
                        ? `${cfg.badgeBg} ${cfg.badgeText} border-2 ${cfg.borderColor} shadow-sm`
                        : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600'
                      }
                    `}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? cfg.dotColor : 'bg-slate-600'}`} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note toggle */}
          <button
            type="button"
            onClick={() => setShowNote(!showNote)}
            className="w-full flex items-center gap-2 text-slate-500 text-xs py-1 hover:text-slate-300 transition-colors"
          >
            <StickyNote size={13} />
            {showNote ? 'Notu gizle' : 'Not ekle (isteğe bağlı)'}
            <ChevronDown
              size={13}
              className={`ml-auto transition-transform duration-200 ${showNote ? 'rotate-180' : ''}`}
            />
          </button>

          {showNote && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Not ekle..."
              rows={3}
              maxLength={500}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/30 transition-all resize-none"
            />
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!title.trim()}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-violet-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30"
          >
            <Plus size={18} />
            Görevi Ekle
          </button>
        </form>
      </div>
    </div>
  );
}
