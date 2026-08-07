import './style.css';
import { fetchPublicData } from './data';
import { supabase } from './supabaseClient';
import { downloadEscalasPdf } from './pdf';
import { initTheme } from './theme';
import type { EscalaWithAnalysts, Notice } from './types';
import {
  formatDateBR,
  formatTime,
  dateRangeIncludesToday,
  timeRangeIncludesNow,
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

// ---------------------------------------------------------------- clock
function tickClock() {
  const now = new Date();
  $('#clockTime').textContent = `${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  $('#clockDate').textContent = todayBR();
  renderTimeSensitiveSections();
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
  const atLunch = currentEscalas.filter((e) => e.kind === 'almoco').flatMap((e) => e.analysts).some((a) =>
    a.id === analystId && a.schedule_start && a.schedule_end && timeRangeIncludesNow(a.schedule_start, a.schedule_end)
  );
  return atLunch ? { text: 'EM PAUSA', tone: 'warn' } : { text: 'EM ATENDIMENTO', tone: 'ok' };
}

function renderUra(escala: EscalaWithAnalysts): string {
  const start = formatTime(escala.start_value ?? '');
  const end = formatTime(escala.end_value ?? '');
  return escala.analysts
    .map((a) => {
      const status = uraStatus(a.id, escala.start_value ?? '00:00', escala.end_value ?? '00:00');
      return analystCard({
        analystName: a.name,
        analystColor: a.color,
        role: a.role,
        top: `Logado das <strong>${start}</strong> às <strong>${end}</strong>${a.extension ? `<br><small>Ramal ${escapeHtml(a.extension)}</small>` : ''}`,
        chip: status,
      });
    })
    .join('');
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

function renderAlmoco(escala: EscalaWithAnalysts): string {
  const inProgress = (analyst: EscalaWithAnalysts['analysts'][number]) =>
    Boolean(analyst.schedule_start && analyst.schedule_end && timeRangeIncludesNow(analyst.schedule_start, analyst.schedule_end));
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
  const lunchCount = almoco.flatMap((e) => e.analysts).filter((a) =>
    a.schedule_start && a.schedule_end && timeRangeIncludesNow(a.schedule_start, a.schedule_end)
  ).length;
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
    const plantao = escalas.filter((e) => e.kind === 'plantao');
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

// ---------------------------------------------------------------- init
startClock();
initTheme();
loadPublicData();

$('#refreshBtn').addEventListener('click', () => loadPublicData());

function openPdfSelection() {
  if (!currentEscalas.length) {
    toast('Não há escalas ativas para exportar.');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pdfTitle">
      <div class="modal-head"><h3 id="pdfTitle">Baixar escalas em PDF</h3><button class="modal-close" type="button" aria-label="Fechar">✕</button></div>
      <div class="modal-body">
        <p class="pdf-help">Marque uma ou mais escalas para incluir no arquivo.</p>
        <div class="pdf-scale-list">${currentEscalas.map((escala) => `
          <label class="check-item pdf-scale-option">
            <input type="checkbox" value="${escala.id}" />
            <span><strong>${escapeHtml(escala.title)}</strong><small>${escapeHtml(escala.analysts.map((a) => a.name).join(', ') || 'Sem analistas vinculados')}</small></span>
          </label>`).join('')}</div>
        <div class="modal-actions"><button type="button" class="btn-ghost pdf-cancel">Cancelar</button><button type="button" class="btn-primary pdf-download" disabled>Baixar PDF</button></div>
      </div>
    </div>`;
  const close = () => overlay.remove();
  const download = overlay.querySelector<HTMLButtonElement>('.pdf-download')!;
  const checks = Array.from(overlay.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  checks.forEach((check) => check.addEventListener('change', () => { download.disabled = !checks.some((item) => item.checked); }));
  overlay.querySelector('.modal-close')!.addEventListener('click', close);
  overlay.querySelector('.pdf-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  download.addEventListener('click', () => {
    const ids = new Set(checks.filter((item) => item.checked).map((item) => item.value));
    downloadEscalasPdf(currentEscalas.filter((escala) => ids.has(escala.id)));
    close();
  });
  document.body.appendChild(overlay);
}

$('#exportPdfBtn').addEventListener('click', openPdfSelection);

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
