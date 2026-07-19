import { createClient } from '@supabase/supabase-js';
import type { Task } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── tasks tablosu ───────────────────────────────────────────
export type TaskRow = {
  id: string;
  title: string;
  note: string | null;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  created_at: string;
  completed_at: string | null;
  reminder_time: string | null;  // ISO 8601 — bildirim zamanı
  is_notified: boolean;           // bildirim gönderildi mi
  user_id: string | null;
};

// ─── push_subscriptions tablosu ──────────────────────────────
/**
 * Her satır bir cihazın push aboneliğini temsil eder.
 * Aynı kullanıcı birden fazla cihazdan abone olabilir;
 * endpoint sütunu unique olduğundan çakışma olmaz.
 */
export type PushSubscriptionRow = {
  /** Otomatik UUID */
  id: string;
  /** Supabase auth user id (opsiyonel, auth entegrasyonuna kadar null) */
  user_id: string | null;
  /**
   * Cihazı tanımlayan takma ad.
   * Örn: "iPhone 13", "Laptop", "İş Bilgisayarı"
   */
  device_label: string;
  /** Push abonelik endpoint URL'si (unique) */
  endpoint: string;
  /** Web Push p256dh anahtarı */
  p256dh: string;
  /** Web Push auth anahtarı */
  auth: string;
  /** Kayıt zamanı */
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: TaskRow;
        Insert: Omit<TaskRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<TaskRow, 'id'>>;
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Omit<PushSubscriptionRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<PushSubscriptionRow, 'id'>>;
      };
    };
  };
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Supabase satırını uygulama Task tipine dönüştür
export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    note: row.note ?? undefined,
    priority: row.priority,
    completed: row.completed,
    created_at: row.created_at,
    completed_at: row.completed_at ?? undefined,
    reminder_time: row.reminder_time ?? null,
    user_id: row.user_id ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// Push Aboneliği Yardımcı Fonksiyonları
// ─────────────────────────────────────────────────────────────

import type { PushSubscriptionJSON } from '../hooks/useNotifications';

/**
 * Cihazın push aboneliğini Supabase'e kaydeder (ya da günceller).
 *
 * @param sub       useNotifications hook'undan gelen subscription JSON
 * @param deviceLabel  Kullanıcının cihazına verdiği isim
 * @param userId    (opsiyonel) Supabase auth user id
 * @returns Kaydedilen satır ya da null
 */
export async function savePushSubscription(
  sub: PushSubscriptionJSON,
  deviceLabel: string,
  userId?: string | null
): Promise<PushSubscriptionRow | null> {
  const payload: Database['public']['Tables']['push_subscriptions']['Insert'] = {
    user_id:      userId ?? null,
    device_label: deviceLabel.trim() || 'Bilinmeyen Cihaz',
    endpoint:     sub.endpoint,
    p256dh:       sub.keys.p256dh,
    auth:         sub.keys.auth,
  };

  // endpoint unique — çakışırsa mevcut kaydı güncelle
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(payload as any, { onConflict: 'endpoint' })
    .select()
    .single();

  if (error) {
    console.error('[supabase] savePushSubscription hatası:', error);
    return null;
  }

  return data as PushSubscriptionRow;
}

/**
 * Verilen endpoint'e ait aboneliği Supabase'den siler.
 *
 * @param endpoint  PushSubscription.endpoint değeri
 */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) {
    console.error('[supabase] removePushSubscription hatası:', error);
  }
}

/**
 * Belirli bir kullanıcıya ait tüm push aboneliklerini getirir.
 * Kullanıcı kendi cihazlarını listelemek istediğinde kullanılır.
 *
 * @param userId  Supabase auth user id
 */
export async function getPushSubscriptions(
  userId: string
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[supabase] getPushSubscriptions hatası:', error);
    return [];
  }

  return (data ?? []) as PushSubscriptionRow[];
}

// ────────────────────────────────────────────────────────────
// Supabase SQL Şeması (Supabase SQL Editor'de bir kez çalıştır)
// ────────────────────────────────────────────────────────────
/*
-- 1. tasks tablosunu oluştur
create table if not exists public.tasks (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade,
  title        text        not null,
  note         text,
  priority     text        check (priority in ('low', 'medium', 'high')) default 'medium',
  completed    boolean     default false,
  created_at   timestamptz default now(),
  completed_at timestamptz
);

-- 2. Row Level Security (kimlik doğrulama olmadan tüm erişim - geliştirme için)
alter table public.tasks enable row level security;

-- Geliştirme aşaması için: Herkes okuyabilir/yazabilir (auth sonra kısıtlanacak)
create policy "allow_all" on public.tasks for all using (true) with check (true);

-- ÜRETİM için (auth entegrasyonundan sonra yukarıdaki policy'i bununla değiştir):
-- create policy "Users own tasks" on public.tasks
--   for all using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. push_subscriptions tablosunu oluştur
-- Her cihazın web push aboneliği burada tutulur.
-- Aynı kullanıcı birden fazla cihazdan abone olabilir.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade,
  device_label text        not null default 'Bilinmeyen Cihaz',
  endpoint     text        not null unique,
  p256dh       text        not null,
  auth         text        not null,
  created_at   timestamptz default now()
);

-- 4. RLS — push_subscriptions
alter table public.push_subscriptions enable row level security;

-- Geliştirme için: tüm erişime izin ver
create policy "allow_all_push" on public.push_subscriptions
  for all using (true) with check (true);

-- ÜRETİM için (auth entegrasyonundan sonra yukarıdaki policy'i bununla değiştir):
-- create policy "Users own subscriptions" on public.push_subscriptions
--   for all using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
*/
