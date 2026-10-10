-- ====================================================================
-- Batch delivery operations for the event worker
-- ====================================================================
-- The worker completed deliveries one round trip at a time, which capped it at
-- ~2-3 events/s over the network (measured 2026-10-10 on the hosted project).
-- These batch versions let one claimed batch be acknowledged in a single call.
-- Single-row functions stay for failures and tooling.
-- ====================================================================

-- Completes several claimed deliveries at once. Only rows still leased to
-- p_worker are completed; returns how many were.
create or replace function public.complete_event_deliveries(p_delivery_ids uuid[], p_worker text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update event_deliveries
  set status = 'succeeded', completed_at = now(), locked_until = null, last_error = null, updated_at = now()
  where id = any (p_delivery_ids) and status = 'processing' and locked_by = left(p_worker, 100);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Consumer-side idempotency for a batch: records (consumer, event) pairs and
-- returns only the event ids seen for the first time, so the consumer applies
-- its effect to exactly those.
create or replace function public.mark_events_processed(p_consumer text, p_event_ids uuid[])
returns uuid[]
language sql
security definer
set search_path = public
as $$
  with inserted as (
    insert into consumer_processed_events (consumer, event_id)
    select p_consumer, e from unnest(p_event_ids) as e
    on conflict (consumer, event_id) do nothing
    returning event_id
  )
  select coalesce(array_agg(event_id), '{}') from inserted
$$;

revoke all on function public.complete_event_deliveries(uuid[], text) from public, anon, authenticated;
revoke all on function public.mark_events_processed(text, uuid[]) from public, anon, authenticated;
grant execute on function public.complete_event_deliveries(uuid[], text) to service_role;
grant execute on function public.mark_events_processed(text, uuid[]) to service_role;

notify pgrst, 'reload schema';
