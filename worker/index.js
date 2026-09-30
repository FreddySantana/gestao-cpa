// Worker na frente dos arquivos estáticos. Só trata /api/acesso; todo o resto é servido
// direto da pasta web/ (assets), sem passar por aqui.
//
// O registro de acesso passa pelo servidor para pegar a localização aproximada que a
// Cloudflare informa (país, estado e cidade). Nada de IP, cookie ou identificação de pessoa.
const SUPABASE = 'https://nzsjbakghksbuvammgtp.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56c2piYWtnaGtzYnV2YW1tZ3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDYwNjEsImV4cCI6MjEwMDkyMjA2MX0.f2lJs7JxrXwsM5bxhW8d48f8KrMiq8v5eNAQanshjzk';

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : null) || null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/acesso') return new Response('Não encontrado', { status: 404 });
    if (request.method !== 'POST') return new Response('Método não permitido', { status: 405 });
    // Só aceita chamadas das próprias páginas.
    const origem = request.headers.get('Origin');
    if (origem && new URL(origem).host !== url.host) return new Response(null, { status: 403 });

    let corpo;
    try {
      corpo = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }

    const cf = request.cf ?? {};
    const envio = fetch(`${SUPABASE}/rest/v1/rpc/registra_acesso`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_campus: texto(corpo.campus, 10),
        p_pagina: texto(corpo.pagina, 60),
        p_ref: Number.isFinite(corpo.ref) ? corpo.ref : null,
        p_origem: texto(corpo.origem, 100),
        p_dispositivo: texto(corpo.dispositivo, 12),
        p_novo: corpo.novo === true,
        p_pais: texto(cf.country, 2),
        p_estado: texto(cf.regionCode ?? cf.region, 40),
        p_cidade: texto(cf.city, 60),
      }),
    }).catch(() => {});

    // Responde na hora; a gravação segue em segundo plano.
    ctx.waitUntil(envio);
    return new Response(null, { status: 204 });
  },
};
