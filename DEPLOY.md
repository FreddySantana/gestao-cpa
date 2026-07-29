# Colocar o Portal CPA online (Supabase + Netlify)

A versão online é estática (pasta `web/`) e fala direto com o Supabase.
A versão local (Express + SQLite, pasta `public/`) continua funcionando de forma independente.

## 1. Supabase (uma vez só)

1. Crie um projeto em https://supabase.com/dashboard (org gratuita serve).
2. **SQL Editor** → cole e rode o arquivo `supabase/schema.sql` inteiro.
   Isso cria as tabelas, as políticas de segurança (RLS), os contadores e o bucket `cpa` do storage.
3. **Authentication → Users → Add user**: crie o usuário do admin
   (e-mail `fredericochem@gmail.com` + senha forte). Marque "Auto confirm user".
   *Não habilite cadastro público (signup) — o portal não usa.*
4. **Settings → API**: copie a `Project URL` e a `anon public key`.
5. Cole as duas em `web/js/config.js`.

## 2. Netlify (uma vez só)

Opção A — arrastar e soltar (mais rápido):
1. https://app.netlify.com → "Add new site" → "Deploy manually".
2. Arraste a pasta `web/` inteira. Pronto, sai uma URL `*.netlify.app`.

Opção B — via git (atualiza sozinho a cada push):
1. Crie um repositório git em `gestao-cpa/` e suba para o GitHub.
2. No Netlify: "Import an existing project" → aponte para o repositório.
   O `netlify.toml` já diz que a pasta publicada é `web/`.

## 3. Atualizações do dia a dia

- Conteúdo (notícias, documentos, membros): tudo pelo `/admin.html` do site online — não precisa redeployar.
- Código/layout: re-arraste a pasta `web/` (opção A) ou dê push (opção B).

## Custos e limites (plano gratuito)

- Netlify: 100 GB de banda/mês — muito além do necessário.
- Supabase: 500 MB de banco + 1 GB de storage + 50k usuários ativos.
  O storage é o limite a observar se subir muitos PDFs pesados.
- Projeto Supabase gratuito "pausa" após ~1 semana sem acesso; o primeiro acesso
  seguinte reativa em ~1 min. Com o portal em uso real isso não acontece.
