import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
export const dbPath = path.join(dataDir, 'cpa.db');

const conn = new DatabaseSync(dbPath);
conn.exec('PRAGMA foreign_keys = ON;');

export const db = {
  prepare: (...args) => conn.prepare(...args),
  exec: (...args) => conn.exec(...args),
  close: () => conn.close(),
};

// Executa uma função dentro de uma transação (rollback em caso de erro).
export function transacao(fn) {
  conn.exec('BEGIN');
  try {
    const r = fn();
    conn.exec('COMMIT');
    return r;
  } catch (e) {
    conn.exec('ROLLBACK');
    throw e;
  }
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      cor TEXT NOT NULL DEFAULT '#1d4ed8',
      ordem INTEGER NOT NULL DEFAULT 0,
      ativa INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS publicacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      resumo TEXT NOT NULL DEFAULT '',
      conteudo TEXT NOT NULL DEFAULT '',
      categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
      capa TEXT,
      destaque INTEGER NOT NULL DEFAULT 0,
      publicado INTEGER NOT NULL DEFAULT 0,
      publicado_em TEXT,
      visualizacoes INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS anexos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publicacao_id INTEGER NOT NULL REFERENCES publicacoes(id) ON DELETE CASCADE,
      arquivo TEXT NOT NULL,
      nome_original TEXT NOT NULL,
      mime TEXT,
      tamanho INTEGER
    );

    CREATE TABLE IF NOT EXISTS documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      pasta TEXT NOT NULL DEFAULT 'Geral',
      ano INTEGER,
      arquivo TEXT NOT NULL,
      nome_original TEXT NOT NULL,
      mime TEXT,
      tamanho INTEGER,
      publicado INTEGER NOT NULL DEFAULT 1,
      downloads INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS membros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      funcao TEXT NOT NULL DEFAULT 'Membro',
      segmento TEXT NOT NULL DEFAULT 'Docente',
      email TEXT,
      bio TEXT NOT NULL DEFAULT '',
      foto TEXT,
      ordem INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL DEFAULT ''
    );
  `);

  // Bancos criados antes da versão com foto/bio nos membros.
  const colunas = db.prepare('PRAGMA table_info(membros)').all().map((c) => c.name);
  if (!colunas.includes('bio')) db.exec("ALTER TABLE membros ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
  if (!colunas.includes('foto')) db.exec('ALTER TABLE membros ADD COLUMN foto TEXT');

  seedUsuario();
  seedCategorias();
  seedConfig();
}

function seedUsuario() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
  if (n > 0) return;
  const senha = process.env.ADMIN_SENHA || 'cpa123';
  db.prepare('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)').run(
    'Fred',
    'fredericochem@gmail.com',
    bcrypt.hashSync(senha, 10)
  );
  console.log(`  Usuário inicial: fredericochem@gmail.com / ${senha}  (troque depois em Configurações)`);
}

function seedCategorias() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM categorias').get();
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO categorias (nome, cor, ordem) VALUES (?, ?, ?)');
  [
    ['Institucional', '#1d4ed8'],
    ['Avaliação Institucional', '#7c3aed'],
    ['Resultados e Transparência', '#0f766e'],
    ['Melhorias Estruturais', '#b45309'],
    ['Serviços', '#be185d'],
    ['Oportunidades e Carreira', '#15803d'],
    ['Notícias e Eventos', '#dc2626'],
    ['Enade', '#4338ca'],
  ].forEach(([nome, cor], i) => ins.run(nome, cor, i));
}

function seedConfig() {
  const padrao = {
    nome_portal: 'Portal CPA · Estácio',
    subtitulo: 'Comissão Própria de Avaliação',
    texto_sobre:
      'A CPA — Comissão Própria de Avaliação é responsável por coordenar a autoavaliação institucional: da elaboração do método, passando pela implementação e sistematização dos resultados, até o Relatório Anual de Avaliação Institucional, que subsidia os planejamentos administrativo e pedagógico da Instituição.',
    link_pesquisa: '',
    texto_pesquisa: 'Pesquisa de Avaliação Institucional 2026',
    email_contato: '',
  };
  const ins = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
  for (const [chave, valor] of Object.entries(padrao)) ins.run(chave, valor);
}

export function getConfig(chave) {
  return db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor ?? '';
}

export function setConfig(chave, valor) {
  db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, String(valor ?? ''));
}

export function todaConfig() {
  const linhas = db.prepare('SELECT chave, valor FROM config').all();
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}
