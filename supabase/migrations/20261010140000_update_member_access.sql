-- ====================================================================
-- Edit a member's role and facility access
-- ====================================================================
-- Direct writes to organization_members / member_facility_access are closed
-- (Sprint 1 hardening), so role and facility changes go through this function,
-- which applies the same two-level admin rules as the rest of the Members page:
--   * owners: change anyone but themselves and other owners
--   * admins: members they can manage (can_manage_member); never owners/admins,
--     and they can't make anyone an admin
--   * ops managers: floor workers' facility access only
-- Role rules: office roles move among admin / ops_manager / supervisor / billing;
-- floor workers and client users keep their role (badge accounts can't sign in to
-- the office app). Changes are recorded by the audit trigger.
-- ====================================================================

create or replace function public.update_member_access(
  p_member_id      uuid,
  p_role           member_role,
  p_all_facilities boolean,
  p_facility_ids   uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target       organization_members;
  v_caller_role  member_role;
  v_office_roles member_role[] := array['admin', 'ops_manager', 'supervisor', 'billing']::member_role[];
  v_facilities   uuid[] := coalesce(p_facility_ids, '{}');
begin
  select * into v_target from organization_members where id = p_member_id;
  if v_target.id is null then
    raise exception 'Member not found.' using errcode = '22023';
  end if;

  v_caller_role := get_user_role(v_target.organization_id);
  if auth.uid() is null or v_caller_role is null then
    raise exception 'You do not have permission to edit this member.' using errcode = '42501';
  end if;
  if v_target.user_id = auth.uid() then
    raise exception 'You can''t change your own role or access.' using errcode = '42501';
  end if;
  if v_target.role = 'owner' then
    raise exception 'Owners can''t be edited here.' using errcode = '42501';
  end if;

  -- Who may edit this member at all
  if not (
    can_manage_member(p_member_id)
    or (v_caller_role = 'ops_manager' and v_target.role = 'floor_worker')
  ) then
    raise exception 'You do not have permission to edit this member.' using errcode = '42501';
  end if;

  -- Role change rules
  if p_role is distinct from v_target.role then
    if v_caller_role = 'ops_manager' then
      raise exception 'Ops managers can change facility access, not roles.' using errcode = '42501';
    end if;
    if v_target.role in ('floor_worker', 'client_user') then
      raise exception 'This member''s role can''t be changed. Floor workers and client users keep their role.' using errcode = '22023';
    end if;
    if not (p_role = any (v_office_roles)) then
      raise exception 'Choose admin, ops manager, supervisor or billing.' using errcode = '22023';
    end if;
    if p_role = 'admin' and v_caller_role <> 'owner' then
      raise exception 'Only an owner can make someone an admin.' using errcode = '42501';
    end if;
  end if;

  -- Facility rules
  if not coalesce(p_all_facilities, false) then
    if exists (
      select 1 from unnest(v_facilities) f
      where not exists (select 1 from facilities where id = f and organization_id = v_target.organization_id)
    ) then
      raise exception 'One or more facilities don''t belong to this organization.' using errcode = '42501';
    end if;
  end if;

  update organization_members
  set role = p_role,
      all_facilities = coalesce(p_all_facilities, false),
      -- "Manage all members" only applies to admins
      can_manage_all_members = case when p_role = 'admin' then can_manage_all_members else false end,
      updated_at = now()
  where id = p_member_id;

  -- Replace specific facility access (only the differences, so the audit log stays meaningful)
  if coalesce(p_all_facilities, false) then
    delete from member_facility_access where member_id = p_member_id;
  else
    delete from member_facility_access
    where member_id = p_member_id and not (facility_id = any (v_facilities));
    insert into member_facility_access (member_id, facility_id)
    select p_member_id, f from unnest(v_facilities) f
    on conflict (member_id, facility_id) do nothing;
  end if;
end;
$$;

comment on function public.update_member_access(uuid, member_role, boolean, uuid[]) is
  'Changes a member''s role and facility access under the two-level admin rules. Audited.';

revoke all on function public.update_member_access(uuid, member_role, boolean, uuid[]) from public, anon;
grant execute on function public.update_member_access(uuid, member_role, boolean, uuid[]) to authenticated;

notify pgrst, 'reload schema';
