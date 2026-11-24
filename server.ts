import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './src/routes/auth.ts';
import { studentsRouter } from './src/routes/students.ts';
import { teacherRouter } from './src/routes/teacher.ts';
import { adminRouter } from './src/routes/admin.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

const LARGE_UPLOAD_PATHS = new Set([
  '/api/teacher/questions',
  '/api/ai/convert-homework',
]);

const defaultJsonParser = express.json({ limit: '256kb' });
const largeJsonParser = express.json({ limit: '6mb' });

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && LARGE_UPLOAD_PATHS.has(req.path)) {
    return largeJsonParser(req, res, next);
  }
  return defaultJsonParser(req, res, next);
});

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err && typeof err === 'object' && 'type' in err) {
    const errType = (err as { type?: string }).type;
    if (errType === 'entity.too.large') {
      return res.status(413).json({
        error: 'حجم داده‌های ارسالی بیش از حد مجاز است.',
      });
    }
    if (errType === 'entity.parse.failed') {
      return res.status(400).json({
        error: 'فرمت داده‌های ارسالی نامعتبر است.',
      });
    }
  }
  return next(err);
});

app.use('/api', authRouter);
app.use('/api', studentsRouter);
app.use('/api', teacherRouter);
app.use('/api', adminRouter);

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hero Students Land server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
