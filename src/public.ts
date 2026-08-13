import './style.css';
import { fetchPublicData } from './data';
import { supabase } from './supabaseClient';
import { initTheme } from './theme';
import type { EscalaWithAnalysts, Notice } from './types';
import {
  formatDateBR,
  formatTime,
  dateRangeIncludesToday,
  initials,
  escapeHtml,
  todayBR,
} from './utils';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
};

const loading = $('#loading');
const muralEl = $('#mural');
const emptyState = $('#emptyState');

let clockTimer: number | undefined;
let realtimeDebounce: number | undefined;
let currentEscalas: EscalaWithAnalysts[] = [];
let analystLoggedIn = false;
let activeLunchAnalystIds = new Set<string>();
let myActiveLunch = false;
let myLunchCanReturn = false;
let myPlannedLunchStart: string | undefined;
let myPlannedLunchEnd: string | undefined;

// ---------------------------------------------------------------- clock
function tickClock() {
  const now = new Date();
  $('#clockTime').textContent = `${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  $('#clockDate').textContent = todayBR();
  renderTimeSensitiveSections();
  if (analystLoggedIn) void refreshMyLunch();
  if (analystLoggedIn) void refreshWorkday();
}

function startClock() {
  tickClock();
  clockTimer = window.setInterval(tickClock, 1000 * 20);
}

// ---------------------------------------------------------------- cards
function analystCard(opts: { analystName: string; analystColor: string; role?: string | null; top: string; chip?: { text: string; tone: 'ok' | 'warn' | 'muted' } }) {
  return `
    <article class="scale-card print-avoid-break">
      <div class="card-top">
        <div class="avatar" style="background:${opts.analystColor}">${initials(opts.analystName)}</div>
        <span class="chip chip-${opts.chip?.tone ?? 'muted'}">${opts.chip?.text ?? '—'}</span>
      </div>
      <h4>${escapeHtml(opts.analystName)}</h4>
      <div class="card-time">${opts.top}</div>
    </article>
  `;
}

function uraStatus(analystId: string, startValue: string, endValue: string): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value: string) => {
    const [hours, mins] = value.slice(0, 5).split(':').map(Number);
    return hours * 60 + mins;
  };
  const start = toMinutes(startValue);
  const end = toMinutes(endValue);
  if (minutes < start) return { text: 'AGENDADO', tone: 'muted' };
  if (minutes >= end) return { text: 'CONCLUÍDO', tone: 'ok' };
  const atLunch = activeLunchAnalystIds.has(analystId);
  return atLunch ? { text: 'EM PAUSA', tone: 'warn' } : { text: 'EM ATENDIMENTO', tone: 'ok' };
}

function renderUra(escala: EscalaWithAnalysts): string {
  const start = formatTime(escala.start_value ?? '');
  const end = formatTime(escala.end_value ?? '');
  const statuses = escala.analysts.map((a) => uraStatus(a.id, escala.start_value ?? '00:00', escala.end_value ?? '00:00'));
  const status = statuses.some((item) => item.text === 'EM PAUSA')
    ? { text: 'EM PAUSA', tone: 'warn' as const }
    : statuses[0] ?? { text: 'AGENDADO', tone: 'muted' as const };
  return `<article class="scale-card ura-group-card print-avoid-break">
    <div class="card-top"><div class="ura-avatar-stack">${escala.analysts.slice(0, 4).map((a) => `<span class="avatar" title="${escapeHtml(a.name)}" style="background:${a.color}">${initials(a.name)}</span>`).join('')}${escala.analysts.length > 4 ? `<span class="avatar ura-more">+${escala.analysts.length - 4}</span>` : ''}</div><span class="chip chip-${status.tone}">${status.text}</span></div>
    <div class="ura-group-names">${escala.analysts.map((a) => `<div><strong>${escapeHtml(a.name)}</strong>${a.extension ? `<small>Ramal ${escapeHtml(a.extension)}</small>` : ''}</div>`).join('')}</div>
    <div class="card-time">URA das <strong>${start}</strong> às <strong>${end}</strong><small>${escala.analysts.length} analista(s) neste horário</small></div>
  </article>`;
}

function renderPlantao(escala: EscalaWithAnalysts): string {
  const hoje = dateRangeIncludesToday(escala.start_value ?? '', escala.end_value ?? '');
  const de = formatDateBR(escala.start_value ?? '');
  const ate = formatDateBR(escala.end_value ?? '');
  return escala.analysts
    .map((a) =>
      analystCard({
        analystName: a.name,
        analystColor: a.color,
        role: a.role,
        top: `De plantão de <strong>${de}</strong> até <strong>${ate}</strong>`,
        chip: hoje ? { text: 'HOJE', tone: 'ok' } : { text: 'ESCALADO', tone: 'warn' },
      })
    )
    .join('');
}

function sortPlantaoByDate(escalas: EscalaWithAnalysts[]): EscalaWithAnalysts[] {
  return [...escalas].sort((a, b) =>
    (a.start_value ?? '9999-12-31').localeCompare(b.start_value ?? '9999-12-31')
    || (a.end_value ?? '9999-12-31').localeCompare(b.end_value ?? '9999-12-31')
  );
}

function renderAlmoco(escala: EscalaWithAnalysts): string {
  const inProgress = (analyst: EscalaWithAnalysts['analysts'][number]) => activeLunchAnalystIds.has(analyst.id);
  return escala.analysts
    .map((a) =>
      analystCard({
        analystName: a.name,
        analystColor: a.color,
        role: a.role,
        top: a.schedule_start && a.schedule_end
          ? `Almoço das <strong>${formatTime(a.schedule_start)}</strong> às <strong>${formatTime(a.schedule_end)}</strong>`
          : 'Horário ainda não definido',
        chip: inProgress(a) ? { text: 'EM ALMOÇO', tone: 'warn' } : a.schedule_start ? { text: 'DEFINIDO', tone: 'ok' } : { text: 'PENDENTE', tone: 'muted' },
      })
    )
    .join('');
}

function renderTimeSensitiveSections() {
  if (!currentEscalas.length) return;
  const localDate = new Date().toLocaleDateString('sv-SE');
  const ura = currentEscalas.filter((e) => e.kind === 'horario' && (!e.schedule_date || e.schedule_date === localDate));
  const almoco = currentEscalas.filter((e) => e.kind === 'almoco');
  $('#uraGrid').innerHTML = ura.map(renderUra).join('');
  $('#almocoGrid').innerHTML = renderAlmocoSchedule(almoco);
  const lunchCount = activeLunchAnalystIds.size;
  $('#lunchCounter').textContent = `Almoço · ${lunchCount} ${lunchCount === 1 ? 'analista' : 'analistas'} em andamento`;
}

function renderAlmocoSchedule(escalas: EscalaWithAnalysts[]): string {
  const entries = escalas
    .flatMap((escala) => escala.analysts.map((analyst) => ({ escala, analyst })))
    .sort((a, b) => (a.analyst.schedule_start ?? '99:99').localeCompare(b.analyst.schedule_start ?? '99:99'));

  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.analyst.schedule_start && entry.analyst.schedule_end
      ? `${entry.analyst.schedule_start}|${entry.analyst.schedule_end}`
      : 'pending';
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, group], index) => {
    const [start, end] = key.split('|');
    const defined = key !== 'pending';
    return `
      <div class="lunch-slot ${defined ? '' : 'lunch-slot-pending'}">
        <div class="lunch-slot-head">
          <span class="lunch-order">${defined ? `${index + 1}º` : '!'}</span>
          <div><strong>${defined ? `${formatTime(start)} às ${formatTime(end)}` : 'Horário pendente'}</strong><small>${group.length} analista(s)</small></div>
        </div>
        <div class="card-grid">
          ${group.map(({ escala, analyst }) => renderAlmoco({ ...escala, analysts: [analyst] })).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderMural(notices: Notice[]): void {
  if (notices.length === 0) {
    muralEl.classList.add('hidden');
    return;
  }
  muralEl.classList.remove('hidden');
  muralEl.innerHTML = `
    <div class="mural-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 11v2a2 2 0 0 0 2 2h2l2 5h3l-2-5 8 3V6L7 9H5a2 2 0 0 0-2 2Z"/></svg></div>
    <div class="mural-content">
      <span class="mural-label">Mural de avisos e lembretes</span>
      <ul>
        ${notices.map((n) => `<li>${escapeHtml(n.text)}</li>`).join('')}
      </ul>
    </div>
  `;
}

// ---------------------------------------------------------------- load
async function loadPublicData(showLoading = true) {
  if (showLoading) loading.classList.remove('hidden');
  try {
    const { notices, escalas } = await fetchPublicData();
    currentEscalas = escalas;
    renderMural(notices);

    const localDate = new Date().toLocaleDateString('sv-SE');
    const ura = escalas.filter((e) => e.kind === 'horario' && (!e.schedule_date || e.schedule_date === localDate));
    const plantao = sortPlantaoByDate(escalas.filter((e) => e.kind === 'plantao'));
    const almoco = escalas.filter((e) => e.kind === 'almoco');

    $('#uraGrid').innerHTML = ura.map(renderUra).join('');
    $('#plantaoGrid').innerHTML = plantao.map(renderPlantao).join('');
    $('#almocoGrid').innerHTML = renderAlmocoSchedule(almoco);
    renderTimeSensitiveSections();

    $('#uraSection').classList.toggle('hidden', ura.length === 0);
    $('#plantaoSection').classList.toggle('hidden', plantao.length === 0);
    $('#almocoSection').classList.toggle('hidden', almoco.length === 0);

    const any = ura.length + plantao.length + almoco.length > 0;
    emptyState.classList.toggle('hidden', any);
    $('#pageTitle').textContent = any ? 'Escalas em vigor' : 'Nenhuma escala publicada';
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Erro ao carregar as escalas.');
  } finally {
    if (showLoading) loading.classList.add('hidden');
  }
}

function toast(message: string) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 4000);
}

