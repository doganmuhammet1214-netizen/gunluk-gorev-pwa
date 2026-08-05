/**
 * AuthScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Giriş Yap / Kayıt Ol ekranı.
 * Mevcut tema token sistemini kullanır (--bg, --sheet-bg, --border vb.)
 */

import { useState, useRef, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { UseAuthReturn } from '../hooks/useAuth';

// ─── Tipler ───────────────────────────────────────────────────────────────────

type Mode = 'signin' | 'signup';

interface AuthScreenProps {
  onSignIn: UseAuthReturn['signIn'];
  onSignUp: UseAuthReturn['signUp'];
  authLoading: boolean;
  authError: string | null;
  clearError: () => void;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export function AuthScreen({
  onSignIn,
  onSignUp,
  authLoading,
  authError,
  clearError,
}: AuthScreenProps) {
  const [mode, setMode]             = useState<Mode>('signin');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Mod değişince hata temizle ve focus ver
  useEffect(() => {
    clearError();
    setSuccessMsg(null);
    setTimeout(() => emailRef.current?.focus(), 150);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading) return;
    clearError();
    setSuccessMsg(null);

    if (mode === 'signin') {
      await onSignIn(email.trim(), password);
    } else {
      const result = await onSignUp(email.trim(), password);
      if (!result.error) {
        // Email doğrulama açıksa başarı mesajı göster
        setSuccessMsg(
          'Kayıt başarılı! E-posta adresinize gönderilen bağlantıya tıklayarak giriş yapabilirsiniz.'
        );
        setPassword('');
      }
    }
  };

  const isValid = email.trim().length > 0 && password.length >= 6;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 transition-colors duration-300"
      style={{ background: 'var(--bg)' }}
    >
      {/* Arka plan desen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo / başlık */}
        <div className="text-center mb-8">
          <div
            className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              boxShadow: '0 8px 32px rgba(124,58,237,0.35)',
            }}
          >
            <CheckCircle2 size={28} className="text-white" />
          </div>
          <h1 className="text-app-primary text-2xl font-bold">Günlük Görev</h1>
          <p className="text-app-secondary text-sm mt-1">
            {mode === 'signin' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur'}
          </p>
        </div>

        {/* Kart */}
        <div
          className="rounded-3xl p-6 border shadow-2xl"
          style={{
            background: 'var(--sheet-bg)',
            borderColor: 'var(--border-strong)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}
        >
          {/* Mod toggle */}
          <div
            className="flex rounded-2xl p-1 mb-6"
            style={{ background: 'var(--surface)' }}
          >
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`
                  flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200
                  ${mode === m
                    ? 'text-white shadow-md'
                    : 'text-app-secondary hover:text-app-primary'
                  }
                `}
                style={
                  mode === m
                    ? {
                        background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                        boxShadow: '0 4px 12px rgba(124,58,237,0.35)',
                      }
                    : {}
                }
              >
                {m === 'signin' ? 'Giriş Yap' : 'Kayıt Ol'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* E-posta */}
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-app-muted pointer-events-none"
              />
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-posta adresi"
                autoComplete="email"
                required
                className="w-full pl-10 pr-4 py-3.5 rounded-xl text-app-primary text-sm placeholder-app-muted outline-none transition-all focus:ring-1 focus:ring-violet-500/40"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-strong)',
                }}
              />
            </div>

            {/* Şifre */}
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-app-muted pointer-events-none"
              />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Şifre (en az 6 karakter)' : 'Şifre'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className="w-full pl-10 pr-12 py-3.5 rounded-xl text-app-primary text-sm placeholder-app-muted outline-none transition-all focus:ring-1 focus:ring-violet-500/40"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-strong)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-secondary transition-colors"
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Hata mesajı */}
            {authError && (
              <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 bg-rose-900/30 border border-rose-700/40">
                <AlertCircle size={15} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-rose-300 text-xs leading-snug">{authError}</p>
              </div>
            )}

            {/* Başarı mesajı (kayıt sonrası email doğrulama) */}
            {successMsg && (
              <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 bg-emerald-900/30 border border-emerald-700/40">
                <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-emerald-300 text-xs leading-snug">{successMsg}</p>
              </div>
            )}

            {/* Submit butonu */}
            <button
              type="submit"
              disabled={!isValid || authLoading}
              className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                boxShadow: isValid && !authLoading
                  ? '0 8px 24px rgba(124,58,237,0.35)'
                  : 'none',
              }}
            >
              {authLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : mode === 'signin' ? (
                <LogIn size={18} />
              ) : (
                <UserPlus size={18} />
              )}
              {authLoading
                ? mode === 'signin' ? 'Giriş yapılıyor...' : 'Kayıt olunuyor...'
                : mode === 'signin' ? 'Giriş Yap' : 'Kayıt Ol'
              }
            </button>
          </form>

          {/* Alt link */}
          <p className="text-center text-app-muted text-xs mt-5">
            {mode === 'signin' ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-violet-400 font-medium hover:text-violet-300 transition-colors underline underline-offset-2"
            >
              {mode === 'signin' ? 'Kayıt Ol' : 'Giriş Yap'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
