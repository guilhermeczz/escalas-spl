import './style.css';
import { supabase } from './supabaseClient';
import { initials, formatTime } from './utils';
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const toast = (message: string) => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 4500); };

async function loadLunch() {
  const { data } = await supabase.rpc('get_my_lunch'); const lunch = Array.isArray(data) ? data[0] : data;
  const now = new Date(); const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $<HTMLInputElement>('#lunchStart').value = lunch?.schedule_start?.slice(0, 5) || hhmm;
  const end = new Date(now.getTime() + 3600000); $<HTMLInputElement>('#lunchEnd').value = lunch?.schedule_end?.slice(0, 5) || `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  if (lunch?.schedule_start && lunch?.schedule_end) { const el = $('#lunchStatus'); el.classList.remove('hidden'); el.textContent = `Horário atual: ${formatTime(lunch.schedule_start)} às ${formatTime(lunch.schedule_end)}`; }
}
async function boot() {
  const { data: auth } = await supabase.auth.getSession(); if (!auth.session) { location.href = '/login.html'; return; }
  const { data: profile } = await supabase.from('profiles').select('name, role, analyst_id, analysts(extension)').eq('id', auth.session.user.id).single();
  if (!profile) { await supabase.auth.signOut(); location.href = '/login.html'; return; } if (profile.role === 'admin') { location.href = '/admin.html'; return; }
  const name = profile.name?.trim() || auth.session.user.email?.split('@')[0] || 'Analista'; $('#userName').textContent = name; $('#userAvatar').textContent = initials(name);
  const analyst = Array.isArray(profile.analysts) ? profile.analysts[0] : profile.analysts; $('#userExtension').textContent = analyst?.extension ? `Ramal ${analyst.extension}` : '';
  if (!profile.analyst_id) { $('#lunchForm').classList.add('hidden'); const el = $('#lunchStatus'); el.classList.remove('hidden'); el.textContent = 'Seu login ainda não está vinculado a um analista. Solicite o vínculo ao administrador.'; return; }
  await loadLunch();
}
$('#lunchForm').addEventListener('submit', async (event) => { event.preventDefault(); const start = $<HTMLInputElement>('#lunchStart').value; const end = $<HTMLInputElement>('#lunchEnd').value; if (end <= start) { toast('O retorno deve ser posterior à saída.'); return; }
  const button = $<HTMLButtonElement>('#saveLunch'); button.disabled = true; button.textContent = 'Salvando...'; const { error } = await supabase.rpc('set_my_lunch', { p_start: start, p_end: end }); button.disabled = false; button.textContent = 'Salvar horário';
  if (error) { toast(error.message.includes('LUNCH_LIMIT') ? 'Já existem 2 analistas em almoço nesse período. Escolha outro horário.' : error.message); return; } toast('Horário de almoço atualizado.'); await loadLunch(); });
$('#logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); location.href = '/login.html'; }); boot();
