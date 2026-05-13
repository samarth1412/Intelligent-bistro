import { z } from 'zod';

export const cartModifierSchema = z.string().trim().min(1);

export const cartLineSchema = z.object({
  itemId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  modifiers: z.array(cartModifierSchema).default([]),
});

export const addCartActionSchema = z.object({
  type: z.literal('add'),
  itemId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  modifiers: z.array(cartModifierSchema).default([]),
});

export const removeCartActionSchema = z.object({
  type: z.literal('remove'),
  itemId: z.string().trim().min(1),
  quantity: z.number().int().positive().optional(),
  modifiers: z.array(cartModifierSchema).default([]),
});

export const updateCartActionSchema = z
  .object({
    type: z.literal('update'),
    itemId: z.string().trim().min(1),
    quantity: z.number().int().positive().optional(),
    modifiers: z.array(cartModifierSchema).default([]),
  })
  .refine((action) => action.quantity !== undefined || action.modifiers.length > 0, {
    message: 'Update actions require a quantity or modifier change',
  });

export const clearCartActionSchema = z.object({
  type: z.literal('clear'),
});

export const queryCartActionSchema = z.object({
  type: z.literal('query'),
});

export const cartActionSchema = z.discriminatedUnion('type', [
  addCartActionSchema,
  removeCartActionSchema,
  updateCartActionSchema,
  clearCartActionSchema,
  queryCartActionSchema,
]);

export type CartLine = z.infer<typeof cartLineSchema>;
export type AddCartAction = z.infer<typeof addCartActionSchema>;
export type RemoveCartAction = z.infer<typeof removeCartActionSchema>;
export type UpdateCartAction = z.infer<typeof updateCartActionSchema>;
export type ClearCartAction = z.infer<typeof clearCartActionSchema>;
export type QueryCartAction = z.infer<typeof queryCartActionSchema>;
export type CartAction = z.infer<typeof cartActionSchema>;
