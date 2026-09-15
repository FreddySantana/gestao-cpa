-- ============================================================
-- Editais (Pesquisa, Extensão e Internacionalização) e inscrições
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Pode rodar mais de uma vez sem quebrar (idempotente).
-- ============================================================

create table if not exists editais (
  id bigint generated always as identity primary key,
  campus text not null default 'ambos' check (campus in ('para', 'belem', 'ambos')),
  area text not null default 'Pesquisa, Extensão e Internacionalização',
  numero text not null default '',          -- ex.: "Edital nº 03/2026"
  titulo text not null,
  resumo text not null default '',
  descricao text not null default '',       -- mesma formatação das publicações
  capa text,                                 -- bucket "cpa"
  arquivo text,                              -- PDF do edital, bucket "cpa"
  arquivo_nome text,
  inicio timestamptz,                        -- sem início: abre ao publicar
  fim timestamptz,                           -- sem fim: não encerra sozinho
  -- Campos do formulário: [{id, rotulo, tipo, obrigatorio, ajuda, opcoes[]}]
  campos jsonb not null default '[]'::jsonb,
  campo_unico text,                          -- id do campo que impede inscrição duplicada
  publicado boolean not null default false,
  publicacao_id bigint references publicacoes(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Resultado fica à parte para o rascunho não vazar pela API antes de publicado.
create table if not exists editais_resultados (
  edital_id bigint primary key references editais(id) on delete cascade,
  texto text not null default '',
  publicado boolean not null default false,
  atualizado_em timestamptz not null default now()
);

create table if not exists inscricoes (
  id bigint generated always as identity primary key,
  edital_id bigint not null references editais(id) on delete cascade,
  protocolo text not null unique,
  dados jsonb not null default '{}'::jsonb,
  anexos jsonb not null default '[]'::jsonb,  -- [{campo, caminho, nome}], bucket "inscricoes"
  chave_unica text,                           -- valor normalizado do campo único
  situacao text not null default 'recebida'
    check (situacao in ('recebida', 'deferida', 'indeferida', 'selecionada')),
  observacao text not null default '',        -- nota interna da CPA
  aceite_lgpd_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (edital_id, chave_unica)
);

create index if not exists inscricoes_edital_idx on inscricoes (edital_id);

-- ---------- Row Level Security ----------

alter table editais enable row level security;
alter table editais_resultados enable row level security;
alter table inscricoes enable row level security;

drop policy if exists publico_le_editais on editais;
create policy publico_le_editais on editais
  for select using (publicado or auth.role() = 'authenticated');

drop policy if exists admin_escreve_editais on editais;
create policy admin_escreve_editais on editais
  for all to authenticated using (true) with check (true);

drop policy if exists publico_le_resultados on editais_resultados;
create policy publico_le_resultados on editais_resultados
  for select using (
    (publicado and exists (select 1 from editais e where e.id = edital_id and e.publicado))
    or auth.role() = 'authenticated'
  );

drop policy if exists admin_escreve_resultados on editais_resultados;
create policy admin_escreve_resultados on editais_resultados
  for all to authenticated using (true) with check (true);

-- Inscrições guardam dados pessoais: visitantes não leem nem gravam direto.
-- A única porta de entrada pública é a função inscrever(), mais abaixo.
drop policy if exists admin_gerencia_inscricoes on inscricoes;
create policy admin_gerencia_inscricoes on inscricoes
  for all to authenticated using (true) with check (true);

-- ---------- Storage: anexos das inscrições (privado) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inscricoes', 'inscricoes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Qualquer pessoa pode enviar arquivo para a pasta de um edital, mas ninguém de fora lê.
drop policy if exists inscricoes_envio_publico on storage.objects;
create policy inscricoes_envio_publico on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'inscricoes' and name like 'edital-%/%');

drop policy if exists inscricoes_admin_le on storage.objects;
create policy inscricoes_admin_le on storage.objects
  for select to authenticated using (bucket_id = 'inscricoes');

drop policy if exists inscricoes_admin_apaga on storage.objects;
create policy inscricoes_admin_apaga on storage.objects
  for delete to authenticated using (bucket_id = 'inscricoes');

-- ---------- Função de inscrição ----------
-- Valida tudo no servidor (o formulário do site pode ser burlado) e devolve o protocolo.

create or replace function inscrever(p_edital bigint, p_dados jsonb, p_anexos jsonb, p_aceite boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e editais%rowtype;
  campo jsonb;
  v jsonb;
  vazio boolean;
  anexo jsonb;
  qtd int;
  dados_limpos jsonb := '{}'::jsonb;
  anexos_limpos jsonb := '[]'::jsonb;
  chave text;
  rotulo_unico text;
  proto text;
begin
  select * into e from editais where id = p_edital;
  if not found or not e.publicado then
    raise exception 'Edital não encontrado.' using errcode = 'P0001';
  end if;
  if e.inicio is not null and now() < e.inicio then
    raise exception 'As inscrições deste edital ainda não começaram.' using errcode = 'P0001';
  end if;
  if e.fim is not null and now() > e.fim then
    raise exception 'As inscrições deste edital estão encerradas.' using errcode = 'P0001';
  end if;
  if not coalesce(p_aceite, false) then
    raise exception 'Para enviar, é preciso aceitar o uso dos dados.' using errcode = 'P0001';
  end if;
  if octet_length(coalesce(p_dados, '{}'::jsonb)::text) > 50000
     or jsonb_array_length(coalesce(p_anexos, '[]'::jsonb)) > 20 then
    raise exception 'A inscrição passou do tamanho permitido.' using errcode = 'P0001';
  end if;

  for campo in select value from jsonb_array_elements(e.campos) loop
    if campo->>'tipo' = 'arquivo' then
      qtd := 0;
      for anexo in
        select value from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb))
        where value->>'campo' = campo->>'id'
      loop
        if coalesce(anexo->>'caminho', '') not like ('edital-' || e.id || '/%')
           or not exists (
             select 1 from storage.objects o
             where o.bucket_id = 'inscricoes' and o.name = anexo->>'caminho'
           ) then
          raise exception 'Anexo inválido em "%".', campo->>'rotulo' using errcode = 'P0001';
        end if;
        anexos_limpos := anexos_limpos || jsonb_build_array(jsonb_build_object(
          'campo', campo->>'id',
          'caminho', anexo->>'caminho',
          'nome', left(coalesce(anexo->>'nome', 'arquivo'), 200)
        ));
        qtd := qtd + 1;
      end loop;
      if coalesce((campo->>'obrigatorio')::boolean, false) and qtd = 0 then
        raise exception 'Envie o arquivo pedido em "%".', campo->>'rotulo' using errcode = 'P0001';
      end if;
    else
      v := coalesce(p_dados, '{}'::jsonb) -> (campo->>'id');
      vazio := v is null
        or jsonb_typeof(v) = 'null'
        or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
        or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0);
      if vazio then
        if coalesce((campo->>'obrigatorio')::boolean, false) then
          raise exception 'Preencha o campo "%".', campo->>'rotulo' using errcode = 'P0001';
        end if;
      else
        if jsonb_typeof(v) = 'string' then
          v := to_jsonb(left(btrim(v #>> '{}'), 5000));
        end if;
        -- Só grava os campos que o edital pede; o resto é descartado.
        dados_limpos := dados_limpos || jsonb_build_object(campo->>'id', v);
        if campo->>'id' = e.campo_unico then
          rotulo_unico := campo->>'rotulo';
          if campo->>'tipo' in ('cpf', 'telefone', 'numero') then
            chave := nullif(regexp_replace(v #>> '{}', '\D', '', 'g'), '');
          else
            chave := nullif(lower(btrim(v #>> '{}')), '');
          end if;
        end if;
      end if;
    end if;
  end loop;

  proto := 'E' || e.id || '-' || to_char(now() at time zone 'America/Belem', 'YYMMDD') || '-'
    || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  begin
    insert into inscricoes (edital_id, protocolo, dados, anexos, chave_unica, aceite_lgpd_em)
    values (e.id, proto, dados_limpos, anexos_limpos, chave, now());
  exception when unique_violation then
    raise exception 'Já existe uma inscrição neste edital com o mesmo "%".', coalesce(rotulo_unico, 'dado')
      using errcode = 'P0001';
  end;

  return proto;
end;
$$;

revoke all on function inscrever(bigint, jsonb, jsonb, boolean) from public;
grant execute on function inscrever(bigint, jsonb, jsonb, boolean) to anon, authenticated;
