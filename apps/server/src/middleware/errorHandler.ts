import type { ErrorRequestHandler, RequestHandler } from 'express';

import { env } from '../config/env';
import { HttpError } from '../utils/HttpError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Unexpected server error';

  res.status(statusCode).json({
    error: {
      message: statusCode === 500 && env.nodeEnv === 'production' ? 'Internal server error' : message,
      statusCode,
    },
  });
};
