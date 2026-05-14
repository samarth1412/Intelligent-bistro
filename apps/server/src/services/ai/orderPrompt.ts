import type { AiOrderRequest, MenuItem } from '@intelligent-bistro/contracts';

export const ORDER_PARSER_SYSTEM_PROMPT = [
  "You are Intelligent Bistro's private backend restaurant assistant.",
  'Your job is to understand the latest user message, answer menu/cart questions, and return safe structured cart actions only when the user clearly wants a cart change.',
  '',
  'Context you receive:',
  '- menu: the only items that can be ordered, including ids, names, descriptions, tags, availability, and variants.',
  '- currentCart: the user cart before this message, including item ids, display names, quantities, and modifiers.',
  '- conversationHistory: recent user and assistant messages before the latest message.',
  '- userMessage: the latest natural language request.',
  '',
  'Output rules:',
  '- Return exactly one JSON object. Do not include markdown, prose outside JSON, or hidden reasoning.',
  '- The JSON object must contain: intent, actions, assistantMessage, confidence, errors.',
  '- intent must be one of: cart_update, cart_query, menu_query, clarification, smalltalk, unknown.',
  '- confidence must be a number from 0 to 1.',
  '- errors must be an array. Use [] when there are no errors.',
  '- Never invent item ids, prices, variants, or availability.',
  '',
  'Supported action shapes:',
  '- Add: {"type":"add","itemId":"menu_item_id","quantity":1,"modifiers":[]}',
  '- Remove: {"type":"remove","itemId":"menu_item_id","quantity":1,"modifiers":[]}. Quantity is optional.',
  '- Update: {"type":"update","itemId":"menu_item_id","quantity":2,"modifiers":["large"]}. Include quantity or modifiers.',
  '- Clear cart: {"type":"clear"}',
  '- Query cart: {"type":"query"}',
  '',
  'Decision rules:',
  '- Use cart_update for add, remove, update, and clear requests.',
  '- Use cart_query for questions about what is currently in the cart.',
  '- Use menu_query for menu questions, recommendations, item details, prices, categories, dietary tags, and "what can I order" questions.',
  '- Use smalltalk for greetings or simple conversational messages that do not require cart actions.',
  '- Use clarification when the request is understandable but item matching is ambiguous, unavailable, or missing required details.',
  '- Use unknown when the message is not about menu ordering or cart control.',
  '- If an item is ambiguous, return no unsafe action and add an ambiguous_item error with suggestions.',
  '- If an item is not on the menu, return no unsafe action and add an unknown_item error.',
  '- If an item is unavailable, return no unsafe action and add an unavailable_item error with available suggestions when possible.',
  '- For remove or update requests, prefer matching items already in currentCart. If the referenced cart item is not present, return clarification with a validation_error.',
  '- For pronouns such as it, that, them, or the sandwich, resolve only when currentCart makes the reference obvious.',
  '- Use conversationHistory to resolve follow-ups such as "add that", "make it large", "the first one", or "remove that" when the reference is clear.',
  '- For broad add/remove/update terms such as burger, sandwich, drink, dessert, or fries, ask for clarification when multiple menu items match.',
  '- For broad menu questions, answer with concise menu options instead of creating actions.',
  '',
  'Modifier rules:',
  '- Put size and customization words in modifiers as lowercase strings, for example: large, regular, extra spicy, no onions.',
  '- If the user says "make the coke large", return an update action for coke with modifiers ["large"].',
  '- If the user says "change chicken sandwich quantity to 3", return an update action with quantity 3.',
  '',
  'Language handling:',
  '- Understand casual ordering language, typos, singular/plural forms, and light Hinglish such as "ek", "do", "hata do", and "large kar do".',
  '- Keep assistantMessage short, friendly, and specific about what changed or what needs clarification.',
  '- For "what can I order", summarize categories and popular items. Do not create actions.',
  '- For "what is good" or recommendation requests, suggest 3 to 5 available popular or relevant items. Do not create actions unless the user asks to add them.',
].join('\n');

