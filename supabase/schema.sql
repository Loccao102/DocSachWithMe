-- Run this ONCE in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text,
  file_path text not null,
  text_path text,
  total_pages integer not null default 0,
  word_count integer not null default 0,
  cover_color text not null default '#b77b62',
  created_at timestamptz not null default now(),
  last_opened_at timestamptz
);
create index if not exists books_owner_idx on public.books(owner_id, created_at desc);

create table if not exists public.reading_progress (
  book_id uuid primary key references public.books(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  block_id text,
  page integer not null default 1,
  percent real not null default 0 check (percent >= 0 and percent <= 100),
  updated_at timestamptz not null default now()
);
create table if not exists public.reader_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  block_id text not null,
  quote text not null default '',
  note text not null default '',
  color text not null default 'yellow',
  created_at timestamptz not null default now()
);
create index if not exists notes_book_idx on public.reader_notes(book_id, created_at desc);

create table if not exists public.reader_bookmarks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  block_id text not null,
  page integer not null,
  created_at timestamptz not null default now(),
  unique(book_id, block_id)
);

alter table public.books enable row level security;
alter table public.reading_progress enable row level security;
alter table public.reader_notes enable row level security;
alter table public.reader_bookmarks enable row level security;

create policy "Owner manages books" on public.books for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owner manages reading progress" on public.reading_progress for all to authenticated
  using (owner_id = auth.uid() and exists(select 1 from public.books b where b.id = book_id and b.owner_id = auth.uid()))
  with check (owner_id = auth.uid() and exists(select 1 from public.books b where b.id = book_id and b.owner_id = auth.uid()));
create policy "Owner manages notes" on public.reader_notes for all to authenticated
  using (owner_id = auth.uid() and exists(select 1 from public.books b where b.id = book_id and b.owner_id = auth.uid()))
  with check (owner_id = auth.uid() and exists(select 1 from public.books b where b.id = book_id and b.owner_id = auth.uid()));
create policy "Owner manages bookmarks" on public.reader_bookmarks for all to authenticated
  using (owner_id = auth.uid() and exists(select 1 from public.books b where b.id = book_id and b.owner_id = auth.uid()))
  with check (owner_id = auth.uid() and exists(select 1 from public.books b where b.id = book_id and b.owner_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 52428800, array['application/pdf','application/json','application/epub+zip'])
on conflict (id) do update set public=false, file_size_limit=52428800,
  allowed_mime_types=array['application/pdf','application/json','application/epub+zip'];

create policy "Readers upload own files" on storage.objects for insert to authenticated
  with check (bucket_id='books' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Readers see own files" on storage.objects for select to authenticated
  using (bucket_id='books' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Readers delete own files" on storage.objects for delete to authenticated
  using (bucket_id='books' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Readers update own files" on storage.objects for update to authenticated
  using (bucket_id='books' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='books' and (storage.foldername(name))[1]=auth.uid()::text);
