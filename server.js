import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import { uploadDir } from './lib/uploads.js';

import authRouter from './routes/auth.js';
import publicoRouter from './routes/publico.js';
import publicacoesRouter from './routes/publicacoes.js';
import documentosRouter from './routes/documentos.js';
import membrosRouter from './routes/membros.js';
import categoriasRouter from './routes/categorias.js';
import configRouter from './routes/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3900;

migrate();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 dias
  })
);

app.use(express.static(path.join(__dirname, 'public')));
// Imagens de capa das publicações (documentos baixam por rota própria, para contar downloads).
app.use('/uploads', express.static(uploadDir));

app.use('/api/auth', authRouter);
app.use('/api/publico', publicoRouter);
app.use('/api/publicacoes', publicacoesRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api/membros', membrosRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/config', configRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ erro: err.message || 'Erro interno' });
});

app.listen(PORT, () => {
  console.log(`\n  Portal CPA rodando em http://localhost:${PORT}`);
  console.log(`  Painel administrativo:  http://localhost:${PORT}/admin.html\n`);
});
