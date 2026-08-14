import { supabase } from '../supabaseClient';
import { escapeHtml } from '../utils';
import { confirmDialog, toast } from './ui';
import type { ImprovementCategory, ImprovementRequest } from '../types';

type RequestStatus = ImprovementRequest['status'];
const labels: Record<ImprovementCategory, string> = { bug: 'Bug', new_implementation: 'Implementação nova', process_improvement: 'Melhoria de processo' };
const emptyLabels: Record<RequestStatus, string> = {
  pending: 'Nenhuma solicitação aguardando análise.', accepted: 'Nenhuma solicitação aceita.', rejected: 'Nenhuma solicitação reprovada.', completed: 'Nenhuma melhoria concluída.'
};
let activeStatus: RequestStatus = 'pending';
let requests: ImprovementRequest[] = [];
let currentRoot: HTMLElement | null = null;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function render(root: HTMLElement): void {
  const counts = (['pending', 'accepted', 'rejected', 'completed'] as RequestStatus[]).reduce((result, status) => ({ ...result, [status]: requests.filter((item) => item.status === status).length }), {} as Record<RequestStatus, number>);
  const types = (['bug', 'new_implementation', 'process_improvement'] as ImprovementCategory[]).reduce((result, category) => ({ ...result, [category]: requests.filter((item) => item.category === category).length }), {} as Record<ImprovementCategory, number>);
  const decided = counts.accepted + counts.rejected + counts.completed;
  const approvalRate = decided ? Math.round(((counts.accepted + counts.completed) / decided) * 100) : 0;
  const filtered = requests.filter((item) => item.status === activeStatus);
  root.innerHTML = `<div class="improvement-workspace">
    <section class="improvement-insights" aria-label="Resumo das solicitações">
      <div class="insight-main"><span>Visão do time</span><strong>${requests.length}</strong><small>solicitações recebidas</small></div>
      <div class="insight-metrics"><div><span>Pendentes</span><strong>${counts.pending}</strong><small>aguardando decisão</small></div><div><span>Em andamento</span><strong>${counts.accepted}</strong><small>${approvalRate}% aprovadas</small></div><div><span>Concluídas</span><strong>${counts.completed}</strong><small>melhorias realizadas</small></div></div>
      <div class="type-summary"><div class="type-summary-head"><strong>Solicitações por tipo</strong><span>${requests.length} no total</span></div><div><span><i class="type-dot bug"></i> Bugs <b>${types.bug}</b></span><span><i class="type-dot implementation"></i> Implementações <b>${types.new_implementation}</b></span><span><i class="type-dot improvement"></i> Melhorias <b>${types.process_improvement}</b></span></div></div>
    </section>
    <nav class="improvement-tabs" aria-label="Status das solicitações">
      <button class="${activeStatus === 'pending' ? 'active' : ''}" data-request-status="pending"><span>Pendentes</span><b>${counts.pending}</b></button>
      <button class="${activeStatus === 'accepted' ? 'active' : ''}" data-request-status="accepted"><span>Aceitas</span><b>${counts.accepted}</b></button>
      <button class="${activeStatus === 'rejected' ? 'active' : ''}" data-request-status="rejected"><span>Reprovadas</span><b>${counts.rejected}</b></button>
      <button class="completed-tab ${activeStatus === 'completed' ? 'active' : ''}" data-request-status="completed"><span>Concluídas</span><b>${counts.completed}</b></button>
    </nav>
    <section class="request-table"><header><span>Tipo e status</span><span>Informações da solicitação</span><span>Ações</span></header><div class="improvement-list">${filtered.length ? filtered.map(cardHtml).join('') : `<div class="improvement-empty"><strong>${emptyLabels[activeStatus]}</strong><span>As solicitações aparecerão aqui conforme forem avaliadas.</span></div>`}</div></section>
  </div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-request-status]').forEach((button) => button.addEventListener('click', () => { activeStatus = button.dataset.requestStatus as RequestStatus; render(root); }));
  root.querySelectorAll<HTMLButtonElement>('[data-review]').forEach((button) => button.addEventListener('click', () => void review(button)));
  root.querySelectorAll<HTMLButtonElement>('[data-detail-id]').forEach((button) => button.addEventListener('click', () => openDetail(button.dataset.detailId!)));
  root.querySelectorAll<HTMLButtonElement>('[data-delete-id]').forEach((button) => button.addEventListener('click', () => confirmDelete(button.dataset.deleteId!)));
}

function cardHtml(request: ImprovementRequest): string {
  const author = request.profiles?.name?.trim() || request.profiles?.email || 'Analista';
  const reviewed = request.reviewed_at ? `<span class="review-date">Avaliada em ${escapeHtml(formatDate(request.reviewed_at))}</span>` : '';
  const statusLabel = request.status === 'pending' ? 'Aguardando análise' : request.status === 'accepted' ? 'Aceita' : request.status === 'completed' ? 'Realizada' : 'Reprovada';
  const reviewActions = request.status === 'pending' ? `<button class="btn-review reject" data-review="rejected" data-id="${request.id}">Reprovar</button><button class="btn-review accept" data-review="accepted" data-id="${request.id}">Aceitar</button>` : request.status === 'accepted' ? `<button class="btn-review complete" data-review="completed" data-id="${request.id}">Marcar concluída</button>` : '';
  const deleteAction = request.status === 'accepted' || request.status === 'rejected' ? `<button class="btn-delete-request" data-delete-id="${request.id}" title="Excluir solicitação">Excluir</button>` : '';
  return `<article class="improvement-card improvement-row status-${request.status}">
    <div class="request-kind"><span class="improvement-tag tag-${request.category}">${labels[request.category]}</span><small class="request-status-label">${statusLabel}</small></div>
    <div class="request-summary"><h3>${escapeHtml(request.title)}</h3><p>${escapeHtml(request.description)}</p><div class="request-meta"><span>Por <strong>${escapeHtml(author)}</strong></span><time datetime="${escapeHtml(request.created_at)}">${escapeHtml(formatDate(request.created_at))}</time>${reviewed}</div></div>
    <div class="request-row-actions"><button class="btn-detail" data-detail-id="${request.id}">Ver detalhes</button>${deleteAction}${reviewActions}</div>
  </article>`;
}

function openDetail(id: string): void {
  const request = requests.find((item) => item.id === id); if (!request) return;
  const author = request.profiles?.name?.trim() || request.profiles?.email || 'Analista';
  const statusLabel = request.status === 'pending' ? 'Aguardando análise' : request.status === 'accepted' ? 'Aceita' : request.status === 'completed' ? 'Realizada / concluída' : 'Reprovada';
  const reviewActions = request.status === 'pending' ? `<button class="btn-review reject" data-review="rejected" data-id="${request.id}">Reprovar solicitação</button><button class="btn-review accept" data-review="accepted" data-id="${request.id}">Aceitar solicitação</button>` : request.status === 'accepted' ? `<button class="btn-review complete" data-review="completed" data-id="${request.id}">Marcar como realizada</button>` : '';
  const deleteAction = request.status === 'accepted' || request.status === 'rejected' ? `<button class="btn-delete-request" data-delete-id="${request.id}">Excluir solicitação</button>` : '';
  const actions = deleteAction || reviewActions ? `<div class="detail-review-actions">${deleteAction}<span></span>${reviewActions}</div>` : '';
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay request-detail-overlay';
  overlay.innerHTML = `<section class="request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><header><div><span class="improvement-tag tag-${request.category}">${labels[request.category]}</span><span class="detail-status status-${request.status}">${statusLabel}</span></div><button class="modal-close" type="button" aria-label="Fechar">✕</button></header><div class="request-detail-content"><p class="detail-eyebrow">Detalhes da solicitação</p><h2 id="detail-title">${escapeHtml(request.title)}</h2><div class="detail-metadata"><div><small>Solicitado por</small><strong>${escapeHtml(author)}</strong></div><div><small>Enviado em</small><strong>${escapeHtml(formatDate(request.created_at))}</strong></div>${request.reviewed_at ? `<div><small>Avaliado em</small><strong>${escapeHtml(formatDate(request.reviewed_at))}</strong></div>` : ''}</div><div class="detail-description"><small>Descrição completa</small><p>${escapeHtml(request.description)}</p></div></div>${actions}</section>`;
  const close = () => overlay.remove(); overlay.querySelector('.modal-close')!.addEventListener('click', close); overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelectorAll<HTMLButtonElement>('[data-review]').forEach((button) => button.addEventListener('click', () => void review(button)));
  overlay.querySelector<HTMLButtonElement>('[data-delete-id]')?.addEventListener('click', () => { close(); confirmDelete(request.id); });
  document.body.appendChild(overlay);
}

