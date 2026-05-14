import { assistantMessageRequestSchema } from '@intelligent-bistro/contracts';
import { Router } from 'express';

import { handleAssistantMessage } from '../services/assistant/assistant.service';
import { HttpError } from '../utils/HttpError';

export const assistantRouter = Router();

assistantRouter.post('/message', async (req, res, next) => {
  try {
    const parsedRequest = assistantMessageRequestSchema.safeParse(req.body);

    if (!parsedRequest.success) {
      throw new HttpError(
        400,
        parsedRequest.error.issues[0]?.message ?? 'Invalid assistant message request'
      );
    }

    const response = await handleAssistantMessage(parsedRequest.data);

    res.json(response);
  } catch (error) {
    next(error);
  }
});
