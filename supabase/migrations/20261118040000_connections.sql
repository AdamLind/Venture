-- =============================================================================
-- Connections and the partner link (Phase 4, #35)
--
-- How people find each other: only your QR code or link, which carry your
-- private profile code (user_preferences.profile_code, resettable), never a
-- search. Scanning or opening one sends a request; the other person accepts.
-- Connections see each other's name, username and photo (strangers still
-- see only username and photo, #28). Each person has at most one partner,
-- who must be a connection and accept. Forgetting someone removes the
-- connection (and partner link) both ways and is remembered, so they can't
-- send you requests; blocking is an extra (blocked_users, #76).
--
-- Tables are written only through the functions below; each person can read
-- their own rows.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tables (two rows per pair, one for each side, so "mine" is a lookup)
-- -----------------------------------------------------------------------------
create table if not exists public.connections (
  user_id    uuid not null references public.users (user_id) on delete cascade,
  other_id   uuid not null references public.users (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, other_id),
  check (user_id <> other_id)
);

create table if not exists public.partners (
  user_id    uuid primary key references public.users (user_id) on delete cascade,
  partner_id uuid not null unique references public.users (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_id <> partner_id)
);

create table if not exists public.connection_requests (
  request_id bigint generated always as identity primary key,
  from_user  uuid not null references public.users (user_id) on delete cascade,
  to_user    uuid not null references public.users (user_id) on delete cascade,
  kind       text not null default 'CONNECT' check (kind in ('CONNECT', 'PARTNER')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user, kind),
  check (from_user <> to_user)
);
create index if not exists connection_requests_to_idx on public.connection_requests (to_user);

-- You forgot them: no requests from them, and (later) they're masked on
-- shared dates both ways
create table if not exists public.forgotten_users (
  user_id      uuid not null references public.users (user_id) on delete cascade,
  forgotten_id uuid not null references public.users (user_id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, forgotten_id),
  check (user_id <> forgotten_id)
);

alter table public.connections enable row level security;
alter table public.partners enable row level security;
alter table public.connection_requests enable row level security;
alter table public.forgotten_users enable row level security;

revoke all on public.connections, public.partners, public.connection_requests, public.forgotten_users
  from anon, authenticated;
grant select on public.connections, public.partners, public.connection_requests, public.forgotten_users
  to authenticated;

drop policy if exists "Your connections" on public.connections;
create policy "Your connections" on public.connections for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Your partner link" on public.partners;
create policy "Your partner link" on public.partners for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Requests to or from you" on public.connection_requests;
create policy "Requests to or from you" on public.connection_requests for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

drop policy if exists "People you forgot" on public.forgotten_users;
create policy "People you forgot" on public.forgotten_users for select to authenticated
  using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 2. Helpers, and who can see whom
-- -----------------------------------------------------------------------------
create or replace function private.is_connected(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.user_id = (select auth.uid()) and c.other_id = p_user_id
  );
$$;

-- Requests either way: you can see who asked you, and who you asked
create or replace function private.has_request_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connection_requests r
    where (r.from_user = (select auth.uid()) and r.to_user = p_user_id)
       or (r.to_user = (select auth.uid()) and r.from_user = p_user_id)
  );
$$;

-- Either one forgot or blocked the other
create or replace function private.keeps_apart(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.forgotten_users f
    where (f.user_id = p_a and f.forgotten_id = p_b) or (f.user_id = p_b and f.forgotten_id = p_a)
  ) or exists (
    select 1 from public.blocked_users b
    where (b.user_id = p_a and b.blocked_id = p_b) or (b.user_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke execute on function private.is_connected(uuid), private.has_request_with(uuid),
  private.keeps_apart(uuid, uuid) from public, anon;
grant execute on function private.is_connected(uuid), private.has_request_with(uuid),
  private.keeps_apart(uuid, uuid) to authenticated;

-- Usernames and photos (the only readable columns, #28)
drop policy if exists "Connections see each other" on public.users;
create policy "Connections see each other" on public.users for select to authenticated
  using (private.is_connected(user_id) or private.has_request_with(user_id));

-- Names too, but only for your connections (and yourself)
create or replace function public.my_connections()
returns table (
  user_id uuid,
  username text,
  first_name text,
  last_name text,
  profile_image_url text,
  connected_at timestamptz,
  is_partner boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.user_id, u.username, u.first_name, u.last_name, u.profile_image_url, c.created_at,
         exists (select 1 from public.partners p where p.user_id = c.user_id and p.partner_id = c.other_id)
  from public.connections c
  join public.users u on u.user_id = c.other_id
  where c.user_id = (select auth.uid())
  order by c.created_at desc;
$$;

revoke execute on function public.my_connections() from public, anon;
grant execute on function public.my_connections() to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Notifications about people (actor_id: who it's about)
-- -----------------------------------------------------------------------------
alter table public.notifications
  add column if not exists actor_id uuid references public.users (user_id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'IDEA_PUBLISHED', 'IDEA_NEEDS_REVISION', 'IDEA_REJECTED',
  'IDEA_HELD', 'IDEA_REPORTED', 'REPORT_ACTIONED', 'REPORT_DISMISSED',
  -- People (#35)
  'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'PARTNER_REQUEST', 'PARTNER_ACCEPTED'
));

create or replace function private.notify_person(p_user uuid, p_kind text, p_actor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, actor_id) values (p_user, p_kind, p_actor);
$$;
revoke execute on function private.notify_person(uuid, text, uuid) from public, anon, authenticated;

-- Make two people connected (both rows), clear any requests to connect
create or replace function private.link_connection(p_a uuid, p_b uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.connections (user_id, other_id) values (p_a, p_b), (p_b, p_a)
  on conflict do nothing;
  delete from public.connection_requests
  where kind = 'CONNECT' and ((from_user = p_a and to_user = p_b) or (from_user = p_b and to_user = p_a));
$$;
revoke execute on function private.link_connection(uuid, uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. Connecting
-- -----------------------------------------------------------------------------
-- Your code, scanned or opened: sends them a request (or connects, if they
-- already asked you). Returns {status, username}. A code that's been reset,
-- or anyone who forgot or blocked you, reads as "not valid" (nothing leaks).
create or replace function public.connect_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_them   uuid;
  v_name   text;
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select up.user_id into v_them
  from public.user_preferences up where up.profile_code = btrim(coalesce(p_code, ''));
  -- You forgot them, and now you're scanning their code: that's a change of mind
  delete from public.forgotten_users where user_id = v_me and forgotten_id = v_them;
  if v_them is null or private.keeps_apart(v_me, v_them) then
    raise exception 'That code isn''t valid anymore. Ask them for a new one.' using errcode = 'P0002';
  end if;
  if v_them = v_me then
    raise exception 'That''s your own code' using errcode = '22023';
  end if;

  select username into v_name from public.users where user_id = v_them;

  if exists (select 1 from public.connections where user_id = v_me and other_id = v_them) then
    return jsonb_build_object('status', 'ALREADY', 'username', v_name);
  end if;

  -- They already asked you: that's a yes
  if exists (select 1 from public.connection_requests
             where from_user = v_them and to_user = v_me and kind = 'CONNECT') then
    perform private.link_connection(v_me, v_them);
    perform private.notify_person(v_them, 'CONNECTION_ACCEPTED', v_me);
    return jsonb_build_object('status', 'CONNECTED', 'username', v_name);
  end if;

  insert into public.connection_requests (from_user, to_user, kind)
  values (v_me, v_them, 'CONNECT')
  on conflict do nothing;
  if found then
    perform private.notify_person(v_them, 'CONNECTION_REQUEST', v_me);
  end if;
  return jsonb_build_object('status', 'REQUESTED', 'username', v_name);
end;
$$;

-- Accept or decline a request to you (connect or partner). Declining is silent.
create or replace function public.respond_to_request(p_request_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := auth.uid();
  v_req public.connection_requests%rowtype;
begin
  select * into v_req from public.connection_requests
  where request_id = p_request_id and to_user = v_me for update;
  if not found then
    raise exception 'That request isn''t there anymore' using errcode = 'P0002';
  end if;

  delete from public.connection_requests where request_id = p_request_id;
  if not p_accept then
    return;
  end if;

  if v_req.kind = 'CONNECT' then
    perform private.link_connection(v_me, v_req.from_user);
    perform private.notify_person(v_req.from_user, 'CONNECTION_ACCEPTED', v_me);
  else
    -- Partner: still connected, and neither has a partner now
    lock table public.partners in share row exclusive mode;
    if not exists (select 1 from public.connections where user_id = v_me and other_id = v_req.from_user) then
      raise exception 'You''re not connected anymore' using errcode = '22023';
    end if;
    if exists (select 1 from public.partners where user_id in (v_me, v_req.from_user)) then
      raise exception 'One of you already has a partner' using errcode = '22023';
    end if;
    insert into public.partners (user_id, partner_id) values (v_me, v_req.from_user), (v_req.from_user, v_me);
    delete from public.connection_requests
    where kind = 'PARTNER' and (from_user in (v_me, v_req.from_user) or to_user in (v_me, v_req.from_user));
    perform private.notify_person(v_req.from_user, 'PARTNER_ACCEPTED', v_me);
  end if;
end;
$$;

-- Take back a request you sent
create or replace function public.cancel_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connection_requests where request_id = p_request_id and from_user = auth.uid();
  if not found then
    raise exception 'That request isn''t there anymore' using errcode = 'P0002';
  end if;
end;
$$;

-- Ask a connection to be your partner (or link, if they already asked you)
create or replace function public.request_partner(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := auth.uid();
  v_req bigint;
begin
  if not exists (select 1 from public.connections where user_id = v_me and other_id = p_user_id) then
    raise exception 'You can only partner with a connection' using errcode = '22023';
  end if;
  if exists (select 1 from public.partners where user_id = v_me) then
    raise exception 'You already have a partner. End that link first.' using errcode = '22023';
  end if;
  if exists (select 1 from public.partners where user_id = p_user_id) then
    raise exception 'They already have a partner' using errcode = '22023';
  end if;

  select request_id into v_req from public.connection_requests
  where from_user = p_user_id and to_user = v_me and kind = 'PARTNER';
  if v_req is not null then
    perform public.respond_to_request(v_req, true);
    return 'LINKED';
  end if;

  insert into public.connection_requests (from_user, to_user, kind)
  values (v_me, p_user_id, 'PARTNER')
  on conflict do nothing;
  if found then
    perform private.notify_person(p_user_id, 'PARTNER_REQUEST', v_me);
  end if;
  return 'REQUESTED';
end;
$$;

-- End your partner link (both sides). You stay connected.
create or replace function public.end_partner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
begin
  select partner_id into v_partner from public.partners where user_id = auth.uid();
  if v_partner is null then
    raise exception 'You don''t have a partner link' using errcode = 'P0002';
  end if;
  delete from public.partners where user_id in (auth.uid(), v_partner);
end;
$$;

-- Forget a connection: removed both ways, with the partner link and any
-- requests; they can't send you requests again. p_block also blocks them
-- (their ideas leave your Discover, #76). They aren't told.
create or replace function public.forget_connection(p_user_id uuid, p_block boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if p_user_id is null or p_user_id = v_me then
    raise exception 'Pick someone else' using errcode = '22023';
  end if;
  delete from public.connections
  where (user_id = v_me and other_id = p_user_id) or (user_id = p_user_id and other_id = v_me);
  delete from public.partners
  where (user_id = v_me and partner_id = p_user_id) or (user_id = p_user_id and partner_id = v_me);
  delete from public.connection_requests
  where (from_user = v_me and to_user = p_user_id) or (from_user = p_user_id and to_user = v_me);
  insert into public.forgotten_users (user_id, forgotten_id) values (v_me, p_user_id)
  on conflict do nothing;
  if p_block then
    insert into public.blocked_users (user_id, blocked_id) values (v_me, p_user_id)
    on conflict do nothing;
  end if;
end;
$$;

-- A new code: the old QR code and link stop working
create or replace function public.reset_profile_code()
returns text
language sql
security definer
set search_path = ''
as $$
  update public.user_preferences set profile_code = private.new_profile_code()
  where user_id = auth.uid()
  returning profile_code;
$$;

revoke execute on function
  public.connect_by_code(text),
  public.respond_to_request(bigint, boolean),
  public.cancel_request(bigint),
  public.request_partner(uuid),
  public.end_partner(),
  public.forget_connection(uuid, boolean),
  public.reset_profile_code()
from public, anon;
grant execute on function
  public.connect_by_code(text),
  public.respond_to_request(bigint, boolean),
  public.cancel_request(bigint),
  public.request_partner(uuid),
  public.end_partner(),
  public.forget_connection(uuid, boolean),
  public.reset_profile_code()
to authenticated;
