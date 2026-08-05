import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, Bell, BellOff, ChevronDown, StickyNote, ChevronUp, Loader2 } from 'lucide-react';
import type { TaskFormData, Priority } from '../types';
import { PRIORITY_CONFIG } from '../types';

type TaskFormProps = {
  onAdd: (data: TaskFormData) => void;
  onClose: () => void;
  isSubmitting?: boolean;
};

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

// Saat listesi: 00-23
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
// Dakika listesi: 00-55 (5'er 5'er)
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// ── Drum scroller yardımcı bileşeni ─────────────────────────────────────────
type DrumProps = {
  items: string[];
  selected: string;
  onChange: (val: string) => void;
  label: string;
};

function DrumScroller({ items, selected, onChange, label }: DrumProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ITEM_H = 40; // px

  const scrollTo = useCallback((val: string, animated = true) => {
    const idx = items.indexOf(val);
    if (idx === -1 || !containerRef.current) return;
    containerRef.current.scrollTo({
      top: idx * ITEM_H,
      behavior: animated ? 'smooth' : 'instant',
    });
  }, [items]);

  useEffect(() => {
    scrollTo(selected, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const idx = Math.round(scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    onChange(items[clamped]);
  }, [items, onChange]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-app-muted text-[10px] font-bold uppercase tracking-widest mb-0.5">
        {label}
      </span>
      <div className="relative w-14">
        {/* Seçim çerçevesi */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 rounded-xl pointer-events-none z-10 border-2"
          style={{
            borderColor: 'rgba(124,58,237,0.50)',
            background: 'rgba(124,58,237,0.10)',
          }}
        />
        {/* Fade — üst */}
        <div
          className="absolute inset-x-0 top-0 h-10 pointer-events-none z-10 rounded-t-xl"
          style={{ background: 'linear-gradient(to bottom, var(--sheet-bg) 0%, transparent 100%)' }}
        />
        {/* Fade — alt */}
        <div
          className="absolute inset-x-0 bottom-0 h-10 pointer-events-none z-10 rounded-b-xl"
          style={{ background: 'linear-gradient(to top, var(--sheet-bg) 0%, transparent 100%)' }}
        />

        {/* Scroll container — 3 item görünür */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="overflow-y-scroll scrollbar-none"
          style={{
            height: ITEM_H * 3,
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div style={{ height: ITEM_H }} />
          {items.map((item) => (
            <div
              key={item}
              onClick={() => { onChange(item); scrollTo(item); }}
              className="flex items-center justify-center cursor-pointer transition-all duration-150"
              style={{
                height: ITEM_H,
                scrollSnapAlign: 'center',
                color: item === selected ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: item === selected ? 700 : 400,
                fontSize: item === selected ? 20 : 15,
              }}
            >
              {item}
            </div>
          ))}
          <div style={{ height: ITEM_H }} />
        </div>
      </div>
    </div>
  );
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────
export function TaskForm({ onAdd, onClose, isSubmitting = false }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [showNote, setShowNote] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultHour = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return String(d.getHours()).padStart(2, '0');
  };
  const [selHour, setSelHour] = useState(defaultHour);
  const [selMinute, setSelMinute] = useState('00');

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    let reminder_time: string | null = null;
    if (showReminder) {
      const now = new Date();
      const chosen = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        Number(selHour),
        Number(selMinute),
        0,
        0
      );
      if (chosen <= now) chosen.setDate(chosen.getDate() + 1);
      reminder_time = chosen.toISOString();
    }

    onAdd({ title, note, priority, reminder_time });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'var(--overlay)' }}
        onClick={isSubmitting ? undefined : onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-sm border rounded-t-3xl pt-5 px-5 animate-slide-up shadow-2xl transition-colors duration-300 select-none"
        style={{
          background: 'var(--sheet-bg)',
          borderColor: 'var(--border-strong)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
          /* ✅ pb-safe: home indicator için kritik */
          paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Handle bar */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full"
          style={{ background: 'var(--border-strong)' }}
        />

        {/* Header */}
        <div className="flex items-center justify-between mt-2 mb-5">
          <h2 className="text-app-primary text-lg font-bold tracking-tight">Yeni Görev</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-app-secondary hover:text-app-primary transition-colors active:scale-90"
            style={{ background: 'var(--surface-2)' }}
            aria-label="Kapat"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title input */}
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Görev başlığı..."
            maxLength={120}
            className="select-text w-full rounded-2xl px-4 py-3.5 text-app-primary text-sm placeholder-app-muted outline-none transition-all duration-200"
            style={{
              background: 'var(--input-bg)',
              border: '1.5px solid var(--border-strong)',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(124,58,237,0.55)';
              e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.10)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--border-strong)';
              e.target.style.boxShadow = 'none';
            }}
          />

          {/* Priority selector */}
          <div>
            <p className="text-app-muted text-xs font-semibold mb-2.5 px-0.5 uppercase tracking-wide">Öncelik</p>
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
                      flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 active:scale-[0.96]
                      flex items-center justify-center gap-1.5
                      ${active
                        ? `${cfg.badgeBg} ${cfg.badgeText}`
                        : 'text-app-muted'
                      }
                    `}
                    style={
                      active
                        ? { border: `1.5px solid ${getPriorityBorderColor(p)}`, boxShadow: `0 4px 12px ${getPriorityGlow(p)}` }
                        : { background: 'var(--surface)', border: '1.5px solid var(--border-strong)' }
                    }
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${active ? cfg.dotColor : ''}`}
                      style={!active ? { background: 'var(--text-faint)' } : {}}
                    />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hatırlatıcı toggle */}
          <button
            type="button"
            id="reminder-toggle-btn"
            onClick={() => setShowReminder(!showReminder)}
            className="w-full flex items-center gap-2.5 text-app-secondary text-xs py-2.5 px-3.5 rounded-2xl transition-all duration-200 active:scale-[0.98]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }}
          >
            {showReminder
              ? <Bell size={13} className="text-violet-400 flex-shrink-0" />
              : <BellOff size={13} className="flex-shrink-0" />
            }
            <span className={showReminder ? 'text-violet-400 font-semibold' : ''}>
              {showReminder ? `Hatırlatıcı: ${selHour}:${selMinute}` : 'Hatırlatıcı ekle'}
            </span>
            <ChevronDown
              size={13}
              className={`ml-auto transition-transform duration-200 ${showReminder ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Drum Picker */}
          {showReminder && (
            <div
              className="rounded-2xl p-4 border transition-colors duration-300 animate-fade-in"
              style={{ background: 'var(--input-bg)', borderColor: 'var(--border)' }}
            >
              <p className="text-app-muted text-[10px] font-bold uppercase tracking-widest text-center mb-3">
                Bildirim Saati
              </p>

              <div className="flex items-center justify-center gap-2">
                <DrumScroller items={HOURS} selected={selHour} onChange={setSelHour} label="Saat" />

                {/* Ayırıcı */}
                <div className="flex flex-col items-center gap-3 pt-6">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                </div>

                <DrumScroller items={MINUTES} selected={selMinute} onChange={setSelMinute} label="Dakika" />
              </div>
            </div>
          )}

          {/* Not toggle */}
          <button
            type="button"
            onClick={() => setShowNote(!showNote)}
            className="w-full flex items-center gap-2.5 text-app-secondary text-xs py-2.5 px-3.5 rounded-2xl transition-all duration-200 active:scale-[0.98]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }}
          >
            <StickyNote size={13} className="flex-shrink-0" />
            <span>{showNote ? 'Notu gizle' : 'Not ekle (isteğe bağlı)'}</span>
            <ChevronUp
              size={13}
              className={`ml-auto transition-transform duration-200 ${showNote ? '' : 'rotate-180'}`}
            />
          </button>

          {showNote && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Not ekle..."
              rows={3}
              maxLength={500}
              className="select-text w-full rounded-2xl px-4 py-3 text-app-primary text-sm placeholder-app-muted outline-none transition-all duration-200 resize-none animate-fade-in"
              style={{
                background: 'var(--input-bg)',
                border: '1.5px solid var(--border-strong)',
                fontFamily: 'inherit',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(124,58,237,0.55)';
                e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.10)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-strong)';
                e.target.style.boxShadow = 'none';
              }}
            />
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              boxShadow: title.trim() && !isSubmitting
                ? '0 10px 30px rgba(124,58,237,0.40), 0 0 0 1px rgba(124,58,237,0.15)'
                : 'none',
            }}
          >
            {isSubmitting
              ? <Loader2 size={18} className="animate-spin" />
              : <Plus size={18} strokeWidth={2.5} />
            }
            {isSubmitting ? 'Ekleniyor...' : 'Görevi Ekle'}
            {!isSubmitting && showReminder && (
              <span className="text-violet-200 font-normal text-xs ml-1">
                · {selHour}:{selMinute}
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function getPriorityBorderColor(priority: Priority): string {
  switch (priority) {
    case 'high':   return 'rgba(239,68,68,0.50)';
    case 'medium': return 'rgba(245,158,11,0.50)';
    default:       return 'rgba(34,197,94,0.50)';
  }
}

function getPriorityGlow(priority: Priority): string {
  switch (priority) {
    case 'high':   return 'rgba(239,68,68,0.15)';
    case 'medium': return 'rgba(245,158,11,0.15)';
    default:       return 'rgba(34,197,94,0.15)';
  }
}
