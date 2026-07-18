import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task, TaskFormData } from '../types';
import type { Database } from '../lib/supabase';
import { supabase, rowToTask } from '../lib/supabase';

type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];

// ─── Durum Tipleri ───────────────────────────────────────────
type LoadingState = 'idle' | 'loading' | 'success' | 'error';

type UseTasksReturn = {
  tasks: Task[];
  activeTasks: Task[];
  completedTasks: Task[];
  stats: {
    total: number;
    completed: number;
    active: number;
    highPriority: number;
    completionRate: number;
  };
  loading: LoadingState;
  error: string | null;
  addTask: (data: TaskFormData) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  refetch: () => Promise<void>;
};

// ─── Hook ────────────────────────────────────────────────────
export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  // ── Görevleri yükle ────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading('loading');
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setTasks((data ?? []).map(rowToTask));
      setLoading('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Görevler yüklenemedi';
      setError(msg);
      setLoading('error');
      console.error('[useTasks] fetchTasks:', err);
    }
  }, []);

  // ── İlk yüklemede + realtime için ──────────────────────────
  useEffect(() => {
    void fetchTasks();

    // Realtime subscription — başka sekmeden/cihazdan değişiklik gelirse anında güncelle
    const channel = supabase
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => [rowToTask(payload.new as Parameters<typeof rowToTask>[0]), ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === payload.new.id
                  ? rowToTask(payload.new as Parameters<typeof rowToTask>[0])
                  : t
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  // ── Görev ekle ──────────────────────────────────────────────
  const addTask = useCallback(async (data: TaskFormData) => {
    const optimisticTask: Task = {
      id: crypto.randomUUID(),
      title: data.title.trim(),
      note: data.note.trim() || undefined,
      priority: data.priority,
      completed: false,
      created_at: new Date().toISOString(),
    };

    // Optimistic update — anında UI'ya yansıt
    setTasks((prev) => [optimisticTask, ...prev]);

    try {
      const insertPayload: TaskInsert = {
        title: optimisticTask.title,
        note: optimisticTask.note ?? null,
        priority: optimisticTask.priority,
        completed: false,
        completed_at: null,
        user_id: null, // Auth entegrasyonunda: (await supabase.auth.getUser()).data.user?.id
      };
      const { data: inserted, error: insertError } = await supabase
        .from('tasks')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) throw insertError;

      // Gerçek id ve created_at ile optimistic task'i güncelle
      if (inserted) {
        setTasks((prev) =>
          prev.map((t) => (t.id === optimisticTask.id ? rowToTask(inserted) : t))
        );
      }
    } catch (err) {
      // Hata durumunda geri al
      setTasks((prev) => prev.filter((t) => t.id !== optimisticTask.id));
      const msg = err instanceof Error ? err.message : 'Görev eklenemedi';
      setError(msg);
      console.error('[useTasks] addTask:', err);
    }
  }, []);

  // ── Görev tamamla / geri al ────────────────────────────────
  const toggleTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const newCompleted = !task.completed;
    const newCompletedAt = newCompleted ? new Date().toISOString() : null;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, completed: newCompleted, completed_at: newCompletedAt ?? undefined }
          : t
      )
    );

    try {
      const updatePayload: TaskUpdate = {
        completed: newCompleted,
        completed_at: newCompletedAt,
      };
      const { error: updateError } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) throw updateError;
    } catch (err) {
      // Geri al
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, completed: task.completed, completed_at: task.completed_at }
            : t
        )
      );
      const msg = err instanceof Error ? err.message : 'Görev güncellenemedi';
      setError(msg);
      console.error('[useTasks] toggleTask:', err);
    }
  }, [tasks]);

  // ── Görev sil ───────────────────────────────────────────────
  const deleteTask = useCallback(async (id: string) => {
    const deleted = tasks.find((t) => t.id === id);

    // Optimistic update
    setTasks((prev) => prev.filter((t) => t.id !== id));

    try {
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
    } catch (err) {
      // Geri al
      if (deleted) setTasks((prev) => [deleted, ...prev]);
      const msg = err instanceof Error ? err.message : 'Görev silinemedi';
      setError(msg);
      console.error('[useTasks] deleteTask:', err);
    }
  }, [tasks]);

  // ── Tümünü temizle ──────────────────────────────────────────
  const clearCompleted = useCallback(async () => {
    const toDelete = tasks.filter((t) => t.completed);
    if (toDelete.length === 0) return;

    // Optimistic update
    setTasks((prev) => prev.filter((t) => !t.completed));

    try {
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('completed', true);

      if (deleteError) throw deleteError;
    } catch (err) {
      // Geri al
      setTasks((prev) => [...toDelete, ...prev]);
      const msg = err instanceof Error ? err.message : 'Tamamlananlar temizlenemedi';
      setError(msg);
      console.error('[useTasks] clearCompleted:', err);
    }
  }, [tasks]);

  // ── Derived state ──────────────────────────────────────────
  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.completed), [tasks]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = completedTasks.length;
    const active = activeTasks.length;
    const highPriority = activeTasks.filter((t) => t.priority === 'high').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, active, highPriority, completionRate };
  }, [tasks, activeTasks, completedTasks]);

  return {
    tasks,
    activeTasks,
    completedTasks,
    stats,
    loading,
    error,
    addTask,
    toggleTask,
    deleteTask,
    clearCompleted,
    refetch: fetchTasks,
  };
}
