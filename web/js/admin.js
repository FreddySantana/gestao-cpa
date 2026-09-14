// Painel administrativo — versão Supabase (Auth + Postgres + Storage).
import { sb, urlArquivo } from '/js/db.js';
import { esc, fmtData, fmtTamanho, mdParaHtml } from '/js/comum.js';

const $ = (id) => document.getElementById(id);

function msg(id, texto, tipo = 'ok') {
  const el = $(id);
  el.textContent = texto;
  el.className = `msg ${tipo}`;
  if (tipo === 'ok') setTimeout(() => (el.className = 'msg'), 3000);
}

function agora() {
  return new Date().toISOString();
}

const NOME_CAMPUS = { para: 'Pará', belem: 'Belém', ambos: 'Ambos' };
const COR_CAMPUS = { para: '#1743c7', belem: '#0f766e', ambos: '#5b6478' };

function seloCampus(campus) {
  return `<span class="selo cat" style="background:${COR_CAMPUS[campus] ?? '#5b6478'}">${NOME_CAMPUS[campus] ?? campus}</span>`;
}

// Sobe um arquivo para o bucket "cpa" e devolve o caminho salvo no banco.
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

function trataErro(error) {
  if (!error) return;
  if (error.code === '23505') throw new Error('Já existe um registro com esse nome.');
  throw new Error(error.message);
}

/* ---------- Sessão ---------- */
async function verificaSessao() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    $('tela-login').style.display = 'none';
    $('painel').classList.add('visivel');
    const nome = session.user.email.split('@')[0];
    $('ola').textContent = `Olá, ${nome}!`;
    carregaTudo();
  } else {
    $('tela-login').style.display = '';
    $('painel').classList.remove('visivel');
  }
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({
    email: $('login-email').value.trim(),
    password: $('login-senha').value,
  });
  if (error) return msg('login-msg', 'E-mail ou senha inválidos.', 'erro');
  verificaSessao();
});

$('sair').addEventListener('click', async (e) => {
  e.preventDefault();
  await sb.auth.signOut();
  location.reload();
});

/* ---------- Abas ---------- */
document.querySelectorAll('.lateral [data-aba]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.lateral [data-aba]').forEach((x) => x.classList.remove('ativo'));
    document.querySelectorAll('.aba').forEach((x) => x.classList.remove('visivel'));
    b.classList.add('ativo');
    $(`aba-${b.dataset.aba}`).classList.add('visivel');
  })
);

function carregaTudo() {
  carregaCategorias();
  carregaPublicacoes();
  carregaDocumentos();
  carregaMembros();
  carregaPeg();
  carregaConfig();
}

/* ---------- Categorias ---------- */
let categorias = [];

