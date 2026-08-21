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

type BirthdayProfile = {
  id: string;
  birth_date: string;
  avatar_path: string | null;
  name: string | null;
  analysts: { name: string; slack_user_id: string | null } | Array<{ name: string; slack_user_id: string | null }> | null;
};

Deno.serve(async (req) => {
  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const testSecret = Deno.env.get('BIRTHDAY_TEST_SECRET');
    const isCronRequest = Boolean(cronSecret && req.headers.get('x-cron-secret') === cronSecret);
    const isBirthdayTest = Boolean(testSecret && req.headers.get('x-birthday-test-secret') === testSecret);
    if (!isCronRequest && !isBirthdayTest) return json({ error: 'Acesso negado' }, 401);

    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(now);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now));
    if (!isBirthdayTest && hour !== 8) return json({ configured: true, sent: false, reason: 'operation_off' });

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const supportWebhook = Deno.env.get('SUPPORT_SLACK_WEBHOOK_URL');
    let birthdaysSent = 0;

    if (supportWebhook) {
      const { data, error } = await client
        .from('profiles')
        .select('id,birth_date,avatar_path,name,analysts(name,slack_user_id)')
        .not('birth_date', 'is', null);
      if (error) throw error;

      const monthDay = today.slice(5);
      const currentYear = Number(today.slice(0, 4));
      const birthdays = ((data ?? []) as unknown as BirthdayProfile[]).filter((profile) => profile.birth_date.slice(5) === monthDay);
      for (const profile of birthdays) {
        const { data: claimed, error: claimError } = await client
          .from('birthday_slack_log')
          .insert({ profile_id: profile.id, birthday_year: currentYear })
          .select('profile_id')
          .maybeSingle();
        if (claimError || !claimed) continue;

        const analyst = Array.isArray(profile.analysts) ? profile.analysts[0] : profile.analysts;
        const name = analyst?.name ?? profile.name ?? 'colega';
        const mention = analyst?.slack_user_id ? `<@${analyst.slack_user_id}>` : `*${name}*`;
        let avatarUrl: string | null = null;
        if (profile.avatar_path) {
          const { data: signed } = await client.storage.from('profile-photos').createSignedUrl(profile.avatar_path, 86400);
          avatarUrl = signed?.signedUrl ?? null;
        }

        const blocks: Array<Record<string, unknown>> = [
          { type: 'section', text: { type: 'mrkdwn', text: `<!channel> 🎉 *Feliz aniversário, ${mention}!*` } },
          { type: 'section', text: { type: 'mrkdwn', text: `Hoje celebramos o dia de *${name}*. Que este novo ciclo venha com saúde, alegria e muitas conquistas! 🥳\n_Deixe aqui sua mensagem para tornar o dia ainda mais especial._` } },
        ];
        if (avatarUrl) blocks.splice(1, 0, { type: 'image', image_url: avatarUrl, alt_text: `Foto de ${name}`, title: { type: 'plain_text', text: `Hoje o dia é de ${name}!` } });

        const response = await fetch(supportWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            text: `Feliz aniversário, ${name}!`,
            attachments: [{ color: '#E01E5A', blocks }],
          }),
        });
        if (response.ok) birthdaysSent++;
        else await client.from('birthday_slack_log').delete().eq('profile_id', profile.id).eq('birthday_year', currentYear);
      }
    }

    const greetingWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
    let greetingSent = false;
    if (!isBirthdayTest && greetingWebhook && weekday !== 'Sun') {
      const dayNumber = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86400000);
      const messageIndex = dayNumber % messages.length;
      const { data: claimed } = await client
        .from('daily_slack_greeting_log')
        .insert({ greeting_date: today, message_index: messageIndex })
        .select('greeting_date')
        .maybeSingle();
      if (claimed) {
        const response = await fetch(greetingWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ text: `<!channel> ☀️ *Bom dia, equipe!* ${messages[messageIndex]}` }),
        });
        greetingSent = response.ok;
        if (!response.ok) await client.from('daily_slack_greeting_log').delete().eq('greeting_date', today);
      }
    }

    return json({ configured: Boolean(supportWebhook || greetingWebhook), test_mode: isBirthdayTest, greeting_sent: greetingSent, birthdays_sent: birthdaysSent, date: today });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});
