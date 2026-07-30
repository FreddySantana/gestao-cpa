// Cliente Supabase + acesso a dados compartilhado entre as páginas.
// supabase-js hospedado localmente (web/js/vendor) para evitar a viagem extra ao CDN.
import { createClient } from './vendor/supabase-bundle.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    return JSON.parse(localStorage.getItem(`cpa:${chave}`));
  } catch {
    return null;
  }
}

export function cacheGrava(chave, valor) {
  try {
    localStorage.setItem(`cpa:${chave}`, JSON.stringify(valor));
  } catch {
    /* armazenamento cheio/indisponível: segue sem cache */
  }
}

// Busca com cache: chama render() imediatamente com o cache (se houver) e de
// novo com os dados frescos — a menos que sejam idênticos aos do cache.
export async function comCache(chave, busca, render) {
  const antigo = cacheLe(chave);
  if (antigo != null) render(antigo, true);
  const fresco = await busca();
  cacheGrava(chave, fresco);
  if (antigo == null || JSON.stringify(antigo) !== JSON.stringify(fresco)) render(fresco, false);
}

export async function pegaConfig() {
  const { data } = await sb.from('config').select('chave,valor');
  return Object.fromEntries((data ?? []).map((l) => [l.chave, l.valor]));
}

export async function categoriasComTotal() {
  const { data } = await sb
    .from('categorias')
    .select('*, publicacoes(count)')
    .eq('ativa', true)
    .order('ordem')
    .order('nome');
  return (data ?? []).map((c) => ({ ...c, total: c.publicacoes?.[0]?.count ?? 0 }));
}

// Contador de downloads (dispara e segue; não bloqueia o clique).
export function contaDownload(id) {
  sb.rpc('incrementa_download', { doc_id: id }).then(() => {});
}

// Delegação: qualquer link com data-conta-download soma o contador ao ser clicado.
export function ativaContadorDownloads(raiz = document) {
  raiz.addEventListener('click', (e) => {
    const a = e.target.closest('[data-conta-download]');
    if (a) contaDownload(Number(a.dataset.contaDownload));
  });
}
