import { aiOrderRequestSchema } from '@intelligent-bistro/contracts';
import { Router } from 'express';

import { parseOrderRequest } from '../services/ai/orderParser.service';
import { HttpError } from '../utils/HttpError';

export const aiRouter = Router();

aiRouter.post('/order', async (req, res, next) => {
  try {
    const parsedRequest = aiOrderRequestSchema.safeParse(req.body);

    if (!parsedRequest.success) {
      throw new HttpError(400, parsedRequest.error.issues[0]?.message ?? 'Invalid AI order request');
    }

    const response = await parseOrderRequest(parsedRequest.data);

    res.json(response);
  } catch (error) {
    next(error);
  }
});
