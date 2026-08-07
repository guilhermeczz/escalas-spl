import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = req.headers.get('Authorization') ?? ''; const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: auth } = await client.auth.getUser(authorization.replace('Bearer ', '')); const { data: caller } = await client.from('profiles').select('role').eq('id', auth.user?.id ?? '').single();
    if (caller?.role !== 'admin') return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { username, password, analystId, name } = await req.json(); if (!/^[a-z0-9._-]{3,40}$/.test(username) || !/^\d{6}$/.test(password)) throw new Error('Username ou senha inválidos.');
    const { data, error } = await client.auth.admin.createUser({ email: `${username}@login.superescalas.com`, password, email_confirm: true, user_metadata: { full_name: name } }); if (error) throw error;
    const { error: profileError } = await client.from('profiles').update({ name, analyst_id: analystId, role: 'user' }).eq('id', data.user.id); if (profileError) { await client.auth.admin.deleteUser(data.user.id); throw profileError; }
    return new Response(JSON.stringify({ id: data.user.id, username }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }); }
});
