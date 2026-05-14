import { z } from 'zod';

import { cartLineSchema } from './cart';
import { menuItemsSchema } from './menu';

export const assistantIntentSchema = z.enum([
  'menu_question',
  'cart_update',
  'cart_question',
  'recommendation_request',
  'clarification_needed',
  'small_talk',
  'checkout_intent',
  'unknown',
]);

export const assistantConversationMessageSchema = z.object({
  content: z.string().trim().min(1),
  referencedItemIds: z.array(z.string().trim().min(1)).optional().default([]),
  role: z.enum(['assistant', 'user']),
});

const assistantCartActionBaseSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1),
});

export const assistantAddCartActionSchema = assistantCartActionBaseSchema.extend({
  type: z.literal('add'),
  itemId: z.string().trim().min(1),
  quantity: z.number().int().positive().optional().default(1),
  modifiers: z.array(z.string().trim().min(1)).optional().default([]),
});

export const assistantRemoveCartActionSchema = assistantCartActionBaseSchema.extend({
  type: z.literal('remove'),
  itemId: z.string().trim().min(1),
  quantity: z.number().int().positive().optional(),
  modifiers: z.array(z.string().trim().min(1)).optional().default([]),
});

export const assistantUpdateQuantityActionSchema = assistantCartActionBaseSchema.extend({
  type: z.literal('update_quantity'),
  itemId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  modifiers: z.array(z.string().trim().min(1)).optional().default([]),
});

export const assistantUpdateModifiersActionSchema = assistantCartActionBaseSchema.extend({
  type: z.literal('update_modifiers'),
  itemId: z.string().trim().min(1),
  modifiers: z.array(z.string().trim().min(1)).min(1),
});

export const assistantClearCartActionSchema = assistantCartActionBaseSchema.extend({
  type: z.literal('clear_cart'),
  itemId: z.string().trim().min(1).optional(),
});

export const assistantCartActionSchema = z.discriminatedUnion('type', [
  assistantAddCartActionSchema,
  assistantRemoveCartActionSchema,
  assistantUpdateQuantityActionSchema,
  assistantUpdateModifiersActionSchema,
  assistantClearCartActionSchema,
]);

export const assistantMessageRequestSchema = z.object({
  cart: z.array(cartLineSchema).optional().default([]),
  conversationHistory: z
    .array(assistantConversationMessageSchema)
    .max(12)
    .optional()
    .default([]),
  lastReferencedItemIds: z.array(z.string().trim().min(1)).optional().default([]),
  menu: menuItemsSchema.optional().default([]),
  message: z.string().trim().min(1, 'Message is required'),
});

export const assistantMessageResponseSchema = z.object({
  actions: z.array(assistantCartActionSchema).default([]),
  assistantMessage: z.string().trim().min(1),
  clarificationOptions: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1),
  intent: assistantIntentSchema,
  needsClarification: z.boolean().default(false),
  referencedItemIds: z.array(z.string().trim().min(1)).default([]),
});

export type AssistantIntent = z.infer<typeof assistantIntentSchema>;
export type AssistantConversationMessage = z.infer<
  typeof assistantConversationMessageSchema
>;
export type AssistantMessageRequest = z.infer<typeof assistantMessageRequestSchema>;
export type AssistantMessageResponse = z.infer<typeof assistantMessageResponseSchema>;
export type AssistantCartAction = z.infer<typeof assistantCartActionSchema>;
