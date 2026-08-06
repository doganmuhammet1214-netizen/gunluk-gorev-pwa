-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: user_fcm_tokens tablosu
-- Firebase Cloud Messaging (FCM) token'larını depolar.
-- Her kullanıcının birden fazla cihazı olabilir (phone + desktop vb.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token    text        NOT NULL UNIQUE,
  device_label text        NOT NULL DEFAULT 'Bilinmeyen Cihaz',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── İndeksler ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user_id ON public.user_fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_token   ON public.user_fcm_tokens(fcm_token);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Kullanıcı yalnızca kendi token'larını görebilir
CREATE POLICY "user_fcm_tokens: select own"
  ON public.user_fcm_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Kullanıcı yalnızca kendi token'larını ekleyebilir
CREATE POLICY "user_fcm_tokens: insert own"
  ON public.user_fcm_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Kullanıcı yalnızca kendi token'larını güncelleyebilir
CREATE POLICY "user_fcm_tokens: update own"
  ON public.user_fcm_tokens
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Kullanıcı yalnızca kendi token'larını silebilir
CREATE POLICY "user_fcm_tokens: delete own"
  ON public.user_fcm_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─── updated_at otomatik güncelleme trigger'ı ────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_user_fcm_tokens_updated_at
  BEFORE UPDATE ON public.user_fcm_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Yorum ───────────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.user_fcm_tokens IS 'Firebase Cloud Messaging push token''ları. Her cihaz için ayrı kayıt.';
COMMENT ON COLUMN public.user_fcm_tokens.fcm_token    IS 'FCM''den alınan tam token string''i.';
COMMENT ON COLUMN public.user_fcm_tokens.device_label IS 'navigator.userAgent ilk 150 karakteri.';
