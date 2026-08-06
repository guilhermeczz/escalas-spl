import { supabase } from '../supabaseClient';
import { fetchNotices } from '../data';
import { escapeHtml, formatDateTime } from '../utils';
import { openModal, confirmDialog, toast, errMessage } from './ui';

export async function initMural(root: HTMLElement) {
  await refreshMural(root);
}

export async function refreshMural(root: HTMLElement) {
  root.innerHTML = `<div class="list-loading">Carregando avisos...</div>`;
  try {
    const notices = await fetchNotices();

    root.innerHTML = `
      <form id="noticeForm" class="notice-form">
        <div class="field">
          <label for="noticeText">Novo lembrete</label>
          <textarea id="noticeText" rows="3" placeholder="Escreva o aviso que aparecerá no topo do mural público..."></textarea>
        </div>
        <div class="notice-form-foot">
          <label class="check-item checkbox-line">
            <input type="checkbox" id="noticeActive" checked />
            Publicar
          </label>
          <button type="submit" class="btn-primary">Publicar aviso</button>
        </div>
      </form>

      <div class="notice-list">
        ${notices
          .map(
            (n) => `
              <article class="notice-row ${n.active ? '' : 'escala-inactive'}">
                <div class="notice-text">${escapeHtml(n.text)}</div>
                <div class="notice-meta">
                  <span class="chip chip-${n.active ? 'ok' : 'muted'}">${n.active ? 'Publicado' : 'Oculto'}</span>
                  <span class="muted">${formatDateTime(n.created_at)}</span>
                </div>
                <div class="escala-actions">
                  <button class="btn-mini" data-act="toggle" data-id="${n.id}">${n.active ? 'Ocultar' : 'Publicar'}</button>
                  <button class="btn-mini" data-act="edit" data-id="${n.id}">Editar</button>
                  <button class="btn-mini btn-mini-danger" data-act="del" data-id="${n.id}">Excluir</button>
                </div>
              </article>
            `
          )
          .join('') || '<div class="empty-inline">Nenhum aviso cadastrado.</div>'}
      </div>
    `;

    root.querySelector<HTMLFormElement>('#noticeForm')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = root.querySelector<HTMLTextAreaElement>('#noticeText')!.value.trim();
      const active = root.querySelector<HTMLInputElement>('#noticeActive')!.checked;
      if (!text) return;
      try {
        const { error } = await supabase.from('notices').insert({ text, active });
        if (error) throw new Error(error.message);
        toast('Aviso publicado.');
        await refreshMural(root);
      } catch (err) {
        toast(errMessage(err), 'error');
      }
    });

    root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const notice = notices.find((n) => n.id === btn.dataset.id)!;
        const act = btn.dataset.act!;
        if (act === 'edit') {
          editNoticeModal(notice.text, async (newText) => {
            const { error } = await supabase.from('notices').update({ text: newText }).eq('id', notice.id);
            if (error) throw new Error(error.message);
            toast('Aviso atualizado.');
            await refreshMural(root);
          });
        } else if (act === 'del') {
          confirmDialog('Excluir aviso', 'Excluir este lembrete do mural?', async () => {
            const { error } = await supabase.from('notices').delete().eq('id', notice.id);
            if (error) throw new Error(error.message);
            toast('Aviso excluído.');
            await refreshMural(root);
          });
        } else if (act === 'toggle') {
          const { error } = await supabase.from('notices').update({ active: !notice.active }).eq('id', notice.id);
          if (error) {
            toast(errMessage(error), 'error');
            return;
          }
          toast(notice.active ? 'Aviso oculto.' : 'Aviso publicado.');
          await refreshMural(root);
        }
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="empty-inline">${escapeHtml(errMessage(err))}</div>`;
  }
}

function editNoticeModal(currentText: string, onSubmit: (text: string) => Promise<void>) {
  openModal(
    'Editar aviso',
    `
    <form id="editNoticeForm">
      <div class="field">
        <label for="editNoticeText">Texto do lembrete</label>
        <textarea id="editNoticeText" rows="3">${escapeHtml(currentText)}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" data-act="cancel">Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>
    `,
    (body) => {
      body.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.addEventListener('click', () => body.closest('.modal-overlay')!.remove());
      body.querySelector<HTMLFormElement>('#editNoticeForm')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = body.querySelector<HTMLTextAreaElement>('#editNoticeText')!.value.trim();
        if (!text) return;
        try {
          await onSubmit(text);
          body.closest('.modal-overlay')!.remove();
        } catch (err) {
          toast(errMessage(err), 'error');
        }
      });
    }
  );
}