async function carregaCategorias() {
  const { data } = await sb.from('categorias').select('*, publicacoes(count)').order('ordem').order('nome');
  categorias = (data ?? []).map((c) => ({ ...c, total_publicacoes: c.publicacoes?.[0]?.count ?? 0 }));

  const opcoes = ['<option value="">Sem categoria</option>']
    .concat(categorias.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`))
    .join('');
  $('pub-categoria').innerHTML = opcoes;
  $('pub-filtro-categoria').innerHTML =
    '<option value="">Todas as categorias</option>' +
    categorias.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');

  $('cat-lista').innerHTML = categorias
    .map(
      (c) => `<tr>
        <td><span class="selo cat" style="background:${esc(c.cor)}">${esc(c.nome)}</span></td>
        <td>${c.total_publicacoes}</td>
        <td>${c.ordem}</td>
        <td>${c.ativa ? 'Sim' : 'Não'}</td>
        <td style="white-space:nowrap">
          <button class="btn mini claro" data-editar-cat="${c.id}">Editar</button>
          <button class="btn mini perigo" data-excluir-cat="${c.id}">Excluir</button>
        </td>
      </tr>`
    )
    .join('');

  $('cat-lista').querySelectorAll('[data-editar-cat]').forEach((b) =>
    b.addEventListener('click', () => editarCategoria(Number(b.dataset.editarCat)))
  );
  $('cat-lista').querySelectorAll('[data-excluir-cat]').forEach((b) =>
    b.addEventListener('click', async () => {
      const c = categorias.find((x) => x.id === Number(b.dataset.excluirCat));
      if (c.total_publicacoes > 0) {
        return msg('cat-msg', `Há ${c.total_publicacoes} publicação(ões) nesta categoria. Mova-as antes de excluir.`, 'erro');
      }
      if (!confirm('Excluir esta categoria?')) return;
      const { error } = await sb.from('categorias').delete().eq('id', c.id);
      if (error) return msg('cat-msg', error.message, 'erro');
      carregaCategorias();
    })
  );
}

function editarCategoria(id) {
  const c = categorias.find((x) => x.id === id);
  const nome = prompt('Nome da categoria:', c.nome);
  if (nome === null) return;
  const cor = prompt('Cor (hex):', c.cor) ?? c.cor;
  const ordem = prompt('Ordem:', c.ordem) ?? c.ordem;
  const ativa = confirm('Categoria ativa? (OK = sim, Cancelar = não)');
  sb.from('categorias')
    .update({ nome: nome.trim(), cor, ordem: Number(ordem) || 0, ativa })
    .eq('id', id)
    .then(({ error }) => {
      if (error) return msg('cat-msg', 'Já existe uma categoria com esse nome.', 'erro');
      carregaCategorias();
    });
}

$('form-categoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { error } = await sb.from('categorias').insert({
      nome: $('cat-nome').value.trim(),
      cor: $('cat-cor').value,
      ordem: Number($('cat-ordem').value) || 0,
    });
    trataErro(error);
    $('cat-nome').value = '';
    msg('cat-msg', 'Categoria criada!');
    carregaCategorias();
  } catch (err) {
    msg('cat-msg', err.message, 'erro');
  }
});

/* ---------- Publicações ---------- */
let pubEditando = null;
let pubAtual = null; // linha carregada no modal (capa, publicado_em…)

async function carregaPublicacoes() {
  let q = sb
    .from('publicacoes')
    .select('id,titulo,campus,destaque,publicado,publicado_em,visualizacoes,categorias(nome,cor)')
    .order('criado_em', { ascending: false });
  const busca = $('pub-busca').value.trim().replace(/[,()]/g, ' ').trim();
  if (busca) q = q.or(`titulo.ilike.%${busca}%,resumo.ilike.%${busca}%`);
  const categoria = $('pub-filtro-categoria').value;
  if (categoria) q = q.eq('categoria_id', Number(categoria));
  const situacao = $('pub-filtro-situacao').value;
  if (situacao === 'publicado') q = q.eq('publicado', true);
  if (situacao === 'rascunho') q = q.eq('publicado', false);
  const campus = $('pub-filtro-campus').value;
  if (campus) q = q.eq('campus', campus);

  const { data } = await q;
  const linhas = data ?? [];
  $('pub-vazio').style.display = linhas.length ? 'none' : '';
  $('pub-lista').innerHTML = linhas
    .map(
      (p) => `<tr>
        <td><strong>${esc(p.titulo)}</strong>${p.destaque ? ' <span class="selo destaque">Destaque</span>' : ''}</td>
        <td>${seloCampus(p.campus)}</td>
        <td>${p.categorias ? `<span class="selo cat" style="background:${esc(p.categorias.cor)}">${esc(p.categorias.nome)}</span>` : '—'}</td>
        <td>${p.publicado ? '<span class="selo pub">Publicada</span>' : '<span class="selo rasc">Rascunho</span>'}</td>
        <td>${fmtData(p.publicado_em) || '—'}</td>
        <td>${p.visualizacoes}</td>
        <td style="white-space:nowrap">
          <button class="btn mini claro" data-editar="${p.id}">Editar</button>
          <button class="btn mini perigo" data-excluir="${p.id}">Excluir</button>
        </td>
      </tr>`
    )
    .join('');

  $('pub-lista').querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => abreModalPublicacao(Number(b.dataset.editar)))
  );
  $('pub-lista').querySelectorAll('[data-excluir]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Excluir esta publicação e seus anexos?')) return;
      const id = Number(b.dataset.excluir);
      const { data: p } = await sb.from('publicacoes').select('capa, anexos(arquivo)').eq('id', id).single();
      const { error } = await sb.from('publicacoes').delete().eq('id', id);
      if (error) return alert(error.message);
      removeArquivo(p?.capa);
      (p?.anexos ?? []).forEach((a) => removeArquivo(a.arquivo));
      carregaPublicacoes();
      carregaCategorias();
    })
  );
}

['pub-busca', 'pub-filtro-categoria', 'pub-filtro-situacao', 'pub-filtro-campus'].forEach((id) => {
  let timer;
  $(id).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(carregaPublicacoes, 250);
  });
});

async function abreModalPublicacao(id = null) {
  pubEditando = id;
  pubAtual = null;
  fechaPrevia();
  $('form-pub').reset();
  $('pub-publicado').checked = true;
  $('pub-campus').value = 'ambos';
  $('pub-capa-previa').style.display = 'none';
  $('pub-remover-capa-wrap').style.display = 'none';
  $('pub-anexos-atuais').innerHTML = '';
  $('pub-msg').className = 'msg';
  $('pub-modal-titulo').textContent = id ? 'Editar publicação' : 'Nova publicação';

  if (id) {
    const { data: p } = await sb
      .from('publicacoes')
      .select('*, anexos(id,arquivo,nome_original,mime,tamanho)')
      .eq('id', id)
      .single();
    pubAtual = p;
    $('pub-titulo').value = p.titulo;
    $('pub-campus').value = p.campus ?? 'ambos';
    $('pub-categoria').value = p.categoria_id ?? '';
    $('pub-resumo').value = p.resumo;
    $('pub-conteudo').value = p.conteudo;
    $('pub-destaque').checked = !!p.destaque;
    $('pub-publicado').checked = !!p.publicado;
    if (p.capa) {
      $('pub-capa-previa').src = urlArquivo(p.capa);
      $('pub-capa-previa').style.display = '';
      $('pub-remover-capa-wrap').style.display = '';
    }
    $('pub-anexos-atuais').innerHTML = p.anexos
      .map(
        (a) => `<div class="anexo-item">📎 ${esc(a.nome_original)} <small>(${fmtTamanho(a.tamanho)})</small>
          <button type="button" class="btn mini perigo" data-anexo="${a.id}" data-arquivo="${esc(a.arquivo)}">Remover</button></div>`
      )
      .join('');
    $('pub-anexos-atuais').querySelectorAll('[data-anexo]').forEach((b) =>
      b.addEventListener('click', async () => {
        await sb.from('anexos').delete().eq('id', Number(b.dataset.anexo));
        removeArquivo(b.dataset.arquivo);
        b.closest('.anexo-item').remove();
      })
    );
  }
  $('modal-pub').classList.add('visivel');
}

/* Prévia: mostra a notícia como vai aparecer no portal, com os valores atuais do formulário. */
function fechaPrevia() {
  $('pub-previa').style.display = 'none';
  $('pub-campos').style.display = '';
  $('pub-ver-previa').textContent = '👁 Pré-visualizar';
}

function montaPrevia() {
  const cat = categorias.find((c) => String(c.id) === $('pub-categoria').value);
  const selo = cat ? `<span class="selo cat" style="background:${esc(cat.cor)}">${esc(cat.nome)}</span>` : '';

  const novaCapa = $('pub-capa').files[0];
  let capa = '';
  if (novaCapa) capa = URL.createObjectURL(novaCapa);
  else if (pubAtual?.capa && !$('pub-remover-capa').checked) capa = urlArquivo(pubAtual.capa);

  const anexos = [...$('pub-anexos-atuais').querySelectorAll('.anexo-item')].map((el) =>
    el.textContent.replace('Remover', '').trim()
  );
  for (const f of $('pub-anexos').files) anexos.push(`📎 ${f.name} (novo)`);

  const resumo = $('pub-resumo').value.trim();
  $('pub-previa').innerHTML = `
    <div class="previa-aviso">Prévia — é assim que a notícia vai aparecer no portal</div>
    <div class="previa-artigo">
      ${selo}
      <h1>${esc($('pub-titulo').value) || '(sem título)'}</h1>
      <div class="previa-meta">Publicado em ${fmtData(agora())} · 0 visualização(ões)</div>
      ${capa ? `<img class="previa-capa" src="${esc(capa)}" alt="">` : ''}
      ${resumo ? `<p class="previa-resumo">${esc(resumo)}</p>` : ''}
      <div class="previa-conteudo">${mdParaHtml($('pub-conteudo').value)}</div>
      ${anexos.length ? `<div class="previa-anexos"><strong>Anexos</strong>${anexos.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : ''}
    </div>`;
}

$('pub-ver-previa').addEventListener('click', () => {
  const mostrando = $('pub-previa').style.display !== 'none';
  if (mostrando) {
    fechaPrevia();
  } else {
    montaPrevia();
    $('pub-previa').style.display = '';
    $('pub-campos').style.display = 'none';
    $('pub-ver-previa').textContent = '✏️ Voltar a editar';
    $('modal-pub').scrollTop = 0;
  }
});

$('nova-publicacao').addEventListener('click', () => abreModalPublicacao());
$('pub-fechar').addEventListener('click', () => $('modal-pub').classList.remove('visivel'));
$('modal-pub').addEventListener('click', (e) => {
  if (e.target === $('modal-pub')) $('modal-pub').classList.remove('visivel');
});

$('form-pub').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const publicado = $('pub-publicado').checked;
    const dados = {
      titulo: $('pub-titulo').value.trim(),
      resumo: $('pub-resumo').value.trim(),
      conteudo: $('pub-conteudo').value,
      categoria_id: $('pub-categoria').value ? Number($('pub-categoria').value) : null,
      campus: $('pub-campus').value,
      destaque: $('pub-destaque').checked,
      publicado,
    };
    if (!dados.titulo) throw new Error('Informe o título.');
    if (publicado && !pubAtual?.publicado_em) dados.publicado_em = agora();

    // Capa: envia a nova antes de gravar; remove a antiga depois.
    const novaCapa = $('pub-capa').files[0];
    if (novaCapa) {
      dados.capa = await envia('capas', novaCapa);
      removeArquivo(pubAtual?.capa);
    } else if (pubEditando && $('pub-remover-capa').checked) {
      removeArquivo(pubAtual?.capa);
      dados.capa = null;
    }

    let id = pubEditando;
    if (pubEditando) {
      dados.atualizado_em = agora();
      const { error } = await sb.from('publicacoes').update(dados).eq('id', pubEditando);
      trataErro(error);
    } else {
      const { data, error } = await sb.from('publicacoes').insert(dados).select('id').single();
      trataErro(error);
      id = data.id;
    }

    for (const f of $('pub-anexos').files) {
      const caminho = await envia('anexos', f);
      const { error } = await sb.from('anexos').insert({
        publicacao_id: id,
        arquivo: caminho,
        nome_original: f.name,
        mime: f.type,
        tamanho: f.size,
      });
      trataErro(error);
    }

    $('modal-pub').classList.remove('visivel');
    carregaPublicacoes();
    carregaCategorias();
  } catch (err) {
    msg('pub-msg', err.message, 'erro');
  }
});

