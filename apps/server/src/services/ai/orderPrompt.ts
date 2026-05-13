import type { AiOrderRequest, MenuItem } from '@intelligent-bistro/contracts';

export function buildOrderParserMessages(request: AiOrderRequest, menuItems: MenuItem[]) {
  const menuContext = menuItems.map((item) => ({
    available: item.available,
    category: item.category,
    id: item.id,
    name: item.name,
    price: item.price,
    tags: item.tags,
    variants: item.variants?.map((variant) => variant.id) ?? [],
  }));

  return [
    {
      role: 'system' as const,
      content:
        'You are the order parser for Intelligent Bistro. Convert the user request into strict JSON only. Do not include markdown. Use only menu item ids from the provided menu. If the item is unclear, unknown, or unavailable, return no unsafe action and add a structured error. Supported actions are add, remove, update, clear, and query.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        cart: request.cart,
        expectedResponseShape: {
          actions: [
            {
              itemId: 'spicy_chicken_sandwich',
              modifiers: ['large'],
              quantity: 2,
              type: 'add',
            },
          ],
          assistantMessage: 'Added 2 spicy chicken sandwiches to your cart.',
          confidence: 0.92,
          errors: [],
          intent: 'cart_update',
        },
        menu: menuContext,
        rules: [
          'Return a JSON object with intent, actions, assistantMessage, confidence, and errors.',
          'intent must be one of cart_update, cart_query, clarification, unknown.',
          'confidence must be between 0 and 1.',
          'For clear cart, use one action: {"type":"clear"}.',
          'For cart contents questions, use one action: {"type":"query"} and intent cart_query.',
          'For modifiers such as large, extra spicy, no onions, use lowercase strings in modifiers.',
          'For unknown or ambiguous items, use errors with code unknown_item or ambiguous_item.',
        ],
        userMessage: request.message,
      }),
    },
  ];
}
