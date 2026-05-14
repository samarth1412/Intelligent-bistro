import { z } from 'zod';

import { cartActionSchema, cartLineSchema } from './cart';

export const aiIntentSchema = z.enum([
  'cart_update',
  'cart_query',
  'menu_query',
  'clarification',
  'smalltalk',
  'unknown',
]);

export const aiErrorCodeSchema = z.enum([
  'ambiguous_item',
  'unknown_item',
  'unavailable_item',
  'validation_error',
]);

export const aiConversationMessageSchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string().trim().min(1),
});

export const aiOrderRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message is required'),
  cart: z.array(cartLineSchema).optional().default([]),
  history: z.array(aiConversationMessageSchema).max(12).optional().default([]),
});

export const aiOrderErrorSchema = z.object({
  code: aiErrorCodeSchema,
  message: z.string().min(1),
  suggestions: z.array(z.string()).optional(),
});

export const aiOrderResponseSchema = z.object({
  intent: aiIntentSchema,
  actions: z.array(cartActionSchema),
  assistantMessage: z.string().min(1),
  confidence: z.number().min(0).max(1),
  errors: z.array(aiOrderErrorSchema).optional().default([]),
});

export type AiIntent = z.infer<typeof aiIntentSchema>;
export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>;
export type AiConversationMessage = z.infer<typeof aiConversationMessageSchema>;
export type AiOrderRequest = z.infer<typeof aiOrderRequestSchema>;
export type AiOrderError = z.infer<typeof aiOrderErrorSchema>;
export type AiOrderResponse = z.infer<typeof aiOrderResponseSchema>;
