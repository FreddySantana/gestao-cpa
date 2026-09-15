// Painel, aba Editais: cadastro, construtor do formulário, inscrições, resultado e divulgação.
import { sb } from '/js/db.js';
import { esc } from '/js/comum.js';
import {
  AREA_PADRAO,
  TIPOS_CAMPO,
  TIPOS_COM_OPCOES,
  SITUACOES_INSCRICAO,
  ROTULO_SITUACAO,
  situacaoEdital,
  fmtPeriodo,
  fmtDataHora,
  TIPOS_EDITAL,
  tipoEdital,
} from '/js/editais.js';

const $ = (id) => document.getElementById(id);
const NOME_CAMPUS = { para: 'Pará', belem: 'Belém', ambos: 'Ambos' };

function msg(id, texto, tipo = 'ok') {
  const el = $(id);
  el.textContent = texto;
  el.className = `msg ${tipo}`;
  if (tipo === 'ok') setTimeout(() => (el.className = 'msg'), 3500);
}

async function envia(pasta, file) {
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase().slice(0, 10);
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`;
  const { error } = await sb.storage.from('cpa').upload(caminho, file);
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  return caminho;
}

function removeArquivo(caminho) {
  if (caminho) sb.storage.from('cpa').remove([caminho]).then(() => {});
}

// datetime-local trabalha no fuso do navegador; o banco guarda em UTC.
function paraInputLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const deInputLocal = (valor) => (valor ? new Date(valor).toISOString() : null);

const novoId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const camposPadrao = () => [
  { id: 'nome', rotulo: 'Nome completo', tipo: 'texto', obrigatorio: true },
  { id: 'matricula', rotulo: 'Matrícula', tipo: 'texto', obrigatorio: true },
  { id: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true },
  { id: 'telefone', rotulo: 'Telefone (WhatsApp)', tipo: 'telefone', obrigatorio: false },
  { id: 'curso', rotulo: 'Curso', tipo: 'texto', obrigatorio: true },
];

let editais = [];
let editando = null;
let campos = [];
let editalAtual = null;
let inscricoes = [];

/* ---------- Lista ---------- */

async function carregaEditais() {
  const { data, error } = await sb.from('editais').select('*, inscricoes(count)').order('criado_em', { ascending: false });
  editais = error ? [] : data ?? [];
  $('editais-vazio').style.display = editais.length ? 'none' : '';
  $('editais-vazio').innerHTML = error
    ? 'Os editais ainda não estão ativos: rode a migração <b>supabase/migracao-editais.sql</b> no Supabase.'
    : 'Nenhum edital cadastrado. Clique em “+ Novo edital”.';
  $('editais-lista').innerHTML = editais
    .map((e) => {
      const situacao = e.publicado ? ROTULO_SITUACAO[situacaoEdital(e)] : 'Rascunho';
      const externo = tipoEdital(e) === 'externo';
      return `<tr>
        <td><strong>${esc(e.titulo)}</strong>${e.numero ? `<br><small style="color:var(--cinza)">${esc(e.numero)}</small>` : ''}
          <br><small style="color:${externo ? '#5b21b6' : '#1e40af'};font-weight:600">${externo ? 'Externo · link nacional' : 'Interno · inscrição no site'}</small></td>
        <td>${NOME_CAMPUS[e.campus] ?? e.campus}</td>
        <td>${externo ? '—' : e.inscricoes?.[0]?.count ?? 0}</td>
        <td>${esc(fmtPeriodo(e))}</td>
        <td>${esc(situacao)}</td>
        <td style="white-space:nowrap">
          <button class="btn mini claro" data-acao="editar" data-id="${e.id}">Editar</button>
          ${externo ? '' : `<button class="btn mini claro" data-acao="inscricoes" data-id="${e.id}">Inscrições</button>`}
          ${e.publicado && e.publicacao_id ? `<a class="btn mini claro" href="/publicacao?id=${e.publicacao_id}" target="_blank" rel="noopener">Ver notícia</a>` : ''}
          <button class="btn mini perigo" data-acao="excluir" data-id="${e.id}">Excluir</button>
        </td>
      </tr>`;
    })
    .join('');
}

function mostraLista() {
  $('editais-lista-bloco').style.display = '';
  $('edital-editor').style.display = 'none';
  $('inscricoes-bloco').style.display = 'none';
  $('novo-edital').style.display = '';
  editando = null;
  editalAtual = null;
}

async function acaoEdital(ev) {
  const botao = ev.target.closest('[data-acao]');
  if (!botao) return;
  const e = editais.find((x) => x.id === Number(botao.dataset.id));
  if (!e) return;
  if (botao.dataset.acao === 'editar') abreEditor(e);
  if (botao.dataset.acao === 'inscricoes') abreInscricoes(e);
  if (botao.dataset.acao === 'excluir') excluiEdital(e);
}

async function excluiEdital(e) {
  const n = e.inscricoes?.[0]?.count ?? 0;
  const partes = [n ? `as ${n} inscrições dele` : '', e.publicacao_id ? 'a notícia de divulgação' : ''].filter(Boolean);
  const pergunta = `Excluir o edital "${e.titulo}"${partes.length ? ` com ${partes.join(' e ')}` : ''}? Isso não pode ser desfeito.`;
  if (!confirm(pergunta)) return;
  const { data: insc } = await sb.from('inscricoes').select('anexos').eq('edital_id', e.id);
  const { error } = await sb.from('editais').delete().eq('id', e.id);
  if (error) return alert(error.message);
  const caminhos = (insc ?? []).flatMap((i) => (i.anexos ?? []).map((a) => a.caminho));
  if (caminhos.length) sb.storage.from('inscricoes').remove(caminhos).then(() => {});
  let capaEmUso = false;
  if (e.publicacao_id) {
    const { error: erroPub } = await sb.from('publicacoes').delete().eq('id', e.publicacao_id);
    // Se a notícia não pôde ser apagada, ela ainda usa a capa.
    capaEmUso = !!erroPub;
  }
  if (!capaEmUso) removeArquivo(e.capa);
  removeArquivo(e.arquivo);
  carregaEditais();
}

/* ---------- Editor ---------- */

function abreEditor(e) {
  editando = e;
  $('form-edital').reset();
  $('edital-msg').className = 'msg';
  $('edital-editor-titulo').textContent = e ? `Editando: ${e.titulo}` : 'Novo edital';
  $('edital-numero').value = e?.numero ?? '';
  $('edital-titulo').value = e?.titulo ?? '';
  $('edital-area').value = e?.area ?? AREA_PADRAO;
  $('edital-campus').value = e?.campus ?? 'ambos';
  $('edital-resumo').value = e?.resumo ?? '';
  $('edital-descricao').value = e?.descricao ?? '';
  $('edital-inicio').value = paraInputLocal(e?.inicio);
  $('edital-fim').value = paraInputLocal(e?.fim);
  $('edital-publicado').checked = !!e?.publicado;
  $('edital-tipo').value = e ? tipoEdital(e) : 'interno';
  $('edital-link').value = e?.link_inscricao ?? '';
  alternaTipo();
  $('edital-capa-atual').textContent = e?.capa ? 'Há uma capa cadastrada; escolha outra imagem só se quiser trocar.' : '';
  $('edital-arquivo-atual').textContent = e?.arquivo ? `Arquivo atual: ${e.arquivo_nome || 'edital.pdf'}` : '';
  const inscritos = e?.inscricoes?.[0]?.count ?? 0;
  $('edital-aviso-inscritos').style.display = inscritos ? '' : 'none';
  $('edital-aviso-inscritos').textContent = `Este edital já tem ${inscritos} inscrição(ões): evite remover ou trocar o tipo dos campos existentes.`;

  campos = e ? structuredClone(e.campos ?? []) : camposPadrao();
  renderCampos();
  renderCampoUnico(e ? e.campo_unico ?? '' : 'matricula');

  $('editais-lista-bloco').style.display = 'none';
  $('inscricoes-bloco').style.display = 'none';
  $('novo-edital').style.display = 'none';
  $('edital-editor').style.display = '';
  $('edital-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function alternaTipo() {
  const externo = $('edital-tipo').value === 'externo';
  $('bloco-link-externo').style.display = externo ? '' : 'none';
  $('bloco-formulario').style.display = externo ? 'none' : '';
}

function renderCampos() {
  $('construtor-campos').innerHTML =
    campos
      .map(
        (c, i) => `
      <div class="campo-construtor" data-i="${i}">
        <div class="linha">
          <div><label>Pergunta ${i + 1}</label><input type="text" data-prop="rotulo" value="${esc(c.rotulo)}" placeholder="Ex.: Curso"></div>
          <div style="max-width:260px">
            <label>Tipo de resposta</label>
            <select data-prop="tipo">${Object.entries(TIPOS_CAMPO)
              .map(([valor, nome]) => `<option value="${valor}"${valor === c.tipo ? ' selected' : ''}>${nome}</option>`)
              .join('')}</select>
          </div>
        </div>
        <div class="opcoes-linha" style="${TIPOS_COM_OPCOES.includes(c.tipo) ? '' : 'display:none'}">
          <label>Opções (uma por linha)</label>
          <textarea data-prop="opcoes" style="min-height:74px">${esc((c.opcoes ?? []).join('\n'))}</textarea>
        </div>
        <label>Texto de ajuda (opcional)</label>
        <input type="text" data-prop="ajuda" value="${esc(c.ajuda ?? '')}" placeholder="Aparece abaixo do campo">
        <div class="campo-construtor-acoes">
          <label class="check"><input type="checkbox" data-prop="obrigatorio"${c.obrigatorio ? ' checked' : ''}> Obrigatório</label>
          <span class="espaco"></span>
          <button type="button" class="btn mini claro" data-mover="-1"${i === 0 ? ' disabled' : ''} aria-label="Mover para cima">↑</button>
          <button type="button" class="btn mini claro" data-mover="1"${i === campos.length - 1 ? ' disabled' : ''} aria-label="Mover para baixo">↓</button>
          <button type="button" class="btn mini perigo" data-remover>Remover</button>
        </div>
      </div>`
      )
      .join('') || '<p class="dica">Nenhum campo ainda. Sem campos, o edital não recebe inscrições pelo site.</p>';
  renderCampoUnico();
}

function renderCampoUnico(selecionado = $('edital-campo-unico').value) {
  const elegiveis = campos.filter((c) => !['arquivo', 'caixas', 'paragrafo'].includes(c.tipo));
  $('edital-campo-unico').innerHTML =
    '<option value="">Não impedir (permite mais de uma inscrição por pessoa)</option>' +
    elegiveis
      .map((c) => `<option value="${esc(c.id)}"${c.id === selecionado ? ' selected' : ''}>${esc(c.rotulo || '(pergunta sem nome)')}</option>`)
      .join('');
}

function atualizaCampo(ev) {
  const el = ev.target;
  const bloco = el.closest('.campo-construtor');
  if (!bloco || !el.dataset.prop) return;
  const c = campos[Number(bloco.dataset.i)];
  const prop = el.dataset.prop;
  if (prop === 'obrigatorio') c.obrigatorio = el.checked;
  else if (prop === 'opcoes') c.opcoes = el.value.split('\n');
  else c[prop] = el.value;
  if (prop === 'tipo') {
    bloco.querySelector('.opcoes-linha').style.display = TIPOS_COM_OPCOES.includes(c.tipo) ? '' : 'none';
    renderCampoUnico();
  }
  if (prop === 'rotulo') renderCampoUnico();
}

function acaoCampo(ev) {
  const bloco = ev.target.closest('.campo-construtor');
  if (!bloco) return;
  const i = Number(bloco.dataset.i);
  const mover = ev.target.closest('[data-mover]');
  if (mover) {
    const j = i + Number(mover.dataset.mover);
    [campos[i], campos[j]] = [campos[j], campos[i]];
    renderCampos();
  } else if (ev.target.closest('[data-remover]')) {
    if (!confirm(`Remover a pergunta "${campos[i].rotulo || i + 1}"?`)) return;
    campos.splice(i, 1);
    renderCampos();
  }
}

async function salvaEdital(ev) {
  ev.preventDefault();
  try {
    const titulo = $('edital-titulo').value.trim();
    if (!titulo) throw new Error('Informe o título do edital.');

    const camposLimpos = campos.map((c) => ({
      id: c.id,
      rotulo: (c.rotulo ?? '').trim(),
      tipo: c.tipo,
      obrigatorio: !!c.obrigatorio,
      ajuda: (c.ajuda ?? '').trim(),
      ...(TIPOS_COM_OPCOES.includes(c.tipo) ? { opcoes: (c.opcoes ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
    }));
    const tipo = $('edital-tipo').value;
    const link = $('edital-link').value.trim();
    if (tipo === 'externo') {
      if (!/^https?:\/\/\S+$/i.test(link)) throw new Error('Informe o link oficial de inscrição, começando com https://');
    } else {
      // O formulário só vale para edital interno; no externo fica guardado, sem uso.
      if (camposLimpos.some((c) => !c.rotulo)) throw new Error('Toda pergunta do formulário precisa de um texto.');
      if (camposLimpos.some((c) => TIPOS_COM_OPCOES.includes(c.tipo) && !c.opcoes.length)) {
        throw new Error('Perguntas com lista de opções precisam de pelo menos uma opção.');
      }
    }

    const inicio = deInputLocal($('edital-inicio').value);
    const fim = deInputLocal($('edital-fim').value);
    if (inicio && fim && new Date(fim) <= new Date(inicio)) {
      throw new Error('O fim das inscrições precisa ser depois do início.');
    }

    const dados = {
      numero: $('edital-numero').value.trim(),
      titulo,
      area: $('edital-area').value.trim() || AREA_PADRAO,
      campus: $('edital-campus').value,
      resumo: $('edital-resumo').value.trim(),
      descricao: $('edital-descricao').value,
      inicio,
      fim,
      campos: camposLimpos,
      campo_unico: $('edital-campo-unico').value || null,
      tipo,
      link_inscricao: tipo === 'externo' ? link : null,
      publicado: $('edital-publicado').checked,
      atualizado_em: new Date().toISOString(),
    };

    const novaCapa = $('edital-capa').files[0];
    if (novaCapa) dados.capa = await envia('capas', novaCapa);
    const novoPdf = $('edital-arquivo').files[0];
    if (novoPdf) {
      if (novoPdf.type !== 'application/pdf') throw new Error('O arquivo do edital precisa ser um PDF.');
      dados.arquivo = await envia('editais', novoPdf);
      dados.arquivo_nome = novoPdf.name;
      removeArquivo(editando?.arquivo);
    }

    const { data: salvo, error } = editando
      ? await sb.from('editais').update(dados).eq('id', editando.id).select().single()
      : await sb.from('editais').insert(dados).select().single();
    if (error) throw new Error(error.message);

    try {
      await sincronizaDivulgacao(salvo);
    } catch (err) {
      carregaEditais();
      throw new Error(`O edital foi salvo, mas a notícia de divulgação não foi atualizada: ${err.message}. Salve de novo para tentar outra vez.`);
    }
    // A capa antiga só sai do armazenamento depois que a notícia já aponta para a nova.
    if (novaCapa && editando?.capa) removeArquivo(editando.capa);
    mostraLista();
    carregaEditais();
  } catch (err) {
    msg('edital-msg', err.message, 'erro');
  }
}

/* ---------- Divulgação ---------- */

// Todo edital publicado vira notícia na tela inicial e no banner (destaque até o fim das inscrições).
// A notícia é derivada do edital: é reescrita a cada salvamento.
async function sincronizaDivulgacao(e) {
  const externo = tipoEdital(e) === 'externo';
  const conteudo = [
    e.numero ? `**${e.numero}** · ${e.area}` : `**${e.area}**`,
    '',
    `**${TIPOS_EDITAL[tipoEdital(e)]}**`,
    '',
    `**Inscrições:** ${fmtPeriodo(e)}`,
    '',
    e.resumo,
    '',
    ...(externo
      ? [
          'A inscrição é feita no site oficial do programa, não pelo portal da CPA.',
          '',
          ...(e.link_inscricao ? [`## [Fazer a inscrição no site oficial](${e.link_inscricao})`, ''] : []),
          `[Ver os detalhes do edital no portal](/edital?id=${e.id})`,
        ]
      : [`## [Ver o edital e fazer a inscrição](/edital?id=${e.id})`]),
  ].join('\n');

  let atual = null;
  if (e.publicacao_id) {
    const { data } = await sb.from('publicacoes').select('id,publicado_em').eq('id', e.publicacao_id).maybeSingle();
    atual = data;
  }
  // Edital em rascunho não cria notícia; se já existia, ela sai do ar junto.
  if (!e.publicado && !atual) return;

  const agora = new Date().toISOString();
  const dados = {
    titulo: e.titulo,
    resumo: e.resumo || `Inscrições ${fmtPeriodo(e)}.`,
    conteudo,
    capa: e.capa ?? null,
    campus: e.campus,
    destaque: true,
    destaque_ate: e.fim ?? null,
    publicado: !!e.publicado,
    atualizado_em: agora,
  };
  if (e.publicado && !atual?.publicado_em) dados.publicado_em = agora;

  if (atual) {
    const { error } = await sb.from('publicacoes').update(dados).eq('id', atual.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: cats } = await sb.from('categorias').select('id,nome');
  const categoria =
    cats?.find((c) => c.nome === 'Oportunidades e Carreira') ?? cats?.find((c) => c.nome === 'Notícias e Eventos');
  const { data: pub, error } = await sb
    .from('publicacoes')
    .insert({ ...dados, categoria_id: categoria?.id ?? null })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const { error: erroLigacao } = await sb.from('editais').update({ publicacao_id: pub.id }).eq('id', e.id);
  if (erroLigacao) throw new Error(erroLigacao.message);
}

