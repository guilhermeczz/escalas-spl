import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const eventPresentation: Record<string, { title: string; action: string; symbol: string; color: string }> = {
  entry: {
    title: 'ENTRADA',
    action: 'entrou no expediente',
    symbol: '🟢 ➡️',
    color: '#2EB67D',
  },
  lunch: {
    title: 'SAÍDA PARA ALMOÇO',
    action: 'saiu para o almoço',
    symbol: '🔴 ⬅️',
    color: '#E01E5A',
  },
  lunch_return: {
    title: 'RETORNO DO ALMOÇO',
    action: 'retornou do almoço',
    symbol: '🟢 ➡️',
    color: '#2EB67D',
  },
  shift_end: {
    title: 'FIM DO EXPEDIENTE',
    action: 'encerrou o expediente',
    symbol: '🔴 ⬅️',
    color: '#E01E5A',
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authorization = req.headers.get('Authorization') ?? '';
    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { eventType } = await req.json();
    const { data, error } = await client.rpc('record_my_work_event', { p_event_type: eventType });
    if (error) throw error;

    const webhook = Deno.env.get('SLACK_WEBHOOK_URL');
    let slackSent = false;
    if (webhook) {
      const time = new Date(data.occurred_at).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
      const analyst = data.analyst_slack_user_id ? `<@${data.analyst_slack_user_id}>` : `*${data.analyst_name}*`;
      const presentation = eventPresentation[data.event_type];
      const message = `${presentation.symbol}\u00a0\u00a0\u00a0*${presentation.title}*\nO analista ${analyst} ${presentation.action} às *${time}*.`;
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          text: `${presentation.title}: ${data.analyst_name} às ${time}`,
          attachments: [{
            color: presentation.color,
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: message } }],
          }],
        }),
      });
      slackSent = response.ok;
    }

    return new Response(
      JSON.stringify({ ...data, slack_sent: slackSent, slack_configured: Boolean(webhook) }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
