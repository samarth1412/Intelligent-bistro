import { Router } from 'express';

import {
  getMenuResponse,
  isMenuCategory,
  requireMenuItem,
} from '../services/menu.service';
import type { MenuCategory } from '../types/menu';
import { HttpError } from '../utils/HttpError';

export const menuRouter = Router();

menuRouter.get('/', (req, res, next) => {
  try {
    const categoryQuery = typeof req.query.category === 'string' ? req.query.category : undefined;
    let category: MenuCategory | undefined;

    if (categoryQuery) {
      if (!isMenuCategory(categoryQuery)) {
        throw new HttpError(400, `Unsupported menu category "${categoryQuery}"`);
      }

      category = categoryQuery;
    }

    res.json(getMenuResponse(category));
  } catch (error) {
    next(error);
  }
});

menuRouter.get('/:itemId', (req, res, next) => {
  try {
    res.json({
      item: requireMenuItem(req.params.itemId),
    });
  } catch (error) {
    next(error);
  }
});