/* ---------- Inscrições ---------- */

const valorTexto = (v) => (Array.isArray(v) ? v.join('; ') : v ?? '');
const rotuloCampo = (id) => editalAtual?.campos?.find((c) => c.id === id)?.rotulo ?? id;

async function abreInscricoes(e) {
  editalAtual = e;
  $('editais-lista-bloco').style.display = 'none';
  $('edital-editor').style.display = 'none';
  $('novo-edital').style.display = 'none';
  $('inscricoes-bloco').style.display = '';
  $('inscricoes-titulo').textContent = `Inscrições · ${e.titulo}`;
  $('inscricoes-filtro').value = '';
  $('inscricoes-lista').innerHTML = '';

  const [{ data, error }, { data: resultado }] = await Promise.all([
    sb.from('inscricoes').select('*').eq('edital_id', e.id).order('criado_em'),
    sb.from('editais_resultados').select('texto,publicado').eq('edital_id', e.id).maybeSingle(),
  ]);
  if (error) return msg('inscricoes-msg', error.message, 'erro');
  inscricoes = data ?? [];
  $('resultado-texto').value = resultado?.texto ?? '';
  $('resultado-publicado').checked = !!resultado?.publicado;
  renderInscricoes();
}

function renderInscricoes() {
  const filtro = $('inscricoes-filtro').value;
  const lista = inscricoes.filter((i) => !filtro || i.situacao === filtro);
  const todos = editalAtual.campos ?? [];
  const visiveis = todos.filter((c) => c.tipo !== 'arquivo').slice(0, 3);
  const temAnexo = todos.some((c) => c.tipo === 'arquivo');

  $('inscricoes-contagem').textContent = `${inscricoes.length} inscrição(ões)${filtro ? ` · ${lista.length} com esta situação` : ''}`;
  $('inscricoes-cabeca').innerHTML = `<tr><th>Protocolo</th><th>Enviada em</th>${visiveis
    .map((c) => `<th>${esc(c.rotulo)}</th>`)
    .join('')}${temAnexo ? '<th>Anexos</th>' : ''}<th>Situação</th><th></th></tr>`;
  $('inscricoes-vazio').style.display = lista.length ? 'none' : '';
  $('inscricoes-lista').innerHTML = lista
    .map(
      (i) => `<tr>
        <td style="white-space:nowrap"><strong>${esc(i.protocolo)}</strong></td>
        <td style="white-space:nowrap">${fmtDataHora(i.criado_em)}</td>
        ${visiveis.map((c) => `<td>${esc(valorTexto(i.dados?.[c.id]))}</td>`).join('')}
        ${temAnexo
          ? `<td style="white-space:nowrap">${(i.anexos ?? [])
              .map((a, k) => `<button class="btn mini claro" data-anexo="${i.id}:${k}">📎 ${esc(rotuloCampo(a.campo))}</button>`)
              .join(' ') || '—'}</td>`
          : ''}
        <td><select data-situacao="${i.id}">${Object.entries(SITUACOES_INSCRICAO)
          .map(([valor, nome]) => `<option value="${valor}"${valor === i.situacao ? ' selected' : ''}>${nome}</option>`)
          .join('')}</select></td>
        <td><button class="btn mini claro" data-detalhe="${i.id}">Ver tudo</button></td>
      </tr>`
    )
    .join('');
}

