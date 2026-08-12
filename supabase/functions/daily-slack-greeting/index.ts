import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const messages = [
  'Que o dia comece leve e termine com a sensação de dever cumprido.',
  'Cada atendimento bem-feito faz diferença. Vamos para mais um ótimo dia!',
  'Que hoje não faltem foco, parceria e bons resultados.',
  'Um novo dia é uma nova oportunidade de fazer um excelente trabalho.',
  'Vamos juntos transformar dedicação em um dia produtivo e positivo.',
  'Pequenas atitudes constroem grandes resultados. Excelente dia, equipe!',
  'Que o trabalho de hoje seja tranquilo, produtivo e cheio de boas conquistas.',
  'Começamos mais um dia com energia, união e vontade de fazer acontecer.',
  'Foco no que importa, parceria em cada etapa e um excelente dia para todos!',
  'Que hoje seja um daqueles dias em que tudo flui bem. Bom trabalho!',
  'Toda jornada começa com um primeiro passo. Que o de hoje seja excelente!',
  'Confiança, colaboração e constância: uma ótima combinação para o dia de hoje.',
  'Que não faltem motivos para celebrar as pequenas vitórias de hoje.',
  'Mais um dia para aprender, contribuir e crescer juntos. Vamos em frente!',
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'Acesso negado' }, 401);
    const webhook = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!webhook) return json({ configured: false, sent: false });

    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(now);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now));
    if (weekday === 'Sun' || hour !== 8) return json({ configured: true, sent: false, reason: 'operation_off' });

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const dayNumber = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86400000);
    const messageIndex = dayNumber % messages.length;
    const { data: claimed, error: claimError } = await client
      .from('daily_slack_greeting_log')
      .insert({ greeting_date: today, message_index: messageIndex })
      .select('greeting_date')
      .maybeSingle();
    if (claimError || !claimed) return json({ configured: true, sent: false, reason: 'already_sent' });

    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text: `<!channel> ☀️ *Bom dia, equipe!* ${messages[messageIndex]}` }),
    });
    if (!response.ok) {
      await client.from('daily_slack_greeting_log').delete().eq('greeting_date', today);
      throw new Error(`Slack respondeu com status ${response.status}`);
    }
    return json({ configured: true, sent: true, greeting_date: today });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});
