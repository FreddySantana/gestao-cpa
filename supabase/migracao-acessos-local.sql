-- Localização aproximada dos acessos (país, estado e cidade), informada pela Cloudflare.
-- Continua sem IP, sem cookie e sem identificar ninguém.
-- Rode uma vez no SQL Editor do Supabase, depois de migracao-acessos.sql.

alter table acessos add column if not exists pais text;
alter table acessos add column if not exists estado text;
alter table acessos add column if not exists cidade text;

-- Versão com localização (a antiga, de 6 parâmetros, deixa de ser usada pelo site).
create or replace function registra_acesso(
  p_campus text, p_pagina text, p_ref bigint, p_origem text, p_dispositivo text, p_novo boolean,
  p_pais text, p_estado text, p_cidade text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_campus is null or p_campus not in ('para', 'belem', 'peg') then return; end if;
  if p_pagina is null or p_pagina !~ '^/[a-z0-9/_-]{0,60}$' then return; end if;
  if p_dispositivo not in ('celular', 'tablet', 'computador') then p_dispositivo := null; end if;
  insert into acessos (campus, pagina, ref_id, origem, dispositivo, novo_no_dia, pais, estado, cidade)
  values (p_campus, p_pagina, p_ref, left(lower(coalesce(nullif(btrim(p_origem), ''), 'direto')), 100),
          p_dispositivo, coalesce(p_novo, false),
          upper(left(nullif(btrim(p_pais), ''), 2)),
          left(nullif(btrim(p_estado), ''), 40),
          left(nullif(btrim(p_cidade), ''), 60));
end;
$$;
revoke all on function registra_acesso(text, text, bigint, text, text, boolean, text, text, text) from public;
grant execute on function registra_acesso(text, text, bigint, text, text, boolean, text, text, text) to anon, authenticated;

-- Resumo do painel com as listas de estado, cidade e país.
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
      from (select campus, count(*) as n from base group by 1) x), '[]'::json),
    'estados', coalesce((
      select json_agg(json_build_object('estado', estado, 'n', n) order by n desc)
      from (select coalesce(estado, 'não identificado') as estado, count(*) as n
            from base where novo_no_dia group by 1 order by 2 desc limit 12) x), '[]'::json),
    'cidades', coalesce((
      select json_agg(json_build_object('cidade', cidade, 'estado', estado, 'n', n) order by n desc)
      from (select cidade, max(estado) as estado, count(*) as n
            from base where novo_no_dia and cidade is not null
            group by cidade order by 3 desc limit 10) x), '[]'::json),
    'paises', coalesce((
      select json_agg(json_build_object('pais', pais, 'n', n) order by n desc)
      from (select coalesce(pais, 'não identificado') as pais, count(*) as n
            from base where novo_no_dia group by 1 order by 2 desc limit 8) x), '[]'::json)
  );
$$;
revoke all on function resumo_acessos(timestamptz, text) from public, anon;
grant execute on function resumo_acessos(timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
