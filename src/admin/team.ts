import { supabase } from '../supabaseClient';
import { fetchAnalysts } from '../data';
import type { Analyst } from '../types';
import { escapeHtml, initials, formatDateTime, formatDateBR } from '../utils';
import { openModal, confirmDialog, toast, errMessage } from './ui';

const COLORS = [
  '#2563eb', // azul
  '#0f766e', // turquesa
  '#15803d', // verde
  '#ca8a04', // dourado
  '#ea580c', // laranja
  '#dc2626', // vermelho
  '#7c3aed', // roxo
  '#db2777', // rosa
];

export async function initTeam(root: HTMLElement) {
  await refreshTeam(root);
  document.getElementById('newAnalystBtn')!.addEventListener('click', () => analystModal(root));
}

export async function refreshTeam(root: HTMLElement) {
  root.innerHTML = `<div class="list-loading">Carregando equipe...</div>`;
  try {
    const analysts = await fetchAnalysts();
    const { data: absenceData, error: absenceError } = await supabase.from('analyst_absences').select('*').is('ended_at', null).order('start_date', { ascending: false });
    if (absenceError) throw new Error(absenceError.message);
    const absences = (absenceData ?? []) as { id:string; analyst_id:string; reason:'vacation'|'medical_leave'; start_date:string; return_date:string; ended_at:string|null }[];
    const today = new Date().toLocaleDateString('sv-SE');
    const currentAbsence = (id:string) => absences.find((item) => item.analyst_id === id && item.return_date > today);
    if (analysts.length === 0) {
      root.innerHTML = `<div class="empty-inline">Nenhum analista cadastrado.</div>`;
      return;
    }
    root.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Analista</th>
              <th>E-mail</th>
              <th>Função</th>
              <th>Ramal</th>
              <th>Slack</th>
              <th>Status</th>
              <th>Cadastrado em</th>
              <th class="th-actions"></th>
            </tr>
          </thead>
          <tbody>
            ${analysts
              .map(
                (a) => `
                  <tr>
                    <td>
                      <div class="cell-user">
                        <span class="avatar" style="background:${a.color}">${initials(a.name)}</span>
                        <span>${escapeHtml(a.name)}</span>
                      </div>
                    </td>
                    <td>${escapeHtml(a.email ?? '—')}</td>
                    <td>${escapeHtml(a.role ?? '—')}</td>
                    <td>${escapeHtml(a.extension ?? '—')}</td>
                    <td>${escapeHtml(a.slack_user_id ?? '—')}</td>
                    <td>${currentAbsence(a.id) ? `<span class="chip chip-${currentAbsence(a.id)!.start_date <= today ? 'warn' : 'muted'}">${currentAbsence(a.id)!.start_date <= today ? 'AUSENTE' : 'PROGRAMADA'} · ${currentAbsence(a.id)!.reason === 'vacation' ? 'Férias' : 'Atestado'}</span><small class="absence-period">${formatDateBR(currentAbsence(a.id)!.start_date)} até ${formatDateBR(currentAbsence(a.id)!.return_date)}</small>` : '<span class="chip chip-ok">ATIVO</span>'}</td>
                    <td>${formatDateTime(a.created_at)}</td>
                    <td class="td-actions">
                      <button class="btn-mini" data-act="edit" data-id="${a.id}">Editar</button>
                      ${currentAbsence(a.id) ? `<button class="btn-mini" data-act="end-absence" data-id="${a.id}">${currentAbsence(a.id)!.start_date <= today ? 'Encerrar ausência' : 'Cancelar ausência'}</button>` : `<button class="btn-mini" data-act="absence" data-id="${a.id}">Definir ausência</button>`}
                      <button class="btn-mini btn-mini-danger" data-act="del" data-id="${a.id}">Excluir</button>
                    </td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-act="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const analyst = analysts.find((a) => a.id === btn.dataset.id)!;
        analystModal(root, analyst);
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-act="del"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const analyst = analysts.find((a) => a.id === btn.dataset.id)!;
        confirmDialog(
          'Excluir analista',
          `Excluir <strong>${escapeHtml(analyst.name)}</strong>? Os vínculos com escalas também serão removidos.`,
          async () => {
            const { error } = await supabase.from('analysts').delete().eq('id', analyst.id);
            if (error) throw new Error(error.message);
            toast('Analista excluído.');
              await refreshTeam(root);
          }
        );
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-act="absence"]').forEach((btn) => btn.addEventListener('click', () => absenceModal(root, analysts.find((a) => a.id === btn.dataset.id)!)));
    root.querySelectorAll<HTMLButtonElement>('[data-act="end-absence"]').forEach((btn) => btn.addEventListener('click', () => { const analyst=analysts.find((a)=>a.id===btn.dataset.id)!; const absence=currentAbsence(analyst.id)!; confirmDialog('Encerrar ausência', `Marcar <strong>${escapeHtml(analyst.name)}</strong> como ativo novamente agora?`, async()=>{const {error}=await supabase.from('analyst_absences').update({ended_at:new Date().toISOString()}).eq('id',absence.id);if(error)throw new Error(error.message);toast('Ausência encerrada.');await refreshTeam(root);}); }));
  } catch (err) {
    root.innerHTML = `<div class="empty-inline">${escapeHtml(errMessage(err))}</div>`;
  }
}

function absenceModal(root: HTMLElement, analyst: Analyst) {
  const today = new Date().toLocaleDateString('sv-SE');
  openModal('Definir ausência', `<form id="absenceForm"><div class="absence-intro"><strong>${escapeHtml(analyst.name)}</strong><span>O analista ficará oculto das escalas durante o período.</span></div><div class="field"><label for="absenceReason">Motivo *</label><select id="absenceReason" required><option value="vacation">Férias</option><option value="medical_leave">Atestado</option></select></div><div class="field-row"><div class="field"><label for="absenceStart">Data de saída *</label><input id="absenceStart" type="date" value="${today}" required></div><div class="field"><label for="absenceReturn">Data de retorno *</label><input id="absenceReturn" type="date" min="${today}" required><small>Voltará a aparecer nesta data.</small></div></div><div class="modal-actions"><button type="button" class="btn-ghost" data-cancel>Cancelar</button><button type="submit" class="btn-primary">Confirmar ausência</button></div></form>`, (body)=>{
    body.querySelector('[data-cancel]')!.addEventListener('click',()=>body.closest('.modal-overlay')!.remove());
    body.querySelector<HTMLFormElement>('#absenceForm')!.addEventListener('submit',async(event)=>{event.preventDefault();const reason=body.querySelector<HTMLSelectElement>('#absenceReason')!.value;const start=body.querySelector<HTMLInputElement>('#absenceStart')!.value;const returned=body.querySelector<HTMLInputElement>('#absenceReturn')!.value;if(!start||!returned||returned<=start){toast('A data de retorno deve ser posterior à data de saída.','error');return;}const button=body.querySelector<HTMLButtonElement>('button[type=submit]')!;button.disabled=true;const {error}=await supabase.from('analyst_absences').insert({analyst_id:analyst.id,reason,start_date:start,return_date:returned});button.disabled=false;if(error){toast(error.message,'error');return;}body.closest('.modal-overlay')!.remove();toast('Ausência registrada.');await refreshTeam(root);});
  });
}

function analystModal(root: HTMLElement, analyst?: Analyst) {
  const isEdit = Boolean(analyst);
  openModal(
    isEdit ? 'Editar analista' : 'Novo analista',
    `
    <form id="analystForm">
      <div class="field">
        <label for="aName">Nome *</label>
        <input id="aName" type="text" value="${escapeHtml(analyst?.name ?? '')}" required placeholder="Nome do analista" />
      </div>
      <div class="field">
        <label for="aEmail">E-mail</label>
        <input id="aEmail" type="email" value="${escapeHtml(analyst?.email ?? '')}" placeholder="email@empresa.com" />
      </div>
      <div class="field">
        <label for="aRole">Função</label>
        <input id="aRole" type="text" value="${escapeHtml(analyst?.role ?? '')}" placeholder="Ex.: Analista de URA" />
      </div>
      <div class="field">
        <label for="aExtension">Ramal</label>
        <input id="aExtension" type="text" inputmode="numeric" maxlength="10" value="${escapeHtml(analyst?.extension ?? '')}" placeholder="Ex.: 1234" />
      </div>
      <div class="field">
        <label for="aSlackId">Slack Member ID</label>
        <input id="aSlackId" type="text" maxlength="20" value="${escapeHtml(analyst?.slack_user_id ?? '')}" placeholder="Ex.: U012AB3CD" />
        <small>Necessário para mencionar e notificar o analista no Slack.</small>
      </div>
      <div class="field">
        <label>Cor do avatar</label>
        <div class="color-row" id="colorRow">
          ${COLORS.map((c) => `<button type="button" class="color-swatch${c === (analyst?.color ?? COLORS[0]) ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}
        </div>
        <input id="aColor" type="color" value="${analyst?.color ?? COLORS[0]}" />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" data-act="cancel">Cancelar</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Salvar alterações' : 'Cadastrar analista'}</button>
      </div>
    </form>
    `,
    (body) => {
      const colorInput = body.querySelector<HTMLInputElement>('#aColor')!;
      const swatches = body.querySelectorAll<HTMLButtonElement>('.color-swatch');

      swatches.forEach((sw) => {
        sw.addEventListener('click', () => {
          colorInput.value = sw.dataset.color!;
          swatches.forEach((s) => s.classList.remove('active'));
          sw.classList.add('active');
        });
      });
      colorInput.addEventListener('input', () => {
        swatches.forEach((s) => s.classList.toggle('active', s.dataset.color === colorInput.value));
      });

      body.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.addEventListener('click', () => body.closest('.modal-overlay')!.remove());
      body.querySelector<HTMLFormElement>('#analystForm')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          name: body.querySelector<HTMLInputElement>('#aName')!.value.trim(),
          email: body.querySelector<HTMLInputElement>('#aEmail')!.value.trim() || null,
          role: body.querySelector<HTMLInputElement>('#aRole')!.value.trim() || null,
          extension: body.querySelector<HTMLInputElement>('#aExtension')!.value.trim() || null,
          slack_user_id: body.querySelector<HTMLInputElement>('#aSlackId')!.value.trim().toUpperCase() || null,
          color: colorInput.value,
        };
        if (!payload.name) return;
        try {
          if (isEdit) {
            const { error } = await supabase.from('analysts').update(payload).eq('id', analyst!.id);
            if (error) throw new Error(error.message);
            toast('Analista atualizado.');
          } else {
            const { error } = await supabase.from('analysts').insert(payload);
            if (error) throw new Error(error.message);
            toast('Analista cadastrado.');
          }
          body.closest('.modal-overlay')!.remove();
          await refreshTeam(root);
        } catch (err) {
          toast(errMessage(err), 'error');
        }
      });
    }
  );
}
