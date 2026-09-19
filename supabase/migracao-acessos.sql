-- Medidor de acessos do portal (aba "📈 Acessos" do painel).
-- Anônimo: não guarda IP, cookie nem identificador do visitante. Cada registro é uma página vista.
-- "novo_no_dia" marca a primeira página que um navegador abriu no dia (conta visitantes por dia).
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists acessos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  campus text not null check (campus in ('para', 'belem', 'peg')),
  pagina text not null,
  ref_id bigint,
  origem text,
  dispositivo text check (dispositivo in ('celular', 'tablet', 'computador')),
  novo_no_dia boolean not null default false
);
create index if not exists acessos_criado_em on acessos (criado_em);

alter table acessos enable row level security;
drop policy if exists "acessos: painel lê" on acessos;
create policy "acessos: painel lê" on acessos for select to authenticated using (true);
-- Sem política de insert: o site registra só pela função abaixo, que valida os campos.

create or replace function registra_acesso(
  p_campus text, p_pagina text, p_ref bigint, p_origem text, p_dispositivo text, p_novo boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_campus is null or p_campus not in ('para', 'belem', 'peg') then return; end if;
  if p_pagina is null or p_pagina !~ '^/[a-z0-9/_-]{0,60}$' then return; end if;
  if p_dispositivo not in ('celular', 'tablet', 'computador') then p_dispositivo := null; end if;
  insert into acessos (campus, pagina, ref_id, origem, dispositivo, novo_no_dia)
  values (p_campus, p_pagina, p_ref, left(lower(coalesce(nullif(btrim(p_origem), ''), 'direto')), 100),
          p_dispositivo, coalesce(p_novo, false));
end;
$$;
revoke all on function registra_acesso(text, text, bigint, text, text, boolean) from public;
grant execute on function registra_acesso(text, text, bigint, text, text, boolean) to anon, authenticated;

-- Resumo agregado para o painel (datas no fuso de Belém).
create or replace function resumo_acessos(p_desde timestamptz, p_campus text default null)
returns json
language sql
stable
set search_path = public
as $$
  with base as (
    select * from acessos
    where criado_em >= p_desde and (p_campus is null or campus = p_campus)
  )
  select json_build_object(
    'total', (select count(*) from base),
    'visitantes', (select count(*) from base where novo_no_dia),
    'por_dia', coalesce((
      select json_agg(json_build_object('dia', dia, 'acessos', n, 'visitantes', v) order by dia)
      from (select (criado_em at time zone 'America/Belem')::date as dia, count(*) as n,
                   count(*) filter (where novo_no_dia) as v
            from base group by 1) d), '[]'::json),
    'paginas', coalesce((
      select json_agg(json_build_object('pagina', pagina, 'n', n) order by n desc)
      from (select pagina, count(*) as n from base group by 1 order by 2 desc limit 10) x), '[]'::json),
    'publicacoes', coalesce((
      select json_agg(json_build_object('id', x.ref_id, 'titulo', p.titulo, 'n', x.n) order by x.n desc)
      from (select ref_id, count(*) as n from base
            where pagina = '/publicacao' and ref_id is not null group by 1 order by 2 desc limit 10) x
      left join publicacoes p on p.id = x.ref_id), '[]'::json),
    'editais', coalesce((
      select json_agg(json_build_object('id', x.ref_id, 'titulo', e.titulo, 'n', x.n) order by x.n desc)
      from (select ref_id, count(*) as n from base
            where pagina = '/edital' and ref_id is not null group by 1 order by 2 desc limit 10) x
      left join editais e on e.id = x.ref_id), '[]'::json),
    'origens', coalesce((
      select json_agg(json_build_object('origem', origem, 'n', n) order by n desc)
      from (select origem, count(*) as n from base where origem <> 'interno'
            group by 1 order by 2 desc limit 8) x), '[]'::json),
    'dispositivos', coalesce((
      select json_agg(json_build_object('dispositivo', dispositivo, 'n', n) order by n desc)
      from (select coalesce(dispositivo, 'desconhecido') as dispositivo, count(*) as n
            from base where novo_no_dia group by 1) x), '[]'::json),
    'campi', coalesce((
      select json_agg(json_build_object('campus', campus, 'n', n) order by n desc)
      from (select campus, count(*) as n from base group by 1) x), '[]'::json)
  );
$$;
revoke all on function resumo_acessos(timestamptz, text) from public;
grant execute on function resumo_acessos(timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