/* ---------- Documentos ---------- */
async function carregaDocumentos() {
  let q = sb.from('documentos').select('*').order('criado_em', { ascending: false });
  const busca = $('doc-busca').value.trim().replace(/[,()]/g, ' ').trim();
  if (busca) q = q.or(`titulo.ilike.%${busca}%,descricao.ilike.%${busca}%,nome_original.ilike.%${busca}%`);
  const { data } = await q;
  const docs = data ?? [];

  const pastas = [...new Set(docs.map((d) => d.pasta))].sort();
  $('lista-pastas').innerHTML = pastas.map((p) => `<option value="${esc(p)}">`).join('');
  $('doc-vazio').style.display = docs.length ? 'none' : '';
  $('doc-lista').innerHTML = docs
    .map(
      (d) => `<tr>
        <td><strong>${esc(d.titulo)}</strong><br><small style="color:var(--cinza)">${esc(d.nome_original)}</small></td>
        <td>${seloCampus(d.campus)}</td>
        <td>${esc(d.pasta)}</td>
        <td>${d.ano ?? '—'}</td>
        <td>${fmtTamanho(d.tamanho)}</td>
        <td>${d.downloads}</td>
        <td>${d.publicado ? 'Sim' : 'Não'}</td>
        <td style="white-space:nowrap">
          <a class="btn mini claro" href="${esc(urlArquivo(d.arquivo, d.nome_original))}" target="_blank" rel="noopener">Baixar</a>
          <button class="btn mini claro" data-editar-doc="${d.id}">Editar</button>
          <button class="btn mini perigo" data-excluir-doc="${d.id}">Excluir</button>
        </td>
      </tr>`
    )
    .join('');

  $('doc-lista').querySelectorAll('[data-editar-doc]').forEach((b) =>
    b.addEventListener('click', () => editarDocumento(docs.find((d) => d.id === Number(b.dataset.editarDoc))))
  );
  $('doc-lista').querySelectorAll('[data-excluir-doc]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Excluir este documento?')) return;
      const d = docs.find((x) => x.id === Number(b.dataset.excluirDoc));
      const { error } = await sb.from('documentos').delete().eq('id', d.id);
      if (error) return msg('doc-msg', error.message, 'erro');
      removeArquivo(d.arquivo);
      carregaDocumentos();
    })
  );
}