function alternaDetalhe(id, botao) {
  const tr = botao.closest('tr');
  const aberto = tr.nextElementSibling;
  if (aberto?.classList.contains('inscricao-detalhe')) {
    aberto.remove();
    return;
  }
  const i = inscricoes.find((x) => x.id === id);
  const linhas = (editalAtual.campos ?? [])
    .filter((c) => c.tipo !== 'arquivo')
    .map((c) => `<dt>${esc(c.rotulo)}</dt><dd>${esc(valorTexto(i.dados?.[c.id])) || '—'}</dd>`)
    .join('');
  const detalhe = document.createElement('tr');
  detalhe.className = 'inscricao-detalhe';
  detalhe.innerHTML = `<td colspan="${tr.children.length}">
    <dl>${linhas}<dt>Aceite de uso dos dados</dt><dd>${i.aceite_lgpd_em ? fmtDataHora(i.aceite_lgpd_em) : '—'}</dd></dl>
    <label style="margin-top:12px">Observação interna (não aparece para o aluno)</label>
    <textarea data-observacao="${i.id}" style="min-height:60px">${esc(i.observacao ?? '')}</textarea>
    <button class="btn mini" type="button" data-salva-obs="${i.id}" style="margin-top:6px">Salvar observação</button>
  </td>`;
  tr.after(detalhe);
}

