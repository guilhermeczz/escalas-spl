/** Helpers de UI compartilhados do painel ADM (modal, confirm, toast). */

let toastTimer: number | undefined;

export function toast(message: string, tone: 'ok' | 'error' = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('show', 'toast-error');
  if (tone === 'error') el.classList.add('toast-error');
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 3500);
}

export function openModal(title: string, bodyHtml: string, onMount?: (root: HTMLElement) => void): HTMLElement {
  const root = document.getElementById('modalRoot')!;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${title}</h3>
        <button type="button" class="modal-close" aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  root.appendChild(overlay);
  if (onMount) onMount(overlay.querySelector('.modal-body') as HTMLElement);
  return overlay;
}

export function closeModal() {
  const root = document.getElementById('modalRoot')!;
  root.innerHTML = '';
}

export function confirmDialog(
  title: string,
  message: string,
  onConfirm: () => Promise<void> | void
) {
  openModal(
    title,
    `
    <p class="confirm-text">${message}</p>
    <div class="modal-actions">
      <button type="button" class="btn-ghost" data-act="cancel">Cancelar</button>
      <button type="button" class="btn-danger" data-act="confirm">Confirmar</button>
    </div>
    `,
    (root) => {
      root.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.addEventListener('click', closeModal);
      root.querySelector<HTMLButtonElement>('[data-act="confirm"]')!.addEventListener('click', async () => {
        const btn = root.querySelector<HTMLButtonElement>('[data-act="confirm"]')!;
        btn.disabled = true;
        try {
          await onConfirm();
          closeModal();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Erro ao executar a ação.', 'error');
          btn.disabled = false;
        }
      });
    }
  );
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro inesperado.';
}
