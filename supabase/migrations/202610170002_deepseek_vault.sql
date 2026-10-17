-- The API key is inserted separately into Supabase Vault and never checked into Git.
create or replace function public.get_deepseek_api_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'deepseek_api_key'
  limit 1;
$$;

revoke all on function public.get_deepseek_api_key() from public, anon, authenticated;
grant execute on function public.get_deepseek_api_key() to service_role;