async function acaoInscricao(ev) {
  const anexo = ev.target.closest('[data-anexo]');
  if (anexo) {
    const [id, k] = anexo.dataset.anexo.split(':').map(Number);
    const a = inscricoes.find((x) => x.id === id)?.anexos?.[k];
    // Abre a aba antes do await, senão o navegador bloqueia como pop-up.
    const aba = window.open('', '_blank');
    const { data, error } = await sb.storage.from('inscricoes').createSignedUrl(a.caminho, 300, { download: a.nome });
    if (error) {
      aba?.close();
      return msg('inscricoes-msg', `Não foi possível abrir o anexo: ${error.message}`, 'erro');
    }
    if (aba) aba.location = data.signedUrl;
    return;
  }
  const detalhe = ev.target.closest('[data-detalhe]');
  if (detalhe) return alternaDetalhe(Number(detalhe.dataset.detalhe), detalhe);

  const salvaObs = ev.target.closest('[data-salva-obs]');
  if (salvaObs) {
    const id = Number(salvaObs.dataset.salvaObs);
    const observacao = document.querySelector(`[data-observacao="${id}"]`).value;
    const { error } = await sb.from('inscricoes').update({ observacao }).eq('id', id);
    if (error) return msg('inscricoes-msg', error.message, 'erro');
    inscricoes.find((x) => x.id === id).observacao = observacao;
    msg('inscricoes-msg', 'Observação salva.');
  }
}

