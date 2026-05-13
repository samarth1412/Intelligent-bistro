import cors from 'cors';
import express from 'express';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { aiRouter } from './routes/ai.routes';
import { healthRouter } from './routes/health.routes';
import { menuRouter } from './routes/menu.routes';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/ai', aiRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/menu', menuRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
