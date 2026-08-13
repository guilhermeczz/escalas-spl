import { jsPDF } from 'jspdf';
import { supabase } from '../supabaseClient';
import { fetchAnalysts, fetchAllEscalas } from '../data';
import { escapeHtml, formatDateBR, formatTime, KIND_LABEL } from '../utils';
import type { EscalaKind, EscalaWithAnalysts } from '../types';

type WorkEvent = { analyst_id: string; work_date: string; event_type: string; occurred_at: string; analysts: { name: string } | { name: string }[] | null };
type LunchEvent = { analyst_id: string; lunch_date: string; started_at: string; expected_return_at: string; returned_at: string | null; analysts: { name: string } | { name: string }[] | null };
type Absence = { analyst_id:string; reason:'vacation'|'medical_leave'; start_date:string; return_date:string; ended_at:string|null; created_at:string; analysts:WorkEvent['analysts'] };

const eventLabels: Record<string, string> = { entry: 'Entrada', lunch: 'Almoço', lunch_return: 'Retorno do almoço', shift_end: 'Fim do expediente' };
const dateValue = (date: Date) => date.toLocaleDateString('sv-SE');
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const analystName = (value: WorkEvent['analysts']) => (Array.isArray(value) ? value[0]?.name : value?.name) ?? '—';

function reportTables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLTableElement>('#reportResults table')).map((table) => ({
    title: table.dataset.exportTitle ?? 'Dados',
    rows: Array.from(table.querySelectorAll<HTMLTableRowElement>('tr')).map((row) =>
      Array.from(row.querySelectorAll<HTMLElement>('th,td')).map((cell) => cell.textContent?.trim() ?? '')),
  }));
}

function exportCsv(root: HTMLElement) {
  const lines = reportTables(root).flatMap(({ title, rows }) => [[title], ...rows, []]);
  if (!lines.length) return;
  const csv = lines.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `relatorio-operacional-${dateValue(new Date())}.csv` });
  link.click(); URL.revokeObjectURL(url);
}

function exportPdf(root: HTMLElement) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const margin = 14; let y = 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Relatório operacional', margin, y);
  y += 7; doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, y); y += 9;
  for (const { title, rows } of reportTables(root)) {
    if (y > 265) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, margin, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    for (const row of rows) {
      const lines = doc.splitTextToSize(row.join(' | '), 180);
      if (y + lines.length * 3.5 > 282) { doc.addPage(); y = 18; }
      doc.text(lines, margin, y); y += lines.length * 3.5 + 1.5;
    }
    y += 5;
  }
  doc.save(`relatorio-operacional-${dateValue(new Date())}.pdf`);
}

function escalaDate(e: EscalaWithAnalysts) { return e.schedule_date || (e.kind === 'plantao' ? e.start_value : null); }
function escalaPeriod(e: EscalaWithAnalysts) {
  if (e.kind === 'horario') return `${formatTime(e.start_value ?? '')} às ${formatTime(e.end_value ?? '')}`;
  if (e.kind === 'plantao') return `${formatDateBR(e.start_value ?? '')} a ${formatDateBR(e.end_value ?? '')}`;
  return e.analysts.some((a) => a.schedule_start) ? 'Horários individuais' : 'A definir';
}

