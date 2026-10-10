-- ====================================================================
-- Rate limits for unauthenticated auth flows (password reset first)
-- ====================================================================
-- Password-reset emails are sent by our own server code (via Resend) using the
-- Supabase admin API, which isn't covered by Supabase's built-in email rate
-- limits. This table + function provide a simple sliding-window limiter.
-- Keys are opaque strings chosen by the caller (emails are hashed before use).
-- ====================================================================

create table if not exists public.auth_rate_limits (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_rate_limits_key_time on public.auth_rate_limits (key, created_at desc);

comment on table public.auth_rate_limits is
  'Sliding-window rate limiting for unauthenticated auth actions. Written only by hit_auth_rate_limit().';

alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from public, anon, authenticated;

-- Records an attempt for p_key and returns true if it is within p_max attempts
-- in the last p_window_seconds (the attempt is recorded either way). Also prunes
-- rows older than a day.
create or replace function public.hit_auth_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_key is null or char_length(p_key) > 200 then
    return false;
  end if;

  -- Serialize attempts for the same key so concurrent requests can't slip through
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  select count(*) into v_count
  from auth_rate_limits
  where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);

  insert into auth_rate_limits (key) values (p_key);

  -- Opportunistic cleanup (cheap thanks to the index)
  delete from auth_rate_limits where key = p_key and created_at < now() - interval '1 day';

  return v_count < p_max;
end;
$$;

revoke all on function public.hit_auth_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_auth_rate_limit(text, integer, integer) to service_role;

notify pgrst, 'reload schema';
