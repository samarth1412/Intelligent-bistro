import { menuItemsSchema } from '@intelligent-bistro/contracts';

import menuItemsJson from '../data/menu.json';
import { HttpError } from '../utils/HttpError';
import { menuCategories, type MenuCategory, type MenuItem } from '../types/menu';

const menuItems = menuItemsSchema.parse(menuItemsJson) as MenuItem[];

export function isMenuCategory(value: string): value is MenuCategory {
  return menuCategories.includes(value as MenuCategory);
}

export function getMenuItems(category?: MenuCategory) {
  if (!category) {
    return menuItems;
  }

  return menuItems.filter((item) => item.category === category);
}

export function getMenuItemById(itemId: string) {
  return menuItems.find((item) => item.id === itemId);
}

export function requireMenuItem(itemId: string) {
  const item = getMenuItemById(itemId);

  if (!item) {
    throw new HttpError(404, `Menu item "${itemId}" was not found`);
  }

  return item;
}

export function getMenuResponse(category?: MenuCategory) {
  return {
    categories: menuCategories,
    count: getMenuItems(category).length,
    items: getMenuItems(category),
  };
}
