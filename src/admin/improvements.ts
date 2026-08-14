import { supabase } from '../supabaseClient';
import { escapeHtml } from '../utils';
import type { ImprovementCategory, ImprovementRequest } from '../types';

const labels: Record<ImprovementCategory, string> = { bug: 'Bug', new_implementation: 'Implementação nova', process_improvement: 'Melhoria de processo' };

export async function refreshImprovements(root: HTMLElement): Promise<void> {
  root.innerHTML = '<p class="overview-empty">Carregando solicitações...</p>';
  const { data, error } = await supabase.from('improvement_requests')
    .select('id,title,description,category,created_at,author_id,profiles!improvement_requests_author_id_fkey(name,email)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const requests = (data ?? []) as unknown as ImprovementRequest[];
  root.innerHTML = requests.length ? requests.map((request) => {
    const author = request.profiles?.name?.trim() || request.profiles?.email || 'Analista';
    const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(request.created_at));
    return `<article class="improvement-card"><div class="improvement-card-head"><span class="improvement-tag tag-${request.category}">${labels[request.category]}</span><time datetime="${escapeHtml(request.created_at)}">${escapeHtml(date)}</time></div><h3>${escapeHtml(request.title)}</h3><p>${escapeHtml(request.description)}</p><footer>Solicitado por <strong>${escapeHtml(author)}</strong></footer></article>`;
  }).join('') : '<p class="overview-empty">Nenhuma melhoria sugerida pelo time.</p>';
}

export const initImprovements = refreshImprovements;
