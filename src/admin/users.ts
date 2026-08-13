import { supabase } from '../supabaseClient';
import { fetchAnalysts } from '../data';
import { escapeHtml } from '../utils';
import { openModal, closeModal, confirmDialog, toast, errMessage } from './ui';

interface LoginProfile { id: string; name: string | null; email: string; analysts: { name: string; extension: string | null } | { name: string; extension: string | null }[] | null }
export async function initUsers(root: HTMLElement) { await refreshUsers(root); document.getElementById('newUserBtn')!.addEventListener('click', () => userModal(root)); }
export async function refreshUsers(root: HTMLElement) {
  root.innerHTML = '<div class="list-loading">Carregando usuários...</div>';
  const { data, error } = await supabase.from('profiles').select('id,name,email,analysts(name,extension)').eq('role', 'user').order('name');
  if (error) { root.innerHTML = `<div class="empty-inline">${escapeHtml(error.message)}</div>`; return; }
  const users = (data ?? []) as unknown as LoginProfile[];
  root.innerHTML = users.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nome</th><th>Username</th><th>Analista vinculado</th><th>Ramal</th><th>Ações</th></tr></thead><tbody>${users.map((user) => { const analyst = Array.isArray(user.analysts) ? user.analysts[0] : user.analysts; return `<tr><td>${escapeHtml(user.name ?? '—')}</td><td><strong>${escapeHtml(user.email.split('@')[0])}</strong></td><td>${escapeHtml(analyst?.name ?? 'Sem vínculo')}</td><td>${escapeHtml(analyst?.extension ?? '—')}</td><td><div class="td-actions"><button class="btn-mini" data-password="${user.id}">Alterar senha</button><button class="btn-mini btn-mini-danger" data-delete="${user.id}">Excluir</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty-inline">Nenhum login de analista criado.</div>';
  root.querySelectorAll<HTMLButtonElement>('[data-password]').forEach((button) => button.addEventListener('click', () => passwordModal(root, users.find((user) => user.id === button.dataset.password)!)));
  root.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((button) => button.addEventListener('click', () => { const user = users.find((item) => item.id === button.dataset.delete)!; confirmDialog('Excluir login', `Excluir definitivamente o login <strong>${escapeHtml(user.email.split('@')[0])}</strong>? O cadastro do analista e suas escalas serão mantidos.`, async () => { const { data, error } = await supabase.functions.invoke('manage-analyst-user', { body: { action: 'delete', userId: user.id } }); if (error || data?.error) throw new Error(data?.error ?? errMessage(error)); toast('Login excluído.'); await refreshUsers(root); }); }));
}

function passwordModal(root: HTMLElement, user: LoginProfile) {
  const username = user.email.split('@')[0];
  openModal(`Alterar senha de ${escapeHtml(username)}`, `<form id="passwordForm"><p class="password-help">Defina uma nova senha numérica para este login.</p><div class="field"><label for="newPassword">Nova senha de 6 números *</label><input id="newPassword" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" required /></div><div class="field"><label for="confirmPassword">Confirme a nova senha *</label><input id="confirmPassword" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" required /><small>Digite exatamente a mesma senha nos dois campos.</small></div><div class="modal-actions"><button type="button" class="btn-ghost" data-cancel>Cancelar</button><button type="submit" class="btn-primary">Atualizar senha</button></div></form>`, (body) => {
    body.querySelector('[data-cancel]')!.addEventListener('click', closeModal);
    body.querySelector<HTMLFormElement>('#passwordForm')!.addEventListener('submit', async (event) => {
      event.preventDefault(); const password = body.querySelector<HTMLInputElement>('#newPassword')!.value; const confirmation = body.querySelector<HTMLInputElement>('#confirmPassword')!.value;
      if (!/^\d{6}$/.test(password)) { toast('A senha deve conter exatamente 6 números.', 'error'); return; }
      if (password !== confirmation) { toast('As duas senhas não coincidem.', 'error'); return; }
      const submit = body.querySelector<HTMLButtonElement>('button[type="submit"]')!; submit.disabled = true;
      const { data, error } = await supabase.functions.invoke('manage-analyst-user', { body: { action: 'update_password', userId: user.id, password } });
      submit.disabled = false; if (error || data?.error) { toast(data?.error ?? errMessage(error), 'error'); return; }
      closeModal(); toast(`Senha de ${username} atualizada.`); await refreshUsers(root);
    });
  });
}
async function userModal(root: HTMLElement) {
  const analysts = await fetchAnalysts();
  openModal('Criar login de analista', `<form id="userForm"><div class="field"><label for="uAnalyst">Analista *</label><select id="uAnalyst" required><option value="">Selecione...</option>${analysts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}${a.extension ? ` · ramal ${escapeHtml(a.extension)}` : ''}</option>`).join('')}</select></div><div class="field"><label for="uUsername">Username *</label><input id="uUsername" minlength="3" maxlength="40" pattern="[a-z0-9._-]+" autocomplete="off" placeholder="Ex.: joao.silva" required /><small>Somente letras minúsculas, números, ponto, hífen e sublinhado.</small></div><div class="field"><label for="uPassword">Senha de 6 números *</label><input id="uPassword" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" required /></div><div class="modal-actions"><button type="button" class="btn-ghost" data-cancel>Cancelar</button><button type="submit" class="btn-primary">Criar login</button></div></form>`, (body) => {
    body.querySelector('[data-cancel]')!.addEventListener('click', () => body.closest('.modal-overlay')!.remove());
    body.querySelector<HTMLFormElement>('#userForm')!.addEventListener('submit', async (event) => { event.preventDefault(); const analystId = body.querySelector<HTMLSelectElement>('#uAnalyst')!.value; const analyst = analysts.find((a) => a.id === analystId)!; const username = body.querySelector<HTMLInputElement>('#uUsername')!.value.trim().toLowerCase(); const password = body.querySelector<HTMLInputElement>('#uPassword')!.value; if (!analyst || !/^[a-z0-9._-]{3,40}$/.test(username) || !/^\d{6}$/.test(password)) { toast('Confira o analista, o username e a senha.', 'error'); return; }
      const submit = body.querySelector<HTMLButtonElement>('button[type="submit"]')!; submit.disabled = true; const { data, error } = await supabase.functions.invoke('create-analyst-user', { body: { username, password, analystId, name: analyst.name } }); submit.disabled = false;
      if (error || data?.error) { toast(data?.error ?? errMessage(error), 'error'); return; } toast(`Login ${username} criado.`); body.closest('.modal-overlay')!.remove(); await refreshUsers(root); });
  });
}