async function mudaSituacao(ev) {
  const sel = ev.target.closest('[data-situacao]');
  if (!sel) return;
  const id = Number(sel.dataset.situacao);
  const { error } = await sb.from('inscricoes').update({ situacao: sel.value }).eq('id', id);
  if (error) return msg('inscricoes-msg', error.message, 'erro');
  inscricoes.find((x) => x.id === id).situacao = sel.value;
  msg('inscricoes-msg', `Situação atualizada para ${SITUACOES_INSCRICAO[sel.value]}.`);
}

function exportaCsv() {
  const todos = editalAtual.campos ?? [];
  const cabecalho = ['Protocolo', 'Enviada em', ...todos.map((c) => c.rotulo), 'Situação', 'Observação interna'];
  const linhas = inscricoes.map((i) => [
    i.protocolo,
    fmtDataHora(i.criado_em),
    ...todos.map((c) =>
      c.tipo === 'arquivo'
        ? (i.anexos ?? []).filter((a) => a.campo === c.id).map((a) => a.nome).join('; ')
        : valorTexto(i.dados?.[c.id])
    ),
    SITUACOES_INSCRICAO[i.situacao],
    i.observacao ?? '',
  ]);
  // Prefixa fórmulas para a planilha não executá-las (valores vêm de visitantes).
  const celula = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  const nome = editalAtual.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  link.href = URL.createObjectURL(blob);
  link.download = `inscricoes-${nome || editalAtual.id}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/* ---------- Resultado ---------- */

function preencheResultado() {
  const campoNome =
    (editalAtual.campos ?? []).find((c) => c.id === 'nome') ?? (editalAtual.campos ?? []).find((c) => c.tipo === 'texto');
  const selecionadas = inscricoes.filter((i) => i.situacao === 'selecionada');
  if (!selecionadas.length) return msg('resultado-msg', 'Nenhuma inscrição está marcada como Selecionada.', 'erro');
  if ($('resultado-texto').value.trim() && !confirm('Substituir o texto atual do resultado?')) return;
  const nomes = selecionadas
    .map((i) => valorTexto(i.dados?.[campoNome?.id]) || i.protocolo)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // A página do edital já mostra o título "Resultado"; aqui vai só o texto.
  $('resultado-texto').value = [
    `Inscrições selecionadas${editalAtual.numero ? ` no ${editalAtual.numero}` : ''}, em ordem alfabética:`,
    '',
    ...nomes.map((n) => `- ${n}`),
  ].join('\n');
}

async function salvaResultado() {
  const { error } = await sb.from('editais_resultados').upsert({
    edital_id: editalAtual.id,
    texto: $('resultado-texto').value,
    publicado: $('resultado-publicado').checked,
    atualizado_em: new Date().toISOString(),
  });
  if (error) return msg('resultado-msg', error.message, 'erro');
  msg('resultado-msg', $('resultado-publicado').checked ? 'Resultado salvo e publicado na página do edital.' : 'Resultado salvo (ainda não publicado).');
}

/* ---------- Ligações ---------- */

$('novo-edital').addEventListener('click', () => abreEditor(null));
$('edital-cancelar').addEventListener('click', mostraLista);
$('edital-tipo').addEventListener('change', alternaTipo);
$('form-edital').addEventListener('submit', salvaEdital);
$('add-campo').addEventListener('click', () => {
  campos.push({ id: novoId(), rotulo: '', tipo: 'texto', obrigatorio: false });
  renderCampos();
  $('construtor-campos').lastElementChild?.querySelector('input')?.focus();
});
$('construtor-campos').addEventListener('input', atualizaCampo);
$('construtor-campos').addEventListener('change', atualizaCampo);
$('construtor-campos').addEventListener('click', acaoCampo);
$('editais-lista').addEventListener('click', acaoEdital);
$('inscricoes-voltar').addEventListener('click', () => {
  mostraLista();
  carregaEditais();
});
$('inscricoes-filtro').addEventListener('change', renderInscricoes);
$('inscricoes-csv').addEventListener('click', exportaCsv);
$('inscricoes-lista').addEventListener('click', acaoInscricao);
$('inscricoes-lista').addEventListener('change', mudaSituacao);
$('resultado-preencher').addEventListener('click', preencheResultado);
$('resultado-salvar').addEventListener('click', salvaResultado);

// O admin.js avisa quando a sessão está pronta; se já avisou antes deste módulo carregar, usa a marca.
if (window.__painelPronto) carregaEditais();
document.addEventListener('painel:pronto', carregaEditais);
