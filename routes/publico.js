import express from 'express';
import path from 'node:path';
import { db, todaConfig } from '../db.js';
import { uploadDir } from '../lib/uploads.js';

const router = express.Router();

const SELECT_PUB = `
  SELECT p.id, p.titulo, p.resumo, p.capa, p.destaque, p.publicado_em, p.visualizacoes,
         c.id AS categoria_id, c.nome AS categoria_nome, c.cor AS categoria_cor
  FROM publicacoes p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  WHERE p.publicado = 1
`;

// Tudo que a home precisa em uma chamada só.
router.get('/home', (req, res) => {
  const destaques = db.prepare(`${SELECT_PUB} AND p.destaque = 1 ORDER BY p.publicado_em DESC LIMIT 5`).all();
  const recentes = db.prepare(`${SELECT_PUB} ORDER BY p.publicado_em DESC LIMIT 12`).all();
  const categorias = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM publicacoes p WHERE p.categoria_id = c.id AND p.publicado = 1) AS total
       FROM categorias c WHERE c.ativa = 1 ORDER BY c.ordem, c.nome`
    )
    .all();
  const documentos = db
    .prepare('SELECT id, titulo, pasta, ano, nome_original, tamanho, criado_em FROM documentos WHERE publicado = 1 ORDER BY criado_em DESC LIMIT 6')
    .all();
  res.json({ config: todaConfig(), destaques, recentes, categorias, documentos });
});

router.get('/publicacoes', (req, res) => {
  const { busca = '', categoria = '', pagina = '1' } = req.query;
  const porPagina = 12;
  const cond = [];
  const params = [];
  if (busca) {
    cond.push('(p.titulo LIKE ? OR p.resumo LIKE ? OR p.conteudo LIKE ?)');
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  if (categoria) {
    cond.push('p.categoria_id = ?');
    params.push(Number(categoria));
  }
  const where = cond.length ? `AND ${cond.join(' AND ')}` : '';
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM publicacoes p WHERE p.publicado = 1 ${where}`)
    .get(...params);
  const offset = (Math.max(1, Number(pagina) || 1) - 1) * porPagina;
  const linhas = db
    .prepare(`${SELECT_PUB} ${where} ORDER BY p.publicado_em DESC LIMIT ? OFFSET ?`)
    .all(...params, porPagina, offset);
  res.json({ total, porPagina, publicacoes: linhas });
});

router.get('/publicacoes/:id', (req, res) => {
  const id = Number(req.params.id);
  const p = db
    .prepare(
      `SELECT p.*, c.nome AS categoria_nome, c.cor AS categoria_cor
       FROM publicacoes p LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.id = ? AND p.publicado = 1`
    )
    .get(id);
  if (!p) return res.status(404).json({ erro: 'Publicação não encontrada.' });
  db.prepare('UPDATE publicacoes SET visualizacoes = visualizacoes + 1 WHERE id = ?').run(id);
  p.anexos = db.prepare('SELECT id, nome_original, mime, tamanho FROM anexos WHERE publicacao_id = ? ORDER BY id').all(id);
  const mesma = db
    .prepare(`${SELECT_PUB} AND p.id != ? AND p.categoria_id = ? ORDER BY p.publicado_em DESC LIMIT 4`)
    .all(id, p.categoria_id ?? -1);
  res.json({ ...p, relacionadas: mesma });
});

router.get('/publicacoes/:id/anexos/:anexoId', (req, res) => {
  const a = db
    .prepare(
      `SELECT a.* FROM anexos a JOIN publicacoes p ON p.id = a.publicacao_id
       WHERE a.id = ? AND a.publicacao_id = ? AND p.publicado = 1`
    )
    .get(Number(req.params.anexoId), Number(req.params.id));
  if (!a) return res.status(404).json({ erro: 'Anexo não encontrado.' });
  res.download(path.join(uploadDir, a.arquivo), a.nome_original);
});

router.get('/documentos', (req, res) => {
  const { busca = '', pasta = '', ano = '' } = req.query;
  const cond = ['publicado = 1'];
  const params = [];
  if (busca) {
    cond.push('(titulo LIKE ? OR descricao LIKE ? OR nome_original LIKE ?)');
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  if (pasta) {
    cond.push('pasta = ?');
    params.push(pasta);
  }
  if (ano) {
    cond.push('ano = ?');
    params.push(Number(ano));
  }
  const linhas = db
    .prepare(
      `SELECT id, titulo, descricao, pasta, ano, nome_original, mime, tamanho, downloads, criado_em
       FROM documentos WHERE ${cond.join(' AND ')} ORDER BY pasta, ano DESC, criado_em DESC`
    )
    .all(...params);
  const pastas = db.prepare('SELECT DISTINCT pasta FROM documentos WHERE publicado = 1 ORDER BY pasta').all().map((l) => l.pasta);
  const anos = db
    .prepare('SELECT DISTINCT ano FROM documentos WHERE publicado = 1 AND ano IS NOT NULL ORDER BY ano DESC')
    .all()
    .map((l) => l.ano);
  res.json({ documentos: linhas, pastas, anos });
});

router.get('/documentos/:id/download', (req, res) => {
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ? AND publicado = 1').get(Number(req.params.id));
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  db.prepare('UPDATE documentos SET downloads = downloads + 1 WHERE id = ?').run(doc.id);
  res.download(path.join(uploadDir, doc.arquivo), doc.nome_original);
});

router.get('/quem-somos', (req, res) => {
  const membros = db
    .prepare('SELECT nome, funcao, segmento, email, bio, foto, ordem FROM membros WHERE ativo = 1 ORDER BY ordem, nome')
    .all();
  res.json({ config: todaConfig(), membros });
});

export default router;
