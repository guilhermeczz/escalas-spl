import { supabase } from '../supabaseClient';
import { escapeHtml } from '../utils';
import { toast } from './ui';
import type { ImprovementCategory, ImprovementRequest } from '../types';

type RequestStatus = ImprovementRequest['status'];
const labels: Record<ImprovementCategory, string> = { bug: 'Bug', new_implementation: 'Implementação nova', process_improvement: 'Melhoria de processo' };
const emptyLabels: Record<RequestStatus, string> = {
  pending: 'Nenhuma solicitação aguardando análise.', accepted: 'Nenhuma solicitação aceita.', rejected: 'Nenhuma solicitação reprovada.'
};
let activeStatus: RequestStatus = 'pending';
let requests: ImprovementRequest[] = [];
let currentRoot: HTMLElement | null = null;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function render(root: HTMLElement): void {
  const counts = (['pending', 'accepted', 'rejected'] as RequestStatus[]).reduce((result, status) => ({ ...result, [status]: requests.filter((item) => item.status === status).length }), {} as Record<RequestStatus, number>);
  const filtered = requests.filter((item) => item.status === activeStatus);
  root.innerHTML = `<div class="improvement-workspace">
    <nav class="improvement-tabs" aria-label="Status das solicitações">
      <button class="${activeStatus === 'pending' ? 'active' : ''}" data-request-status="pending"><span>Pendentes</span><b>${counts.pending}</b></button>
      <button class="${activeStatus === 'accepted' ? 'active' : ''}" data-request-status="accepted"><span>Aceitas</span><b>${counts.accepted}</b></button>
      <button class="${activeStatus === 'rejected' ? 'active' : ''}" data-request-status="rejected"><span>Reprovadas</span><b>${counts.rejected}</b></button>
    </nav>
    <div class="improvement-list">${filtered.length ? filtered.map(cardHtml).join('') : `<div class="improvement-empty"><strong>${emptyLabels[activeStatus]}</strong><span>As solicitações aparecerão aqui conforme forem avaliadas.</span></div>`}</div>
  </div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-request-status]').forEach((button) => button.addEventListener('click', () => { activeStatus = button.dataset.requestStatus as RequestStatus; render(root); }));
  root.querySelectorAll<HTMLButtonElement>('[data-review]').forEach((button) => button.addEventListener('click', () => void review(button)));
}

function cardHtml(request: ImprovementRequest): string {
  const author = request.profiles?.name?.trim() || request.profiles?.email || 'Analista';
  const reviewed = request.reviewed_at ? `<span class="review-date">Avaliada em ${escapeHtml(formatDate(request.reviewed_at))}</span>` : '';
  const actions = request.status === 'pending' ? `<div class="improvement-actions"><button class="btn-review reject" data-review="rejected" data-id="${request.id}">Reprovar</button><button class="btn-review accept" data-review="accepted" data-id="${request.id}">Aceitar solicitação</button></div>` : '';
  return `<article class="improvement-card status-${request.status}"><div class="improvement-card-head"><span class="improvement-tag tag-${request.category}">${labels[request.category]}</span><time datetime="${escapeHtml(request.created_at)}">${escapeHtml(formatDate(request.created_at))}</time></div><h3>${escapeHtml(request.title)}</h3><p>${escapeHtml(request.description)}</p><footer><span>Solicitado por <strong>${escapeHtml(author)}</strong></span>${reviewed}</footer>${actions}</article>`;
}

async function review(button: HTMLButtonElement): Promise<void> {
  const status = button.dataset.review as 'accepted' | 'rejected';
  const id = button.dataset.id!;
  const card = button.closest<HTMLElement>('.improvement-card');
  card?.querySelectorAll<HTMLButtonElement>('button').forEach((item) => { item.disabled = true; });
  const { data: auth } = await supabase.auth.getSession();
  const { error } = await supabase.from('improvement_requests').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: auth.session?.user.id }).eq('id', id);
  if (error) { card?.querySelectorAll<HTMLButtonElement>('button').forEach((item) => { item.disabled = false; }); toast(error.message, 'error'); return; }
  const item = requests.find((request) => request.id === id); if (item) { item.status = status; item.reviewed_at = new Date().toISOString(); }
  if (currentRoot) render(currentRoot);
  toast(status === 'accepted' ? 'Solicitação aceita.' : 'Solicitação reprovada.');
}

export async function refreshImprovements(root: HTMLElement): Promise<void> {
  currentRoot = root; root.innerHTML = '<p class="overview-empty">Carregando solicitações...</p>';
  const { data, error } = await supabase.from('improvement_requests').select('id,title,description,category,created_at,author_id,status,reviewed_at,reviewed_by,profiles!improvement_requests_author_id_fkey(name,email)').order('created_at', { ascending: false });
  if (error) throw error; requests = (data ?? []) as unknown as ImprovementRequest[]; render(root);
}

export const initImprovements = refreshImprovements;
