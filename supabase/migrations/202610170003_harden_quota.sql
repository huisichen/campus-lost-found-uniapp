-- Only the Edge Function's server credential may consume quota for a verified user.
create or replace function public.consume_ai_match_quota_for_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := false;
begin
  if p_user_id is null then return false; end if;
  insert into public.ai_match_quota (user_id, day, calls)
  values (p_user_id, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update
    set calls = public.ai_match_quota.calls + 1
    where public.ai_match_quota.calls < 10
  returning true into accepted;
  return coalesce(accepted, false);
end;
$$;

revoke all on function public.consume_ai_match_quota_for_user(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_match_quota_for_user(uuid) to service_role;
drop function public.consume_ai_match_quota();
