// Cliente Supabase + acesso a dados compartilhado entre as páginas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
