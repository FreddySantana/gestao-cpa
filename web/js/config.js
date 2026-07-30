// Credenciais do projeto Supabase do Portal CPA.
// A anon key é pública por design: a segurança vem das políticas RLS (ver supabase/schema.sql).
// Preencha com os valores em: Painel do Supabase → Settings → API.

// Qual portal cada domínio mostra. Domínios fora da lista caem no PADRAO
// (útil para o *.netlify.app e o localhost durante o desenvolvimento).
export const CAMPUS_POR_DOMINIO = {
  'para.cpaestacio.com.br': 'para',
  'belem.cpaestacio.com.br': 'belem',
};
export const CAMPUS_PADRAO = 'para';
export const SUPABASE_URL = 'https://nzsjbakghksbuvammgtp.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56c2piYWtnaGtzYnV2YW1tZ3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDYwNjEsImV4cCI6MjEwMDkyMjA2MX0.f2lJs7JxrXwsM5bxhW8d48f8KrMiq8v5eNAQanshjzk';