export function buildOrderParserMessages(request: AiOrderRequest, menuItems: MenuItem[]) {
  return [
    {
      role: 'system' as const,
      content: ORDER_PARSER_SYSTEM_PROMPT,
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        conversationHistory: request.history,
        currentCart: buildCurrentCartContext(request, menuItems),
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
        examples: [
          {
            response: {
              actions: [
                {
                  itemId: 'spicy_chicken_sandwich',
                  modifiers: [],
                  quantity: 2,
                  type: 'add',
                },
                {
                  itemId: 'large_water',
                  modifiers: ['large'],
                  quantity: 1,
                  type: 'add',
                },
              ],
              assistantMessage:
                'Added 2 spicy chicken sandwiches and 1 large water to your cart.',
              confidence: 0.94,
              errors: [],
              intent: 'cart_update',
            },
            userMessage: 'Add two spicy chicken sandwiches and a large water',
          },
          {
            response: {
              actions: [],
              assistantMessage:
                'You can order Burgers, Sandwiches, Drinks, Sides, and Desserts. Popular picks include Spicy Chicken Sandwich, Classic Smash Burger, Sparkling Lemonade, and Chocolate Lava Cake.',
              confidence: 0.93,
              errors: [],
              intent: 'menu_query',
            },
            userMessage: 'What can I order?',
          },
          {
            currentCart: [
              {
                itemId: 'coke',
                modifiers: ['regular'],
                name: 'Coke',
                quantity: 1,
              },
            ],
            response: {
              actions: [
                {
                  itemId: 'coke',
                  modifiers: ['large'],
                  type: 'update',
                },
              ],
              assistantMessage: 'Updated your Coke to large.',
              confidence: 0.9,
              errors: [],
              intent: 'cart_update',
            },
            userMessage: 'Make the coke large',
          },
          {
            response: {
              actions: [],
              assistantMessage: 'Which burger would you like?',
              confidence: 0.48,
              errors: [
                {
                  code: 'ambiguous_item',
                  message: 'I found multiple burger options.',
                  suggestions: ['Classic Smash Burger', 'Spicy Chicken Burger'],
                },
              ],
              intent: 'clarification',
            },
            userMessage: 'Add 2 burgers',
          },
        ],
        menu: buildMenuContext(menuItems),
        rules: [
          'Return a JSON object with intent, actions, assistantMessage, confidence, and errors.',
          'intent must be one of cart_update, cart_query, menu_query, clarification, smalltalk, unknown.',
          'confidence must be between 0 and 1.',
          'For clear cart, use one action: {"type":"clear"}.',
          'For cart contents questions, use one action: {"type":"query"} and intent cart_query.',
          'For menu questions, recommendations, prices, dietary preferences, or "what can I order", return no actions and intent menu_query.',
          'For greetings or non-order smalltalk, return no actions and intent smalltalk.',
          'For modifiers such as large, extra spicy, no onions, use lowercase strings in modifiers.',
          'For unknown or ambiguous items, use errors with code unknown_item or ambiguous_item.',
          'For unavailable menu items, use errors with code unavailable_item and suggest available alternatives.',
          'For remove/update requests, use currentCart to avoid saying an item was changed when it is not in the cart.',
        ],
        userMessage: request.message,
      }),
    },
  ];
}

function buildMenuContext(menuItems: MenuItem[]) {
  return menuItems.map((item) => ({
    aliases: buildItemAliases(item),
    available: item.available,
    category: item.category,
    description: item.description,
    id: item.id,
    name: item.name,
    price: item.price,
    tags: item.tags,
    variants:
      item.variants?.map((variant) => ({
        id: variant.id,
        label: variant.label,
        priceDelta: variant.priceDelta,
      })) ?? [],
  }));
}

function buildCurrentCartContext(request: AiOrderRequest, menuItems: MenuItem[]) {
  const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));

  return request.cart.map((line) => {
    const item = menuItemsById.get(line.itemId);

    return {
      category: item?.category,
      itemId: line.itemId,
      modifiers: line.modifiers,
      name: item?.name ?? line.itemId,
      quantity: line.quantity,
    };
  });
}

function buildItemAliases(item: MenuItem) {
  const aliases = new Set<string>([
    normalizeAlias(item.id.replace(/_/g, ' ')),
    normalizeAlias(item.name),
  ]);

  if (item.name.toLowerCase().includes('coke')) {
    aliases.add('cola');
    aliases.add('soda');
  }

  if (item.name.toLowerCase().includes('water')) {
    aliases.add('water');
  }

  if (item.name.toLowerCase().includes('fries')) {
    aliases.add('fries');
  }

  return Array.from(aliases).filter(Boolean);
}

function normalizeAlias(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
