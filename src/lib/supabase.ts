import { createClient } from '@supabase/supabase-js';
import type { Task } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Supabase veritabanı tablo tipi (tasks tablosu)
export type TaskRow = {
  id: string;
  title: string;
  note: string | null;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  created_at: string;
  completed_at: string | null;
  user_id: string | null;
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
    user_id: row.user_id ?? undefined,
  };
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
*/
