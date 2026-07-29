import express from 'express';
import path from 'node:path';
import { db } from '../db.js';
import { exigeLogin } from '../lib/auth.js';
import { uploadDocumento, uploadDir, removeArquivo } from '../lib/uploads.js';

const router = express.Router();
router.use(exigeLogin);

router.get('/', (req, res) => {
  const { busca = '', pasta = '', ano = '' } = req.query;
  const cond = [];
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
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  res.json(db.prepare(`SELECT * FROM documentos ${where} ORDER BY criado_em DESC`).all(...params));
});

router.get('/pastas', (req, res) => {
  res.json(db.prepare('SELECT DISTINCT pasta FROM documentos ORDER BY pasta').all().map((l) => l.pasta));
});

router.post('/', uploadDocumento.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  const b = req.body ?? {};
  const titulo = String(b.titulo || '').trim() || Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const info = db
    .prepare(
      `INSERT INTO documentos (titulo, descricao, pasta, ano, arquivo, nome_original, mime, tamanho, publicado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      titulo,
      String(b.descricao || '').trim(),
      String(b.pasta || 'Geral').trim() || 'Geral',
      b.ano ? Number(b.ano) : null,
      req.file.filename,
      Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      req.file.mimetype,
      req.file.size,
      b.publicado === '0' ? 0 : 1
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  const b = req.body ?? {};
  db.prepare('UPDATE documentos SET titulo = ?, descricao = ?, pasta = ?, ano = ?, publicado = ? WHERE id = ?').run(
    String(b.titulo || doc.titulo).trim(),
    String(b.descricao ?? doc.descricao).trim(),
    String(b.pasta || doc.pasta).trim() || 'Geral',
    b.ano ? Number(b.ano) : null,
    b.publicado ? 1 : 0,
    id
  );
  res.json({ ok: true });
});

router.get('/:id/download', (req, res) => {
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(Number(req.params.id));
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  res.download(path.join(uploadDir, doc.arquivo), doc.nome_original);
});

router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(Number(req.params.id));
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  db.prepare('DELETE FROM documentos WHERE id = ?').run(doc.id);
  removeArquivo(doc.arquivo);
  res.json({ ok: true });
});

export default router;
