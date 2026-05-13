import type { CartAction, MenuItem } from '@intelligent-bistro/contracts';
import { create } from 'zustand';

export const TAX_RATE = 0.0875;

export type CartLineItem = {
  lineId: string;
  itemId: string;
  name: string;
  description: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  modifiers: string[];
};

export type CartTotals = {
  itemCount: number;
  subtotal: number;
  tax: number;
  total: number;
};

export type CartActionResultStatus = 'applied' | 'missing_item' | 'not_found' | 'noop';

export type CartActionResult = {
  action: CartAction;
  status: CartActionResultStatus;
  message: string;
};

export type MenuItemLookup = Record<string, MenuItem>;

type AddItemOptions = {
  modifiers?: string[];
  quantity?: number;
};

type CartState = {
  lines: CartLineItem[];
  lastActionResult?: CartActionResult;
  addItem: (item: MenuItem, options?: AddItemOptions) => void;
  applyAction: (action: CartAction, menuItemsById: MenuItemLookup) => CartActionResult;
  applyActions: (actions: CartAction[], menuItemsById: MenuItemLookup) => CartActionResult[];
  clearCart: () => void;
  removeItem: (itemId: string, quantity?: number, modifiers?: string[]) => void;
  updateModifiers: (itemId: string, modifiers: string[], currentModifiers?: string[]) => void;
  updateQuantity: (itemId: string, quantity: number, modifiers?: string[]) => void;
};

