// Painel, aba Acessos: resumo anônimo das páginas vistas (tabela "acessos", função resumo_acessos).
import { sb } from '/js/db.js';
import { esc } from '/js/comum.js';

const $ = (id) => document.getElementById(id);
const NOME_PAGINA = {
  '/': 'Início',
  '/noticias': 'Notícias',
  '/publicacao': 'Publicações (leitura)',
  '/documentos': 'Documentos',
  '/editais': 'Editais (lista)',
  '/edital': 'Editais (leitura)',
  '/quem-somos': 'Quem Somos',
  '/peg': 'Links PEG',
};
const NOME_CAMPUS = { para: 'Estácio Pará', belem: 'Estácio Belém', peg: 'Links PEG' };
const NOME_DISPOSITIVO = { celular: 'Celular', tablet: 'Tablet', computador: 'Computador', desconhecido: 'Não identificado' };
const NOME_ORIGEM = { direto: 'Acesso direto (link salvo, digitado ou app)' };

const fmtNum = (n) => Number(n).toLocaleString('pt-BR');
const diaLocal = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Belem' });
const fmtDia = (iso, opcoes = { day: '2-digit', month: '2-digit' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', opcoes);

async function carrega() {
  const dias = Number($('acessos-periodo').value);
  const campus = $('acessos-campus').value || null;
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));
  $('acessos-msg').className = 'msg';
  $('acessos-conteudo').style.opacity = '0.5';
  const { data, error } = await sb.rpc('resumo_acessos', { p_desde: desde.toISOString(), p_campus: campus });
  $('acessos-conteudo').style.opacity = '';
  if (error) {
    $('acessos-msg').textContent = /resumo_acessos|function/i.test(error.message)
      ? 'O medidor ainda não está ativo: rode a migração supabase/migracao-acessos.sql no Supabase.'
      : error.message;
    $('acessos-msg').className = 'msg erro';
    return;
  }
  render(data, desde, dias);
}

