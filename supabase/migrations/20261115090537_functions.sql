-- Askwell database functions (docs/project.md §7, §9).
--
-- Only service_role may execute the service functions. Routes call them after
-- checking ownership and reading the plan. Plan limits are parameters, taken
-- from PLAN_LIMITS in packages/shared; no limit is hardcoded here.
--
-- Every function is SECURITY INVOKER with search_path = ''.
-- Error convention (routes map these): expected failures raise SQLSTATE
-- 'P0001' (supabase-js error.code) with the API ErrorCode as the message:
--   not_found       the project or conversation does not exist (or belongs elsewhere)
--   limit_reached   create_project / reserve_knowledge_source at the plan limit
--   quota_exceeded  consume_message at the monthly message limit
--   invalid_input   a parameter is out of range

-- ---------------------------------------------------------------------------
-- create_project
-- ---------------------------------------------------------------------------
-- Locks the owner's account row, so two concurrent calls for one owner run one
-- after the other and the second sees the first's project in its count.
-- Creates the account if the Clerk webhook hasn't yet (plan defaults to free).

create function public.create_project(
  p_owner_id text,
  p_name text,
  p_public_key text,
  p_max_projects integer
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects;
begin
  if p_max_projects is null or p_max_projects < 0 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_max_projects must be >= 0';
  end if;

  insert into public.accounts (clerk_user_id)
  values (p_owner_id)
  on conflict (clerk_user_id) do nothing;

  perform 1 from public.accounts a where a.clerk_user_id = p_owner_id for update;

  if (select count(*) from public.projects p where p.owner_id = p_owner_id) >= p_max_projects then
    raise exception 'limit_reached' using errcode = 'P0001', detail = 'project limit for this plan';
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, btrim(p_name), p_public_key)
  returning * into v_project;

  insert into public.widget_configs (project_id) values (v_project.id);

  return v_project;
end;
$$;

-- ---------------------------------------------------------------------------
-- reserve_knowledge_source
-- ---------------------------------------------------------------------------
-- Locks the project row, counts its sources and inserts the new one.
-- Pasted text starts as 'processing' with no file. A file starts as
-- 'uploading' with storage key '<project_id>/<source_id>.<type>'.
-- A file reservation not finalized within p_reservation_ttl (default 2 hours)
-- no longer counts (§6.4). Deleting those rows and files is not done here.

create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_max_sources integer,
  p_reservation_ttl interval default interval '2 hours'
)
returns public.knowledge_sources
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_source public.knowledge_sources;
begin
  if p_max_sources is null or p_max_sources < 0 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_max_sources must be >= 0';
  end if;
  if p_reservation_ttl is null or p_reservation_ttl <= interval '0' then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_reservation_ttl must be > 0';
  end if;

  perform 1 from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001', detail = 'project';
  end if;

  if (
    select count(*)
    from public.knowledge_sources s
    where s.project_id = p_project_id
      and not (s.status = 'uploading' and s.created_at <= now() - p_reservation_ttl)
  ) >= p_max_sources then
    raise exception 'limit_reached' using errcode = 'P0001', detail = 'knowledge source limit for this plan';
  end if;

  insert into public.knowledge_sources (id, project_id, title, type, storage_key, status)
  values (
    v_id,
    p_project_id,
    btrim(p_title),
    p_type,
    case when p_type = 'text' then null else p_project_id::text || '/' || v_id::text || '.' || p_type end,
    case when p_type = 'text' then 'processing' else 'uploading' end
  )
  returning * into v_source;

  return v_source;
end;
$$;

-- ---------------------------------------------------------------------------
-- consume_message
-- ---------------------------------------------------------------------------
-- One UPDATE checks the quota and counts the message, so concurrent calls
-- can't both take the last message. The period is the UTC calendar month:
-- the first message of a new month resets the count to 1.
-- Returns messages_used after this message.

