import type {
  AssistantCartAction,
  AssistantMessageResponse,
  MenuItem,
} from '@intelligent-bistro/contracts';
import { assistantMessageResponseSchema } from '@intelligent-bistro/contracts';

type CartLine = {
  itemId: string;
  modifiers: string[];
  quantity: number;
};

const supportedGenericModifiers = new Set([
  'extra spicy',
  'extra sauce',
  'ketchup',
  'large',
  'mayo',
  'no ice',
  'no onions',
  'regular',
  'sauce',
  'spicy',
]);

export function validateCartActions({
  cart,
  menuItems,
  response,
}: {
  cart: CartLine[];
  menuItems: MenuItem[];
  response: AssistantMessageResponse;
}) {
  const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
  const cartItemIds = new Set(cart.map((line) => line.itemId));
  const invalidReasons: string[] = [];

  const validActions = response.actions.filter((action) => {
    if (action.type === 'clear_cart') {
      return true;
    }

    const item = menuItemsById.get(action.itemId);

    if (!item) {
      invalidReasons.push(`I could not find "${action.itemId}" on the menu.`);
      return false;
    }

    if (!item.available) {
      invalidReasons.push(`${item.name} is currently unavailable.`);
      return false;
    }

    if (
      (action.type === 'remove' ||
        action.type === 'update_modifiers' ||
        action.type === 'update_quantity') &&
      !cartItemIds.has(action.itemId)
    ) {
      invalidReasons.push(`${item.name} is not currently in your cart.`);
      return false;
    }

    if ('modifiers' in action && action.modifiers && !modifiersAreValid(action.modifiers, item)) {
      invalidReasons.push(`I could not apply those modifiers to ${item.name}.`);
      return false;
    }

    return true;
  });

  if (invalidReasons.length === 0) {
    return assistantMessageResponseSchema.parse({
      ...response,
      actions: validActions,
    });
  }

  return assistantMessageResponseSchema.parse({
    ...response,
    actions: validActions,
    assistantMessage:
      validActions.length > 0
        ? response.assistantMessage
        : `${invalidReasons[0]} Could you clarify what you want me to do?`,
    clarificationOptions: response.clarificationOptions,
    intent: validActions.length > 0 ? response.intent : 'clarification_needed',
    needsClarification: validActions.length === 0,
    confidence: Math.min(response.confidence, 0.58),
  });
}

function modifiersAreValid(modifiers: string[], item: MenuItem) {
  const allowedVariantIds = new Set(item.variants?.map((variant) => variant.id) ?? []);

  return modifiers.every((modifier) => {
    const normalizedModifier = modifier.trim().toLowerCase();

    return supportedGenericModifiers.has(normalizedModifier) || allowedVariantIds.has(normalizedModifier);
  });
}
