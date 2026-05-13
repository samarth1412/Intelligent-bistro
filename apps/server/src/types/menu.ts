export const menuCategories = ['Burgers', 'Sandwiches', 'Drinks', 'Sides', 'Desserts'] as const;

export type MenuCategory = (typeof menuCategories)[number];

export const menuTags = [
  'classic',
  'gluten-free',
  'popular',
  'premium',
  'spicy',
  'vegan',
  'vegetarian',
] as const;

export type MenuTag = (typeof menuTags)[number];

export type MenuVariant = {
  id: string;
  label: string;
  priceDelta: number;
};

export type MenuItem = {
  id: string;
  name: string;
  category: MenuCategory;
  description: string;
  price: number;
  imageUrl: string;
  tags: MenuTag[];
  available: boolean;
  variants?: MenuVariant[];
};