create function public.consume_message(
  p_project_id uuid,
  p_limit integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_month_start timestamptz := date_trunc('month', now(), 'UTC');
  v_used integer;
begin
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_limit must be >= 0';
  end if;

  update public.projects p
  set
    messages_used = case when p.period_start < v_month_start then 1 else p.messages_used + 1 end,
    period_start = case when p.period_start < v_month_start then v_month_start else p.period_start end
  where p.id = p_project_id
    and (case when p.period_start < v_month_start then 0 else p.messages_used end) < p_limit
  returning p.messages_used into v_used;

  if v_used is null then
    if exists (select 1 from public.projects p where p.id = p_project_id) then
      raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'monthly message limit for this plan';
    end if;
    raise exception 'not_found' using errcode = 'P0001', detail = 'project';
  end if;

  return v_used;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_chat_turn
-- ---------------------------------------------------------------------------
-- Saves the visitor message and the bot reply. With no conversation ID it
-- starts a new conversation. A given ID must belong to this project.
-- Returns the conversation ID.

create function public.save_chat_turn(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_visitor_message text,
  p_bot_reply text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid := p_conversation_id;
  -- now() is fixed for the transaction; the reply is stamped 1µs later so
  -- ordering by created_at always puts it after the visitor message.
  v_at timestamptz := clock_timestamp();
begin
  if v_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  elsif not exists (
    select 1 from public.conversations c
    where c.id = v_conversation_id and c.project_id = p_project_id
  ) then
    raise exception 'not_found' using errcode = 'P0001', detail = 'conversation';
  end if;

  insert into public.messages (conversation_id, role, body, created_at)
  values
    (v_conversation_id, 'visitor', p_visitor_message, v_at),
    (v_conversation_id, 'bot', p_bot_reply, v_at + interval '1 microsecond');

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- match_chunks
-- ---------------------------------------------------------------------------
-- Nearest chunks of ready sources in one project, by cosine distance.
-- The HNSW index is shared by all projects and filters after the scan, so a
-- small project's chunks could fall outside the first candidates. Iterative
-- scan (pgvector 0.8+) keeps scanning until enough rows pass the filter.

-- Load the pgvector library before the CREATE below. Until it is loaded in
-- this session, Postgres treats hnsw.iterative_scan as an unknown placeholder,
-- and only a superuser may put one in a function's SET clause (42501 on
-- Supabase). Parsing a vector value loads the library and registers the
-- setting as a normal user setting.
select '[0]'::extensions.vector;

create function public.match_chunks(
  p_project_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 5
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = 'strict_order'
as $$
begin
  if p_match_count is null or p_match_count < 1 or p_match_count > 50 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_match_count must be 1-50';
  end if;

  return query
  select
    c.id,
    c.source_id,
    c.content,
    1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
  where c.project_id = p_project_id
    and s.status = 'ready'
  order by c.embedding operator(extensions.<=>) p_query_embedding
  limit p_match_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- owner_activity
-- ---------------------------------------------------------------------------
-- Conversation list for one project (§6.7), newest first: the earliest
-- message's body cut to 140 characters, and the message count. PostgREST
-- aggregates stay off (§9). SECURITY INVOKER and called by the owner, so RLS
-- limits it to their projects: an unowned or missing project returns 0 rows.

create function public.owner_activity(p_project_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  first_message_preview text,
  message_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.created_at,
    coalesce(left(first_msg.body, 140), '') as first_message_preview,
    (select count(*)::integer from public.messages m where m.conversation_id = c.id) as message_count
  from public.conversations c
  left join lateral (
    select m.body
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at, m.id
    limit 1
  ) first_msg on true
  where c.project_id = p_project_id
  order by c.created_at desc, c.id desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The schema migration already stops new functions getting default EXECUTE;
-- revoke again explicitly so this file is correct on its own.

revoke all on function public.create_project(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.reserve_knowledge_source(uuid, text, text, integer, interval)
  from public, anon, authenticated;
revoke all on function public.consume_message(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.save_chat_turn(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.match_chunks(uuid, extensions.vector, integer)
  from public, anon, authenticated;
revoke all on function public.owner_activity(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.create_project(text, text, text, integer) to service_role;
grant execute on function public.reserve_knowledge_source(uuid, text, text, integer, interval) to service_role;
grant execute on function public.consume_message(uuid, integer) to service_role;
grant execute on function public.save_chat_turn(uuid, uuid, text, text, text) to service_role;
grant execute on function public.match_chunks(uuid, extensions.vector, integer) to service_role;
grant execute on function public.owner_activity(uuid) to authenticated;
