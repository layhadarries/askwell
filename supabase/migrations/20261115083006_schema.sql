-- Askwell schema: the 7 tables in docs/project.md §7, plus RLS, grants and the
-- private `knowledge` storage bucket.
--
-- Access model (§7, §9):
--   anon           nothing: no table, no function
--   authenticated  SELECT own rows; UPDATE projects.name; DELETE own projects
--   service_role   SELECT/INSERT/UPDATE/DELETE on every table (bypasses RLS)
-- TRUNCATE is granted to no API role.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Default privileges
-- ---------------------------------------------------------------------------
-- Supabase grants ALL on new tables and EXECUTE on new functions to the API
-- roles by default. Turn that off so every grant has to be written explicitly.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;
-- EXECUTE for PUBLIC is a built-in global default; a per-schema revoke can't
-- remove it. New functions get no EXECUTE until a migration grants it (§9).
alter default privileges for role postgres
  revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.accounts (
  clerk_user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  public_key text not null unique check (public_key like 'pk\_%'),
  messages_used integer not null default 0 check (messages_used >= 0),
  period_start timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null default '#4f46e5' check (button_color ~ '^#[0-9a-fA-F]{6}$'),
  position text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null default 'Chat with us' check (char_length(btrim(label)) between 1 and 40),
  animation text not null default 'fade' check (animation in ('fade', 'slide', 'scale')),
  header_text text not null default 'Ask us anything'
    check (char_length(btrim(header_text)) between 1 and 60),
  show_badge boolean not null default true
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  type text not null check (type in ('text', 'pdf', 'md', 'txt')),
  storage_key text,
  status text not null default 'processing'
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  -- Pasted text has no file; every uploaded file has one.
  constraint knowledge_sources_storage_key_matches_type
    check ((type = 'text') = (storage_key is null)),
  -- Target of the composite FK from knowledge_chunks.
  constraint knowledge_sources_id_project_id_key unique (id, project_id)
);

create index knowledge_sources_project_id_created_at_idx
  on public.knowledge_sources (project_id, created_at desc);
create unique index knowledge_sources_storage_key_key
  on public.knowledge_sources (storage_key) where storage_key is not null;

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  -- A chunk is deleted with its source, and always lives in the source's project.
  constraint knowledge_chunks_source_fkey foreign key (source_id, project_id)
    references public.knowledge_sources (id, project_id) on delete cascade
);

create index knowledge_chunks_source_id_project_id_idx
  on public.knowledge_chunks (source_id, project_id);
create index knowledge_chunks_project_id_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null check (char_length(visitor_id) between 1 and 128),
  created_at timestamptz not null default now()
);

create index conversations_project_id_created_at_idx
  on public.conversations (project_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('visitor', 'bot')),
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS helpers (the only SECURITY DEFINER functions)
-- ---------------------------------------------------------------------------
-- They live in `private`, which the Data API does not expose. Policies call them
-- as `authenticated`, so that role keeps EXECUTE; nobody else gets it.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

create function private.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  join public.projects p on p.id = c.project_id
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

revoke all on function private.owned_project_ids() from public, anon, service_role;
revoke all on function private.owned_conversation_ids() from public, anon, service_role;
grant execute on function private.owned_project_ids() to authenticated;
grant execute on function private.owned_conversation_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Owners read their account"
  on public.accounts for select to authenticated
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their projects"
  on public.projects for select to authenticated
  using (id in (select private.owned_project_ids()));

-- Write policies check the row's own owner_id, not the helper: if a row is
-- re-checked after a concurrent change, the current owner is what counts.
create policy "Owners rename their projects"
  on public.projects for update to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners delete their projects"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their widget configs"
  on public.widget_configs for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their knowledge sources"
  on public.knowledge_sources for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their conversations"
  on public.conversations for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their messages"
  on public.messages for select to authenticated
  using (conversation_id in (select private.owned_conversation_ids()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Start from nothing (this also removes TRUNCATE), then grant what §7 allows.

revoke all on
  public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages
from public, anon, authenticated, service_role;

grant select on
  public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages
to authenticated;
grant update (name) on public.projects to authenticated;
grant delete on public.projects to authenticated;

grant select, insert, update, delete on
  public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages
to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private `knowledge` bucket
-- ---------------------------------------------------------------------------
-- No storage.objects policies: only service_role (signed upload URLs, server
-- reads and deletes) touches these files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  10485760,
  array['application/pdf', 'text/markdown', 'text/x-markdown', 'text/plain']
)
on conflict (id) do nothing;
