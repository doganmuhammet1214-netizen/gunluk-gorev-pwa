/**
 * AuthScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Giriş Yap / Kayıt Ol ekranı.
 * iOS PWA safe-area, Inter font, focus rings, select-none tam uyumlu.
 */

import { useState, useRef, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, Loader2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
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
      className="min-h-screen flex flex-col items-center justify-center px-5 select-none transition-colors duration-300"
      style={{
        background: 'var(--bg)',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Arka plan efektleri */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Üst mor halo */}
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(124,58,237,0.6) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        {/* Alt sağ accent */}
        <div
          className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.7) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }}
        />
        {/* Mesh grid — subtle */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(124,58,237,1) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Logo / başlık */}
        <div className="text-center mb-8">
          <div
            className="inline-flex w-20 h-20 rounded-3xl items-center justify-center mb-5 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
              boxShadow: '0 12px 40px rgba(124,58,237,0.45), 0 0 0 1px rgba(124,58,237,0.2)',
            }}
          >
            <CheckCircle2 size={32} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="text-app-primary text-3xl font-bold tracking-tight">FlowDay</h1>
          <p className="text-app-secondary text-sm mt-2 font-medium">
            {mode === 'signin' ? 'Hesabına hoş geldin 👋' : 'Yeni hesap oluştur ✨'}
          </p>
        </div>

        {/* Kart */}
        <div
          className="rounded-3xl p-6 border shadow-2xl"
          style={{
            background: 'var(--sheet-bg)',
            borderColor: 'var(--border-strong)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.08)',
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
                  flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.97]
                  ${mode === m
                    ? 'text-white shadow-md'
                    : 'text-app-secondary hover:text-app-primary'
                  }
                `}
                style={
                  mode === m
                    ? {
                        background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                        boxShadow: '0 4px 16px rgba(124,58,237,0.40)',
                      }
                    : {}
                }
              >
                {m === 'signin' ? 'Giriş Yap' : 'Kayıt Ol'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* E-posta */}
            <div className="relative">
              <Mail
                size={15}
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
                className="select-text w-full pl-10 pr-4 py-3.5 rounded-2xl text-app-primary text-sm placeholder-app-muted outline-none transition-all duration-200"
                style={{
                  background: 'var(--input-bg)',
                  border: '1.5px solid var(--border-strong)',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(124,58,237,0.55)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border-strong)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Şifre */}
            <div className="relative">
              <Lock
                size={15}
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
                className="select-text w-full pl-10 pr-12 py-3.5 rounded-2xl text-app-primary text-sm placeholder-app-muted outline-none transition-all duration-200"
                style={{
                  background: 'var(--input-bg)',
                  border: '1.5px solid var(--border-strong)',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(124,58,237,0.55)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border-strong)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-secondary transition-colors active:scale-90 p-1"
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Hata mesajı */}
            {authError && (
              <div className="flex items-start gap-2.5 rounded-2xl px-3.5 py-3 animate-fade-in"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}
              >
                <AlertCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-rose-300 text-xs leading-snug">{authError}</p>
              </div>
            )}

            {/* Başarı mesajı */}
            {successMsg && (
              <div className="flex items-start gap-2.5 rounded-2xl px-3.5 py-3 animate-fade-in"
                style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)' }}
              >
                <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-emerald-300 text-xs leading-snug">{successMsg}</p>
              </div>
            )}

            {/* Submit butonu */}
            <button
              type="submit"
              disabled={!isValid || authLoading}
              className="w-full py-4 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed mt-2"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                boxShadow: isValid && !authLoading
                  ? '0 10px 30px rgba(124,58,237,0.40), 0 0 0 1px rgba(124,58,237,0.15)'
                  : 'none',
              }}
            >
              {authLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : mode === 'signin' ? (
                <LogIn size={18} />
              ) : (
                <Sparkles size={18} />
              )}
              {authLoading
                ? (mode === 'signin' ? 'Giriş yapılıyor...' : 'Kayıt olunuyor...')
                : (mode === 'signin' ? 'Giriş Yap' : 'Hesap Oluştur')
              }
            </button>
          </form>

          {/* Alt link */}
          <p className="text-center text-app-muted text-xs mt-5 leading-relaxed">
            {mode === 'signin' ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-violet-400 font-semibold hover:text-violet-300 transition-colors underline underline-offset-2 active:scale-95"
            >
              {mode === 'signin' ? 'Kayıt Ol' : 'Giriş Yap'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
