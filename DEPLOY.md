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

## 2. Cloudflare Pages (uma vez só)

> **Por que Cloudflare e não Netlify**: a rede da Estácio bloqueia o Netlify por IP
> (categoria "hospedagem gratuita"), inclusive através do domínio próprio — o CNAME
> leva ao mesmo servidor. A Cloudflare passa pelo filtro, e o Supabase já roda nela.

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → aba **Pages**
   → **Connect to Git** → autorize o GitHub e escolha `gestao-cpa`.
2. Configuração do build (a pasta `web/` já é estática, não há build):
   - Framework preset: **None**
   - Build command: **deixe vazio**
   - Build output directory: **`web`**
3. **Save and Deploy**. Sai uma URL `*.pages.dev` — já dá para testar.
4. **Custom domains** → adicione `para.cpaestacio.com.br` e `belem.cpaestacio.com.br`.
5. No Registro.br (DNS → Editar Zona), troque o destino dos dois CNAMEs de
   `gestao-cpa.netlify.app.` para `<nome-do-projeto>.pages.dev.` e salve.

O arquivo `web/_headers` cuida dos cabeçalhos de segurança (equivalente ao antigo
`netlify.toml`, que fica no repositório apenas como histórico).

## 3. Atualizações do dia a dia

- Conteúdo (notícias, documentos, membros): tudo pelo `/admin.html` do site online — não precisa redeployar.
- Código/layout: `git push` — a Cloudflare publica sozinha em ~1 min.

## Custos e limites (plano gratuito)

- Cloudflare Pages: builds e banda ilimitados para site estático.
- Supabase: 500 MB de banco + 1 GB de storage + 50k usuários ativos.
  O storage é o limite a observar se subir muitos PDFs pesados.
- Projeto Supabase gratuito "pausa" após ~1 semana sem acesso; o primeiro acesso
  seguinte reativa em ~1 min. Com o portal em uso real isso não acontece.
