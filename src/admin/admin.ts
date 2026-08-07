import '../style.css';
import { supabase } from '../supabaseClient';
import { initTeam, refreshTeam } from './team';
import { initEscalas, refreshEscalas } from './escalas';
import { initMural, refreshMural } from './notices';
import { toast } from './ui';
import { fetchPublicData } from '../data';
import { escapeHtml, formatDateBR, formatTime } from '../utils';
import { initTheme } from '../theme';
import { initUsers, refreshUsers } from './users';
import { initUraConfig } from './uraConfig';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
};

const loading = $('#loading');
let realtimeDebounce: number | undefined;
let realtimeChannel: ReturnType<typeof supabase.channel> | undefined;
const changedTables = new Set<string>();

async function requireAdmin(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    window.location.href = '/login.html';
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, name, email')
    .eq('id', data.session.user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    window.location.href = '/?analista=1';
    return false;
  }
  const name = profile.name?.trim() || profile.email?.split('@')[0] || 'Administrador';
  $('#adminName').textContent = name;
  $('#adminAvatar').textContent = name.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join('');
  return true;
}

function initNav() {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.admin-tab');
  const views: Record<string, HTMLElement> = {
    dashboard: $('#view-dashboard'),
    team: $('#view-team'),
    escalas: $('#view-escalas'),
    mural: $('#view-mural'),
    users: $('#view-users'),
    'ura-config': $('#view-ura-config'),
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      Object.entries(views).forEach(([name, view]) => {
        view.classList.toggle('hidden', name !== tab.dataset.tab);
      });
    });
  });
}

async function renderOverview() {
  const { notices, escalas } = await fetchPublicData();
  const row = (name: string, detail: string, label: string) => `<div class="overview-row"><strong>${escapeHtml(name)}</strong><span>${detail}</span><em>${label}</em></div>`;
  const ura = escalas.filter((item) => item.kind === 'horario').flatMap((item) => item.analysts.map((person) => row(person.name, `${formatTime(item.start_value ?? '')} – ${formatTime(item.end_value ?? '')}`, 'Ativo'))).join('');
  const plantao = escalas.filter((item) => item.kind === 'plantao').flatMap((item) => item.analysts.map((person) => row(person.name, `${formatDateBR(item.start_value ?? '')} a ${formatDateBR(item.end_value ?? '')}`, 'Plantão'))).join('');
  const almoco = escalas.filter((item) => item.kind === 'almoco')
    .flatMap((item) => item.analysts)
    .sort((a, b) => (a.schedule_start ?? '99:99').localeCompare(b.schedule_start ?? '99:99'))
    .map((person, index) => row(
      person.name,
      person.schedule_start && person.schedule_end ? `${formatTime(person.schedule_start)} – ${formatTime(person.schedule_end)}` : 'Horário pendente',
      person.schedule_start ? `${index + 1}º` : 'Pendente'
    )).join('');
  $('#overviewUra').innerHTML = ura || '<p class="overview-empty">Nenhuma escala URA ativa.</p>';
  $('#overviewPlantao').innerHTML = plantao || '<p class="overview-empty">Nenhum plantão ativo.</p>';
  $('#overviewAlmoco').innerHTML = almoco || '<p class="overview-empty">Nenhuma escala de almoço ativa.</p>';
  $('#overviewMural').innerHTML = notices.map((notice) => `<p class="notice-preview"><strong>Aviso:</strong> ${escapeHtml(notice.text)}</p>`).join('') || '<p class="overview-empty">Nenhum aviso publicado.</p>';
}

function initDashboardActions() {
  const openTab = (name: string) => {
    const tab = document.querySelector<HTMLButtonElement>(`.admin-tab[data-tab="${name}"]`);
    tab?.click();
    document.body.classList.remove('menu-open');
  };

  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  document.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.quick!;
      openTab(target);
      if (target === 'escalas') $('#newEscalaBtn').click();
      if (target === 'team') $('#newAnalystBtn').click();
      if (target === 'mural') window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('#noticeText')?.focus(), 0);
    });
  });
  $('#dashboardDate').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).format(new Date());
}

function initRealtimeUpdates() {
  const receiveChange = (payload: { table: string }) => {
    changedTables.add(payload.table);
    if (realtimeDebounce) window.clearTimeout(realtimeDebounce);
    realtimeDebounce = window.setTimeout(async () => {
      const tables = new Set(changedTables);
      changedTables.clear();
      const jobs: Promise<unknown>[] = [renderOverview()];
      if (tables.has('analysts')) jobs.push(refreshTeam($('#teamList')));
      if (tables.has('analysts') || tables.has('escalas') || tables.has('escala_analysts')) {
        jobs.push(refreshEscalas($('#escalaList')));
      }
      if (tables.has('notices')) jobs.push(refreshMural($('#muralList')));
      if (tables.has('profiles')) jobs.push(refreshUsers($('#userList')));
      await Promise.all(jobs);
    }, 250);
  };

  realtimeChannel = supabase.channel('admin-escalas-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'escalas' }, receiveChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_analysts' }, receiveChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'analysts' }, receiveChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, receiveChange)
    .subscribe();
}

$('#logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
});

async function boot() {
  initTheme();
  loading.classList.remove('hidden');
  if (!(await requireAdmin())) return;
  loading.classList.add('hidden');

  initNav();
  await Promise.all([
    renderOverview(),
    initTeam($('#teamList')),
    initEscalas($('#escalaList')),
    initMural($('#muralList')),
    initUsers($('#userList')),
    initUraConfig($('#uraConfig')),
  ]);
  initDashboardActions();
  initRealtimeUpdates();
}

window.addEventListener('beforeunload', () => {
  if (realtimeDebounce) window.clearTimeout(realtimeDebounce);
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
});

boot().catch((err) => {
  loading.classList.add('hidden');
  toast(err instanceof Error ? err.message : 'Erro ao carregar o painel.', 'error');
});