function editarDocumento(d) {
  const titulo = prompt('Título:', d.titulo);
  if (titulo === null) return;
  const pasta = prompt('Pasta:', d.pasta) ?? d.pasta;
  const ano = prompt('Ano (vazio = sem ano):', d.ano ?? '') ?? d.ano;
  const descricao = prompt('Descrição:', d.descricao) ?? d.descricao;
  let campus = (prompt('Portal (para, belem ou ambos):', d.campus) ?? d.campus).trim().toLowerCase();
  if (!['para', 'belem', 'ambos'].includes(campus)) campus = d.campus;
  const publicado = confirm('Visível no portal? (OK = sim, Cancelar = não)');
  sb.from('documentos')
    .update({
      titulo: titulo.trim() || d.titulo,
      pasta: pasta.trim() || 'Geral',
      ano: ano ? Number(ano) : null,
      descricao: String(descricao).trim(),
      campus,
      publicado,
    })
    .eq('id', d.id)
    .then(({ error }) => {
      if (error) return msg('doc-msg', error.message, 'erro');
      carregaDocumentos();
    });
}

$('form-doc').addEventListener('submit', async (e) => {
  e.preventDefault();
  const arquivo = $('doc-arquivo').files[0];
  if (!arquivo) return msg('doc-msg', 'Escolha um arquivo.', 'erro');
  try {
    const caminho = await envia('documentos', arquivo);
    const { error } = await sb.from('documentos').insert({
      titulo: $('doc-titulo').value.trim() || arquivo.name,
      descricao: $('doc-descricao').value.trim(),
      pasta: $('doc-pasta').value.trim() || 'Geral',
      ano: $('doc-ano').value ? Number($('doc-ano').value) : null,
      campus: $('doc-campus').value,
      arquivo: caminho,
      nome_original: arquivo.name,
      mime: arquivo.type,
      tamanho: arquivo.size,
    });
    trataErro(error);
    $('form-doc').reset();
    msg('doc-msg', 'Documento enviado!');
    carregaDocumentos();
  } catch (err) {
    msg('doc-msg', err.message, 'erro');
  }
});

