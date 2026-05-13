import {
  aiOrderResponseSchema,
  type AiOrderRequest,
  type AiOrderResponse,
} from '@intelligent-bistro/contracts';

import { postJson } from '@/src/lib/api';

export async function parseAssistantOrder(request: AiOrderRequest): Promise<AiOrderResponse> {
  const response = await postJson<AiOrderResponse, AiOrderRequest>('/api/ai/order', request);

  return aiOrderResponseSchema.parse(response);
}
