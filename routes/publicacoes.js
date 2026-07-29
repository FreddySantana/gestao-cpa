import express from 'express';
import { db, transacao } from '../db.js';
import { exigeLogin } from '../lib/auth.js';
import { uploadPublicacao, removeArquivo } from '../lib/uploads.js';

const router = express.Router();
router.use(exigeLogin);

const SELECT_BASE = `
  SELECT p.*, c.nome AS categoria_nome, c.cor AS categoria_cor,
         (SELECT COUNT(*) FROM anexos a WHERE a.publicacao_id = p.id) AS total_anexos
  FROM publicacoes p
  LEFT JOIN categorias c ON c.id = p.categoria_id
`;

router.get('/', (req, res) => {
  const { busca = '', categoria = '', situacao = '' } = req.query;
  const cond = [];
  const params = [];
  if (busca) {
    cond.push('(p.titulo LIKE ? OR p.resumo LIKE ?)');
    params.push(`%${busca}%`, `%${busca}%`);
  }
  if (categoria) {
    cond.push('p.categoria_id = ?');
    params.push(Number(categoria));
  }
  if (situacao === 'publicado') cond.push('p.publicado = 1');
  if (situacao === 'rascunho') cond.push('p.publicado = 0');
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`${SELECT_BASE} ${where} ORDER BY p.criado_em DESC`).all(...params);
  res.json(linhas);
});

router.get('/:id', (req, res) => {
  const p = db.prepare(`${SELECT_BASE} WHERE p.id = ?`).get(Number(req.params.id));
  if (!p) return res.status(404).json({ erro: 'Publicação não encontrada.' });
  p.anexos = db.prepare('SELECT * FROM anexos WHERE publicacao_id = ? ORDER BY id').all(p.id);
  res.json(p);
});

const camposUpload = uploadPublicacao.fields([
  { name: 'capa', maxCount: 1 },
  { name: 'anexos', maxCount: 10 },
]);

function dadosDoCorpo(req) {
  const b = req.body ?? {};
  return {
    titulo: String(b.titulo || '').trim(),
    resumo: String(b.resumo || '').trim(),
    conteudo: String(b.conteudo || ''),
    categoria_id: b.categoria_id ? Number(b.categoria_id) : null,
    destaque: b.destaque === '1' || b.destaque === 1 || b.destaque === true ? 1 : 0,
    publicado: b.publicado === '1' || b.publicado === 1 || b.publicado === true ? 1 : 0,
  };
}

function insereAnexos(publicacaoId, files) {
  const ins = db.prepare(
    'INSERT INTO anexos (publicacao_id, arquivo, nome_original, mime, tamanho) VALUES (?, ?, ?, ?, ?)'
  );
  for (const f of files ?? []) {
    ins.run(publicacaoId, f.filename, Buffer.from(f.originalname, 'latin1').toString('utf8'), f.mimetype, f.size);
  }
}

router.post('/', camposUpload, (req, res) => {
  const d = dadosDoCorpo(req);
  if (!d.titulo) return res.status(400).json({ erro: 'Informe o título.' });
  const capa = req.files?.capa?.[0]?.filename ?? null;
  const r = transacao(() => {
    const info = db
      .prepare(
        `INSERT INTO publicacoes (titulo, resumo, conteudo, categoria_id, capa, destaque, publicado, publicado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now','localtime') END)`
      )
      .run(d.titulo, d.resumo, d.conteudo, d.categoria_id, capa, d.destaque, d.publicado, d.publicado);
    insereAnexos(Number(info.lastInsertRowid), req.files?.anexos);
    return info.lastInsertRowid;
  });
  res.status(201).json({ id: Number(r) });
});

router.put('/:id', camposUpload, (req, res) => {
  const id = Number(req.params.id);
  const atual = db.prepare('SELECT * FROM publicacoes WHERE id = ?').get(id);
  if (!atual) return res.status(404).json({ erro: 'Publicação não encontrada.' });
  const d = dadosDoCorpo(req);
  if (!d.titulo) return res.status(400).json({ erro: 'Informe o título.' });

  let capa = atual.capa;
  const novaCapa = req.files?.capa?.[0]?.filename;
  if (novaCapa) {
    removeArquivo(atual.capa);
    capa = novaCapa;
  } else if (req.body?.remover_capa === '1') {
    removeArquivo(atual.capa);
    capa = null;
  }

  transacao(() => {
    db.prepare(
      `UPDATE publicacoes SET titulo = ?, resumo = ?, conteudo = ?, categoria_id = ?, capa = ?,
         destaque = ?, publicado = ?, atualizado_em = datetime('now','localtime'),
         publicado_em = CASE WHEN ? = 1 AND publicado_em IS NULL THEN datetime('now','localtime') ELSE publicado_em END
       WHERE id = ?`
    ).run(d.titulo, d.resumo, d.conteudo, d.categoria_id, capa, d.destaque, d.publicado, d.publicado, id);
    insereAnexos(id, req.files?.anexos);
  });
  res.json({ ok: true });
});

router.delete('/:id/anexos/:anexoId', (req, res) => {
  const a = db
    .prepare('SELECT * FROM anexos WHERE id = ? AND publicacao_id = ?')
    .get(Number(req.params.anexoId), Number(req.params.id));
  if (!a) return res.status(404).json({ erro: 'Anexo não encontrado.' });
  db.prepare('DELETE FROM anexos WHERE id = ?').run(a.id);
  removeArquivo(a.arquivo);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM publicacoes WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ erro: 'Publicação não encontrada.' });
  const anexos = db.prepare('SELECT arquivo FROM anexos WHERE publicacao_id = ?').all(id);
  db.prepare('DELETE FROM publicacoes WHERE id = ?').run(id);
  removeArquivo(p.capa);
  anexos.forEach((a) => removeArquivo(a.arquivo));
  res.json({ ok: true });
});

export default router;
