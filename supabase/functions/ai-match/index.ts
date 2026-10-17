import { handleRequest } from '../_shared/matcher.js'

Deno.serve(request => handleRequest(request, {
  deepseekKey: Deno.env.get('DEEPSEEK_API_KEY'),
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}))