function render(r, desde, dias) {
  // Série diária completa, com zero nos dias sem acesso.
  const porDia = new Map(r.por_dia.map((d) => [d.dia, d]));
  const serie = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    const chave = diaLocal(d);
    serie.push({ dia: chave, acessos: porDia.get(chave)?.acessos ?? 0, visitantes: porDia.get(chave)?.visitantes ?? 0 });
  }
  const pico = serie.reduce((a, b) => (b.acessos > a.acessos ? b : a), serie[0]);

  $('acessos-kpis').innerHTML = [
    ['Páginas vistas', fmtNum(r.total), `nos últimos ${dias} dias`],
    ['Visitantes', fmtNum(r.visitantes), 'navegadores diferentes por dia'],
    ['Páginas por visitante', r.visitantes ? (r.total / r.visitantes).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—', 'em média'],
    ['Dia com mais acessos', pico.acessos ? fmtDia(pico.dia) : '—', pico.acessos ? `${fmtNum(pico.acessos)} páginas vistas` : 'sem acessos no período'],
  ]
    .map(([rotulo, valor, sub]) => `<div class="kpi"><span>${rotulo}</span><strong>${valor}</strong><small>${sub}</small></div>`)
    .join('');

  graficoDias(serie);
  $('acessos-tabela').innerHTML = `<div class="tabela-wrap"><table>
    <thead><tr><th>Dia</th><th>Páginas vistas</th><th>Visitantes</th></tr></thead>
    <tbody>${serie
      .slice()
      .reverse()
      .map((d) => `<tr><td>${fmtDia(d.dia, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td>${fmtNum(d.acessos)}</td><td>${fmtNum(d.visitantes)}</td></tr>`)
      .join('')}</tbody></table></div>`;

  listaBarras('acessos-publicacoes', r.publicacoes.map((p) => ({
    rotulo: p.titulo ? `<a href="/publicacao?id=${p.id}" target="_blank" rel="noopener">${esc(p.titulo)}</a>` : `Publicação ${p.id} (excluída)`,
    n: p.n,
  })), 'Nenhuma publicação lida no período.');
  listaBarras('acessos-paginas', r.paginas.map((p) => ({ rotulo: esc(NOME_PAGINA[p.pagina] ?? p.pagina), n: p.n })));
  listaBarras('acessos-origens', r.origens.map((o) => ({ rotulo: esc(NOME_ORIGEM[o.origem] ?? o.origem), n: o.n })),
    'Sem visitas vindas de fora no período.');
  listaBarras('acessos-dispositivos', r.dispositivos.map((d) => ({ rotulo: NOME_DISPOSITIVO[d.dispositivo] ?? esc(d.dispositivo), n: d.n })),
    'Sem visitantes no período.', true);
  listaBarras('acessos-editais', r.editais.map((e) => ({
    rotulo: e.titulo ? `<a href="/edital?id=${e.id}" target="_blank" rel="noopener">${esc(e.titulo)}</a>` : `Edital ${e.id} (excluído)`,
    n: e.n,
  })), 'Nenhum edital visto no período.');
  listaBarras('acessos-campi', r.campi.map((c) => ({ rotulo: NOME_CAMPUS[c.campus] ?? esc(c.campus), n: c.n })), undefined, true);
}

// Lista com barra horizontal proporcional ao maior valor (uma cor só: é magnitude, não identidade).
function listaBarras(id, itens, vazio = 'Sem acessos no período.', comPercentual = false) {
  if (!itens.length) {
    $(id).innerHTML = `<p class="vazio-lista">${vazio}</p>`;
    return;
  }
  const max = Math.max(...itens.map((i) => i.n));
  const soma = itens.reduce((s, i) => s + i.n, 0);
  $(id).innerHTML = `<ol class="barras">${itens
    .map((i) => {
      const extra = comPercentual ? ` <small>${Math.round((i.n / soma) * 100)}%</small>` : '';
      return `<li><div class="barras-rotulo"><span>${i.rotulo}</span><b>${fmtNum(i.n)}${extra}</b></div>
        <div class="barras-trilho"><div class="barras-valor" style="width:${Math.max(2, (i.n / max) * 100)}%"></div></div></li>`;
    })
    .join('')}</ol>`;
}

// Colunas por dia em SVG: base no zero, grade discreta, dica ao passar o mouse.
function graficoDias(serie) {
  const L = 760, A = 220, m = { t: 14, r: 8, b: 26, l: 36 };
  const w = L - m.l - m.r, h = A - m.t - m.b;
  const maxBruto = Math.max(1, ...serie.map((d) => d.acessos));
  const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((p) => maxBruto / p <= 4) ?? 10000;
  const max = Math.ceil(maxBruto / passo) * passo;
  const y = (v) => m.t + h - (v / max) * h;
  const faixa = w / serie.length;
  const larg = Math.max(2, Math.min(28, faixa - 2));
  const cadaRotulo = Math.ceil(serie.length / 7);

  let svg = '';
  for (let v = 0; v <= max; v += passo) {
    svg += `<line x1="${m.l}" x2="${L - m.r}" y1="${y(v)}" y2="${y(v)}" class="${v ? 'grade' : 'eixo'}"/>
      <text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="rotulo-eixo">${fmtNum(v)}</text>`;
  }
  serie.forEach((d, i) => {
    const x = m.l + i * faixa + (faixa - larg) / 2;
    if (d.acessos) {
      const topo = y(d.acessos), alt = m.t + h - topo, r = Math.min(4, larg / 2, alt);
      // Topo arredondado, base reta no zero.
      svg += `<path class="coluna" d="M${x},${m.t + h} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + larg - r} Q${x + larg},${topo} ${x + larg},${topo + r} V${m.t + h} Z"/>`;
    }
    if (i % cadaRotulo === 0 || i === serie.length - 1) {
      svg += `<text x="${m.l + i * faixa + faixa / 2}" y="${A - 8}" text-anchor="middle" class="rotulo-eixo">${fmtDia(d.dia)}</text>`;
    }
    svg += `<rect class="alvo" data-i="${i}" x="${m.l + i * faixa}" y="${m.t}" width="${faixa}" height="${h}"/>`;
  });

  $('acessos-grafico').innerHTML = `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Páginas vistas por dia">${svg}</svg><div class="dica-grafico" hidden></div>`;
  const dica = $('acessos-grafico').querySelector('.dica-grafico');
  const caixa = $('acessos-grafico');
  caixa.querySelectorAll('.alvo').forEach((alvo) => {
    alvo.addEventListener('mouseenter', () => {
      const d = serie[Number(alvo.dataset.i)];
      dica.innerHTML = `<strong>${fmtDia(d.dia, { weekday: 'short', day: '2-digit', month: '2-digit' })}</strong><br>${fmtNum(d.acessos)} páginas vistas<br>${fmtNum(d.visitantes)} visitantes`;
      dica.hidden = false;
      alvo.classList.add('ativo');
    });
    alvo.addEventListener('mousemove', (ev) => {
      const r = caixa.getBoundingClientRect();
      const x = Math.min(ev.clientX - r.left + 12, r.width - dica.offsetWidth - 4);
      dica.style.left = `${Math.max(4, x)}px`;
      dica.style.top = `${ev.clientY - r.top - dica.offsetHeight - 10}px`;
    });
    alvo.addEventListener('mouseleave', () => {
      dica.hidden = true;
      alvo.classList.remove('ativo');
    });
  });
}

$('acessos-periodo').addEventListener('change', carrega);
$('acessos-campus').addEventListener('change', carrega);
// Só consulta quando a aba é aberta (e a cada nova abertura, para atualizar).
document.querySelector('.lateral [data-aba="acessos"]').addEventListener('click', carrega);
