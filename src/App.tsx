import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { TaskList } from './components/TaskList';
import { TaskForm } from './components/TaskForm';
import { BottomNav } from './components/BottomNav';
import { StatsView } from './components/StatsView';
import { NotificationBanner } from './components/NotificationBanner';
import { AuthScreen } from './components/AuthScreen';
import { useTasks } from './hooks/useTasks';
import { useNotifications } from './hooks/useNotifications';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import type { Tab } from './types';
import { Plus, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [showForm, setShowForm] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const { session, user, loading: authLoading, authLoading: authProcessing, authError, clearError, signIn, signUp, signOut } = useAuth();

  // ─── Görev hook'u — yalnızca session varken aktif ──────────────────────────
  const userId = user?.id ?? '';
  const {
    activeTasks,
    completedTasks,
    stats,
    loading,
    isSubmitting,
    error,
    addTask,
    toggleTask,
    deleteTask,
    clearCompleted,
    refetch,
  } = useTasks({ userId });

  const { permission, status: notifStatus, subscribe } = useNotifications({ userId: user?.id ?? null });

  // Abonelik işlemi pushSubscription.ts içinde Supabase kaydını otomatik yapar.
  // iOS: Bu callback doğrudan bir onClick handler'ına bağlanmalıdır.
  const handleSubscribe = useCallback(async () => {
    await subscribe();
  }, [subscribe]);

  const showHeader = activeTab === 'tasks' || activeTab === 'completed';

  // Bildirim banner'ını göster: izin 'granted' değilse ve kullanıcı kapatmadıysa
  const showNotifBanner =
    !bannerDismissed &&
    notifStatus !== 'unsupported' &&
    notifStatus !== 'subscribed' &&
    permission !== 'granted';

  // Hata mesajını otomatik temizle
  useEffect(() => {
    // Hata gösterilirse 4 saniye sonra kaybolur (isteğe bağlı)
  }, [error]);

  // ── Auth durumu henüz bilinmiyor → splash ──────────────────────────────────
  if (authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              boxShadow: '0 8px 32px rgba(124,58,237,0.35)',
            }}
          >
            <Loader2 size={28} className="text-white animate-spin" />
          </div>
          <p className="text-app-secondary text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // ── Oturum açılmamış → giriş/kayıt ekranı ────────────────────────────────
  if (!session) {
    return (
      <AuthScreen
        onSignIn={signIn}
        onSignUp={signUp}
        authLoading={authProcessing}
        authError={authError}
        clearError={clearError}
      />
    );
  }

  // ── Oturum açık → ana uygulama ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-app flex items-center justify-center transition-colors duration-300">
      {/* Mobile frame */}
      <div className="relative w-full max-w-sm h-screen max-h-[900px] bg-app overflow-hidden flex flex-col shadow-2xl border-x border-app transition-colors duration-300">

        {/* ─── Loading overlay (ilk yükleme) ─── */}
        {loading === 'loading' && activeTasks.length === 0 && completedTasks.length === 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-app/90 backdrop-blur-sm gap-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Loader2 size={28} className="text-violet-400 animate-spin" />
            </div>
            <p className="text-app-secondary text-sm">Görevler yükleniyor...</p>
          </div>
        )}

        {/* ─── Error banner ─── */}
        {error && (
          <div className="absolute top-4 left-4 right-4 z-30 bg-rose-900/80 backdrop-blur-sm border border-rose-700/60 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
            <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
            <p className="text-rose-200 text-xs flex-1 leading-snug">{error}</p>
            <button
              onClick={() => void refetch()}
              className="flex items-center gap-1 text-rose-300 text-xs font-medium hover:text-white transition-colors active:scale-90 flex-shrink-0"
            >
              <RefreshCw size={12} />
              Tekrar dene
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto overscroll-none pb-24">
          {showHeader && (
            <Header
              activeCount={activeTasks.length}
              completedCount={completedTasks.length}
              theme={theme}
              onToggleTheme={toggleTheme}
              userEmail={user?.email ?? ''}
              onSignOut={() => void signOut()}
            />
          )}

          {/* ─── Bildirim izin banner'ı ─── */}
          {showNotifBanner && (
            <NotificationBanner
              status={notifStatus}
              onSubscribe={() => void handleSubscribe()}
              onDismiss={() => setBannerDismissed(true)}
            />
          )}

          {activeTab === 'stats' && (
            <div className="pt-14 pb-2 px-5">
              <h1 className="text-app-primary text-2xl font-bold">İstatistikler</h1>
              <p className="text-app-secondary text-sm mt-0.5">Görev özeti</p>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="pt-3">
              <TaskList
                tasks={activeTasks}
                type="active"
                onToggle={(id) => void toggleTask(id)}
                onDelete={(id) => void deleteTask(id)}
              />
            </div>
          )}

          {activeTab === 'completed' && (
            <div className="pt-3">
              <TaskList
                tasks={completedTasks}
                type="completed"
                onToggle={(id) => void toggleTask(id)}
                onDelete={(id) => void deleteTask(id)}
                onClearCompleted={() => void clearCompleted()}
              />
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="pt-3">
              <StatsView stats={stats} />
            </div>
          )}
        </div>

        {/* FAB - Add task button (only on tasks tab) */}
        {activeTab === 'tasks' && (
          <button
            onClick={() => setShowForm(true)}
            className="absolute bottom-24 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-violet-500 shadow-lg shadow-violet-500/30 flex items-center justify-center transition-all duration-200 active:scale-90 hover:shadow-violet-500/50 hover:scale-105 z-10"
            aria-label="Görev ekle"
          >
            <Plus size={26} strokeWidth={2.5} className="text-white" />
          </button>
        )}

        {/* Bottom Nav */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeCount={activeTasks.length}
          completedCount={completedTasks.length}
        />
      </div>

      {/* Task form modal */}
      {showForm && (
        <TaskForm
          onAdd={(data) => { void addTask(data); }}
          onClose={() => setShowForm(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

export default App;

