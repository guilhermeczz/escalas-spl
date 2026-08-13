import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: auth } = await client.auth.getUser(token);
    const { data: caller } = await client.from('profiles').select('role').eq('id', auth.user?.id ?? '').single();
    if (caller?.role !== 'admin') return json({ error: 'Acesso negado' }, 403);

    const { action, userId, password } = await req.json();
    if (!userId || userId === auth.user?.id) return json({ error: 'Usuário inválido.' }, 400);
    const { data: target } = await client.from('profiles').select('role').eq('id', userId).single();
    if (target?.role !== 'user') return json({ error: 'Somente logins de analistas podem ser alterados.' }, 400);

    if (action === 'update_password') {
      if (!/^\d{6}$/.test(password ?? '')) return json({ error: 'A senha deve conter exatamente 6 números.' }, 400);
      const { error } = await client.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return json({ updated: true });
    }
    if (action === 'delete') {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ deleted: true });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 400);
  }
});
