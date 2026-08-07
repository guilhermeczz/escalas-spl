import './style.css';
import { supabase } from './supabaseClient';
import { initTheme } from './theme';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
};

const form = $<HTMLFormElement>('#loginForm');
const usernameInput = $<HTMLInputElement>('#username');
const passInput = $<HTMLInputElement>('#password');
const errorEl = $('#loginError');
const loginBtn = $<HTMLButtonElement>('#loginBtn');

initTheme();

$('#togglePass').addEventListener('click', () => {
  const isPassword = passInput.type === 'password';
  passInput.type = isPassword ? 'text' : 'password';
});

const LOGIN_DOMAIN = 'login.superescalas.com';

function usernameToEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  return `${normalized}@${LOGIN_DOMAIN}`;
}

async function login(username: string, password: string) {
  const email = usernameToEmail(username);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showError('Usuário ou senha inválidos. Verifique e tente novamente.');
    return;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', sessionData.session!.user.id).single();
  window.location.href = profile?.role === 'admin' ? '/admin.html' : '/?analista=1';
}

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.add('hidden');

  const username = usernameInput.value.trim().toLowerCase();
  const password = passInput.value;

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    showError('Use de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.');
    return;
  }
  if (!/^\d{6}$/.test(password)) {
    showError('A senha deve ter exatamente 6 números.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Entrando...';
  try {
    await login(username, password);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar no painel';
  }
});

// Se já estiver logado, vai direto para o painel
supabase.auth.getSession().then(({ data }) => {
  if (data.session) {
    supabase.from('profiles').select('role').eq('id', data.session.user.id).single().then(({ data: profile }) => {
      window.location.href = profile?.role === 'admin' ? '/admin.html' : '/?analista=1';
    });
  }
});
