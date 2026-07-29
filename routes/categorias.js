import express from 'express';
import { db } from '../db.js';
import { exigeLogin } from '../lib/auth.js';

const router = express.Router();
router.use(exigeLogin);

router.get('/', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM publicacoes p WHERE p.categoria_id = c.id) AS total_publicacoes
         FROM categorias c ORDER BY c.ordem, c.nome`
      )
      .all()
  );
});

router.post('/', (req, res) => {
  const b = req.body ?? {};
  const nome = String(b.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da categoria.' });
  try {
    const info = db
      .prepare('INSERT INTO categorias (nome, cor, ordem, ativa) VALUES (?, ?, ?, ?)')
      .run(nome, String(b.cor || '#1d4ed8'), Number(b.ordem) || 0, b.ativa === false ? 0 : 1);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch {
    res.status(400).json({ erro: 'Já existe uma categoria com esse nome.' });
  }
});

router.put('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM categorias WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ erro: 'Categoria não encontrada.' });
  const b = req.body ?? {};
  try {
    db.prepare('UPDATE categorias SET nome = ?, cor = ?, ordem = ?, ativa = ? WHERE id = ?').run(
      String(b.nome || c.nome).trim(),
      String(b.cor || c.cor),
      Number(b.ordem ?? c.ordem) || 0,
      b.ativa ? 1 : 0,
      c.id
    );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ erro: 'Já existe uma categoria com esse nome.' });
  }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM publicacoes WHERE categoria_id = ?').get(id);
  if (n > 0) return res.status(400).json({ erro: `Há ${n} publicação(ões) nesta categoria. Mova-as antes de excluir.` });
  db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
