import { esc, fmtData, fmtTamanho, mdParaHtml } from '/js/comum.js';

const $ = (id) => document.getElementById(id);

async function api(url, opcoes = {}) {
  if (opcoes.json) {
    opcoes.body = JSON.stringify(opcoes.json);
    opcoes.headers = { 'Content-Type': 'application/json' };
    delete opcoes.json;
  }
  const r = await fetch(url, opcoes);
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
}

function msg(id, texto, tipo = 'ok') {
  const el = $(id);
  el.textContent = texto;
  el.className = `msg ${tipo}`;
  if (tipo === 'ok') setTimeout(() => (el.className = 'msg'), 3000);
}

/* ---------- Sessão ---------- */
async function verificaSessao() {
  const { usuario } = await api('/api/auth/eu');
  if (usuario) {
    $('tela-login').style.display = 'none';
    $('painel').classList.add('visivel');
    $('ola').textContent = `Olá, ${usuario.nome}!`;
    carregaTudo();
  } else {
    $('tela-login').style.display = '';
    $('painel').classList.remove('visivel');
  }
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/auth/login', { method: 'POST', json: { email: $('login-email').value, senha: $('login-senha').value } });
    verificaSessao();
  } catch (err) {
    msg('login-msg', err.message, 'erro');
  }
});

$('sair').addEventListener('click', async (e) => {
  e.preventDefault();
  await api('/api/auth/logout', { method: 'POST' });
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
  carregaConfig();
}

/* ---------- Categorias ---------- */
let categorias = [];

async function carregaCategorias() {
  categorias = await api('/api/categorias');
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
      if (!confirm('Excluir esta categoria?')) return;
      try {
        await api(`/api/categorias/${b.dataset.excluirCat}`, { method: 'DELETE' });
        carregaCategorias();
      } catch (err) {
        msg('cat-msg', err.message, 'erro');
      }
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
  api(`/api/categorias/${id}`, { method: 'PUT', json: { nome, cor, ordem, ativa } })
    .then(carregaCategorias)
    .catch((err) => msg('cat-msg', err.message, 'erro'));
}

$('form-categoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/categorias', {
      method: 'POST',
      json: { nome: $('cat-nome').value, cor: $('cat-cor').value, ordem: $('cat-ordem').value },
    });
    $('cat-nome').value = '';
    msg('cat-msg', 'Categoria criada!');
    carregaCategorias();
  } catch (err) {
    msg('cat-msg', err.message, 'erro');
  }
});

/* ---------- Publicações ---------- */
let pubEditando = null;
let pubCapaAtual = null;

