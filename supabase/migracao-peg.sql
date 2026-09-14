-- ============================================================
-- Links do PEG (Programa de Excelência em Gestão) — peg.cpaestacio.com.br
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Pode rodar mais de uma vez sem quebrar (idempotente): itens já existentes
-- não são sobrescritos, então edições feitas pelo painel são preservadas.
-- ============================================================

create table if not exists peg_itens (
  id bigint generated always as identity primary key,
  pilar text not null default 'Excelência Acadêmica',
  numero int not null,
  titulo text not null,
  categoria text not null default 'Processo' check (categoria in ('Processo', 'Resultado')),
  observacao text not null default '',
  links jsonb not null default '[]'::jsonb,   -- [{"rotulo": "...", "url": "https://..."}]
  ordem int not null default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (pilar, numero)
);

alter table peg_itens enable row level security;

-- Página pública lê os itens visíveis; o painel (logado) vê e edita tudo.
drop policy if exists publico_le_peg on peg_itens;
create policy publico_le_peg on peg_itens
  for select using (ativo or auth.role() = 'authenticated');

drop policy if exists admin_escreve_peg on peg_itens;
create policy admin_escreve_peg on peg_itens
  for all to authenticated using (true) with check (true);

-- ---------- Pilar Excelência Acadêmica (Manual PEG 2026) ----------
-- Links da lista enviada pela CPA, completados com os links oficiais do manual.

insert into peg_itens (pilar, numero, titulo, categoria, observacao, links, ordem) values
('Excelência Acadêmica', 1, 'Aumentar a adesão do corpo docente nos treinamentos realizados', 'Processo', '',
 '[{"rotulo":"Painel de treinamentos docentes","url":"https://app.powerbi.com/groups/me/apps/53af3806-77b0-4981-872c-a7a3017cb41d/reports/c69f7376-aa8d-48d2-a7b8-95e6e9697be0/ReportSectiona66dad55543045540cf0?experience=power-bi"}]', 1),

('Excelência Acadêmica', 2, 'Realizar a gestão do ciclo ENADE nas unidades', 'Processo', '',
 '[{"rotulo":"Painel do ciclo ENADE","url":"https://app.powerbi.com/groups/me/apps/205742fa-8d65-4eba-8960-f3695fc272d8/reports/f2b3e513-3501-4589-bc09-5709c6c74868/df1e72700d0eb4553a85?experience=power-bi&bookmarkGuid=Bookmark6f75c55c4475cd45d974"}]', 2),

('Excelência Acadêmica', 3, 'Realizar reuniões de GDA para monitoramento de indicadores e análise dos desvios de resultados', 'Processo',
 'Evidências documentais: atas e pautas das reuniões de GDA.', '[]', 3),

('Excelência Acadêmica', 4, 'Avaliar a atuação do Núcleo de Apoio e Atendimento Psicopedagógico (NAAP)', 'Processo', '',
 '[{"rotulo":"NAAP – Power BI","url":"https://app.powerbi.com/groups/me/apps/53af3806-77b0-4981-872c-a7a3017cb41d/reports/f3ed9cc3-0dd3-4798-b6f1-2356feb11eff/e3c706740ddd611136b6?experience=power-bi"}]', 4),

('Excelência Acadêmica', 5, 'Realizar ações acadêmicas institucionais com Colegiado Docente, Núcleo Docente Estruturante (NDE) e Comissão Própria de Avaliação (CPA)', 'Processo',
 'Evidência verificada in loco.',
 '[{"rotulo":"Painel de ações acadêmicas","url":"https://app.powerbi.com/groups/me/apps/bb9b41ce-a04c-4366-b05e-cc46d521298c/reports/6a102d83-7b72-4c2a-a084-e0c94c0e67a4/ReportSectionbeb905d6a7e71453aff7?experience=power-bi&bookmarkGuid=Bookmarkd3e4b9963c99fb546f17"}]', 5),

('Excelência Acadêmica', 6, 'Garantir os processos relativos à jornada de estágio dos estudantes', 'Processo', '',
 '[{"rotulo":"Painel Estágio – Power BI","url":"https://app.powerbi.com/groups/me/apps/53af3806-77b0-4981-872c-a7a3017cb41d/reports/0ad46128-5ccc-4c15-a058-7d3e660003e6/e361abde48ad691813f5?experience=power-bi&bookmarkGuid=41b4f9ff7b74048c170c"},{"rotulo":"Painel CSC – Power BI","url":"https://app.powerbi.com/groups/me/apps/6db78f69-f5d8-4b98-a62b-086667e5d1c3/reports/93493f14-96f3-4ad9-b1db-2f8f23bb596d/8f2986f0be808e8140e2?experience=power-bi&clientSideAuth=0"}]', 6),

('Excelência Acadêmica', 7, 'Manter custo docente/aluno conforme planejado', 'Resultado',
 'Indicador de Custo Docente por Aluno (Book de Resultados).',
 '[{"rotulo":"Book de Resultados – custo docente/aluno","url":"https://app.powerbi.com/groups/me/apps/ba1c9a95-b88b-4871-b5c7-191c8201b6ee/reports/6339d6d0-5634-40de-acbe-390df74442d3/ReportSectionce9873c448d0900c00be?experience=power-bi"},{"rotulo":"Book de Resultados – visão complementar","url":"https://app.powerbi.com/groups/me/apps/ba1c9a95-b88b-4871-b5c7-191c8201b6ee/reports/7f10bebb-9ea6-430e-9533-b7d24e612004/ReportSection1d55196badfd1d466c99?experience=power-bi"}]', 7),

