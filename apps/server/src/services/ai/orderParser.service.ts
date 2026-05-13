import {
  aiOrderResponseSchema,
  type AiOrderError,
  type AiOrderRequest,
  type AiOrderResponse,
  type CartAction,
  type MenuItem,
} from '@intelligent-bistro/contracts';
import OpenAI from 'openai';

import { env } from '../../config/env';
import { getMenuItemById, getMenuItems } from '../menu.service';
import { parseOrderWithFallback } from './fallbackOrderParser.service';
import { buildOrderParserMessages } from './orderPrompt';

let openaiClient: OpenAI | undefined;

export async function parseOrderRequest(request: AiOrderRequest): Promise<AiOrderResponse> {
  if (!env.openaiApiKey) {
    return parseOrderWithFallback(request);
  }

  try {
    const rawResponse = await requestOpenAiOrderParse(request, getMenuItems());
    return sanitizeAiOrderResponse(rawResponse);
  } catch (error) {
    return withFallbackError(parseOrderWithFallback(request), error);
  }
}

async function requestOpenAiOrderParse(
  request: AiOrderRequest,
  menuItems: MenuItem[]
): Promise<AiOrderResponse> {
  const client = getOpenAiClient();
  const completion = await client.chat.completions.create({
    messages: buildOrderParserMessages(request, menuItems),
    model: env.openaiModel,
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message.content;

  if (!content) {
    throw new Error('OpenAI returned an empty order parsing response');
  }

  return aiOrderResponseSchema.parse(JSON.parse(content));
}

function getOpenAiClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  return openaiClient;
}

function sanitizeAiOrderResponse(response: AiOrderResponse): AiOrderResponse {
  const errors: AiOrderError[] = [...(response.errors ?? [])];
  const actions = response.actions.filter((action) => {
    if (!hasItemId(action)) {
      return true;
    }

    const item = getMenuItemById(action.itemId);

    if (!item) {
      errors.push({
        code: 'unknown_item',
        message: `I could not find "${action.itemId}" on the menu.`,
      });
      return false;
    }

    if (!item.available) {
      errors.push({
        code: 'unavailable_item',
        message: `${item.name} is currently unavailable.`,
        suggestions: getAvailableSuggestions(item.category),
      });
      return false;
    }

    return true;
  });

  const hasErrors = errors.length > 0;
  const hasActions = actions.length > 0;

  return aiOrderResponseSchema.parse({
    ...response,
    actions,
    assistantMessage:
      hasErrors && !hasActions
        ? 'I could not confidently match that request to available menu items.'
        : response.assistantMessage,
    confidence: hasErrors ? Math.min(response.confidence, 0.65) : response.confidence,
    errors,
    intent: hasErrors && !hasActions ? 'clarification' : response.intent,
  });
}

function hasItemId(action: CartAction): action is CartAction & { itemId: string } {
  return 'itemId' in action;
}

function getAvailableSuggestions(category: MenuItem['category']) {
  return getMenuItems(category)
    .filter((item) => item.available)
    .slice(0, 3)
    .map((item) => item.name);
}

function withFallbackError(response: AiOrderResponse, error: unknown): AiOrderResponse {
  const message = error instanceof Error ? error.message : 'Unknown AI parsing error';

  return aiOrderResponseSchema.parse({
    ...response,
    confidence: Math.min(response.confidence, 0.82),
    errors: [
      ...(response.errors ?? []),
      {
        code: 'validation_error',
        message: `OpenAI parsing failed, so the deterministic fallback parser was used. ${message}`,
      },
    ],
  });
}
