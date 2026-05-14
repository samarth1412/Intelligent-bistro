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
    return sanitizeAiOrderResponse(rawResponse, request);
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

function sanitizeAiOrderResponse(
  response: AiOrderResponse,
  request: AiOrderRequest
): AiOrderResponse {
  const errors: AiOrderError[] = [...(response.errors ?? [])];
  const cartItemIds = new Set(request.cart.map((line) => line.itemId));
  let convertedMissingUpdate = false;
  const actions = response.actions.reduce<CartAction[]>((safeActions, action) => {
    if (!hasItemId(action)) {
      return [...safeActions, action];
    }

    const item = getMenuItemById(action.itemId);

    if (!item) {
      errors.push({
        code: 'unknown_item',
        message: `I could not find "${action.itemId}" on the menu.`,
      });
      return safeActions;
    }

    if (!item.available) {
      errors.push({
        code: 'unavailable_item',
        message: `${item.name} is currently unavailable.`,
        suggestions: getAvailableSuggestions(item.category),
      });
      return safeActions;
    }

    if (action.type === 'remove' && !cartItemIds.has(action.itemId)) {
      errors.push({
        code: 'validation_error',
        message: `${item.name} is not currently in the cart.`,
      });
      return safeActions;
    }

    if (action.type === 'update' && !cartItemIds.has(action.itemId)) {
      convertedMissingUpdate = true;
      return [
        ...safeActions,
        {
          itemId: action.itemId,
          modifiers: action.modifiers,
          quantity: action.quantity ?? 1,
          type: 'add',
        },
      ];
    }

    return [...safeActions, action];
  }, []);

  const hasErrors = errors.length > 0;
  const hasActions = actions.length > 0;
  const firstAction = actions[0];
  const assistantMessage =
    convertedMissingUpdate && actions.length === 1 && firstAction && hasItemId(firstAction)
      ? `Added ${getMenuItemById(firstAction.itemId)?.name ?? 'that item'} to your cart.`
      : hasErrors && !hasActions
        ? 'I could not confidently match that request to available cart items.'
        : response.assistantMessage;

  return aiOrderResponseSchema.parse({
    ...response,
    actions,
    assistantMessage,
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
  const isDevelopment = env.nodeEnv !== 'production';
  const detail = error instanceof Error ? error.message : 'Unknown AI parsing error';
  const fallbackParserResolvedRequest = response.actions.length > 0;

  return aiOrderResponseSchema.parse({
    ...response,
    confidence: Math.min(response.confidence, 0.82),
    errors: fallbackParserResolvedRequest
      ? response.errors
      : [
          ...(response.errors ?? []),
          {
            code: 'validation_error',
            message: isDevelopment
              ? `OpenAI parsing was unavailable, so the local parser handled this request. ${detail}`
              : 'The assistant used local order parsing for this request.',
          },
        ],
  });
}