let docTimer;
$('doc-busca').addEventListener('input', () => {
  clearTimeout(docTimer);
  docTimer = setTimeout(carregaDocumentos, 250);
});

/* ---------- Membros ---------- */
let membroEditando = null;
let membroAtual = null;

async function carregaMembros() {
  const { data } = await sb.from('membros').select('*').order('ordem').order('nome');
  const membros = data ?? [];
  $('membro-vazio').style.display = membros.length ? 'none' : '';
  $('membro-lista').innerHTML = membros
    .map(
      (m) => `<tr>
        <td>${
          m.foto
            ? `<img src="${esc(urlArquivo(m.foto))}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;display:block">`
            : '<span style="display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--azul-claro);color:var(--azul);font-size:13px;font-weight:700">' +
              esc(m.nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')) +
              '</span>'
        }</td>
        <td><strong>${esc(m.nome)}</strong>${m.bio ? `<br><small style="color:var(--cinza)">${esc(m.bio.slice(0, 60))}${m.bio.length > 60 ? '…' : ''}</small>` : ''}</td>
        <td>${seloCampus(m.campus)}</td>
        <td>${esc(m.funcao)}</td>
        <td>${esc(m.segmento)}</td>
        <td>${esc(m.email ?? '—')}</td>
        <td>${m.ordem}</td>
        <td>${m.ativo ? 'Sim' : 'Não'}</td>
        <td style="white-space:nowrap">
          <button class="btn mini claro" data-editar-membro="${m.id}">Editar</button>
          <button class="btn mini perigo" data-excluir-membro="${m.id}">Excluir</button>
        </td>
      </tr>`
    )
    .join('');

  $('membro-lista').querySelectorAll('[data-editar-membro]').forEach((b) =>
    b.addEventListener('click', () => editarMembro(membros.find((m) => m.id === Number(b.dataset.editarMembro))))
  );
  $('membro-lista').querySelectorAll('[data-excluir-membro]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Excluir este membro?')) return;
      const m = membros.find((x) => x.id === Number(b.dataset.excluirMembro));
      const { error } = await sb.from('membros').delete().eq('id', m.id);
      if (error) return msg('membro-msg', error.message, 'erro');
      removeArquivo(m.foto);
      if (membroEditando === m.id) limpaFormMembro();
      carregaMembros();
    })
  );
}

