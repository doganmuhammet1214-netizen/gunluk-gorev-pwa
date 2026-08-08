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
import { Plus, AlertCircle, RefreshCw, Loader2, BarChart3 } from 'lucide-react';
import { TestNotificationButton } from './components/TestNotificationButton';

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

  // iOS: Bu callback doğrudan bir onClick handler'ına bağlanmalıdır.
  const handleSubscribe = useCallback(async () => {
    await subscribe();
  }, [subscribe]);

  const showHeader = activeTab === 'tasks' || activeTab === 'completed';

  // Bildirim banner'ını göster
  const showNotifBanner =
    !bannerDismissed &&
    notifStatus !== 'unsupported' &&
    notifStatus !== 'subscribed' &&
    permission !== 'granted';

  useEffect(() => {
    // Hata gösterilirse 4 saniye sonra kaybolur (isteğe bağlı)
  }, [error]);

  // ── Auth durumu henüz bilinmiyor → splash ──────────────────────────────────
  if (authLoading) {
    return (
      <div
        className="min-h-dvh h-dvh w-full flex items-center justify-center select-none"
        style={{ background: 'var(--bg)' }}
      >
        {/* Arka plan glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(124,58,237,0.12) 0%, transparent 70%)',
          }}
        />
        <div className="relative flex flex-col items-center gap-5 animate-fade-in">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
              boxShadow: '0 12px 40px rgba(124,58,237,0.40)',
            }}
          >
            <Loader2 size={30} className="text-white animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-app-primary font-semibold text-base">FlowDay</p>
            <p className="text-app-secondary text-sm mt-0.5">Yükleniyor...</p>
          </div>
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
    <div className="min-h-dvh h-dvh w-full bg-app flex items-center justify-center transition-colors duration-300 overflow-hidden">
      {/* Mobile / PWA frame — Mobilde tam ekran (full screen), Masaüstünde (sm+) kart görünümlü */}
      <div className="relative w-full h-full sm:max-w-md sm:h-[92vh] sm:max-h-[900px] sm:rounded-3xl sm:border sm:border-app sm:shadow-2xl bg-app overflow-hidden flex flex-col transition-colors duration-300 select-none">

        {/* ─── Loading overlay (ilk yükleme) ─── */}
        {loading === 'loading' && activeTasks.length === 0 && completedTasks.length === 0 && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4"
            style={{ background: 'rgba(10,15,30,0.90)', backdropFilter: 'blur(8px)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'rgba(124,58,237,0.15)',
                border: '1px solid rgba(124,58,237,0.25)',
              }}
            >
              <Loader2 size={24} className="text-violet-400 animate-spin" />
            </div>
            <p className="text-app-secondary text-sm font-medium">Görevler yükleniyor...</p>
          </div>
        )}

        {/* ─── Error banner ─── */}
        {error && (
          <div
            className="absolute top-4 left-4 right-4 z-30 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl animate-fade-in"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <AlertCircle size={15} className="text-rose-400 flex-shrink-0" />
            <p className="text-rose-300 text-xs flex-1 leading-snug">{error}</p>
            <button
              onClick={() => void refetch()}
              className="flex items-center gap-1 text-rose-300 text-xs font-semibold hover:text-white transition-colors active:scale-90 flex-shrink-0"
            >
              <RefreshCw size={11} />
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

          {/* ─── Debug: Test Bildirimi Butonu (izin verilmişse göster) ─── */}
          {permission === 'granted' && (
            <TestNotificationButton />
          )}

          {/* ─── İstatistikler sekme başlığı ─── */}
          {activeTab === 'stats' && (
            <div
              className="px-5 pb-4"
              style={{
                paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
              }}
            >
              <div className="flex items-center gap-3 mb-1">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(124,58,237,0.15)' }}
                >
                  <BarChart3 size={18} className="text-violet-400" />
                </div>
                <div>
                  <h1 className="text-app-primary text-2xl font-bold tracking-tight">İstatistikler</h1>
                  <p className="text-app-secondary text-xs font-medium">Görev özeti</p>
                </div>
              </div>
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
            <div className="pt-1">
              <StatsView stats={stats} />
            </div>
          )}
        </div>

        {/* FAB - Görev ekle butonu */}
        {activeTab === 'tasks' && (
          <button
            onClick={() => setShowForm(true)}
            className="absolute bottom-24 right-4 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 z-10"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              boxShadow: '0 8px 28px rgba(124,58,237,0.50), 0 0 0 1px rgba(124,58,237,0.20)',
            }}
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
