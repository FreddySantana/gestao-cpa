-- Editais internos (inscrição pelo site) x externos (editais nacionais com link próprio de inscrição)
-- e prazo de destaque das notícias (a divulgação do edital sai do banner quando as inscrições encerram).
-- Rode uma vez no SQL Editor do Supabase, depois de migracao-editais.sql.

alter table editais add column if not exists tipo text not null default 'interno';
alter table editais drop constraint if exists editais_tipo_check;
alter table editais add constraint editais_tipo_check check (tipo in ('interno', 'externo'));

alter table editais add column if not exists link_inscricao text;
alter table editais drop constraint if exists editais_link_inscricao_check;
alter table editais add constraint editais_link_inscricao_check
  check (link_inscricao is null or link_inscricao ~* '^https?://[^[:space:]]+$');

alter table publicacoes add column if not exists destaque_ate timestamptz;

-- Edital externo não recebe inscrição pelo portal, nem chamando a função direto.
create or replace function bloqueia_inscricao_externa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from editais where id = new.edital_id and tipo = 'externo') then
    raise exception 'Este edital recebe inscrições apenas pelo site oficial do programa.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists inscricoes_bloqueia_externo on inscricoes;
create trigger inscricoes_bloqueia_externo
  before insert on inscricoes
  for each row execute function bloqueia_inscricao_externa();

notify pgrst, 'reload schema';
