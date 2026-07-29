import express from 'express';
import { setConfig, todaConfig } from '../db.js';
import { exigeLogin } from '../lib/auth.js';

const router = express.Router();
router.use(exigeLogin);

const CHAVES = ['nome_portal', 'subtitulo', 'texto_sobre', 'link_pesquisa', 'texto_pesquisa', 'email_contato'];

router.get('/', (req, res) => {
  res.json(todaConfig());
});

router.put('/', (req, res) => {
  const b = req.body ?? {};
  for (const chave of CHAVES) {
    if (chave in b) setConfig(chave, b[chave]);
  }
  res.json({ ok: true });
});

export default router;