async function carregaPublicacoes() {
  const q = new URLSearchParams({
    busca: $('pub-busca').value.trim(),
    categoria: $('pub-filtro-categoria').value,
    situacao: $('pub-filtro-situacao').value,
  });
  const linhas = await api(`/api/publicacoes?${q}`);
  $('pub-vazio').style.display = linhas.length ? 'none' : '';
  $('pub-lista').innerHTML = linhas
    .map(
      (p) => `<tr>
        <td><strong>${esc(p.titulo)}</strong>${p.destaque ? ' <span class="selo destaque">Destaque</span>' : ''}</td>
        <td>${p.categoria_nome ? `<span class="selo cat" style="background:${esc(p.categoria_cor)}">${esc(p.categoria_nome)}</span>` : '—'}</td>
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
      await api(`/api/publicacoes/${b.dataset.excluir}`, { method: 'DELETE' });
      carregaPublicacoes();
    })
  );
}

['pub-busca', 'pub-filtro-categoria', 'pub-filtro-situacao'].forEach((id) => {
  let timer;
  $(id).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(carregaPublicacoes, 250);
  });
});

async function abreModalPublicacao(id = null) {
  pubEditando = id;
  pubCapaAtual = null;
  fechaPrevia();
  $('form-pub').reset();
  $('pub-publicado').checked = true;
  $('pub-capa-previa').style.display = 'none';
  $('pub-remover-capa-wrap').style.display = 'none';
  $('pub-anexos-atuais').innerHTML = '';
  $('pub-msg').className = 'msg';
  $('pub-modal-titulo').textContent = id ? 'Editar publicação' : 'Nova publicação';

  if (id) {
    const p = await api(`/api/publicacoes/${id}`);
    $('pub-titulo').value = p.titulo;
    $('pub-categoria').value = p.categoria_id ?? '';
    $('pub-resumo').value = p.resumo;
    $('pub-conteudo').value = p.conteudo;
    $('pub-destaque').checked = !!p.destaque;
    $('pub-publicado').checked = !!p.publicado;
    pubCapaAtual = p.capa;
    if (p.capa) {
      $('pub-capa-previa').src = `/uploads/${p.capa}`;
      $('pub-capa-previa').style.display = '';
      $('pub-remover-capa-wrap').style.display = '';
    }
    $('pub-anexos-atuais').innerHTML = p.anexos
      .map(
        (a) => `<div class="anexo-item">📎 ${esc(a.nome_original)} <small>(${fmtTamanho(a.tamanho)})</small>
          <button type="button" class="btn mini perigo" data-anexo="${a.id}">Remover</button></div>`
      )
      .join('');
    $('pub-anexos-atuais').querySelectorAll('[data-anexo]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api(`/api/publicacoes/${id}/anexos/${b.dataset.anexo}`, { method: 'DELETE' });
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
  else if (pubCapaAtual && !$('pub-remover-capa').checked) capa = `/uploads/${pubCapaAtual}`;

  const anexos = [...$('pub-anexos-atuais').querySelectorAll('.anexo-item')].map((el) =>
    el.textContent.replace('Remover', '').trim()
  );
  for (const f of $('pub-anexos').files) anexos.push(`📎 ${f.name} (novo)`);

  const resumo = $('pub-resumo').value.trim();
  const hoje = fmtData(new Date().toISOString());
  $('pub-previa').innerHTML = `
    <div class="previa-aviso">Prévia — é assim que a notícia vai aparecer no portal</div>
    <div class="previa-artigo">
      ${selo}
      <h1>${esc($('pub-titulo').value) || '(sem título)'}</h1>
      <div class="previa-meta">Publicado em ${hoje} · 0 visualização(ões)</div>
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
  const fd = new FormData();
  fd.append('titulo', $('pub-titulo').value);
  fd.append('categoria_id', $('pub-categoria').value);
  fd.append('resumo', $('pub-resumo').value);
  fd.append('conteudo', $('pub-conteudo').value);
  fd.append('destaque', $('pub-destaque').checked ? '1' : '0');
  fd.append('publicado', $('pub-publicado').checked ? '1' : '0');
  if ($('pub-remover-capa').checked) fd.append('remover_capa', '1');
  const capa = $('pub-capa').files[0];
  if (capa) fd.append('capa', capa);
  for (const f of $('pub-anexos').files) fd.append('anexos', f);

  try {
    if (pubEditando) {
      await api(`/api/publicacoes/${pubEditando}`, { method: 'PUT', body: fd });
    } else {
      await api('/api/publicacoes', { method: 'POST', body: fd });
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
  const q = new URLSearchParams({ busca: $('doc-busca').value.trim() });
  const docs = await api(`/api/documentos?${q}`);
  const pastas = await api('/api/documentos/pastas');
  $('lista-pastas').innerHTML = pastas.map((p) => `<option value="${esc(p)}">`).join('');
  $('doc-vazio').style.display = docs.length ? 'none' : '';
  $('doc-lista').innerHTML = docs
    .map(
      (d) => `<tr>
        <td><strong>${esc(d.titulo)}</strong><br><small style="color:var(--cinza)">${esc(d.nome_original)}</small></td>
        <td>${esc(d.pasta)}</td>
        <td>${d.ano ?? '—'}</td>
        <td>${fmtTamanho(d.tamanho)}</td>
        <td>${d.downloads}</td>
        <td>${d.publicado ? 'Sim' : 'Não'}</td>
        <td style="white-space:nowrap">
          <a class="btn mini claro" href="/api/documentos/${d.id}/download">Baixar</a>
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
      await api(`/api/documentos/${b.dataset.excluirDoc}`, { method: 'DELETE' });
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
  const publicado = confirm('Visível no portal? (OK = sim, Cancelar = não)');
  api(`/api/documentos/${d.id}`, { method: 'PUT', json: { titulo, pasta, ano, descricao, publicado } })
    .then(carregaDocumentos)
    .catch((err) => msg('doc-msg', err.message, 'erro'));
}

$('form-doc').addEventListener('submit', async (e) => {
  e.preventDefault();
  const arquivo = $('doc-arquivo').files[0];
  if (!arquivo) return msg('doc-msg', 'Escolha um arquivo.', 'erro');
  const fd = new FormData();
  fd.append('arquivo', arquivo);
  fd.append('titulo', $('doc-titulo').value);
  fd.append('pasta', $('doc-pasta').value);
  fd.append('ano', $('doc-ano').value);
  fd.append('descricao', $('doc-descricao').value);
  try {
    await api('/api/documentos', { method: 'POST', body: fd });
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

async function carregaMembros() {
  const membros = await api('/api/membros');
  $('membro-vazio').style.display = membros.length ? 'none' : '';
  $('membro-lista').innerHTML = membros
    .map(
      (m) => `<tr>
        <td>${
          m.foto
            ? `<img src="/uploads/${esc(m.foto)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;display:block">`
            : '<span style="display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--azul-claro);color:var(--azul);font-size:13px;font-weight:700">' +
              esc(m.nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')) +
              '</span>'
        }</td>
        <td><strong>${esc(m.nome)}</strong>${m.bio ? `<br><small style="color:var(--cinza)">${esc(m.bio.slice(0, 60))}${m.bio.length > 60 ? '…' : ''}</small>` : ''}</td>
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
      await api(`/api/membros/${b.dataset.excluirMembro}`, { method: 'DELETE' });
      if (membroEditando === Number(b.dataset.excluirMembro)) limpaFormMembro();
      carregaMembros();
    })
  );
}

function limpaFormMembro() {
  membroEditando = null;
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
  $('membro-nome').value = m.nome;
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
    $('membro-foto-previa').src = `/uploads/${m.foto}`;
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
  const fd = new FormData();
  fd.append('nome', $('membro-nome').value);
  fd.append('funcao', $('membro-funcao').value);
  fd.append('segmento', $('membro-segmento').value);
  fd.append('email', $('membro-email').value);
  fd.append('ordem', $('membro-ordem').value);
  fd.append('bio', $('membro-bio').value);
  fd.append('ativo', membroEditando && !$('membro-ativo').checked ? '0' : '1');
  if ($('membro-remover-foto').checked) fd.append('remover_foto', '1');
  const foto = $('membro-foto').files[0];
  if (foto) fd.append('foto', foto);

  try {
    if (membroEditando) {
      await api(`/api/membros/${membroEditando}`, { method: 'PUT', body: fd });
      msg('membro-msg', 'Membro atualizado!');
    } else {
      await api('/api/membros', { method: 'POST', body: fd });
      msg('membro-msg', 'Membro adicionado!');
    }
    limpaFormMembro();
    carregaMembros();
  } catch (err) {
    msg('membro-msg', err.message, 'erro');
  }
});

/* ---------- Configurações ---------- */
const CHAVES_CFG = ['nome_portal', 'subtitulo', 'texto_sobre', 'link_pesquisa', 'texto_pesquisa', 'email_contato'];

async function carregaConfig() {
  const cfg = await api('/api/config');
  for (const chave of CHAVES_CFG) $(`cfg-${chave}`).value = cfg[chave] ?? '';
}

$('form-config').addEventListener('submit', async (e) => {
  e.preventDefault();
  const corpo = {};
  for (const chave of CHAVES_CFG) corpo[chave] = $(`cfg-${chave}`).value;
  try {
    await api('/api/config', { method: 'PUT', json: corpo });
    msg('cfg-msg', 'Configurações salvas!');
  } catch (err) {
    msg('cfg-msg', err.message, 'erro');
  }
});

$('form-senha').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/auth/senha', { method: 'POST', json: { atual: $('senha-atual').value, nova: $('senha-nova').value } });
    $('form-senha').reset();
    msg('senha-msg', 'Senha alterada!');
  } catch (err) {
    msg('senha-msg', err.message, 'erro');
  }
});

verificaSessao();
