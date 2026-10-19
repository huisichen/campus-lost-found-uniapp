create or replace function public.get_web_push_vapid()
returns jsonb language sql security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'publicKey', (select decrypted_secret from vault.decrypted_secrets where name = 'web_push_public_key' limit 1),
    'privateKey', (select decrypted_secret from vault.decrypted_secrets where name = 'web_push_private_key' limit 1),
    'subject', (select decrypted_secret from vault.decrypted_secrets where name = 'web_push_subject' limit 1)
  );
$$;
revoke all on function public.get_web_push_vapid() from public, anon, authenticated;
grant execute on function public.get_web_push_vapid() to service_role;
