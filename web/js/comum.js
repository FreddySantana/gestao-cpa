// Utilitários compartilhados entre as páginas do portal (versão Supabase).
import { urlArquivo } from './db.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function classeIcone(mime = '', nome = '') {
  const n = (nome || '').toLowerCase();
  if ((mime || '').includes('pdf') || n.endsWith('.pdf')) return ['pdf', 'PDF'];
  if ((mime || '').includes('word') || /\.docx?$/.test(n)) return ['doc', 'DOC'];
  if ((mime || '').includes('presentation') || (mime || '').includes('powerpoint') || /\.pptx?$/.test(n)) return ['ppt', 'PPT'];
  if ((mime || '').includes('sheet') || (mime || '').includes('excel') || /\.xlsx?$/.test(n)) return ['xls', 'XLS'];
  return ['doc', 'ARQ'];
}

// Converte o texto das publicações (markdown simplificado) em HTML seguro.
// Suporta: ## títulos, **negrito**, *itálico*, [link](url), ![descrição](url) para
// imagens, listas com "- " e > citação.
// Publicação dos dois portais com o nome certo da instituição: as marcações abaixo viram
// o nome do campus em que a notícia está sendo lida (com artigo: "a Faculdade" / "o Centro Universitário").
const TERMOS_CAMPUS = {
  para: { instituicao: 'Faculdade Estácio do Pará', a: 'a', da: 'da', na: 'na' },
  belem: { instituicao: 'Centro Universitário Estácio Belém', a: 'o', da: 'do', na: 'no' },
};
export function aplicaTermosCampus(texto, campus) {
  const t = TERMOS_CAMPUS[campus] ?? TERMOS_CAMPUS.para;
  return String(texto ?? '')
    .replaceAll('{{a_instituicao}}', `${t.a} ${t.instituicao}`)
    .replaceAll('{{da_instituicao}}', `${t.da} ${t.instituicao}`)
    .replaceAll('{{na_instituicao}}', `${t.na} ${t.instituicao}`)
    .replaceAll('{{instituicao}}', t.instituicao);
}

// Uma imagem na primeira linha do conteúdo toma o lugar da capa na página da notícia
// (a capa continua sendo usada no slider e nos cards). Útil para capa sem texto + arte com texto.
export function separaImagemInicial(texto = '') {
  const m = texto.match(/^\s*!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)[ \t]*(?:\r?\n|$)/);
  return m ? { alt: m[1], url: m[2], resto: texto.slice(m[0].length) } : { alt: '', url: null, resto: texto };
}

