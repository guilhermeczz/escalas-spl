import { supabase } from '../supabaseClient';
import { fetchAnalysts } from '../data';
import type { Analyst } from '../types';
import { escapeHtml, initials } from '../utils';
import { errMessage, toast } from './ui';

interface TemplateRow {
  plantonista_id: string;
  analyst_id: string;
  start_time: string;
  end_time: string;
  day_type: 'weekday' | 'saturday';
}

function participantRows(analysts: Analyst[], configured: Map<string, TemplateRow>): string {
  return analysts.map((analyst) => {
    const slot = configured.get(analyst.id);
    return `<div class="analyst-schedule-row ${slot ? 'selected show-individual-time' : ''}" data-row="${analyst.id}">
      <label class="analyst-choice">
        <input type="checkbox" ${slot ? 'checked' : ''} />
        <span class="avatar avatar-xs" style="background:${analyst.color}">${initials(analyst.name)}</span>
        <span><strong>${escapeHtml(analyst.name)}</strong><small>${escapeHtml(analyst.extension ? `Ramal ${analyst.extension}` : analyst.role ?? 'Analista')}</small></span>
      </label>
      <div class="individual-time-fields">
        <label>Início<input class="slot-start" type="time" value="${slot?.start_time?.slice(0, 5) ?? '08:00'}" /></label>
        <span class="time-arrow">até</span>
        <label>Fim<input class="slot-end" type="time" value="${slot?.end_time?.slice(0, 5) ?? '17:00'}" /></label>
      </div>
    </div>`;
  }).join('');
}

function ownerBranch(owner: Analyst, analysts: Analyst[], templates: TemplateRow[]): string {
  const weekday = templates.filter((item) => item.day_type === 'weekday');
  const configured = new Map(weekday.map((item) => [item.analyst_id, item]));
  return `<details class="ura-owner-branch" data-owner="${owner.id}">
    <summary>
      <span class="section-arrow" aria-hidden="true">›</span>
      <span class="avatar" style="background:${owner.color}">${initials(owner.name)}</span>
      <span class="ura-owner-heading"><strong>${escapeHtml(owner.name)}</strong><small>Quando estiver de plantão</small></span>
      <span class="section-count">${weekday.length} ${weekday.length === 1 ? 'pessoa' : 'pessoas'} na URA</span>
    </summary>
    <div class="ura-branch-content">
      <div class="ura-branch-note"><strong>Segunda a sexta</strong><span>Marque os participantes e defina o turno de cada um. No sábado, ${escapeHtml(owner.name)} assume automaticamente das 08:30 às 13:30.</span></div>
      <div class="analyst-schedule-list ura-template-rows">${participantRows(analysts, configured)}</div>
      <div class="ura-config-footer"><span class="ura-selected-count">${weekday.length} selecionado${weekday.length === 1 ? '' : 's'}</span><button class="btn-primary" data-save-owner type="button">Salvar ${escapeHtml(owner.name.split(' ')[0])}</button></div>
    </div>
  </details>`;
}

function bindBranch(branch: HTMLDetailsElement) {
  const rows = Array.from(branch.querySelectorAll<HTMLElement>('[data-row]'));
  const count = branch.querySelector<HTMLElement>('.ura-selected-count')!;
  const summaryCount = branch.querySelector<HTMLElement>('.section-count')!;
  const update = () => {
    const selected = rows.filter((row) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).length;
    count.textContent = `${selected} selecionado${selected === 1 ? '' : 's'}`;
    summaryCount.textContent = `${selected} ${selected === 1 ? 'pessoa' : 'pessoas'} na URA`;
  };
  rows.forEach((row) => {
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.addEventListener('change', () => {
      row.classList.toggle('selected', checkbox.checked);
      row.classList.toggle('show-individual-time', checkbox.checked);
      update();
    });
  });
}

