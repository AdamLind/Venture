-- Live photos (#39): whose a photo is defaults to whoever adds it, and the
-- app may say so (the policy only accepts your own id)
alter table public.captures alter column user_id set default auth.uid();
grant insert (user_id) on public.captures to authenticated;