export function mdParaHtml(texto) {
  const linhas = esc(texto).split(/\r?\n/);
  const saida = [];
  let lista = null; // 'ul' | 'ol'
  let paragrafo = [];

  // A imagem vem antes do link: senão "![x](url)" casaria como link e sobraria o "!".
  const inline = (s) =>
    s
      .replace(
        /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
        '<img class="conteudo-img" src="$2" alt="$1" loading="lazy">'
      )
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Links internos do próprio portal, como [Inscreva-se](/edital?id=3).
      .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

  const fechaLista = () => {
    if (lista) {
      saida.push(`</${lista}>`);
      lista = null;
    }
  };
  const fechaParagrafo = () => {
    if (paragrafo.length) {
      saida.push(`<p>${paragrafo.join('<br>')}</p>`);
      paragrafo = [];
    }
  };

  for (const bruta of linhas) {
    const l = bruta.trim();
    if (!l) {
      fechaParagrafo();
      fechaLista();
      continue;
    }
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)/))) {
      fechaParagrafo();
      fechaLista();
      const nivel = Math.min(m[1].length, 4);
      saida.push(`<h${nivel}>${inline(m[2])}</h${nivel}>`);
    } else if ((m = l.match(/^-\s+(.*)/))) {
      fechaParagrafo();
      if (lista !== 'ul') {
        fechaLista();
        saida.push('<ul>');
        lista = 'ul';
      }
      saida.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = l.match(/^\d+[.)]\s+(.*)/))) {
      fechaParagrafo();
      if (lista !== 'ol') {
        fechaLista();
        saida.push('<ol>');
        lista = 'ol';
      }
      saida.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = l.match(/^&gt;\s?(.*)/))) {
      fechaParagrafo();
      fechaLista();
      saida.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`);
    } else {
      fechaLista();
      paragrafo.push(inline(l));
    }
  }
  fechaParagrafo();
  fechaLista();
  // Duas ou mais imagens seguidas (cada uma em seu parágrafo) viram uma galeria em grade;
  // clicar abre a foto inteira em outra aba.
  const soImagem = /^<p>(<img class="conteudo-img" src="([^"]+)"[^>]*>)<\/p>$/;
  const final = [];
  for (let i = 0; i < saida.length; ) {
    let j = i;
    while (j < saida.length && soImagem.test(saida[j])) j++;
    if (j - i >= 2) {
      const itens = saida.slice(i, j).map((p) => {
        const [, img, src] = p.match(soImagem);
        return `<a href="${src}" target="_blank" rel="noopener">${img}</a>`;
      });
      final.push(`<div class="galeria">${itens.join('')}</div>`);
      i = j;
    } else {
      final.push(saida[i]);
      i++;
    }
  }
  return final.join('\n');
}

// Preenche nome do portal, banner de pesquisa e rodapé a partir da config.
export function aplicaConfig(config) {
  document.querySelectorAll('[data-config]').forEach((el) => {
    const chave = el.dataset.config;
    if (config[chave]) el.textContent = config[chave];
  });
  const banner = document.getElementById('banner-pesquisa');
  if (banner) {
    if (config.link_pesquisa) {
      banner.style.display = '';
      banner.querySelector('strong').textContent = config.texto_pesquisa || 'Pesquisa de Avaliação Institucional';
      banner.querySelector('a').href = config.link_pesquisa;
    } else {
      banner.style.display = 'none';
    }
  }
  const btnPesquisa = document.getElementById('menu-pesquisa');
  if (btnPesquisa) {
    if (config.link_pesquisa) {
      btnPesquisa.style.display = '';
      btnPesquisa.href = config.link_pesquisa;
    } else {
      btnPesquisa.style.display = 'none';
    }
  }
  // Contatos do rodapé: só aparecem quando preenchidos nas configurações.
  aplicaContato('rodape-biblioteca', 'Biblioteca', config.email_biblioteca);
  aplicaContato('rodape-contato', 'Contato', config.email_contato);
}

function aplicaContato(id, rotulo, email) {
  const el = document.getElementById(id);
  if (!el) return;
  if (email) {
    el.href = `mailto:${email}`;
    el.textContent = `${rotulo}: ${email}`;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

export function cardPublicacao(p, grande = false) {
  const capa = p.capa
    ? `<img class="capa" src="${esc(urlArquivo(p.capa))}" alt="" loading="lazy">`
    : `<div class="capa-vazia">CPA</div>`;
  const cat = p.categoria_nome
    ? `<span class="etiqueta" style="background:${esc(p.categoria_cor || '#1d4ed8')}">${esc(p.categoria_nome)}</span>`
    : '';
  return `
    <article class="card${grande ? ' destaque-grande' : ''}">
      <a href="/publicacao?id=${p.id}">${capa}</a>
      <div class="corpo">
        <div>${cat}</div>
        <h3><a href="/publicacao?id=${p.id}">${esc(p.titulo)}</a></h3>
        <p class="resumo">${esc(p.resumo)}</p>
        <div class="meta">${fmtData(p.publicado_em)}</div>
      </div>
    </article>`;
}

export function itemDocumento(d) {
  const [cls, rotulo] = classeIcone(d.mime, d.nome_original);
  const detalhes = [d.pasta, d.ano, fmtTamanho(d.tamanho)].filter(Boolean).join(' · ');
  return `
    <div class="doc">
      <div class="icone ${cls}">${rotulo}</div>
      <div class="info">
        <strong>${esc(d.titulo)}</strong>
        <span>${esc(detalhes)}</span>
      </div>
      <a class="baixar" href="${esc(urlArquivo(d.arquivo, d.nome_original))}" data-conta-download="${d.id}" target="_blank" rel="noopener">Baixar</a>
    </div>`;
}