function currentHHMM(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function addOneHour(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const total = hours * 60 + minutes + 60;
  return `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function refreshMyLunch() {
  const [{ data }, { data: activeIds }] = await Promise.all([
    supabase.rpc('get_my_lunch'), supabase.rpc('active_lunch_analyst_ids')
  ]);
  activeLunchAnalystIds = new Set((activeIds ?? []).map((row: { analyst_id: string }) => row.analyst_id));
  const lunch = Array.isArray(data) ? data[0] : data;
  const card = $('#myLunchCard');
  const start = lunch?.schedule_start?.slice(0, 5) as string | undefined;
  const end = lunch?.schedule_end?.slice(0, 5) as string | undefined;
  myPlannedLunchStart = start;
  myPlannedLunchEnd = end;
  myActiveLunch = Boolean(lunch?.event_id && !lunch?.returned_at);
  const completed = Boolean(lunch?.returned_at);
  card.classList.toggle('in-progress', myActiveLunch);
  if (myActiveLunch) {
    const returnUnlock = new Date(new Date(lunch.started_at).getTime() + 59 * 60 * 1000);
    myLunchCanReturn = Date.now() >= returnUnlock.getTime();
    $('#myLunchStatus').textContent = 'Em andamento';
    $('#myLunchTime').textContent = myLunchCanReturn
      ? `Retorno previsto às ${new Date(lunch.expected_return_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`
      : `Retorno liberado às ${returnUnlock.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`;
    $('#openLunchBtn').textContent = myLunchCanReturn ? 'Registrar retorno' : 'Retorno bloqueado';
    if (myLunchCanReturn) $('#openLunchBtn').removeAttribute('disabled'); else $('#openLunchBtn').setAttribute('disabled', '');
  } else if (completed) {
    myLunchCanReturn = false;
    $('#myLunchStatus').textContent = 'Concluído';
    $('#myLunchTime').textContent = `Retorno registrado às ${new Date(lunch.returned_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`;
    $('#openLunchBtn').textContent = 'Almoço concluído';
    $('#openLunchBtn').setAttribute('disabled', '');
  } else {
    myLunchCanReturn = false;
    $('#openLunchBtn').removeAttribute('disabled');
    $('#myLunchStatus').textContent = start && end ? 'Previsto' : 'Ainda não previsto';
    $('#myLunchTime').textContent = start && end ? `${formatTime(start)} às ${formatTime(end)}` : 'Registre somente quando for sair';
    $('#openLunchBtn').textContent = 'Registrar almoço';
  }
  renderTimeSensitiveSections();
}

function openLunchEditor() {
  const now = new Date();
  const expectedReturn = addOneHour(currentHHMM(now));
  const currentTime = currentHHMM(now);
  const outsidePlannedTime = Boolean(myPlannedLunchStart && myPlannedLunchEnd && (currentTime < myPlannedLunchStart || currentTime >= myPlannedLunchEnd));
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h3>${myActiveLunch ? 'Registrar retorno' : 'Iniciar almoço agora'}</h3><p class="toolbar-sub">${myActiveLunch ? 'Confirme que você já retornou ao atendimento.' : 'A saída será registrada com o horário atual.'}</p></div><button class="modal-close" type="button">✕</button></div><form id="myLunchForm" class="modal-body">${myActiveLunch ? '<div class="schedule-tip"><strong>Retornar ao atendimento</strong><span>O horário real será salvo, mesmo após o previsto.</span></div>' : `${outsidePlannedTime ? `<div class="schedule-tip lunch-outside-warning"><strong>Você está saindo fora do horário previsto</strong><span>Previsto: ${formatTime(myPlannedLunchStart!)} às ${formatTime(myPlannedLunchEnd!)} · Saída agora: ${formatTime(currentTime)}. Confirme se deseja realmente iniciar o almoço neste horário.</span></div>` : ''}<div class="schedule-tip"><strong>Retorno previsto às ${formatTime(expectedReturn)}</strong><span>O retorno só poderá ser registrado depois de 59 minutos.</span></div><div class="schedule-tip"><strong>Limite simultâneo</strong><span>Até 4 analistas podem ficar em almoço ao mesmo tempo.</span></div>`}<div class="modal-actions"><button class="btn-ghost lunch-cancel" type="button">Cancelar</button><button class="btn-primary" type="submit">${myActiveLunch ? 'Confirmar retorno' : outsidePlannedTime ? 'Sim, iniciar agora' : 'Confirmar saída'}</button></div></form></div>`;
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close')!.addEventListener('click', close);
  overlay.querySelector('.lunch-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector<HTMLFormElement>('#myLunchForm')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = overlay.querySelector<HTMLButtonElement>('button[type=submit]')!;
    button.disabled = true; button.textContent = 'Salvando...';
    const { error } = await supabase.rpc(myActiveLunch ? 'finish_my_lunch' : 'start_my_lunch');
    if (error) { button.disabled = false; button.textContent = myActiveLunch ? 'Confirmar retorno' : 'Confirmar saída'; toast(error.message.includes('LUNCH_LIMIT') ? 'Já existem 4 analistas em almoço. Aguarde um deles retornar.' : error.message.includes('RETURN_TOO_EARLY') ? 'O retorno só é liberado após 59 minutos de almoço.' : error.message); return; }
    const returning = myActiveLunch; close(); toast(returning ? 'Retorno registrado.' : 'Saída para almoço registrada.'); await refreshMyLunch();
  });
  document.body.appendChild(overlay);
}

async function initAnalystSession(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) {
    location.replace('/login.html');
    return false;
  }
  const { data: profile } = await supabase.from('profiles').select('name,role,analyst_id,analysts(extension)').eq('id', auth.session.user.id).single();
  if (!profile) {
    await supabase.auth.signOut();
    location.replace('/login.html');
    return false;
  }
  if (profile.role === 'admin') {
    location.replace('/admin.html');
    return false;
  }
  analystLoggedIn = true;
  const analyst = Array.isArray(profile.analysts) ? profile.analysts[0] : profile.analysts;
  const name = profile.name?.trim() || auth.session.user.email?.split('@')[0] || 'Analista';
  $('#analystIdentity').classList.remove('hidden');
  $('#loggedAnalystName').textContent = name;
  $('#loggedAnalystExtension').textContent = analyst?.extension ? `Ramal ${analyst.extension}` : '';
  $('#workdayPanel').classList.remove('hidden');
  $('#analystLogout').classList.remove('hidden');
  document.querySelectorAll<HTMLAnchorElement>('a[href="/login.html"]').forEach((link) => link.classList.add('hidden'));
  if (!profile.analyst_id) { $('#myLunchStatus').textContent = 'Perfil sem vínculo'; $('#openLunchBtn').setAttribute('disabled', ''); return true; }
  await Promise.all([refreshMyLunch(), refreshWorkday()]);
  return true;
}

type WorkEventType = 'entry' | 'lunch' | 'lunch_return' | 'shift_end';
const workEventLabels: Record<WorkEventType, string> = { entry:'Entrada', lunch:'Almoço', lunch_return:'Retorno do almoço', shift_end:'Fim do expediente' };

async function refreshWorkday() {
  const { data } = await supabase.rpc('get_my_workday');
  const events = (data ?? []) as { event_type: WorkEventType; occurred_at: string }[];
  const last = events.length ? events[events.length - 1] : undefined;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-work-event]'));
  buttons.forEach((button) => { button.disabled = true; button.classList.remove('completed','active'); });
  events.forEach((event) => document.querySelector<HTMLButtonElement>(`[data-work-event="${event.event_type}"]`)?.classList.add('completed'));
  let next: WorkEventType | null = 'entry'; let status='Aguardando entrada'; let hint='Registre a entrada quando iniciar o expediente.';
  if(last?.event_type==='entry'){next='lunch';status='Em expediente';hint='Próxima ação: saída para almoço.';}
  if(last?.event_type==='lunch'){
    const unlock=new Date(new Date(last.occurred_at).getTime()+59*60000); const allowed=Date.now()>=unlock.getTime(); next=allowed?'lunch_return':null; status='Em almoço'; hint=allowed?'O retorno já pode ser registrado.':`Retorno liberado às ${unlock.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.`;
  }
  if(last?.event_type==='lunch_return'){next='shift_end';status='Em expediente';hint='Próxima ação: fim do expediente.';}
  if(last?.event_type==='shift_end'){next=null;status='Expediente encerrado';hint='Todos os registros de hoje foram concluídos.';}
  $('#workdayStatus').textContent=status; $('#workdayHint').textContent=hint;
  if(next){const button=document.querySelector<HTMLButtonElement>(`[data-work-event="${next}"]`);if(button){button.disabled=false;button.classList.add('active');}}
}

function confirmWorkEvent(eventType: WorkEventType) {
  const overlay=document.createElement('div'); overlay.className='modal-overlay';
  const special=eventType==='lunch'?'<div class="schedule-tip"><strong>Almoço de 1 hora</strong><span>O retorno será liberado somente após 59 minutos.</span></div>':'';
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h3>Confirmar ${workEventLabels[eventType].toLowerCase()}</h3><p class="toolbar-sub">O horário atual será registrado no seu histórico.</p></div><button class="modal-close" type="button">✕</button></div><form class="modal-body work-confirm-form"><div class="work-confirm"><strong>${workEventLabels[eventType]}</strong><span>${new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</span></div>${special}<p>Tem certeza de que deseja confirmar esta ação?</p><div class="modal-actions"><button class="btn-ghost cancel-work" type="button">Cancelar</button><button class="btn-primary" type="submit">Sim, confirmar</button></div></form></div>`;
  const close=()=>overlay.remove(); overlay.querySelector('.modal-close')!.addEventListener('click',close);overlay.querySelector('.cancel-work')!.addEventListener('click',close);
  overlay.querySelector('form')!.addEventListener('submit',async(event)=>{event.preventDefault();const button=overlay.querySelector<HTMLButtonElement>('button[type=submit]')!;button.disabled=true;button.textContent='Registrando...';const {data,error}=await supabase.functions.invoke('record-work-event',{body:{eventType}});if(error||data?.error){button.disabled=false;button.textContent='Sim, confirmar';const message=data?.error??error?.message??'Erro ao registrar.';toast(message.includes('RETURN_TOO_EARLY')?'O retorno ainda não foi liberado.':message.includes('LUNCH_LIMIT')?'Já existem 4 analistas em almoço. Aguarde um deles retornar.':message.includes('OPERATION_OFF')?'O sistema está fora do horário de expediente.':'Não foi possível registrar o ponto.');return;}close();toast(`${workEventLabels[eventType]} registrada com sucesso.`);await Promise.all([refreshWorkday(),refreshMyLunch()]);});
  document.body.appendChild(overlay);
}

// ---------------------------------------------------------------- init
startClock();
initTheme();
const uraSection = $('#uraSection');
const almocoSection = $('#almocoSection');
const plantaoSection = $('#plantaoSection');
uraSection.after(almocoSection);
almocoSection.after(plantaoSection);
initAnalystSession().then((allowed) => {
  if (allowed) loadPublicData();
});

$('#refreshBtn').addEventListener('click', () => loadPublicData());
$('#openLunchBtn').addEventListener('click', openLunchEditor);
document.querySelectorAll<HTMLButtonElement>('[data-work-event]').forEach((button)=>button.addEventListener('click',()=>confirmWorkEvent(button.dataset.workEvent as WorkEventType)));
$('#analystLogout').addEventListener('click', async () => { await supabase.auth.signOut(); location.href = '/login.html'; });

const scheduleRefresh = () => {
  if (realtimeDebounce) window.clearTimeout(realtimeDebounce);
  realtimeDebounce = window.setTimeout(() => loadPublicData(false), 250);
};
const realtimeChannel = supabase.channel('public-escalas-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'escalas' }, scheduleRefresh)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_analysts' }, scheduleRefresh)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'analysts' }, scheduleRefresh)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, scheduleRefresh)
  .subscribe();

window.addEventListener('beforeunload', () => {
  if (clockTimer) window.clearInterval(clockTimer);
  if (realtimeDebounce) window.clearTimeout(realtimeDebounce);
  supabase.removeChannel(realtimeChannel);
});
