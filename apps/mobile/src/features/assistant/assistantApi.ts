import {
  assistantMessageResponseSchema,
  type AssistantMessageRequest,
  type AssistantMessageResponse,
} from '@intelligent-bistro/contracts';

import { postJson } from '@/src/lib/api';

export async function sendAssistantMessage(
  request: AssistantMessageRequest
): Promise<AssistantMessageResponse> {
  const response = await postJson<AssistantMessageResponse, AssistantMessageRequest>(
    '/api/assistant/message',
    request
  );

  return assistantMessageResponseSchema.parse(response);
}
