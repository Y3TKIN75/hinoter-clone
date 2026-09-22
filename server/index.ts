import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { router } from './routes.js';
import { verifyModels, HAS_API_KEY, STT_MODEL, CHAT_MODEL, LLM_INPUT_BUDGET, modelWarnings } from './groq.js';
import { DATA_DIR } from './db.js';
import { recoverStuckJobs } from './summarize.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use('/api', router);

// Üretimde istemci build'ini de aynı sunucudan sun.
const clientDist = path.join(import.meta.dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Hata yakalayıcı (multer boyut hataları dâhil).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const e = err as { code?: string; message?: string; status?: number };
  if (e?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Dosya boyut sınırını aşıyor' });
  console.error('[server]', err);
  res.status(e?.status ?? 500).json({ error: e?.message ?? 'Sunucu hatası' });
});

app.listen(PORT, async () => {
  console.log(`API: http://localhost:${PORT}/api  (veri: ${DATA_DIR})`);
  console.log(`STT: ${STT_MODEL} | LLM: ${CHAT_MODEL} | LLM_INPUT_BUDGET: ${LLM_INPUT_BUDGET}`);
  if (!HAS_API_KEY) console.warn('UYARI: GROQ_API_KEY tanımlı değil. .env.example dosyasını .env olarak kopyalayıp anahtarınızı girin.');
  await verifyModels();
  for (const w of modelWarnings) console.warn('UYARI:', w);
  if (HAS_API_KEY) recoverStuckJobs();
});