function limpaFormMembro() {
  membroEditando = null;
  membroAtual = null;
  $('form-membro').reset();
  $('membro-form-titulo').textContent = 'Adicionar membro';
  $('membro-salvar').textContent = 'Adicionar membro';
  $('membro-cancelar').style.display = 'none';
  $('membro-ativo-wrap').style.display = 'none';
  $('membro-foto-previa').style.display = 'none';
  $('membro-remover-foto-wrap').style.display = 'none';
}

function editarMembro(m) {
  membroEditando = m.id;
  membroAtual = m;
  $('membro-nome').value = m.nome;
  $('membro-campus').value = m.campus ?? 'para';
  $('membro-funcao').value = m.funcao;
  $('membro-segmento').value = m.segmento;
  $('membro-email').value = m.email ?? '';
  $('membro-ordem').value = m.ordem;
  $('membro-bio').value = m.bio ?? '';
  $('membro-ativo').checked = !!m.ativo;
  $('membro-foto').value = '';
  $('membro-remover-foto').checked = false;
  $('membro-form-titulo').textContent = `Editando: ${m.nome}`;
  $('membro-salvar').textContent = 'Salvar alterações';
  $('membro-cancelar').style.display = '';
  $('membro-ativo-wrap').style.display = '';
  if (m.foto) {
    $('membro-foto-previa').src = urlArquivo(m.foto);
    $('membro-foto-previa').style.display = '';
    $('membro-remover-foto-wrap').style.display = '';
  } else {
    $('membro-foto-previa').style.display = 'none';
    $('membro-remover-foto-wrap').style.display = 'none';
  }
  $('form-membro').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('membro-cancelar').addEventListener('click', limpaFormMembro);

$('form-membro').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const dados = {
      nome: $('membro-nome').value.trim(),
      campus: $('membro-campus').value,
      funcao: $('membro-funcao').value,
      segmento: $('membro-segmento').value,
      email: $('membro-email').value.trim() || null,
      ordem: Number($('membro-ordem').value) || 0,
      bio: $('membro-bio').value.trim(),
      ativo: membroEditando ? $('membro-ativo').checked : true,
    };
    if (!dados.nome) throw new Error('Informe o nome.');

    const novaFoto = $('membro-foto').files[0];
    if (novaFoto) {
      dados.foto = await envia('fotos', novaFoto);
      removeArquivo(membroAtual?.foto);
    } else if (membroEditando && $('membro-remover-foto').checked) {
      removeArquivo(membroAtual?.foto);
      dados.foto = null;
    }

    if (membroEditando) {
      const { error } = await sb.from('membros').update(dados).eq('id', membroEditando);
      trataErro(error);
      msg('membro-msg', 'Membro atualizado!');
    } else {
      const { error } = await sb.from('membros').insert(dados);
      trataErro(error);
      msg('membro-msg', 'Membro adicionado!');
    }
    limpaFormMembro();
    carregaMembros();
  } catch (err) {
    msg('membro-msg', err.message, 'erro');
  }
});