export function normalizeModifiers(modifiers: string[] = []) {
  return Array.from(
    new Set(modifiers.map((modifier) => modifier.trim().toLowerCase()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

export function createCartLineId(itemId: string, modifiers: string[] = []) {
  const normalizedModifiers = normalizeModifiers(modifiers);
  return normalizedModifiers.length > 0
    ? `${itemId}:${normalizedModifiers.join('|')}`
    : itemId;
}

export function calculateCartTotals(lines: CartLineItem[], taxRate = TAX_RATE): CartTotals {
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const subtotal = roundCurrency(
    lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0)
  );
  const tax = roundCurrency(subtotal * taxRate);

  return {
    itemCount,
    subtotal,
    tax,
    total: roundCurrency(subtotal + tax),
  };
}

function addLine(lines: CartLineItem[], item: MenuItem, quantity = 1, modifiers: string[] = []) {
  const normalizedModifiers = normalizeModifiers(modifiers);
  const lineId = createCartLineId(item.id, normalizedModifiers);
  const existingLine = lines.find((line) => line.lineId === lineId);

  if (existingLine) {
    return lines.map((line) =>
      line.lineId === lineId ? { ...line, quantity: line.quantity + quantity } : line
    );
  }

  return [
    ...lines,
    {
      description: item.description,
      imageUrl: item.imageUrl,
      itemId: item.id,
      lineId,
      modifiers: normalizedModifiers,
      name: item.name,
      quantity,
      unitPrice: item.price,
    },
  ];
}

function removeLine(
  lines: CartLineItem[],
  itemId: string,
  quantity?: number,
  modifiers?: string[]
) {
  const lineIds = getMatchingLineIds(lines, itemId, modifiers);

  if (lineIds.length === 0) {
    return lines;
  }

  if (quantity === undefined) {
    return lines.filter((line) => !lineIds.includes(line.lineId));
  }

  let remainingQuantityToRemove = quantity;

  return lines
    .map((line) => {
      if (!lineIds.includes(line.lineId) || remainingQuantityToRemove <= 0) {
        return line;
      }

      const removedQuantity = Math.min(line.quantity, remainingQuantityToRemove);
      remainingQuantityToRemove -= removedQuantity;

      return {
        ...line,
        quantity: line.quantity - removedQuantity,
      };
    })
    .filter((line) => line.quantity > 0);
}

function updateLineQuantity(
  lines: CartLineItem[],
  itemId: string,
  quantity: number,
  modifiers?: string[]
) {
  const lineIds = getMatchingLineIds(lines, itemId, modifiers);

  return lines.map((line) =>
    lineIds.includes(line.lineId)
      ? {
          ...line,
          quantity,
        }
      : line
  );
}

function updateLineModifiers(
  lines: CartLineItem[],
  itemId: string,
  modifiers: string[],
  currentModifiers?: string[]
) {
  const lineIds = getMatchingLineIds(lines, itemId, currentModifiers);
  const normalizedModifiers = normalizeModifiers(modifiers);

  return lines.reduce<CartLineItem[]>((updatedLines, line) => {
    if (!lineIds.includes(line.lineId)) {
      return [...updatedLines, line];
    }

    const nextLine = {
      ...line,
      lineId: createCartLineId(line.itemId, normalizedModifiers),
      modifiers: normalizedModifiers,
    };
    const existingLineIndex = updatedLines.findIndex(
      (candidate) => candidate.lineId === nextLine.lineId
    );

    if (existingLineIndex === -1) {
      return [...updatedLines, nextLine];
    }

    return updatedLines.map((candidate, index) =>
      index === existingLineIndex
        ? {
            ...candidate,
            quantity: candidate.quantity + nextLine.quantity,
          }
        : candidate
    );
  }, []);
}

function getMatchingLineIds(lines: CartLineItem[], itemId: string, modifiers?: string[]) {
  if (modifiers === undefined) {
    return lines.filter((line) => line.itemId === itemId).map((line) => line.lineId);
  }

  const lineId = createCartLineId(itemId, modifiers);
  return lines.some((line) => line.lineId === lineId) ? [lineId] : [];
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  addItem: (item, options) => {
    set((state) => ({
      lines: addLine(state.lines, item, options?.quantity ?? 1, options?.modifiers),
    }));
  },
  applyAction: (action, menuItemsById) => {
    const result = applyCartAction(action, menuItemsById, get().lines);

    if (result.status !== 'noop') {
      set((state) => ({
        lastActionResult: result,
        lines: applyCartActionToLines(action, menuItemsById, state.lines),
      }));
    } else {
      set({ lastActionResult: result });
    }

    return result;
  },
  applyActions: (actions, menuItemsById) =>
    actions.map((action) => get().applyAction(action, menuItemsById)),
  clearCart: () => {
    set({ lines: [] });
  },
  removeItem: (itemId, quantity, modifiers) => {
    set((state) => ({
      lines: removeLine(state.lines, itemId, quantity, modifiers),
    }));
  },
  updateModifiers: (itemId, modifiers, currentModifiers) => {
    set((state) => ({
      lines: updateLineModifiers(state.lines, itemId, modifiers, currentModifiers),
    }));
  },
  updateQuantity: (itemId, quantity, modifiers) => {
    set((state) => ({
      lines: updateLineQuantity(state.lines, itemId, quantity, modifiers),
    }));
  },
}));

export const selectCartLines = (state: CartState) => state.lines;
export const selectCartTotals = (state: CartState) => calculateCartTotals(state.lines);
export const selectCartItemCount = (state: CartState) => calculateCartTotals(state.lines).itemCount;

function applyCartAction(
  action: CartAction,
  menuItemsById: MenuItemLookup,
  lines: CartLineItem[]
): CartActionResult {
  switch (action.type) {
    case 'add':
      if (!menuItemsById[action.itemId]) {
        return {
          action,
          message: `Could not add unknown menu item "${action.itemId}".`,
          status: 'missing_item',
        };
      }

      return {
        action,
        message: `Added ${action.quantity} item${action.quantity === 1 ? '' : 's'} to cart.`,
        status: 'applied',
      };

    case 'remove':
      return lines.some((line) => line.itemId === action.itemId)
        ? {
            action,
            message: 'Removed item from cart.',
            status: 'applied',
          }
        : {
            action,
            message: `Could not remove "${action.itemId}" because it is not in the cart.`,
            status: 'not_found',
          };

    case 'update':
      return lines.some((line) => line.itemId === action.itemId)
        ? {
            action,
            message: 'Updated item in cart.',
            status: 'applied',
          }
        : {
            action,
            message: `Could not update "${action.itemId}" because it is not in the cart.`,
            status: 'not_found',
          };

    case 'clear':
      return {
        action,
        message: 'Cleared cart.',
        status: lines.length > 0 ? 'applied' : 'noop',
      };

    case 'query':
      return {
        action,
        message: 'Cart contents requested.',
        status: 'noop',
      };
  }
}

function applyCartActionToLines(
  action: CartAction,
  menuItemsById: MenuItemLookup,
  lines: CartLineItem[]
) {
  const result = applyCartAction(action, menuItemsById, lines);

  if (result.status !== 'applied') {
    return lines;
  }

  switch (action.type) {
    case 'add':
      return addLine(lines, menuItemsById[action.itemId], action.quantity, action.modifiers);
    case 'remove':
      return removeLine(lines, action.itemId, action.quantity, action.modifiers);
    case 'update': {
      const quantityUpdated =
        action.quantity !== undefined
          ? updateLineQuantity(lines, action.itemId, action.quantity)
          : lines;

      return action.modifiers.length > 0
        ? updateLineModifiers(quantityUpdated, action.itemId, action.modifiers)
        : quantityUpdated;
    }
    case 'clear':
      return [];
    case 'query':
      return lines;
  }
}
