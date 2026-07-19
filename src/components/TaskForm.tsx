import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, ChevronDown, StickyNote, Bell, BellOff, ChevronUp } from 'lucide-react';
import type { TaskFormData, Priority } from '../types';
import { PRIORITY_CONFIG } from '../types';

type TaskFormProps = {
  onAdd: (data: TaskFormData) => void;
  onClose: () => void;
};

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

// Saat listesi: 00-23
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
// Dakika listesi: 00-55 (5'er 5'er)
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// ── Drum scroller yardımcı bileşeni ─────────────────────────
type DrumProps = {
  items: string[];
  selected: string;
  onChange: (val: string) => void;
  label: string;
};

function DrumScroller({ items, selected, onChange, label }: DrumProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ITEM_H = 40; // px

  // Seçili öğeye scroll et
  const scrollTo = useCallback((val: string, animated = true) => {
    const idx = items.indexOf(val);
    if (idx === -1 || !containerRef.current) return;
    containerRef.current.scrollTo({
      top: idx * ITEM_H,
      behavior: animated ? 'smooth' : 'instant',
    });
  }, [items]);

  // İlk renderda pozisyona git
  useEffect(() => {
    scrollTo(selected, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll bittikten sonra en yakın değeri yakala
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const idx = Math.round(scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    onChange(items[clamped]);
  }, [items, onChange]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-app-muted text-[10px] font-semibold uppercase tracking-widest mb-0.5">
        {label}
      </span>
      <div className="relative w-14">
        {/* Seçim çerçevesi */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 rounded-xl pointer-events-none z-10 border-2 border-violet-500/50"
          style={{ background: 'rgba(124,58,237,0.10)' }}
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
          {/* Üst boşluk — scroll için */}
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
          {/* Alt boşluk — scroll için */}
          <div style={{ height: ITEM_H }} />
        </div>
      </div>
    </div>
  );
}

// ── Ana bileşen ──────────────────────────────────────────────
export function TaskForm({ onAdd, onClose }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [showNote, setShowNote] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Varsayılan: şu andan 1 saat sonra, 5'e yuvarla
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
    if (!title.trim()) return;

    let reminder_time: string | null = null;
    if (showReminder) {
      // Bugünün tarihiyle seçilen saati birleştir
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
      // Eğer geçmişte kaldıysa yarına al
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
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-sm border rounded-t-3xl p-5 pb-8 animate-slide-up shadow-2xl transition-colors duration-300"
        style={{ background: 'var(--sheet-bg)', borderColor: 'var(--border-strong)' }}
      >
        {/* Handle */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full"
          style={{ background: 'var(--surface)' }}
        />

        {/* Header */}
        <div className="flex items-center justify-between mt-3 mb-5">
          <h2 className="text-app-primary text-lg font-bold">Yeni Görev</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-app-secondary hover:text-app-primary transition-colors active:scale-90"
            style={{ background: 'var(--surface)' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Görev başlığı..."
            maxLength={120}
            className="w-full rounded-xl px-4 py-3.5 text-app-primary text-sm placeholder-app-muted outline-none focus:ring-1 focus:ring-violet-500/30 transition-all"
            style={{
              background: 'var(--input-bg)',
              border: '1px solid var(--border-strong)',
            }}
          />

          {/* Priority selector */}
          <div>
            <p className="text-app-muted text-xs font-medium mb-2 px-1">Öncelik</p>
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
                        : 'text-app-muted border'
                      }
                    `}
                    style={!active ? { background: 'var(--surface)', borderColor: 'var(--border-strong)' } : {}}
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

          {/* ── Hatırlatıcı toggle ── */}
          <button
            type="button"
            id="reminder-toggle-btn"
            onClick={() => setShowReminder(!showReminder)}
            className="w-full flex items-center gap-2 text-app-muted text-xs py-1 hover:text-app-secondary transition-colors"
          >
            {showReminder
              ? <Bell size={13} className="text-violet-400" />
              : <BellOff size={13} />
            }
            {showReminder ? 'Hatırlatıcı ayarlandı — değiştir' : 'Hatırlatıcı ekle (saat & dakika)'}
            <ChevronDown
              size={13}
              className={`ml-auto transition-transform duration-200 ${showReminder ? 'rotate-180' : ''}`}
            />
          </button>

          {/* ── Drum Picker ── */}
          {showReminder && (
            <div
              className="rounded-2xl p-4 border transition-colors duration-300"
              style={{ background: 'var(--input-bg)', borderColor: 'var(--border)' }}
            >
              <p className="text-app-muted text-[10px] font-semibold uppercase tracking-widest text-center mb-3">
                Bildirim Saati
              </p>

              <div className="flex items-center justify-center gap-2">
                <DrumScroller
                  items={HOURS}
                  selected={selHour}
                  onChange={setSelHour}
                  label="Saat"
                />

                {/* Ayırıcı */}
                <div className="flex flex-col items-center gap-3 pt-6">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                </div>

                <DrumScroller
                  items={MINUTES}
                  selected={selMinute}
                  onChange={setSelMinute}
                  label="Dakika"
                />
              </div>

              {/* Özet */}
              <div className="mt-3 flex items-center justify-center gap-2">
                <Bell size={12} className="text-violet-400" />
                <p className="text-violet-400 text-xs font-semibold">
                  {selHour}:{selMinute} hatırlatıcı
                </p>
              </div>
            </div>
          )}

          {/* Note toggle */}
          <button
            type="button"
            onClick={() => setShowNote(!showNote)}
            className="w-full flex items-center gap-2 text-app-muted text-xs py-1 hover:text-app-secondary transition-colors"
          >
            <StickyNote size={13} />
            {showNote ? 'Notu gizle' : 'Not ekle (isteğe bağlı)'}
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
              className="w-full rounded-xl px-4 py-3 text-app-primary text-sm placeholder-app-muted outline-none focus:ring-1 focus:ring-violet-500/30 transition-all resize-none"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--border-strong)',
              }}
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
            {showReminder && (
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
