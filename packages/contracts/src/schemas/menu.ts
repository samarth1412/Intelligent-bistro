import { z } from 'zod';

export const menuCategories = ['Burgers', 'Sandwiches', 'Drinks', 'Sides', 'Desserts'] as const;

export const menuTags = [
  'classic',
  'gluten-free',
  'popular',
  'premium',
  'spicy',
  'vegan',
  'vegetarian',
] as const;

export const menuCategorySchema = z.enum(menuCategories);

export const menuTagSchema = z.enum(menuTags);

export const menuVariantSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  priceDelta: z.number(),
});

export const menuItemSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: menuCategorySchema,
  description: z.string().trim().min(1),
  price: z.number().nonnegative(),
  imageUrl: z.string().url(),
  tags: z.array(menuTagSchema),
  available: z.boolean(),
  variants: z.array(menuVariantSchema).optional(),
});

export const menuItemsSchema = z.array(menuItemSchema);

export const menuResponseSchema = z.object({
  categories: z.array(menuCategorySchema),
  count: z.number().int().nonnegative(),
  items: menuItemsSchema,
});

export const menuItemResponseSchema = z.object({
  item: menuItemSchema,
});

export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type MenuTag = z.infer<typeof menuTagSchema>;
export type MenuVariant = z.infer<typeof menuVariantSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuResponse = z.infer<typeof menuResponseSchema>;
export type MenuItemResponse = z.infer<typeof menuItemResponseSchema>;