('Excelência Acadêmica', 8, 'Atingir conceito satisfatório na visita de avaliação do INEP/MEC', 'Resultado', '',
 '[{"rotulo":"Painel de avaliação INEP/MEC","url":"https://app.powerbi.com/groups/me/apps/205742fa-8d65-4eba-8960-f3695fc272d8/reports/f2b3e513-3501-4589-bc09-5709c6c74868/d8492a21b8eac3690ca8?experience=power-bi&bookmarkGuid=852c0ce7c21430880502"}]', 8),

('Excelência Acadêmica', 9, 'Garantir conceitos satisfatórios em notas ENADE e CPC dos cursos ofertados nas unidades', 'Resultado', '',
 '[{"rotulo":"Painel ENADE e CPC","url":"https://app.powerbi.com/groups/me/apps/205742fa-8d65-4eba-8960-f3695fc272d8/reports/f2b3e513-3501-4589-bc09-5709c6c74868/ReportSectiond6d8cc6a97811cc99bcf?experience=power-bi&bookmarkGuid=Bookmarke1e590c4b5791101c0bc"},{"rotulo":"Relatório de conceitos ENADE e CPC","url":"https://app.powerbi.com/groups/me/apps/205742fa-8d65-4eba-8960-f3695fc272d8/reports/a2d33c6f-aa9e-401f-bf1f-95e88a522b30/6493dbb685e1bb6deba8?experience=power-bi"}]', 9),

('Excelência Acadêmica', 10, 'Engajar os estudantes para melhorarmos o tempo de estudo dos conteúdos digitais', 'Resultado',
 'Relatório PULSO da Gerência de Tecnologia Educacional.',
 '[{"rotulo":"PULSO – Tempo de estudo","url":"https://app.powerbi.com/groups/me/apps/f97e7c8e-0061-486b-8f21-a8cf39e64f30/reports/986dab02-7b97-4643-8fd0-003d8285b3c9/ffe7ce3be2b3e3ccd43e?experience=power-bi"}]', 10),

('Excelência Acadêmica', 11, 'Estimular a frequência dos alunos nas aulas presenciais', 'Resultado',
 'Relatório PULSO da Gerência de Tecnologia Educacional.',
 '[{"rotulo":"PULSO – Frequência dos alunos","url":"https://app.powerbi.com/groups/me/apps/f97e7c8e-0061-486b-8f21-a8cf39e64f30/reports/986dab02-7b97-4643-8fd0-003d8285b3c9/ffe7ce3be2b3e3ccd43e?experience=power-bi"}]', 11),

('Excelência Acadêmica', 12, 'Garantir adesão nas atividades avaliativas (SM, AV e AVS)', 'Resultado',
 'Relatório PULSO da Gerência de Tecnologia Educacional.',
 '[{"rotulo":"PULSO – Atividades avaliativas","url":"https://app.powerbi.com/groups/me/apps/f97e7c8e-0061-486b-8f21-a8cf39e64f30/reports/986dab02-7b97-4643-8fd0-003d8285b3c9/ffe7ce3be2b3e3ccd43e?experience=power-bi"}]', 12),

('Excelência Acadêmica', 13, 'Aumentar o grau de aprendizagem dos alunos', 'Resultado',
 'Relatório PULSO da Gerência de Tecnologia Educacional.',
 '[{"rotulo":"PULSO – Grau de aprendizagem","url":"https://app.powerbi.com/groups/me/apps/f97e7c8e-0061-486b-8f21-a8cf39e64f30/reports/986dab02-7b97-4643-8fd0-003d8285b3c9/ffe7ce3be2b3e3ccd43e?experience=power-bi"}]', 13),

('Excelência Acadêmica', 14, 'Atingir o crédito financeiro durante planejamento acadêmico', 'Resultado', '',
 '[{"rotulo":"Renovação – MD – Power BI","url":"https://app.powerbi.com/groups/me/apps/ba1c9a95-b88b-4871-b5c7-191c8201b6ee/reports/ef0ca3be-b6db-4b54-8c4b-3522a598e4dc/ReportSection545d14e82b07eff749fe?experience=power-bi"}]', 14),

('Excelência Acadêmica', 15, 'Assegurar a ciência no documento de Movimentação de Quadro Docente (MQD)', 'Resultado', '',
 '[{"rotulo":"Relatório BI – MQD","url":"https://app.powerbi.com/Redirect?action=OpenReport&appId=ba1c9a95-b88b-4871-b5c7-191c8201b6ee&reportObjectId=f40eb0e1-2f33-4e3e-be45-7a545206444a&ctid=29e081cc-983f-4d52-b1d0-103595213bc6&reportPage=c18983730a7fc21eee3c&pbi_source=appShareLink"}]', 15)
on conflict (pilar, numero) do nothing;
