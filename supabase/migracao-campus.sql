-- ============================================================
-- Migração: separação por campus (Estácio Pará × Estácio Belém)
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Pode rodar mais de uma vez sem quebrar (idempotente).
--
-- Valores de campus:
--   'para'  → aparece só em para.cpaestacio.com.br
--   'belem' → aparece só em belem.cpaestacio.com.br
--   'ambos' → aparece nos dois portais (publicações e documentos)
-- Membros não têm 'ambos': cada comissão é própria de um campus (exigência MEC).
-- ============================================================

-- ---------- Conteúdo ganha a etiqueta de campus ----------

alter table publicacoes add column if not exists campus text not null default 'ambos';
alter table documentos  add column if not exists campus text not null default 'ambos';
alter table membros     add column if not exists campus text not null default 'para';

do $$ begin
  alter table publicacoes add constraint publicacoes_campus_chk check (campus in ('para','belem','ambos'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table documentos add constraint documentos_campus_chk check (campus in ('para','belem','ambos'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table membros add constraint membros_campus_chk check (campus in ('para','belem'));
exception when duplicate_object then null; end $$;

-- ---------- Config passa a ser por portal ----------

alter table config add column if not exists site text not null default 'para';

do $$ begin
  alter table config drop constraint config_pkey;
  alter table config add primary key (site, chave);
exception when others then null; end $$;

-- Duplica a config existente (site 'para') para o portal de Belém.
insert into config (site, chave, valor)
  select 'belem', chave, valor from config where site = 'para'
on conflict (site, chave) do nothing;

-- Nomes de cada portal (edite depois no admin, se quiser).
update config set valor = 'Portal CPA · Estácio Pará'  where site = 'para'  and chave = 'nome_portal';
update config set valor = 'Portal CPA · Estácio Belém' where site = 'belem' and chave = 'nome_portal';
update config set valor = 'Comissão Própria de Avaliação · Estácio Pará'
  where site = 'para' and chave = 'subtitulo';
update config set valor = 'Comissão Própria de Avaliação · Centro Universitário Estácio Belém'
  where site = 'belem' and chave = 'subtitulo';
