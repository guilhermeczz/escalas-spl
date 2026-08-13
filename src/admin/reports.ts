import { supabase } from '../supabaseClient';
import { fetchAnalysts, fetchAllEscalas } from '../data';
import { escapeHtml, formatDateBR, formatTime } from '../utils';
import { jsPDF } from 'jspdf';

const dateValue = (date: Date) => date.toLocaleDateString('sv-SE');
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—';

const reportRows = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLTableRowElement>('#reportResults table tr'))
  .map((row) => Array.from(row.querySelectorAll<HTMLElement>('th,td')).map((cell) => cell.textContent?.trim() ?? ''));

function exportCsv(root: HTMLElement) {
  const rows = reportRows(root);
  if (!rows.length) return;
  const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  link.download = `relatorio-operacional-${dateValue(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportPdf(root: HTMLElement) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14; let y = 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Relatório operacional', margin, y);
  y += 8; doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, y); y += 8;
  for (const row of reportRows(root)) {
    const lines = doc.splitTextToSize(row.join(' | '), 180);
    if (y + lines.length * 4 > 282) { doc.addPage(); y = 18; }
    doc.text(lines, margin, y); y += lines.length * 4 + 2;
  }
  doc.save(`relatorio-operacional-${dateValue(new Date())}.pdf`);
}

export async function initReports(root: HTMLElement) {
  const analysts = await fetchAnalysts(); const today = new Date(); const monthStart = new Date(today.getFullYear(),today.getMonth(),1);
  root.innerHTML = `<div class="report-filters"><div class="field"><label>Analista</label><select id="reportAnalyst"><option value="">Todos</option>${analysts.map((a)=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></div><div class="field"><label>Data inicial</label><input id="reportFrom" type="date" value="${dateValue(monthStart)}"></div><div class="field"><label>Data final</label><input id="reportTo" type="date" value="${dateValue(today)}"></div><div class="field"><label>Situação do almoço</label><select id="reportStatus"><option value="">Todas</option><option value="active">Em andamento</option><option value="completed">Concluído</option></select></div><button id="applyReport" class="btn-primary">Aplicar filtros</button></div><div class="report-export-actions"><button id="exportReportPdf" class="btn-primary" type="button">Exportar PDF</button><button id="exportReportCsv" class="btn-ghost" type="button">Exportar CSV</button></div><div id="reportResults"></div>`;
  const load = async () => {
    const analystId = root.querySelector<HTMLSelectElement>('#reportAnalyst')!.value; const from = root.querySelector<HTMLInputElement>('#reportFrom')!.value; const to = root.querySelector<HTMLInputElement>('#reportTo')!.value; const status = root.querySelector<HTMLSelectElement>('#reportStatus')!.value; const results = root.querySelector<HTMLElement>('#reportResults')!; results.innerHTML='<div class="list-loading">Gerando relatório...</div>';
    let query = supabase.from('lunch_events').select('id,analyst_id,lunch_date,started_at,expected_return_at,returned_at,analysts(name)').gte('lunch_date',from).lte('lunch_date',to).order('started_at',{ascending:false}); if(analystId) query=query.eq('analyst_id',analystId); if(status==='active') query=query.is('returned_at',null); if(status==='completed') query=query.not('returned_at','is',null);
    let workQuery=supabase.from('workday_events').select('analyst_id,work_date,event_type,occurred_at,analysts(name)').gte('work_date',from).lte('work_date',to).order('occurred_at',{ascending:false});if(analystId)workQuery=workQuery.eq('analyst_id',analystId);
    const [{data:lunches,error},escalas,{data:workEvents,error:workError}] = await Promise.all([query,fetchAllEscalas(),workQuery]); if(error||workError){results.innerHTML=`<div class="empty-inline">${escapeHtml(error?.message??workError?.message??'Erro no relatório')}</div>`;return;}
    const filteredEscalas=escalas.filter((e)=>{const matchesAnalyst=!analystId||e.analysts.some((a)=>a.id===analystId); const date=e.schedule_date||(e.kind==='plantao'?e.start_value:null); return matchesAnalyst&&(!date||date>=from&&date<=to);});
    const eventLabels:Record<string,string>={entry:'Entrada',lunch:'Almoço',lunch_return:'Retorno do almoço',shift_end:'Fim do expediente'};
    results.innerHTML=`<div class="report-summary"><strong>${workEvents?.length??0}</strong><span>eventos de jornada</span><strong>${filteredEscalas.length}</strong><span>escalas no período</span></div><h3 class="report-heading">Jornada de trabalho</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Analista</th><th>Data</th><th>Evento</th><th>Horário registrado</th></tr></thead><tbody>${(workEvents??[]).map((row:any)=>{const a=Array.isArray(row.analysts)?row.analysts[0]:row.analysts;return`<tr><td>${escapeHtml(a?.name??'—')}</td><td>${formatDateBR(row.work_date)}</td><td>${escapeHtml(eventLabels[row.event_type]??row.event_type)}</td><td>${dateTime(row.occurred_at)}</td></tr>`;}).join('')||'<tr><td colspan="4">Nenhum evento de jornada.</td></tr>'}</tbody></table></div><h3 class="report-heading">Almoços e retornos (histórico anterior)</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Analista</th><th>Data</th><th>Saída real</th><th>Retorno previsto</th><th>Retorno real</th><th>Situação</th></tr></thead><tbody>${(lunches??[]).map((row:any)=>{const a=Array.isArray(row.analysts)?row.analysts[0]:row.analysts;return`<tr><td>${escapeHtml(a?.name??'—')}</td><td>${formatDateBR(row.lunch_date)}</td><td>${dateTime(row.started_at)}</td><td>${dateTime(row.expected_return_at)}</td><td>${dateTime(row.returned_at)}</td><td><span class="chip chip-${row.returned_at?'ok':'warn'}">${row.returned_at?'Concluído':'Em andamento'}</span></td></tr>`;}).join('')||'<tr><td colspan="6">Nenhum registro.</td></tr>'}</tbody></table></div><h3 class="report-heading">Escalas</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Tipo</th><th>Escala</th><th>Analistas</th><th>Data/período</th><th>Horário</th></tr></thead><tbody>${filteredEscalas.map((e)=>`<tr><td>${escapeHtml(e.kind.toUpperCase())}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.analysts.map((a)=>a.name).join(', '))}</td><td>${e.schedule_date?formatDateBR(e.schedule_date):e.kind==='plantao'?`${formatDateBR(e.start_value??'')} a ${formatDateBR(e.end_value??'')}`:'—'}</td><td>${e.kind==='horario'?`${formatTime(e.start_value??'')} às ${formatTime(e.end_value??'')}`:'—'}</td></tr>`).join('')||'<tr><td colspan="5">Nenhuma escala.</td></tr>'}</tbody></table></div>`;
  };
  root.querySelector('#applyReport')!.addEventListener('click',load);
  root.querySelector('#exportReportPdf')!.addEventListener('click',()=>exportPdf(root));
  root.querySelector('#exportReportCsv')!.addEventListener('click',()=>exportCsv(root));
  await load();
}
