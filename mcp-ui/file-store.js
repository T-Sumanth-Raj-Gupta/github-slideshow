const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'uploads.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ files: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{"files":[]}');
  return Array.isArray(parsed.files) ? parsed.files : [];
}

function writeStore(files) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify({ files }, null, 2));
}

function isTextType(name, mimeType) {
  const ext = path.extname(name || '').toLowerCase();
  const textExtensions = new Set(['.txt', '.md', '.json', '.csv', '.html', '.xml', '.yaml', '.yml', '.js', '.ts']);
  return textExtensions.has(ext) || (mimeType || '').startsWith('text/');
}

function normalizeUpload(file) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const raw = Buffer.from(file.base64 || '', 'base64');

  const content = isTextType(file.name, file.mimeType)
    ? { type: 'text', value: raw.toString('utf8') }
    : {
      type: 'binary',
      value: `Binary file (${file.mimeType || 'unknown'}) with ${raw.length} bytes`,
      base64Preview: raw.subarray(0, Math.min(raw.length, 160)).toString('base64')
    };

  return {
    id,
    createdAt: new Date().toISOString(),
    name: file.name,
    mimeType: file.mimeType || 'application/octet-stream',
    size: raw.length,
    content
  };
}

function addFiles(uploadedFiles) {
  const existing = readStore();
  const normalized = uploadedFiles.map(normalizeUpload);
  const next = existing.concat(normalized);
  writeStore(next);
  return normalized;
}

function listFiles() {
  return readStore();
}

function getFileById(id) {
  return readStore().find((file) => file.id === id);
}

module.exports = {
  DATA_FILE,
  addFiles,
  listFiles,
  getFileById
};
