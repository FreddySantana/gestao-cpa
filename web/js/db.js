// Cliente Supabase + acesso a dados compartilhado entre as páginas.
// supabase-js hospedado localmente (web/js/vendor) para evitar a viagem extra ao CDN.
import { createClient } from './vendor/supabase-bundle.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CAMPUS_POR_DOMINIO, CAMPUS_PADRAO } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Qual portal este acesso representa: o domínio decide; ?campus=belem força
// (fica na aba, via sessionStorage — útil para testar antes dos domínios).
// Nas páginas públicas um script inline já resolveu isso antes da primeira
// pintura e deixou o resultado no <html data-campus>; aqui só reaproveitamos.
function detectaCampus() {
  try {
    const jaResolvido = document.documentElement.dataset.campus;
    if (jaResolvido === 'para' || jaResolvido === 'belem') return jaResolvido;
    const forcado = new URLSearchParams(location.search).get('campus');
    if (forcado === 'para' || forcado === 'belem') {
      sessionStorage.setItem('campus-forcado', forcado);
      return forcado;
    }
    return sessionStorage.getItem('campus-forcado') || CAMPUS_POR_DOMINIO[location.hostname] || CAMPUS_PADRAO;
  } catch {
    return CAMPUS_PADRAO;
  }
}
export const CAMPUS = detectaCampus();

// Filtro padrão de conteúdo: o campus deste portal + o que vale para ambos.
export const CAMPUS_VISIVEIS = [CAMPUS, 'ambos'];

// Campos padrão de publicação com a categoria embutida.
export const SEL_PUB =
  'id,titulo,resumo,capa,destaque,publicado,publicado_em,visualizacoes,categoria_id,categorias(id,nome,cor)';

// URL pública de um arquivo no bucket "cpa". Com nomeDownload, o navegador baixa com esse nome.
export function urlArquivo(caminho, nomeDownload) {
  if (!caminho) return '';
  const base = `${SUPABASE_URL}/storage/v1/object/public/cpa/${caminho}`;
  return nomeDownload ? `${base}?download=${encodeURIComponent(nomeDownload)}` : base;
}

// Achata o join de categoria para o formato que os componentes usam.
export function normalizaPublicacao(p) {
  return {
    ...p,
    categoria_nome: p.categorias?.nome ?? null,
    categoria_cor: p.categorias?.cor ?? null,
  };
}

/* Cache local (stale-while-revalidate): renderiza na hora com a última resposta
   e atualiza por baixo quando o banco responder. */
export function cacheLe(chave) {
  try {
    return JSON.parse(localStorage.getItem(`cpa:${CAMPUS}:${chave}`));
  } catch {
    return null;
  }
}

export function cacheGrava(chave, valor) {
  try {
    localStorage.setItem(`cpa:${CAMPUS}:${chave}`, JSON.stringify(valor));
  } catch {
    /* armazenamento cheio/indisponível: segue sem cache */
  }
}

// Busca com cache: chama render() imediatamente com o cache (se houver) e de
// novo com os dados frescos — a menos que sejam idênticos aos do cache.
// Se a busca falhar (rede oscilou), o cache já exibido permanece na tela.
export async function comCache(chave, busca, render) {
  const antigo = cacheLe(chave);
  if (antigo != null) render(antigo, true);
  try {
    const fresco = await busca();
    cacheGrava(chave, fresco);
    if (antigo == null || JSON.stringify(antigo) !== JSON.stringify(fresco)) render(fresco, false);
  } catch (e) {
    // Sem cache para segurar a tela: repassa o erro para a página tratar.
    if (antigo == null) throw e;
    console.warn(`Atualização de "${chave}" falhou; mantendo cache.`, e);
  }
}

// Lança em caso de erro do PostgREST — para não confundir "falhou" com "não existe".
export function exigeDados({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function pegaConfig() {
  const data = exigeDados(await sb.from('config').select('chave,valor').eq('site', CAMPUS));
  return Object.fromEntries(data.map((l) => [l.chave, l.valor]));
}

export async function categoriasComTotal() {
  const data = exigeDados(
    await sb
      .from('categorias')
      .select('*, publicacoes(count)')
      .eq('ativa', true)
      .in('publicacoes.campus', CAMPUS_VISIVEIS)
      // Conta só as publicadas: logado no painel, as regras de acesso também
      // deixam passar rascunhos e despublicadas, e os números ficariam errados.
      .eq('publicacoes.publicado', true)
      .order('ordem')
      .order('nome')
  );
  return data.map((c) => ({ ...c, total: c.publicacoes?.[0]?.count ?? 0 }));
}

// Contador de downloads (dispara e segue; não bloqueia o clique).
export function contaDownload(id) {
  sb.rpc('incrementa_download', { doc_id: id }).then(() => {});
}

// Medidor de acessos (aba "Acessos" do painel). Anônimo: sem cookie, IP ou identificador;
// só uma marca local com a data da última visita, para contar visitantes por dia.
// Não conta o painel nem quem está logado nele neste navegador.
function registraAcesso() {
  try {
    if (navigator.webdriver || location.pathname.startsWith('/admin')) return;
    if (Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))) return;
    const pagina = (location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/').toLowerCase();
    const campus = location.hostname.startsWith('peg.') || pagina.startsWith('/peg') ? 'peg' : CAMPUS;
    const ref = Number(new URLSearchParams(location.search).get('id')) || null;
    let origem = 'direto';
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      origem = host === location.hostname ? 'interno' : host;
    }
    const celular = /Mobi|Android.+Mobile|iPhone/i.test(navigator.userAgent);
    const tablet = !celular && (/iPad|Android|Tablet/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100));
    const hoje = new Date().toLocaleDateString('en-CA');
    const novo = localStorage.getItem('cpa:ultima-visita') !== hoje;
    if (novo) localStorage.setItem('cpa:ultima-visita', hoje);
    sb.rpc('registra_acesso', {
      p_campus: campus,
      p_pagina: pagina,
      p_ref: ref,
      p_origem: origem,
      p_dispositivo: celular ? 'celular' : tablet ? 'tablet' : 'computador',
      p_novo: novo,
    }).then(() => {});
  } catch {
    // Medição nunca pode atrapalhar a página.
  }
}
setTimeout(registraAcesso, 800);

// Delegação: qualquer link com data-conta-download soma o contador ao ser clicado.
export function ativaContadorDownloads(raiz = document) {
  raiz.addEventListener('click', (e) => {
    const a = e.target.closest('[data-conta-download]');
    if (a) contaDownload(Number(a.dataset.contaDownload));
  });
}
