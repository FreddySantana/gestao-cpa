import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const MIMES_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MIMES_DOCUMENTO = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

// Capa e anexos de publicações: imagens e documentos.
export const uploadPublicacao = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ([...MIMES_IMAGEM, ...MIMES_DOCUMENTO].includes(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido. Use imagens (JPG, PNG, WEBP, GIF) ou PDF/Office.'));
  },
});

// Foto dos membros da CPA: apenas imagens.
export const uploadFoto = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (MIMES_IMAGEM.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido. Use imagens JPG, PNG, WEBP ou GIF.'));
  },
});

// Repositório de documentos: PDF e Office.
export const uploadDocumento = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (MIMES_DOCUMENTO.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido. Use PDF, DOC, DOCX, PPT, PPTX, XLS ou XLSX.'));
  },
});

export function removeArquivo(nome) {
  if (!nome) return;
  fs.rm(path.join(uploadDir, nome), () => {});
}