export async function initReports(root: HTMLElement) {
  const analysts = await fetchAnalysts(); const today = new Date(); const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  root.innerHTML = `
    <div class="report-toolbar">
      <div><strong>Consulta operacional</strong><span>Combine os filtros para analisar jornada, almoço e escalas.</span></div>
      <div class="report-export-actions"><button id="exportReportPdf" class="btn-primary" type="button" disabled>Exportar PDF</button><button id="exportReportCsv" class="btn-ghost" type="button" disabled>Exportar CSV</button></div>
    </div>
    <div class="report-filters">
      <div class="field"><label>Analista</label><select id="reportAnalyst"><option value="">Todos os analistas</option>${analysts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Data inicial</label><input id="reportFrom" type="date" value="${dateValue(monthStart)}"></div>
      <div class="field"><label>Data final</label><input id="reportTo" type="date" value="${dateValue(today)}"></div>
      <div class="field"><label>Evento da jornada</label><select id="reportEvent"><option value="">Todos os eventos</option>${Object.entries(eventLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
      <div class="field"><label>Situação do almoço</label><select id="reportStatus"><option value="">Todas</option><option value="active">Em andamento</option><option value="completed">Concluído</option></select></div>
      <div class="field"><label>Tipo de escala</label><select id="reportKind"><option value="">Todas as escalas</option><option value="horario">URA</option><option value="almoco">Almoço</option><option value="plantao">Plantão</option></select></div>
      <div class="report-filter-actions"><button id="clearReport" class="btn-ghost" type="button">Limpar</button><button id="applyReport" class="btn-primary" type="button">Aplicar filtros</button></div>
    </div>
    <div id="reportFeedback" class="report-feedback hidden"></div><div id="reportResults"></div>`;

  const load = async () => {
    const analystId = root.querySelector<HTMLSelectElement>('#reportAnalyst')!.value;
    const from = root.querySelector<HTMLInputElement>('#reportFrom')!.value; const to = root.querySelector<HTMLInputElement>('#reportTo')!.value;
    const status = root.querySelector<HTMLSelectElement>('#reportStatus')!.value; const eventType = root.querySelector<HTMLSelectElement>('#reportEvent')!.value;
    const kind = root.querySelector<HTMLSelectElement>('#reportKind')!.value as EscalaKind | '';
    const results = root.querySelector<HTMLElement>('#reportResults')!; const feedback = root.querySelector<HTMLElement>('#reportFeedback')!;
    if (!from || !to || from > to) { feedback.textContent = 'Informe um período válido: a data inicial deve ser anterior à data final.'; feedback.classList.remove('hidden'); return; }
    feedback.classList.add('hidden'); results.innerHTML = '<div class="list-loading">Gerando relatório...</div>';
    root.querySelectorAll<HTMLButtonElement>('.report-export-actions button').forEach((button) => { button.disabled = true; });

    let lunchQuery = supabase.from('lunch_events').select('analyst_id,lunch_date,started_at,expected_return_at,returned_at,analysts(name)').gte('lunch_date', from).lte('lunch_date', to).order('started_at', { ascending: false });
    if (analystId) lunchQuery = lunchQuery.eq('analyst_id', analystId); if (status === 'active') lunchQuery = lunchQuery.is('returned_at', null); if (status === 'completed') lunchQuery = lunchQuery.not('returned_at', 'is', null);
    let workQuery = supabase.from('workday_events').select('analyst_id,work_date,event_type,occurred_at,analysts(name)').gte('work_date', from).lte('work_date', to).order('occurred_at', { ascending: false });
    if (analystId) workQuery = workQuery.eq('analyst_id', analystId); if (eventType) workQuery = workQuery.eq('event_type', eventType);
    let absenceQuery=supabase.from('analyst_absences').select('analyst_id,reason,start_date,return_date,ended_at,created_at,analysts(name)').lte('start_date',to).gte('return_date',from).order('start_date',{ascending:false});if(analystId)absenceQuery=absenceQuery.eq('analyst_id',analystId);
    const [{ data: lunches, error }, escalas, { data: workEvents, error: workError },{data:absenceData,error:absenceError}] = await Promise.all([lunchQuery, fetchAllEscalas(), workQuery,absenceQuery]);
    if (error || workError || absenceError) { results.innerHTML = `<div class="report-empty">${escapeHtml(error?.message ?? workError?.message ?? absenceError?.message ?? 'Erro ao gerar o relatório.')}</div>`; return; }
    const lunchRows = (lunches ?? []) as unknown as LunchEvent[]; const workRows = (workEvents ?? []) as unknown as WorkEvent[];
    const absenceRows=(absenceData??[]) as unknown as Absence[];
    const filteredEscalas = escalas.filter((e) => (!analystId || e.analysts.some((a) => a.id === analystId)) && (!kind || e.kind === kind) && (!escalaDate(e) || escalaDate(e)! >= from && escalaDate(e)! <= to));
    const activeLunches = lunchRows.filter((e) => !e.returned_at).length;
    const table = (title: string, count: number, headings: string[], rows: string, empty: string) => `<section class="report-section"><div class="report-heading"><div><h3>${title}</h3><span>${count} registro${count === 1 ? '' : 's'}</span></div></div><div class="table-wrap"><table class="data-table" data-export-title="${title}"><thead><tr>${headings.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headings.length}">${empty}</td></tr>`}</tbody></table></div></section>`;
    results.innerHTML = `<div class="report-kpis"><article><span>Eventos de jornada</span><strong>${workRows.length}</strong><small>No período selecionado</small></article><article><span>Almoços registrados</span><strong>${lunchRows.length}</strong><small>${activeLunches} em andamento</small></article><article><span>Escalas encontradas</span><strong>${filteredEscalas.length}</strong><small>Conforme os filtros</small></article><article><span>Ausências</span><strong>${absenceRows.length}</strong><small>Férias e atestados</small></article></div>
      ${table('Jornada de trabalho', workRows.length, ['Analista', 'Data', 'Evento', 'Horário'], workRows.map((row) => `<tr><td><strong>${escapeHtml(analystName(row.analysts))}</strong></td><td>${formatDateBR(row.work_date)}</td><td><span class="report-event">${escapeHtml(eventLabels[row.event_type] ?? row.event_type)}</span></td><td>${dateTime(row.occurred_at)}</td></tr>`).join(''), 'Nenhum evento de jornada encontrado.')}
      ${table('Almoços e retornos', lunchRows.length, ['Analista', 'Data', 'Saída', 'Retorno previsto', 'Retorno real', 'Situação'], lunchRows.map((row) => `<tr><td><strong>${escapeHtml(analystName(row.analysts))}</strong></td><td>${formatDateBR(row.lunch_date)}</td><td>${dateTime(row.started_at)}</td><td>${dateTime(row.expected_return_at)}</td><td>${dateTime(row.returned_at)}</td><td><span class="chip chip-${row.returned_at ? 'ok' : 'warn'}">${row.returned_at ? 'Concluído' : 'Em andamento'}</span></td></tr>`).join(''), 'Nenhum almoço encontrado.')}
      ${table('Histórico de ausências', absenceRows.length, ['Analista','Motivo','Saída','Retorno','Situação'], absenceRows.map((row)=>`<tr><td><strong>${escapeHtml(analystName(row.analysts))}</strong></td><td><span class="report-event">${row.reason==='vacation'?'Férias':'Atestado'}</span></td><td>${formatDateBR(row.start_date)}</td><td>${formatDateBR(row.return_date)}</td><td><span class="chip chip-${row.ended_at?'muted':'warn'}">${row.ended_at?'Encerrada':'Programada/ativa'}</span></td></tr>`).join(''),'Nenhuma ausência encontrada.')}
      ${table('Escalas', filteredEscalas.length, ['Tipo', 'Escala', 'Analistas', 'Data ou período', 'Horário'], filteredEscalas.map((e) => `<tr><td><span class="report-kind">${escapeHtml(KIND_LABEL[e.kind])}</span></td><td><strong>${escapeHtml(e.title)}</strong></td><td>${escapeHtml(e.analysts.map((a) => a.name).join(', ') || '—')}</td><td>${e.schedule_date ? formatDateBR(e.schedule_date) : e.kind === 'plantao' ? `${formatDateBR(e.start_value ?? '')} a ${formatDateBR(e.end_value ?? '')}` : '—'}</td><td>${escalaPeriod(e)}</td></tr>`).join(''), 'Nenhuma escala encontrada.')}`;
    root.querySelectorAll<HTMLButtonElement>('.report-export-actions button').forEach((button) => { button.disabled = false; });
  };

  root.querySelector('#applyReport')!.addEventListener('click', load);
  root.querySelector('#clearReport')!.addEventListener('click', () => {
    root.querySelectorAll<HTMLSelectElement>('.report-filters select').forEach((select) => { select.value = ''; });
    root.querySelector<HTMLInputElement>('#reportFrom')!.value = dateValue(monthStart); root.querySelector<HTMLInputElement>('#reportTo')!.value = dateValue(today); void load();
  });
  root.querySelector('#exportReportPdf')!.addEventListener('click', () => exportPdf(root)); root.querySelector('#exportReportCsv')!.addEventListener('click', () => exportCsv(root));
  await load();
}
