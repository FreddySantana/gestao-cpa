import express from 'express';
import { db } from '../db.js';
import { exigeLogin } from '../lib/auth.js';
import { uploadFoto, removeArquivo } from '../lib/uploads.js';

const router = express.Router();
router.use(exigeLogin);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM membros ORDER BY ordem, nome').all());
});

// O formulário envia FormData (por causa da foto), então os campos chegam como texto.
function dadosDoCorpo(req, atual = {}) {
  const b = req.body ?? {};
  return {
    nome: String(b.nome ?? atual.nome ?? '').trim(),
    funcao: String(b.funcao ?? atual.funcao ?? 'Membro').trim() || 'Membro',
    segmento: String(b.segmento ?? atual.segmento ?? 'Docente').trim() || 'Docente',
    email: String(b.email ?? atual.email ?? '').trim() || null,
    bio: String(b.bio ?? atual.bio ?? '').trim(),
    ordem: Number(b.ordem ?? atual.ordem) || 0,
    ativo: b.ativo === '0' ? 0 : 1,
  };
}

router.post('/', uploadFoto.single('foto'), (req, res) => {
  const d = dadosDoCorpo(req);
  if (!d.nome) return res.status(400).json({ erro: 'Informe o nome.' });
  const info = db
    .prepare(
      'INSERT INTO membros (nome, funcao, segmento, email, bio, foto, ordem, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(d.nome, d.funcao, d.segmento, d.email, d.bio, req.file?.filename ?? null, d.ordem, d.ativo);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.put('/:id', uploadFoto.single('foto'), (req, res) => {
  const m = db.prepare('SELECT * FROM membros WHERE id = ?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ erro: 'Membro não encontrado.' });
  const d = dadosDoCorpo(req, m);
  if (!d.nome) return res.status(400).json({ erro: 'Informe o nome.' });

  let foto = m.foto;
  if (req.file) {
    removeArquivo(m.foto);
    foto = req.file.filename;
  } else if (req.body?.remover_foto === '1') {
    removeArquivo(m.foto);
    foto = null;
  }

  db.prepare(
    'UPDATE membros SET nome = ?, funcao = ?, segmento = ?, email = ?, bio = ?, foto = ?, ordem = ?, ativo = ? WHERE id = ?'
  ).run(d.nome, d.funcao, d.segmento, d.email, d.bio, foto, d.ordem, d.ativo, m.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM membros WHERE id = ?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ erro: 'Membro não encontrado.' });
  db.prepare('DELETE FROM membros WHERE id = ?').run(m.id);
  removeArquivo(m.foto);
  res.json({ ok: true });
});

export default router;