/* ---------- Links PEG ---------- */
let pegEditando = null;
let pegItens = [];

// Os links são editados como texto, uma linha "Nome do botão | https://url" cada.
function linksParaTexto(links) {
  return (links ?? []).map((l) => `${l.rotulo} | ${l.url}`).join('\n');
}

function textoParaLinks(texto) {
  const links = [];
  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim();
    if (!linha) continue;
    // Separa no primeiro "|": o nome não pode ter barra, mas a URL pode.
    const i = linha.indexOf('|');
    const rotulo = i >= 0 ? linha.slice(0, i).trim() : '';
    const url = (i >= 0 ? linha.slice(i + 1) : linha).trim();
    if (!/^https:\/\/\S+$/.test(url)) {
      throw new Error(`Link inválido (precisa começar com https://): ${url.slice(0, 60) || rotulo}`);
    }
    links.push({ rotulo: rotulo || 'Abrir relatório', url });
  }
  return links;
}

async function carregaPeg() {
  const { data, error } = await sb.from('peg_itens').select('*').order('pilar').order('ordem').order('numero');
  // Sem a tabela (migração ainda não rodada) a aba só mostra a instrução.
  pegItens = error ? [] : data ?? [];
  $('peg-vazio').style.display = pegItens.length ? 'none' : '';
  $('peg-lista').innerHTML = pegItens
    .map(
      (it) => `<tr>
        <td><strong>${it.numero}</strong></td>
        <td>${esc(it.titulo)}</td>
        <td>${esc(it.pilar)}</td>
        <td>${esc(it.categoria)}</td>
        <td>${it.links?.length ?? 0}</td>
        <td>${it.ativo ? 'Sim' : 'Não'}</td>
        <td style="white-space:nowrap">
          <button class="btn mini claro" data-editar-peg="${it.id}">Editar</button>
          <button class="btn mini perigo" data-excluir-peg="${it.id}">Excluir</button>
        </td>
      </tr>`
    )
    .join('');

  $('peg-lista').querySelectorAll('[data-editar-peg]').forEach((b) =>
    b.addEventListener('click', () => abreFormPeg(pegItens.find((x) => x.id === Number(b.dataset.editarPeg))))
  );
  $('peg-lista').querySelectorAll('[data-excluir-peg]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Excluir este item do PEG?')) return;
      const id = Number(b.dataset.excluirPeg);
      const { error: erro } = await sb.from('peg_itens').delete().eq('id', id);
      if (erro) return alert(erro.message);
      if (pegEditando === id) fechaFormPeg();
      carregaPeg();
    })
  );
}