function confirmDelete(id: string): void {
  const request = requests.find((item) => item.id === id); if (!request) return;
  confirmDialog('Excluir solicitação', `Tem certeza de que deseja excluir “${escapeHtml(request.title)}”? Esta ação não poderá ser desfeita.`, async () => {
    const { error } = await supabase.from('improvement_requests').delete().eq('id', id);
    if (error) throw error;
    requests = requests.filter((item) => item.id !== id);
    if (currentRoot) render(currentRoot);
    toast('Solicitação excluída.');
  });
}

async function review(button: HTMLButtonElement): Promise<void> {
  const status = button.dataset.review as 'accepted' | 'rejected' | 'completed';
  const id = button.dataset.id!;
  const card = button.closest<HTMLElement>('.improvement-card');
  card?.querySelectorAll<HTMLButtonElement>('button').forEach((item) => { item.disabled = true; });
  const { data: auth } = await supabase.auth.getSession();
  const { error } = await supabase.from('improvement_requests').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: auth.session?.user.id }).eq('id', id);
  if (error) { card?.querySelectorAll<HTMLButtonElement>('button').forEach((item) => { item.disabled = false; }); toast(error.message, 'error'); return; }
  const item = requests.find((request) => request.id === id); if (item) { item.status = status; item.reviewed_at = new Date().toISOString(); }
  button.closest('.modal-overlay')?.remove();
  if (currentRoot) render(currentRoot);
  toast(status === 'accepted' ? 'Solicitação aceita.' : status === 'completed' ? 'Melhoria marcada como concluída.' : 'Solicitação reprovada.');
}

export async function refreshImprovements(root: HTMLElement): Promise<void> {
  currentRoot = root; root.innerHTML = '<p class="overview-empty">Carregando solicitações...</p>';
  const { data, error } = await supabase.from('improvement_requests').select('id,title,description,category,created_at,author_id,status,reviewed_at,reviewed_by,profiles!improvement_requests_author_id_fkey(name,email)').order('created_at', { ascending: false });
  if (error) throw error; requests = (data ?? []) as unknown as ImprovementRequest[]; render(root);
}

export const initImprovements = refreshImprovements;
