import { supabase } from '../supabaseClient';
import { fetchAllEscalas, fetchAnalysts } from '../data';
import type { EscalaWithAnalysts, EscalaKind } from '../types';
import { escapeHtml, initials, formatTime, formatDateBR, KIND_LABEL } from '../utils';
import { openModal, confirmDialog, toast, errMessage } from './ui';

export async function initEscalas(root: HTMLElement) {
  await refreshEscalas(root);
  document.getElementById('newEscalaBtn')!.addEventListener('click', () => escalaModal(root));
}

function describe(escala: EscalaWithAnalysts): string {
  if (escala.kind === 'horario') {
    return `de <strong>${formatTime(escala.start_value ?? '')}</strong> às <strong>${formatTime(escala.end_value ?? '')}</strong>`;
  }
  if (escala.kind === 'plantao') {
    return `de <strong>${formatDateBR(escala.start_value ?? '')}</strong> até <strong>${formatDateBR(escala.end_value ?? '')}</strong>`;
  }
  const defined = escala.analysts.filter((analyst) => analyst.schedule_start && analyst.schedule_end).length;
  return `<strong>${defined}</strong> de ${escala.analysts.length} horário(s) individual(is) definido(s)`;
}

export async function refreshEscalas(root: HTMLElement) {
  root.innerHTML = `<div class="list-loading">Carregando escalas...</div>`;
  try {
    const escalas = await fetchAllEscalas();
    if (escalas.length === 0) {
      root.innerHTML = `<div class="empty-inline">Nenhuma escala criada ainda.</div>`;
      return;
    }
    root.innerHTML = `
      <div class="escala-cards">
        ${escalas
          .map(
            (e) => `
              <article class="escala-row ${e.active ? '' : 'escala-inactive'}">
                <div class="escala-main">
                  <span class="chip chip-${e.kind}">${KIND_LABEL[e.kind]}</span>
                  <div class="escala-info">
                    <h4>${escapeHtml(e.title)} ${e.active ? '' : '<span class="badge-off">inativa</span>'}</h4>
                    <p>${describe(e)}</p>
                    <div class="escala-analysts">
                      ${e.analysts
                        .map((a) => `<span class="mini-user"><span class="avatar avatar-xs" style="background:${a.color}">${initials(a.name)}</span>${escapeHtml(a.name)}</span>`)
                        .join('') || '<span class="muted">Sem analistas vinculados</span>'}
                    </div>
                  </div>
                </div>
                <div class="escala-actions">
                  <button class="btn-mini" data-act="toggle" data-id="${e.id}">${e.active ? 'Desativar' : 'Ativar'}</button>
                  <button class="btn-mini" data-act="edit" data-id="${e.id}">Editar</button>
                  <button class="btn-mini btn-mini-danger" data-act="del" data-id="${e.id}">Excluir</button>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const escala = escalas.find((e) => e.id === btn.dataset.id)!;
        const act = btn.dataset.act!;
        if (act === 'edit') {
          escalaModal(root, escala);
        } else if (act === 'del') {
          confirmDialog(
            'Excluir escala',
            `Excluir a escala <strong>${escapeHtml(escala.title)}</strong>?`,
            async () => {
              const { error } = await supabase.from('escalas').delete().eq('id', escala.id);
              if (error) throw new Error(error.message);
              toast('Escala excluída.');
              await refreshEscalas(root);
            }
          );
        } else if (act === 'toggle') {
          const { error } = await supabase.from('escalas').update({ active: !escala.active }).eq('id', escala.id);
          if (error) {
            toast(errMessage(error), 'error');
            return;
          }
          toast(escala.active ? 'Escala desativada.' : 'Escala ativada.');
          await refreshEscalas(root);
        }
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="empty-inline">${escapeHtml(errMessage(err))}</div>`;
  }
}

function kindFields(kind: EscalaKind, e?: EscalaWithAnalysts): string {
  if (kind === 'horario') {
    return `
      <div class="field-row">
        <div class="field">
          <label for="esStart">Início *</label>
          <input id="esStart" type="time" value="${e?.start_value ?? '08:00'}" required />
        </div>
        <div class="field">
          <label for="esEnd">Fim *</label>
          <input id="esEnd" type="time" value="${e?.end_value ?? '17:00'}" required />
        </div>
      </div>
    `;
  }
  if (kind === 'plantao') {
    return `
      <div class="field-row">
        <div class="field">
          <label for="esStart">Data início *</label>
          <input id="esStart" type="date" value="${e?.start_value ?? ''}" required />
        </div>
        <div class="field">
          <label for="esEnd">Data fim *</label>
          <input id="esEnd" type="date" value="${e?.end_value ?? ''}" required />
        </div>
      </div>
    `;
  }
  return `
    <div class="schedule-tip">
      <strong>Horário individual por analista</strong>
      <span>Selecione cada pessoa abaixo e informe quando começa e termina o almoço.</span>
    </div>
  `;
}

function analystSelector(analysts: Awaited<ReturnType<typeof fetchAnalysts>>, escala?: EscalaWithAnalysts): string {
  return analysts.map((analyst) => {
    const assigned = escala?.analysts.find((item) => item.id === analyst.id);
    const selected = Boolean(assigned);
    return `
      <div class="analyst-schedule-row ${selected ? 'selected' : ''}" data-analyst-row="${analyst.id}">
        <label class="analyst-choice">
          <input class="analyst-select" type="checkbox" value="${analyst.id}" ${selected ? 'checked' : ''} />
          <span class="avatar avatar-xs" style="background:${analyst.color}">${initials(analyst.name)}</span>
          <span><strong>${escapeHtml(analyst.name)}</strong><small>${escapeHtml(analyst.role ?? 'Analista')}</small></span>
        </label>
        <div class="individual-time-fields">
          <label>Início<input class="individual-start" type="time" value="${assigned?.schedule_start ?? '12:00'}" /></label>
          <span class="time-arrow">até</span>
          <label>Fim<input class="individual-end" type="time" value="${assigned?.schedule_end ?? '13:00'}" /></label>
        </div>
      </div>`;
  }).join('') || '<p class="muted">Cadastre analistas em "Equipe" antes de criar escalas.</p>';
}

async function escalaModal(root: HTMLElement, escala?: EscalaWithAnalysts) {
  const isEdit = Boolean(escala);
  const analysts = await fetchAnalysts();
  const selectedIds = new Set((escala?.analysts ?? []).map((a) => a.id));

  openModal(
    isEdit ? 'Editar escala' : 'Nova escala',
    `
    <form id="escalaForm">
      <div class="field">
        <label for="esTitle">Título *</label>
        <input id="esTitle" type="text" value="${escapeHtml(escala?.title ?? '')}" required placeholder="Ex.: Escala URA — Semana" />
      </div>
      <div class="field">
        <label for="esKind">Tipo de escala</label>
        <select id="esKind">
          <option value="horario" ${escala?.kind === 'horario' ? 'selected' : ''}>Horário (Escala URA)</option>
          <option value="plantao" ${escala?.kind === 'plantao' ? 'selected' : ''}>Data (Plantão)</option>
          <option value="almoco" ${escala?.kind === 'almoco' ? 'selected' : ''}>Flexível (Almoço)</option>
        </select>
      </div>
      <div id="kindFields">${kindFields(escala?.kind ?? 'horario', escala)}</div>
      <div class="field">
        <div class="field-heading"><label>Analistas da escala</label><span id="selectedCount">${selectedIds.size} selecionado(s)</span></div>
        <div id="analystChecks" class="analyst-schedule-list">
          ${analystSelector(analysts, escala)}
        </div>
      </div>
      <label class="check-item checkbox-line">
        <input type="checkbox" id="esActive" ${escala?.active ?? true ? 'checked' : ''} />
        Escala ativa (visível no mural público)
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" data-act="cancel">Cancelar</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Salvar alterações' : 'Criar escala'}</button>
      </div>
    </form>
    `,
    async (body) => {
      body.closest('.modal')?.classList.add('schedule-modal');
      const kindSelect = body.querySelector<HTMLSelectElement>('#esKind')!;
      const kindFieldsEl = body.querySelector<HTMLDivElement>('#kindFields')!;
      const analystRows = Array.from(body.querySelectorAll<HTMLElement>('[data-analyst-row]'));
      const selectedCount = body.querySelector<HTMLElement>('#selectedCount')!;

      const updateAnalystRows = () => {
        const isLunch = kindSelect.value === 'almoco';
        analystRows.forEach((row) => {
          const checkbox = row.querySelector<HTMLInputElement>('.analyst-select')!;
          row.classList.toggle('selected', checkbox.checked);
          row.classList.toggle('show-individual-time', isLunch && checkbox.checked);
          row.querySelectorAll<HTMLInputElement>('.individual-time-fields input').forEach((input) => {
            input.required = isLunch && checkbox.checked;
            input.disabled = !isLunch || !checkbox.checked;
          });
        });
        selectedCount.textContent = `${analystRows.filter((row) => row.querySelector<HTMLInputElement>('.analyst-select')!.checked).length} selecionado(s)`;
      };

      analystRows.forEach((row) => row.querySelector<HTMLInputElement>('.analyst-select')!.addEventListener('change', updateAnalystRows));

      kindSelect.addEventListener('change', () => {
        kindFieldsEl.innerHTML = kindFields(kindSelect.value as EscalaKind, escala);
        updateAnalystRows();
      });
      updateAnalystRows();

      body.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.addEventListener('click', () => body.closest('.modal-overlay')!.remove());
      body.querySelector<HTMLFormElement>('#escalaForm')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const kind = kindSelect.value as EscalaKind;
        const title = body.querySelector<HTMLInputElement>('#esTitle')!.value.trim();
        const active = body.querySelector<HTMLInputElement>('#esActive')!.checked;
        const selectedRows = analystRows.filter((row) => row.querySelector<HTMLInputElement>('.analyst-select')!.checked);

        if (!title) return;
        if (!selectedRows.length) {
          toast('Selecione pelo menos um analista para a escala.', 'error');
          return;
        }
        if (kind === 'almoco') {
          const invalidTime = selectedRows.some((analystRow) => {
            const start = analystRow.querySelector<HTMLInputElement>('.individual-start')!.value;
            const end = analystRow.querySelector<HTMLInputElement>('.individual-end')!.value;
            return !start || !end || end <= start;
          });
          if (invalidTime) {
            toast('Confira os horários: o fim do almoço deve ser depois do início.', 'error');
            return;
          }
        }

        const startEl = body.querySelector<HTMLInputElement>('#esStart');
        const endEl = body.querySelector<HTMLInputElement>('#esEnd');

        const row = {
          kind,
          title,
          start_value: startEl ? startEl.value : null,
          end_value: endEl ? endEl.value : null,
          note: null,
          active,
        };

        try {
          if (isEdit) {
            const { error: upErr } = await supabase.from('escalas').update(row).eq('id', escala!.id);
            if (upErr) throw new Error(upErr.message);
            const { error: delErr } = await supabase.from('escala_analysts').delete().eq('escala_id', escala!.id);
            if (delErr) throw new Error(delErr.message);
            if (selectedRows.length) {
              const { error: insErr } = await supabase.from('escala_analysts').insert(
                selectedRows.map((analystRow) => ({
                  escala_id: escala!.id,
                  analyst_id: analystRow.dataset.analystRow!,
                  schedule_start: kind === 'almoco' ? analystRow.querySelector<HTMLInputElement>('.individual-start')!.value : null,
                  schedule_end: kind === 'almoco' ? analystRow.querySelector<HTMLInputElement>('.individual-end')!.value : null,
                }))
              );
              if (insErr) throw new Error(insErr.message);
            }
            toast('Escala atualizada.');
          } else {
            const { data, error } = await supabase.from('escalas').insert(row).select('id').single();
            if (error) throw new Error(error.message);
            if (selectedRows.length) {
              const { error: insErr } = await supabase.from('escala_analysts').insert(
                selectedRows.map((analystRow) => ({
                  escala_id: data!.id,
                  analyst_id: analystRow.dataset.analystRow!,
                  schedule_start: kind === 'almoco' ? analystRow.querySelector<HTMLInputElement>('.individual-start')!.value : null,
                  schedule_end: kind === 'almoco' ? analystRow.querySelector<HTMLInputElement>('.individual-end')!.value : null,
                }))
              );
              if (insErr) throw new Error(insErr.message);
            }
            toast('Escala criada.');
          }
          body.closest('.modal-overlay')!.remove();
          await refreshEscalas(root);
        } catch (err) {
          toast(errMessage(err), 'error');
        }
      });
    }
  );
}