async function saveBranch(branch: HTMLDetailsElement) {
  const ownerId = branch.dataset.owner!;
  const button = branch.querySelector<HTMLButtonElement>('[data-save-owner]')!;
  const selected = Array.from(branch.querySelectorAll<HTMLElement>('[data-row]')).filter((row) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked);
  const invalid = selected.some((row) => {
    const start = row.querySelector<HTMLInputElement>('.slot-start')!.value;
    const end = row.querySelector<HTMLInputElement>('.slot-end')!.value;
    return !start || !end || end <= start;
  });
  if (invalid) {
    toast('Confira os horários: o fim deve ser depois do início.', 'error');
    return;
  }

  button.disabled = true;
  try {
    const { error: deleteError } = await supabase.from('ura_template_slots').delete().eq('plantonista_id', ownerId);
    if (deleteError) throw deleteError;
    const payload: Array<Omit<TemplateRow, 'start_time' | 'end_time'> & { start_time: string; end_time: string }> = selected.map((row) => ({
      plantonista_id: ownerId,
      analyst_id: row.dataset.row!,
      start_time: row.querySelector<HTMLInputElement>('.slot-start')!.value,
      end_time: row.querySelector<HTMLInputElement>('.slot-end')!.value,
      day_type: 'weekday',
    }));
    payload.push({ plantonista_id: ownerId, analyst_id: ownerId, start_time: '08:30', end_time: '13:30', day_type: 'saturday' });
    const { error } = await supabase.from('ura_template_slots').insert(payload);
    if (error) throw error;
    toast('Configuração deste plantonista salva.');
  } catch (error) {
    toast(errMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
}

export async function initUraConfig(root: HTMLElement) {
  root.classList.add('ura-config-root');
  root.innerHTML = '<div class="list-loading">Carregando configurações...</div>';
  try {
    const [analysts, templateResult] = await Promise.all([
      fetchAnalysts(),
      supabase.from('ura_template_slots').select('plantonista_id,analyst_id,start_time,end_time,day_type'),
    ]);
    if (templateResult.error) throw templateResult.error;
    const templates = (templateResult.data ?? []) as TemplateRow[];
    const ownerIds = new Set(templates.map((item) => item.plantonista_id));
    const configuredOwners = analysts.filter((analyst) => ownerIds.has(analyst.id));
    const availableOwners = analysts.filter((analyst) => !ownerIds.has(analyst.id));

    root.innerHTML = `<div class="ura-config-intro"><div><strong>Configurações por plantonista</strong><span>Cada ramificação reúne apenas a equipe e os horários usados naquele plantão.</span></div>${availableOwners.length ? `<label>Nova configuração<select id="newUraOwner"><option value="">Escolha um plantonista...</option>${availableOwners.map((analyst) => `<option value="${analyst.id}">${escapeHtml(analyst.name)}</option>`).join('')}</select></label>` : ''}</div>
      <div id="uraOwnerBranches" class="ura-owner-branches">${configuredOwners.map((owner) => ownerBranch(owner, analysts, templates.filter((item) => item.plantonista_id === owner.id))).join('') || '<div class="empty-inline">Nenhum plantonista configurado.</div>'}</div>`;

    const branches = root.querySelector<HTMLElement>('#uraOwnerBranches')!;
    root.querySelectorAll<HTMLDetailsElement>('.ura-owner-branch').forEach((branch) => {
      bindBranch(branch);
      branch.querySelector<HTMLButtonElement>('[data-save-owner]')!.addEventListener('click', () => saveBranch(branch));
    });
    root.querySelector<HTMLSelectElement>('#newUraOwner')?.addEventListener('change', (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const owner = analysts.find((analyst) => analyst.id === select.value);
      if (!owner) return;
      branches.querySelector('.empty-inline')?.remove();
      branches.insertAdjacentHTML('beforeend', ownerBranch(owner, analysts, []));
      const branch = branches.lastElementChild as HTMLDetailsElement;
      branch.open = true;
      bindBranch(branch);
      branch.querySelector<HTMLButtonElement>('[data-save-owner]')!.addEventListener('click', () => saveBranch(branch));
      select.querySelector(`option[value="${owner.id}"]`)?.remove();
      select.value = '';
    });
  } catch (error) {
    root.innerHTML = `<div class="empty-inline">${escapeHtml(errMessage(error))}</div>`;
  }
}
