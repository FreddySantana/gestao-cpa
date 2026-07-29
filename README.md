# Portal CPA · Estácio

Portal público + painel administrativo da CPA (Comissão Própria de Avaliação): notícias e divulgações, repositório de documentos oficiais, composição da comissão e link para a pesquisa de avaliação institucional em andamento. Substitui o antigo mural no Notion.

O projeto tem **duas versões**:

- **`web/` — versão online (Supabase + Netlify)**: site estático que fala direto com o Supabase (Postgres + Auth + Storage). É a versão publicada. Ver `DEPLOY.md`.
- **`public/` + Express — versão local (SQLite)**: roda na sua máquina com `npm start`, útil para desenvolvimento e testes sem internet.

## Rodar

```bash
npm install
npm start        # ou npm run dev (com --watch)
```

- Portal público: http://localhost:3900
- Painel administrativo: http://localhost:3900/admin.html
- Login inicial: `fredericochem@gmail.com` / `cpa123` (troque na aba Configurações)

## Estrutura

| Área | O que faz |
| --- | --- |
| **Portal** (`/`) | Home com destaques, últimas publicações, banner da pesquisa e documentos recentes |
| **Notícias** (`/noticias.html`) | Todas as publicações, com busca, filtro por categoria e paginação |
| **Documentos** (`/documentos.html`) | Repositório agrupado por pasta, com filtros por pasta/ano e contagem de downloads |
| **Quem Somos** (`/quem-somos.html`) | Texto institucional + membros da comissão por segmento |
| **Admin** (`/admin.html`) | CRUD de publicações (capa, anexos, destaque, rascunho), documentos, membros, categorias e configurações |

## Tecnologia

Mesmo padrão dos demais sistemas do repositório: Node.js + Express + SQLite nativo (`node:sqlite`), sessão com `express-session`, senhas com `bcryptjs`, uploads com `multer`. Sem framework de frontend — HTML/CSS/JS puros em `public/`.

- Banco: `data/cpa.db` (criado automaticamente)
- Arquivos enviados: `uploads/`
- Porta: `3900` (variável `PORT` para trocar)

O conteúdo das publicações aceita formatação simplificada (markdown-lite): `## título`, `**negrito**`, `*itálico*`, `- lista`, `[texto](url)`, `> citação`.
