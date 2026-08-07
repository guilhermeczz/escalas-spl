import { supabase } from '../supabaseClient';
import { fetchAnalysts } from '../data';
import { escapeHtml } from '../utils';
import { toast } from './ui';

interface TemplateRow { analyst_id: string; start_time: string; end_time: string }
export async function initUraConfig(root: HTMLElement) {
  const analysts = await fetchAnalysts();
  root.innerHTML = `<div class="field"><label for="templateOwner">Quando o plantonista for:</label><select id="templateOwner"><option value="">Selecione o plantonista...</option>${analysts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></div><div id="templateRows" class="analyst-schedule-list"><p class="empty-inline">Selecione um plantonista para configurar.</p></div><button id="saveTemplate" class="btn-primary hidden" type="button">Salvar configuração da URA</button>`;
  const owner = root.querySelector<HTMLSelectElement>('#templateOwner')!; const rows = root.querySelector<HTMLElement>('#templateRows')!; const save = root.querySelector<HTMLButtonElement>('#saveTemplate')!;
  owner.addEventListener('change', async () => {
    if (!owner.value) { rows.innerHTML = '<p class="empty-inline">Selecione um plantonista para configurar.</p>'; save.classList.add('hidden'); return; }
    const { data } = await supabase.from('ura_template_slots').select('analyst_id,start_time,end_time').eq('plantonista_id', owner.value);
    const configured = new Map(((data ?? []) as TemplateRow[]).map((row) => [row.analyst_id, row]));
    rows.innerHTML = analysts.map((analyst) => { const slot = configured.get(analyst.id); return `<div class="analyst-schedule-row ${slot ? 'selected show-individual-time' : ''}" data-row="${analyst.id}"><label class="analyst-choice"><input type="checkbox" ${slot ? 'checked' : ''}/><span><strong>${escapeHtml(analyst.name)}</strong><small>${escapeHtml(analyst.extension ? `Ramal ${analyst.extension}` : analyst.role ?? 'Analista')}</small></span></label><div class="individual-time-fields"><label>Início<input class="slot-start" type="time" value="${slot?.start_time?.slice(0,5) ?? '08:00'}" /></label><span class="time-arrow">até</span><label>Fim<input class="slot-end" type="time" value="${slot?.end_time?.slice(0,5) ?? '17:00'}" /></label></div></div>`; }).join('');
    rows.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => row.querySelector<HTMLInputElement>('input[type=checkbox]')!.addEventListener('change', (event) => { const checked = (event.target as HTMLInputElement).checked; row.classList.toggle('selected', checked); row.classList.toggle('show-individual-time', checked); })); save.classList.remove('hidden');
  });
  save.addEventListener('click', async () => {
    const selected = Array.from(rows.querySelectorAll<HTMLElement>('[data-row]')).filter((row) => row.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked);
    const invalid = selected.some((row) => row.querySelector<HTMLInputElement>('.slot-end')!.value <= row.querySelector<HTMLInputElement>('.slot-start')!.value); if (invalid) { toast('Confira os horários configurados.', 'error'); return; }
    save.disabled = true; const { error: deleteError } = await supabase.from('ura_template_slots').delete().eq('plantonista_id', owner.value);
    const payload = selected.map((row) => ({ plantonista_id: owner.value, analyst_id: row.dataset.row!, start_time: row.querySelector<HTMLInputElement>('.slot-start')!.value, end_time: row.querySelector<HTMLInputElement>('.slot-end')!.value }));
    const result = deleteError ? { error: deleteError } : payload.length ? await supabase.from('ura_template_slots').insert(payload) : { error: null }; save.disabled = false;
    if (result.error) { toast(result.error.message, 'error'); return; } toast('Configuração da URA salva.');
  });
}
