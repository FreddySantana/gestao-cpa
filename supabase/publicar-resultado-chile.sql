-- Publica o resultado da Mobilidade Presencial 2026 (Chile): notícia + resultado na página do edital.
-- Rode uma vez no SQL Editor do Supabase.

insert into publicacoes (titulo, resumo, conteudo, categoria_id, capa, campus, destaque, destaque_ate, publicado, publicado_em)
values (
  'Mobilidade presencial no Chile: resultado divulgado',
  'A Estácio divulgou os selecionados para a semana de atividades em Santiago, em dezembro. Veja as listas de alunos e de docente.',
  '![Mobilidade Presencial 2026 — Resultado divulgado — Santiago, Chile — alunos e docentes — viagem prevista de 6 a 10/12/2026](/img/mobilidade-chile-resultado.jpg)

A Estácio divulgou, em **6 de outubro de 2026**, o resultado do edital de **mobilidade presencial 2026**, que leva estudantes e docentes a **Santiago, no Chile**, para uma semana de atividades acadêmicas e culturais em língua espanhola, em parceria com a instituição chilena INACAP.

## Listas oficiais

- [Resultado dos alunos selecionados (PDF)](/arquivos/resultado-mobilidade-chile-2026-alunos.pdf)
- [Resultado do docente selecionado (PDF)](/arquivos/resultado-mobilidade-chile-2026-docente.pdf)

Foram selecionados **14 alunos** e **1 docente** entre as unidades da Estácio no país. Cada lista traz a instituição, a capital de saída e chegada do voo internacional, o nome e o curso.

## Próximos passos

- **Viagem prevista:** de **6 a 10 de dezembro de 2026**, em Santiago.
- O programa inclui passagem, hospedagem, seguro-viagem, transporte local para as atividades, alimentação básica, aulas e atividades culturais, conforme o edital.
- Quem foi selecionado deve ficar atento aos comunicados da instituição sobre documentação, principalmente identidade válida ou passaporte.

[Ver o edital completo no portal](/edital?id=6)

Parabéns aos selecionados! A internacionalização é um dos eixos acompanhados pela CPA na avaliação institucional.',
  (select id from categorias where nome = 'Oportunidades e Carreira'),
  '/img/mobilidade-chile-resultado.jpg',
  'ambos',
  true,
  '2026-10-21T02:59:00Z',
  true,
  now()
);

-- Mesmo resultado na página do edital (Mobilidade presencial, id 6).
insert into editais_resultados (edital_id, texto, publicado, atualizado_em)
values (
  6,
  'Resultado divulgado em **6 de outubro de 2026**: foram selecionados **14 alunos** e **1 docente** entre as unidades da Estácio no país.

- [Resultado dos alunos selecionados (PDF)](/arquivos/resultado-mobilidade-chile-2026-alunos.pdf)
- [Resultado do docente selecionado (PDF)](/arquivos/resultado-mobilidade-chile-2026-docente.pdf)

A viagem está prevista para 6 a 10 de dezembro de 2026, em Santiago.',
  true,
  now()
)
on conflict (edital_id) do update
  set texto = excluded.texto, publicado = true, atualizado_em = now();
