-- ============================================================
-- Portal CPA · Estácio — schema para Supabase (Postgres)
-- Rode este arquivo inteiro no SQL Editor do painel do Supabase.
-- Pode rodar mais de uma vez sem quebrar (idempotente).
-- ============================================================

-- ---------- Tabelas ----------

create table if not exists categorias (
  id bigint generated always as identity primary key,
  nome text not null unique,
  cor text not null default '#1d4ed8',
  ordem int not null default 0,
  ativa boolean not null default true
);

create table if not exists publicacoes (
  id bigint generated always as identity primary key,
  titulo text not null,
  resumo text not null default '',
  conteudo text not null default '',
  categoria_id bigint references categorias(id) on delete set null,
  capa text,                             -- caminho do arquivo no bucket "cpa"
  destaque boolean not null default false,
  publicado boolean not null default false,
  publicado_em timestamptz,
  visualizacoes int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists anexos (
  id bigint generated always as identity primary key,
  publicacao_id bigint not null references publicacoes(id) on delete cascade,
  arquivo text not null,                 -- caminho no bucket "cpa"
  nome_original text not null,
  mime text,
  tamanho bigint
);

create table if not exists documentos (
  id bigint generated always as identity primary key,
  titulo text not null,
  descricao text not null default '',
  pasta text not null default 'Geral',
  ano int,
  arquivo text not null,                 -- caminho no bucket "cpa"
  nome_original text not null,
  mime text,
  tamanho bigint,
  publicado boolean not null default true,
  downloads int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists membros (
  id bigint generated always as identity primary key,
  nome text not null,
  funcao text not null default 'Membro',
  segmento text not null default 'Docente',
  email text,
  bio text not null default '',
  foto text,                             -- caminho no bucket "cpa"
  ordem int not null default 0,
  ativo boolean not null default true
);

create table if not exists config (
  chave text primary key,
  valor text not null default ''
);

-- ---------- Row Level Security ----------
-- Visitante (anon): enxerga apenas conteúdo publicado/ativo.
-- Admin logado (authenticated): pode tudo.

alter table categorias  enable row level security;
alter table publicacoes enable row level security;
alter table anexos      enable row level security;
alter table documentos  enable row level security;
alter table membros     enable row level security;
alter table config      enable row level security;

-- Leitura pública
drop policy if exists publico_le_categorias on categorias;
create policy publico_le_categorias on categorias
  for select using (ativa or auth.role() = 'authenticated');

drop policy if exists publico_le_publicacoes on publicacoes;
create policy publico_le_publicacoes on publicacoes
  for select using (publicado or auth.role() = 'authenticated');

drop policy if exists publico_le_anexos on anexos;
create policy publico_le_anexos on anexos
  for select using (
    exists (select 1 from publicacoes p where p.id = publicacao_id and (p.publicado or auth.role() = 'authenticated'))
  );

drop policy if exists publico_le_documentos on documentos;
create policy publico_le_documentos on documentos
  for select using (publicado or auth.role() = 'authenticated');

drop policy if exists publico_le_membros on membros;
create policy publico_le_membros on membros
  for select using (ativo or auth.role() = 'authenticated');

drop policy if exists publico_le_config on config;
create policy publico_le_config on config for select using (true);

-- Escrita apenas para o admin autenticado
drop policy if exists admin_escreve_categorias on categorias;
create policy admin_escreve_categorias on categorias
  for all to authenticated using (true) with check (true);

drop policy if exists admin_escreve_publicacoes on publicacoes;
create policy admin_escreve_publicacoes on publicacoes
  for all to authenticated using (true) with check (true);

drop policy if exists admin_escreve_anexos on anexos;
create policy admin_escreve_anexos on anexos
  for all to authenticated using (true) with check (true);

drop policy if exists admin_escreve_documentos on documentos;
create policy admin_escreve_documentos on documentos
  for all to authenticated using (true) with check (true);

drop policy if exists admin_escreve_membros on membros;
create policy admin_escreve_membros on membros
  for all to authenticated using (true) with check (true);

drop policy if exists admin_escreve_config on config;
create policy admin_escreve_config on config
  for all to authenticated using (true) with check (true);

-- ---------- Contadores (chamados pelo site sem login) ----------

create or replace function incrementa_visualizacao(pub_id bigint)
returns void language sql security definer set search_path = public as $$
  update publicacoes set visualizacoes = visualizacoes + 1 where id = pub_id and publicado;
$$;

create or replace function incrementa_download(doc_id bigint)
returns void language sql security definer set search_path = public as $$
  update documentos set downloads = downloads + 1 where id = doc_id and publicado;
$$;

grant execute on function incrementa_visualizacao(bigint) to anon, authenticated;
grant execute on function incrementa_download(bigint) to anon, authenticated;

-- ---------- Storage: bucket único "cpa" ----------
-- Pastas usadas pelo site: capas/, fotos/, documentos/, anexos/
-- Bucket público (leitura por URL direta); escrita só autenticado.

insert into storage.buckets (id, name, public)
values ('cpa', 'cpa', true)
on conflict (id) do nothing;

drop policy if exists cpa_leitura_publica on storage.objects;
create policy cpa_leitura_publica on storage.objects
  for select using (bucket_id = 'cpa');

drop policy if exists cpa_admin_envia on storage.objects;
create policy cpa_admin_envia on storage.objects
  for insert to authenticated with check (bucket_id = 'cpa');

drop policy if exists cpa_admin_atualiza on storage.objects;
create policy cpa_admin_atualiza on storage.objects
  for update to authenticated using (bucket_id = 'cpa');

drop policy if exists cpa_admin_apaga on storage.objects;
create policy cpa_admin_apaga on storage.objects
  for delete to authenticated using (bucket_id = 'cpa');

-- ---------- Seeds ----------

insert into categorias (nome, cor, ordem) values
  ('Institucional', '#1d4ed8', 0),
  ('Avaliação Institucional', '#7c3aed', 1),
  ('Resultados e Transparência', '#0f766e', 2),
  ('Melhorias Estruturais', '#b45309', 3),
  ('Serviços', '#be185d', 4),
  ('Oportunidades e Carreira', '#15803d', 5),
  ('Notícias e Eventos', '#dc2626', 6),
  ('Enade', '#4338ca', 7)
on conflict (nome) do nothing;

insert into config (chave, valor) values
  ('nome_portal', 'Portal CPA · Estácio'),
  ('subtitulo', 'Comissão Própria de Avaliação'),
  ('texto_sobre', 'A CPA — Comissão Própria de Avaliação é responsável por coordenar a autoavaliação institucional: da elaboração do método, passando pela implementação e sistematização dos resultados, até o Relatório Anual de Avaliação Institucional, que subsidia os planejamentos administrativo e pedagógico da Instituição.'),
  ('link_pesquisa', ''),
  ('texto_pesquisa', 'Pesquisa de Avaliação Institucional 2026'),
  ('email_contato', '')
on conflict (chave) do nothing;
