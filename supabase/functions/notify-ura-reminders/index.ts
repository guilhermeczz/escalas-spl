import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
  try{
    const cronSecret=Deno.env.get('CRON_SECRET');
    if(!cronSecret||req.headers.get('x-cron-secret')!==cronSecret)return json({error:'Acesso negado'},401);
    const webhook=Deno.env.get('SLACK_WEBHOOK_URL'); if(!webhook)return json({configured:false,sent:0});
    const lead=Math.max(1,Number(Deno.env.get('URA_REMINDER_MINUTES')??'5'));
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const now=new Date(); const dateFmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}); const timeFmt=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false});
    const today=dateFmt.format(now); const nowParts=timeFmt.format(now).split(':').map(Number); const nowMinutes=nowParts[0]*60+nowParts[1];
    const {data:scales,error}=await client.from('escalas').select('id,start_value,end_value,escala_analysts(analyst_id(id,name,slack_user_id))').eq('kind','horario').eq('active',true).eq('schedule_date',today); if(error)throw error;
    let sent=0;
    for(const scale of scales??[]){for(const link of scale.escala_analysts??[]){const analyst=Array.isArray(link.analyst_id)?link.analyst_id[0]:link.analyst_id;if(!analyst)continue;
      for(const reminder of [{type:'ura_start',time:scale.start_value},{type:'ura_end',time:scale.end_value}]){const [h,m]=String(reminder.time).slice(0,5).split(':').map(Number);if(h*60+m-nowMinutes!==lead)continue;
        const {data:claimed,error:claimError}=await client.from('slack_notification_log').insert({escala_id:scale.id,analyst_id:analyst.id,schedule_date:today,notification_type:reminder.type}).select('id').maybeSingle();if(claimError||!claimed)continue;
        const mention=analyst.slack_user_id?`<@${analyst.slack_user_id}>`:`*${analyst.name}*`;
        const message=reminder.type==='ura_start'
          ? `⏰ ${mention}, seu horário na URA começa em *${lead} minutos*. Seu turno de hoje é das *${String(scale.start_value).slice(0,5)}* às *${String(scale.end_value).slice(0,5)}*.`
          : `⏰ ${mention}, seu turno na URA está chegando ao fim. Em *${lead} minutos*, faça o logout da URA, por favor.`;
        const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({text:message})});
        if(response.ok)sent++;else await client.from('slack_notification_log').delete().eq('id',claimed.id);
      }
    }}
    return json({configured:true,sent,checked_at:now.toISOString()});
  }catch(error){return json({error:error instanceof Error?error.message:'Erro interno'},500);}
});
