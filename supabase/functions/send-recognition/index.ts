import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let recognitionId: string | null = null;
  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return json({ error: 'Acesso negado' }, 401);
    const { data: profile } = await userClient.from('profiles').select('role').eq('id', auth.user.id).single();
    if (profile?.role !== 'admin') return json({ error: 'Acesso restrito ao ADM' }, 403);

    ({ recognitionId } = await req.json());
    if (!recognitionId) return json({ error: 'Reconhecimento não informado' }, 400);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: recognition, error: claimError } = await client
      .from('recognition_posts')
      .update({ slack_claimed_at: new Date().toISOString(), slack_error: null })
      .eq('id', recognitionId)
      .is('slack_claimed_at', null)
      .is('slack_sent_at', null)
      .select('id,title,message,media_path,media_type,analysts(name,slack_user_id)')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!recognition) return json({ sent: false, reason: 'already_sent_or_processing' });

    const analyst = Array.isArray(recognition.analysts) ? recognition.analysts[0] : recognition.analysts;
    const name = analyst?.name ?? 'Analista';
    const mention = analyst?.slack_user_id ? `<@${analyst.slack_user_id}>` : `*${name}*`;
    const mediaUrl = recognition.media_path
      ? client.storage.from('recognition-media').getPublicUrl(recognition.media_path).data.publicUrl
      : null;
    const blocks: Array<Record<string, unknown>> = [
      { type: 'section', text: { type: 'mrkdwn', text: `<!channel> 🌟 *${recognition.title}*` } },
      { type: 'section', text: { type: 'mrkdwn', text: `${mention} recebeu um reconhecimento especial! 👏\n>${String(recognition.message).replace(/\n/g, '\n>')}` } },
    ];
    if (mediaUrl && recognition.media_type?.startsWith('image/')) {
      blocks.push({ type: 'image', image_url: mediaUrl, alt_text: `Imagem do reconhecimento de ${name}`, title: { type: 'plain_text', text: `Parabéns, ${name}!` } });
    }
    if (mediaUrl && recognition.media_type?.startsWith('audio/')) {
      blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: '▶️ Ouvir áudio' }, url: mediaUrl, action_id: 'open_recognition_audio' }] });
    }
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_Parabéns pelo excelente trabalho e por fazer a diferença no time!_' }] });

    const webhook = Deno.env.get('SUPPORT_SLACK_WEBHOOK_URL');
    if (!webhook) throw new Error('Webhook do canal de suporte não configurado');
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text: `Reconhecimento para ${name}`, attachments: [{ color: '#2EB67D', blocks }] }),
    });
    if (!response.ok) throw new Error(`Slack respondeu com status ${response.status}`);
    await client.from('recognition_posts').update({ slack_sent_at: new Date().toISOString() }).eq('id', recognition.id);
    return json({ sent: true, recognition_id: recognition.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    if (recognitionId) {
      const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await client.from('recognition_posts').update({ slack_claimed_at: null, slack_error: message }).eq('id', recognitionId).is('slack_sent_at', null);
    }
    return json({ error: message }, 500);
  }
});
