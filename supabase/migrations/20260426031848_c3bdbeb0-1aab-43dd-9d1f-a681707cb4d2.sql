-- Extensions for cron polling
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Singleton table to track the getUpdates offset
create table if not exists public.telegram_bot_state (
  id int primary key check (id = 1),
  update_offset bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.telegram_bot_state (id, update_offset)
values (1, 0)
on conflict (id) do nothing;

alter table public.telegram_bot_state enable row level security;

create policy "Admins read telegram bot state"
on public.telegram_bot_state
for select
to authenticated
using (public.is_admin());

-- Table for storing incoming Telegram messages (audit trail)
create table if not exists public.telegram_messages (
  update_id bigint primary key,
  chat_id bigint not null,
  message_id bigint,
  text text,
  caption text,
  file_id text,
  file_unique_id text,
  mime_type text,
  duration int,
  file_size bigint,
  thumb_file_id text,
  movie_id uuid references public.movies(id) on delete set null,
  processing_status text not null default 'pending',
  processing_error text,
  raw_update jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_telegram_messages_chat_id on public.telegram_messages (chat_id);
create index if not exists idx_telegram_messages_status on public.telegram_messages (processing_status);

alter table public.telegram_messages enable row level security;

create policy "Admins read telegram messages"
on public.telegram_messages
for select
to authenticated
using (public.is_admin());

create policy "Admins update telegram messages"
on public.telegram_messages
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());