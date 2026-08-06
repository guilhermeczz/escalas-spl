import { supabase } from '../supabaseClient';
import { fetchAnalysts } from '../data';
import type { Analyst } from '../types';
import { escapeHtml, initials, formatDateTime } from '../utils';
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
                    <td>${formatDateTime(a.created_at)}</td>
                    <td class="td-actions">
                      <button class="btn-mini" data-act="edit" data-id="${a.id}">Editar</button>
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
  } catch (err) {
    root.innerHTML = `<div class="empty-inline">${escapeHtml(errMessage(err))}</div>`;
  }
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
