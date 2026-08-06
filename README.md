# Escalas · Superlógica — Controle de Acesso

Sistema web para gestão de escalas da equipe de controle de acesso.

- **Visão pública** (`/`): dashboard read-only com mural de avisos, escalas de **URA** (por horário), **Plantão** (por data) e **Almoço** (flexível), e botão **Exportar PDF**.
- **Visão ADM** (`/login.html`): login com e-mail e senha + painel com CRUD de **Equipe**, **Escalas** e **Mural**.

## Stack

| Camada    | Tecnologia                                        |
| --------- | ------------------------------------------------- |
| Frontend  | Vite + TypeScript (HTML/CSS/JS vanilla)            |
| Backend   | Supabase (Postgres + Auth + Row Level Security)    |
| Auth      | Supabase Auth (e-mail/senha, sessão persistente)   |
| Deploy    | Vercel (static)                                    |

Sem servidor próprio: o navegador fala direto com o Supabase usando a chave pública (`anon`), e a segurança é garantida por políticas RLS no banco.

---

## 1. Criar o projeto no Supabase (free)

1. Crie uma conta/org em https://supabase.com e clique em **New project** (região próxima de você, senha forte — guarde-a).
2. No painel, abra **SQL Editor** → **New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
   - Isso cria as tabelas (`profiles`, `analysts`, `escalas`, `escala_analysts`, `notices`), a trigger de perfil, a função `is_admin()`, as políticas RLS e os **dados de exemplo**.
3. Crie o usuário administrador:
   - Escolha um username simples, por exemplo `carlos`.
   - Em **Authentication → Users → Add user**, use o e-mail técnico `carlos@login.superescalas.com` e uma senha numérica de 6 dígitos.
   - O usuário verá apenas `carlos` na tela de login; o e-mail técnico é montado internamente.
   - Depois, no SQL Editor, torne-o admin (troque pelo e-mail usado):
     ```sql
     update public.profiles set role = 'admin'
     where email = 'carlos@login.superescalas.com';
     ```
4. Pegue as credenciais em **Project Settings → API**:
   - `Project URL` → vai em `VITE_SUPABASE_URL`
   - `anon public` → vai em `VITE_SUPABASE_ANON_KEY`

> As políticas RLS já garantem: **leitura pública** de equipe/escalas/mural e **escrita somente para `role = 'admin'`**.

---

## 2. Rodar localmente

Requisito: Node.js >= 22.5 (o projeto não usa SQLite local, mas esta é a versão mínima do Vite).

```bash
npm install
cp .env.example .env    # no PowerShell: Copy-Item .env.example .env
```

Edite o `.env` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA-CHAVE-ANON
```

Rode:

```bash
npm run dev        # http://localhost:5173
```

Verifique com `npm run typecheck` e gere a versão de produção com `npm run build`.

---

## 3. Publicar na Vercel

1. Suba o projeto para um repositório Git (GitHub/GitLab/Bitbucket).
2. Em https://vercel.com → **Add New → Project** → importe o repositório.
3. A Vercel detecta **Vite** automaticamente. Confirme:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy**. Pronto: `https://seu-projeto.vercel.app`.

> Variáveis com prefixo `VITE_` são embutidas no build **na hora do deploy** — se trocar de projeto Supabase, altere as variáveis e faça um novo deploy.

---

## Estrutura do projeto

```
.
├── index.html            # Visão pública (dashboard)
├── login.html            # Login do ADM
├── admin.html            # Painel administrativo
├── src/
│   ├── style.css         # Estilos corporativos + impressão/PDF + responsivo
│   ├── supabaseClient.ts # Cliente Supabase (URL + anon key)
│   ├── data.ts           # Queries compartilhadas (escalas/equipe/mural)
│   ├── types.ts          # Tipos de domínio
│   ├── utils.ts          # Formatação de data/hora, chips, etc.
│   ├── public.ts         # Lógica do dashboard público
│   ├── login.ts          # Lógica do login
│   └── admin/
│       ├── admin.ts      # Guard de acesso + navegação por abas
│       ├── team.ts       # CRUD de analistas
│       ├── escalas.ts    # CRUD de escalas (horário/data/almoço)
│       ├── notices.ts    # CRUD do mural de avisos
│       └── ui.ts         # Modal, confirmação e toast
├── supabase/
│   └── schema.sql        # Tabelas + RLS + seed (rodar no SQL Editor)
├── vite.config.ts        # Build multi-página
└── .env.example
```

---

## Modelo de dados

| Tabela           | Papel                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `profiles`       | Usuário autenticado (`role`: `user` ou `admin`)                       |
| `analysts`       | Analistas da equipe (nome, e-mail, função, cor do avatar)             |
| `escalas`        | Escalas: `kind = horario\|plantao\|almoco` + valores/nota e `active`  |
| `escala_analysts`| Vínculo N:N escala ↔ analista                                         |
| `notices`        | Avisos do mural (texto + `active`)                                    |

## Criando mais administradores

Cada novo usuário criado em **Authentication → Users** recebe `role = 'user'`. Para promover:

```sql
update public.profiles set role = 'admin'
where email = 'outro-email@empresa.com';
```

## Notas

- **Exportar PDF**: usa o diálogo de impressão do navegador com CSS de impressão dedicado (recomenda-se marcar "Salvar como PDF"). Se preferir gerar o PDF direto, troque o handler em `src/public.ts` por `html2pdf.js`.
- Os dados de exemplo (5 analistas, 3 escalas, 1 aviso) são inseridos apenas se as tabelas estiverem vazias — apague-os quando quiser via painel ADM.
