/**
 * useAuth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Auth oturum yönetimi.
 *
 * - onAuthStateChange ile oturumu reaktif olarak takip eder.
 * - signIn / signUp / signOut fonksiyonlarını expose eder.
 * - loading=true iken session henüz bilinmiyor (splash göster).
 */

import { useState, useEffect, useCallback } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface AuthResult {
  error: string | null;
}

export interface UseAuthReturn {
  /** Aktif oturum (null = giriş yapılmamış) */
  session: Session | null;
  /** Kısayol: oturumdaki kullanıcı */
  user: User | null;
  /** true iken auth durumu henüz belirlenmedi (uygulama açılışı) */
  loading: boolean;
  /** İşlem sırasında true (signIn/signUp/signOut) */
  authLoading: boolean;
  /** Son auth hatası */
  authError: string | null;
  /** Hata mesajını temizle */
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

// ─── Hata mesajlarını Türkçeleştir ───────────────────────────────────────────

function localizeError(err: AuthError | Error | unknown): string {
  const msg = (err as AuthError)?.message ?? String(err);
  if (msg.includes('Invalid login credentials'))
    return 'E-posta veya şifre hatalı.';
  if (msg.includes('Email not confirmed'))
    return 'E-posta adresinizi doğrulamanız gerekiyor.';
  if (msg.includes('User already registered'))
    return 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.';
  if (msg.includes('Password should be at least'))
    return 'Şifre en az 6 karakter olmalıdır.';
  if (msg.includes('Unable to validate email'))
    return 'Geçerli bir e-posta adresi girin.';
  if (msg.includes('rate limit') || msg.includes('too many requests'))
    return 'Çok fazla deneme. Lütfen birkaç dakika bekleyin.';
  return msg || 'Bilinmeyen bir hata oluştu.';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const [session, setSession]         = useState<Session | null>(null);
  const [loading, setLoading]         = useState(true);    // ilk yükleme
  const [authLoading, setAuthLoading] = useState(false);   // işlem sırasında
  const [authError, setAuthError]     = useState<string | null>(null);

  // ── Oturum değişikliklerini dinle ──────────────────────────────────────────
  useEffect(() => {
    // Mevcut oturumu al (sayfa yenilenince de çalışır)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Gerçek zamanlı değişiklikler (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── signIn ─────────────────────────────────────────────────────────────────
  const signIn = useCallback(async (
    email: string,
    password: string
  ): Promise<AuthResult> => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = localizeError(error);
        setAuthError(msg);
        return { error: msg };
      }
      return { error: null };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // ── signUp ─────────────────────────────────────────────────────────────────
  const signUp = useCallback(async (
    email: string,
    password: string
  ): Promise<AuthResult> => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        const msg = localizeError(error);
        setAuthError(msg);
        return { error: msg };
      }
      return { error: null };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // ── signOut ────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setAuthError(null), []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    authLoading,
    authError,
    clearError,
    signIn,
    signUp,
    signOut,
  };
}
