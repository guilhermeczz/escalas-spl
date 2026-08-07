import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const labels:Record<string,string>={entry:'iniciou o expediente',lunch:'saiu para o almoço',lunch_return:'retornou do almoço',shift_end:'encerrou o expediente'};
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const authorization=req.headers.get('Authorization')??'';
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});
    const {eventType}=await req.json();
    const {data,error}=await client.rpc('record_my_work_event',{p_event_type:eventType}); if(error)throw error;
    const webhook=Deno.env.get('SLACK_WEBHOOK_URL'); let slackSent=false;
    if(webhook){const time=new Date(data.occurred_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:`*${data.analyst_name}* ${labels[data.event_type]} às *${time}*.`})});slackSent=response.ok;}
    return new Response(JSON.stringify({...data,slack_sent:slackSent,slack_configured:Boolean(webhook)}),{headers:{...cors,'Content-Type':'application/json'}});
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:'Erro interno'}),{status:400,headers:{...cors,'Content-Type':'application/json'}});}
});
