import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { exigeLogin } from '../lib/auth.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, senha } = req.body ?? {};
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }
  req.session.usuario = { id: u.id, nome: u.nome, email: u.email };
  res.json({ usuario: req.session.usuario });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/eu', (req, res) => {
  res.json({ usuario: req.session?.usuario ?? null });
});

router.post('/senha', exigeLogin, (req, res) => {
  const { atual, nova } = req.body ?? {};
  if (String(nova || '').length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter ao menos 6 caracteres.' });
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.session.usuario.id);
  if (!bcrypt.compareSync(String(atual || ''), u.senha_hash)) {
    return res.status(400).json({ erro: 'Senha atual incorreta.' });
  }
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(nova), 10), u.id);
  res.json({ ok: true });
});

export default router;