function abreFormPeg(item = null) {
  pegEditando = item?.id ?? null;
  $('form-peg').reset();
  $('peg-msg').className = 'msg';
  $('peg-form-titulo').textContent = item ? `Editando item ${item.numero}` : 'Novo item';
  $('peg-numero').value = item?.numero ?? '';
  $('peg-pilar').value = item?.pilar ?? 'Excelência Acadêmica';
  $('peg-categoria').value = item?.categoria ?? 'Processo';
  $('peg-titulo').value = item?.titulo ?? '';
  $('peg-observacao').value = item?.observacao ?? '';
  $('peg-links').value = linksParaTexto(item?.links);
  $('peg-ordem').value = item?.ordem ?? 0;
  $('peg-ativo').checked = item ? !!item.ativo : true;
  $('peg-form-cartao').style.display = '';
  $('peg-form-cartao').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fechaFormPeg() {
  pegEditando = null;
  $('peg-form-cartao').style.display = 'none';
}

$('novo-peg').addEventListener('click', () => abreFormPeg());
$('peg-cancelar').addEventListener('click', fechaFormPeg);

$('form-peg').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const dados = {
      numero: Number($('peg-numero').value),
      pilar: $('peg-pilar').value.trim(),
      categoria: $('peg-categoria').value,
      titulo: $('peg-titulo').value.trim(),
      observacao: $('peg-observacao').value.trim(),
      links: textoParaLinks($('peg-links').value),
      ordem: Number($('peg-ordem').value) || 0,
      ativo: $('peg-ativo').checked,
      atualizado_em: agora(),
    };
    if (!dados.numero || !dados.pilar || !dados.titulo) throw new Error('Preencha número, pilar e título.');

    const { error } = pegEditando
      ? await sb.from('peg_itens').update(dados).eq('id', pegEditando)
      : await sb.from('peg_itens').insert(dados);
    if (error?.code === '23505') throw new Error(`Já existe o item ${dados.numero} no pilar ${dados.pilar}.`);
    trataErro(error);
    fechaFormPeg();
    carregaPeg();
  } catch (err) {
    msg('peg-msg', err.message, 'erro');
  }
});

/* ---------- Configurações ---------- */
const CHAVES_CFG = [
  'nome_portal',
  'subtitulo',
  'texto_sobre',
  'link_pesquisa',
  'texto_pesquisa',
  'email_contato',
  'email_biblioteca',
];

async function carregaConfig() {
  const site = $('cfg-site').value;
  const { data } = await sb.from('config').select('chave,valor').eq('site', site);
  const cfg = Object.fromEntries((data ?? []).map((l) => [l.chave, l.valor]));
  for (const chave of CHAVES_CFG) $(`cfg-${chave}`).value = cfg[chave] ?? '';
}

$('cfg-site').addEventListener('change', carregaConfig);

$('form-config').addEventListener('submit', async (e) => {
  e.preventDefault();
  const site = $('cfg-site').value;
  const linhas = CHAVES_CFG.map((chave) => ({ site, chave, valor: $(`cfg-${chave}`).value }));
  const { error } = await sb.from('config').upsert(linhas);
  if (error) return msg('cfg-msg', error.message, 'erro');
  msg('cfg-msg', `Configurações do portal ${site === 'para' ? 'Estácio Pará' : 'Estácio Belém'} salvas!`);
});

$('form-senha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nova = $('senha-nova').value;
  if (nova.length < 6) return msg('senha-msg', 'A nova senha precisa ter ao menos 6 caracteres.', 'erro');
  // Confere a senha atual reautenticando antes de trocar.
  const { data: { session } } = await sb.auth.getSession();
  const { error: erroAtual } = await sb.auth.signInWithPassword({
    email: session.user.email,
    password: $('senha-atual').value,
  });
  if (erroAtual) return msg('senha-msg', 'Senha atual incorreta.', 'erro');
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) return msg('senha-msg', error.message, 'erro');
  $('form-senha').reset();
  msg('senha-msg', 'Senha alterada!');
});

verificaSessao();
