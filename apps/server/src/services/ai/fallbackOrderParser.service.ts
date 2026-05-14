import {
  aiOrderResponseSchema,
  type AiOrderError,
  type AiOrderRequest,
  type AiOrderResponse,
  type AiIntent,
  type CartAction,
  type MenuItem,
} from '@intelligent-bistro/contracts';

import { getMenuItems } from '../menu.service';

type ItemMatch =
  | {
      item: MenuItem;
      status: 'matched';
    }
  | {
      matches: MenuItem[];
      status: 'ambiguous';
      term: string;
    }
  | {
      status: 'unknown';
      term: string;
    };

type FallbackResponseDraft = {
  actions: CartAction[];
  assistantMessage: string;
  confidence: number;
  errors?: AiOrderError[];
  intent: AiIntent;
};

const numberWords = new Map<string, number>([
  ['a', 1],
  ['an', 1],
  ['ek', 1],
  ['one', 1],
  ['do', 2],
  ['two', 2],
  ['teen', 3],
  ['three', 3],
  ['char', 4],
  ['chaar', 4],
  ['four', 4],
  ['paanch', 5],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

const fillerWords = new Set([
  'a',
  'an',
  'and',
  'large',
  'regular',
  'for',
  'my',
  'of',
  'please',
  'the',
  'to',
  'with',
]);

const itemAliases: Record<string, string[]> = {
  classic_smash_burger: ['classic burger', 'smash burger', 'burger'],
  spicy_chicken_burger: ['spicy chicken burger', 'chicken burger'],
  bbq_bacon_burger: ['bbq bacon burger', 'bacon burger', 'bbq burger'],
  garden_veggie_burger: ['veggie burger', 'garden burger', 'vegan burger'],
  spicy_chicken_sandwich: [
    'spicy chicken sandwich',
    'chicken sandwich',
    'spicy sandwich',
    'sandwich',
  ],
  turkey_avocado_sandwich: ['turkey sandwich', 'avocado sandwich', 'turkey avocado'],
  caprese_panini: ['caprese panini', 'panini', 'caprese sandwich'],
  brisket_grilled_cheese: ['brisket grilled cheese', 'grilled cheese', 'brisket sandwich'],
  large_water: ['large water', 'water'],
  coke: ['coke', 'cola', 'soda'],
  sparkling_lemonade: ['sparkling lemonade', 'lemonade'],
  iced_berry_tea: ['iced berry tea', 'berry tea', 'iced tea', 'tea'],
  french_fries: ['french fries', 'fries'],
  truffle_parmesan_fries: ['truffle fries', 'parmesan fries'],
  sweet_potato_fries: ['sweet potato fries'],
  side_caesar_salad: ['caesar salad', 'side salad', 'salad'],
  chocolate_lava_cake: ['lava cake', 'chocolate cake', 'cake'],
  vanilla_bean_cheesecake: ['cheesecake', 'vanilla cheesecake'],
  salted_caramel_brownie: ['brownie', 'caramel brownie'],
};

export function parseOrderWithFallback(request: AiOrderRequest): AiOrderResponse {
  const normalizedMessage = normalizeText(request.message);

  if (isGreeting(normalizedMessage)) {
    return createResponse({
      actions: [],
      assistantMessage:
        'Hi, I can help you browse the menu, choose popular items, add food to your cart, update quantities, remove items, or summarize your cart.',
      confidence: 0.92,
      intent: 'smalltalk',
    });
  }

  if (isCartQuery(normalizedMessage)) {
    return createResponse({
      actions: [{ type: 'query' }],
      assistantMessage: createCartSummaryMessage(request),
      confidence: 0.96,
      intent: 'cart_query',
    });
  }

  if (isMenuQuery(normalizedMessage)) {
    return createMenuQueryResponse(normalizedMessage);
  }

  const menuItemInfo = createMenuItemInfoResponse(normalizedMessage);

  if (menuItemInfo) {
    return menuItemInfo;
  }

  const contextualResponse = parseContextualRequest(normalizedMessage, request);

  if (contextualResponse) {
    return contextualResponse;
  }

  if (isClearCart(normalizedMessage)) {
    return createResponse({
      actions: [{ type: 'clear' }],
      assistantMessage: 'Cleared your cart.',
      confidence: 0.98,
      intent: 'cart_update',
    });
  }

  if (isRemove(normalizedMessage)) {
    return parseRemoveRequest(normalizedMessage, request.cart);
  }

  if (isUpdate(normalizedMessage)) {
    return parseUpdateRequest(normalizedMessage, request.cart);
  }

  if (isAdd(normalizedMessage)) {
    return parseAddRequest(normalizedMessage);
  }

  if (looksLikeFoodOrder(normalizedMessage)) {
    return parseAddRequest(normalizedMessage);
  }

  return createResponse({
    actions: [],
    assistantMessage:
      'I can help with the menu and your cart. Ask what you can order, request a recommendation, or tell me what to add.',
    confidence: 0.45,
    intent: 'unknown',
  });
}

function parseAddRequest(message: string) {
  const actions: CartAction[] = [];
  const errors: AiOrderError[] = [];
  const segments = splitOrderSegments(
    stripIntentWords(message, [
      'add',
      'can',
      'could',
      'give',
      'grab',
      'have',
      'i',
      'like',
      'need',
      'order',
      'please',
      'want',
      'would',
    ])
  );

  for (const segment of segments) {
    const quantity = extractQuantity(segment) ?? 1;
    const modifiers = extractModifiers(segment);
    const match = resolveMenuItem(segment);

    if (match.status === 'matched') {
      actions.push({
        itemId: match.item.id,
        modifiers,
        quantity,
        type: 'add',
      });
      continue;
    }

    errors.push(createMatchError(match));
  }

  return createResponse({
    actions,
    assistantMessage:
      actions.length > 0
        ? `Added ${formatActionList(actions)} to your cart.`
        : 'I could not match that add request to a menu item.',
    confidence: errors.length > 0 ? 0.62 : 0.88,
    errors,
    intent: actions.length > 0 ? 'cart_update' : 'clarification',
  });
}

function parseRemoveRequest(message: string, cart: AiOrderRequest['cart']) {
  const match = resolveMenuItem(stripIntentWords(message, ['remove', 'delete', 'take out']));

  if (match.status !== 'matched') {
    return createResponse({
      actions: [],
      assistantMessage: 'I could not match that remove request to an item in your cart.',
      confidence: 0.58,
      errors: [createMatchError(match)],
      intent: 'clarification',
    });
  }

  const quantity = extractQuantity(message, false);

  if (!cart.some((line) => line.itemId === match.item.id)) {
    return createResponse({
      actions: [],
      assistantMessage: `${match.item.name} is not in your cart yet.`,
      confidence: 0.84,
      errors: [
        {
          code: 'validation_error',
          message: `${match.item.name} is not currently in the cart.`,
        },
      ],
      intent: 'clarification',
    });
  }

  const action: CartAction = {
    itemId: match.item.id,
    modifiers: [],
    type: 'remove',
    ...(quantity ? { quantity } : {}),
  };

  return createResponse({
    actions: [action],
    assistantMessage: `Removed ${match.item.name} from your cart.`,
    confidence: 0.9,
    intent: 'cart_update',
  });
}

function parseUpdateRequest(message: string, cart: AiOrderRequest['cart']) {
  const match = resolveMenuItem(
    stripIntentWords(message, ['change', 'make', 'set', 'update', 'quantity'])
  );

  if (match.status !== 'matched') {
    return createResponse({
      actions: [],
      assistantMessage: 'I could not match that update request to an item in your cart.',
      confidence: 0.58,
      errors: [createMatchError(match)],
      intent: 'clarification',
    });
  }

  const quantity = extractQuantity(message, false);
  const modifiers = extractModifiers(message);

  if (quantity === undefined && modifiers.length === 0) {
    return createResponse({
      actions: [],
      assistantMessage: 'Tell me the new quantity or modifier you want for that item.',
      confidence: 0.5,
      errors: [
        {
          code: 'validation_error',
          message: 'Update request did not include a quantity or modifier.',
        },
      ],
      intent: 'clarification',
    });
  }

  if (!cart.some((line) => line.itemId === match.item.id)) {
    const action: CartAction = {
      itemId: match.item.id,
      modifiers,
      quantity: quantity ?? 1,
      type: 'add',
    };

    return createResponse({
      actions: [action],
      assistantMessage: `Added ${formatActionList([action])} to your cart.`,
      confidence: 0.82,
      intent: 'cart_update',
    });
  }

  return createResponse({
    actions: [
      {
        itemId: match.item.id,
        modifiers,
        type: 'update',
        ...(quantity !== undefined ? { quantity } : {}),
      },
    ],
    assistantMessage: `Updated ${match.item.name} in your cart.`,
    confidence: 0.86,
    intent: 'cart_update',
  });
}

function parseContextualRequest(message: string, request: AiOrderRequest) {
  if (!/\b(that|those|it|one|first|second|third|last)\b/.test(message)) {
    return undefined;
  }

  const referencedMatch = resolveContextualMenuItem(message, request);

  if (!referencedMatch) {
    return undefined;
  }

  if (referencedMatch.status === 'ambiguous') {
    return createResponse({
      actions: [],
      assistantMessage: `I mentioned ${formatMenuItems(referencedMatch.matches)}. Which one should I use?`,
      confidence: 0.62,
      intent: 'clarification',
    });
  }

  const quantity = extractQuantity(message) ?? 1;
  const modifiers = extractModifiers(message);

  if (isRemove(message)) {
    return parseRemoveRequest(`remove ${referencedMatch.item.name}`, request.cart);
  }

  if (isUpdate(message)) {
    return parseUpdateRequest(`update ${referencedMatch.item.name} ${message}`, request.cart);
  }

  if (isAdd(message)) {
    const action: CartAction = {
      itemId: referencedMatch.item.id,
      modifiers,
      quantity,
      type: 'add',
    };

    return createResponse({
      actions: [action],
      assistantMessage: `Added ${formatActionList([action])} to your cart.`,
      confidence: 0.82,
      intent: 'cart_update',
    });
  }

  return undefined;
}

function resolveMenuItem(input: string): ItemMatch {
  const normalizedInput = normalizeText(removeQuantityWords(input));
  const menuItems = getMenuItems().filter((item) => item.available);
  const genericAmbiguity = getGenericAmbiguity(normalizedInput, menuItems);

  if (genericAmbiguity) {
    return genericAmbiguity;
  }

  const scoredMatches = menuItems
    .map((item) => ({
      item,
      score: scoreItemMatch(normalizedInput, item),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestMatch = scoredMatches[0];

  if (!bestMatch) {
    return {
      status: 'unknown',
      term: input.trim(),
    };
  }

  const tiedMatches = scoredMatches.filter((match) => match.score === bestMatch.score);

  if (isAmbiguousCategoryTerm(normalizedInput, tiedMatches.map((match) => match.item))) {
    return {
      matches: tiedMatches.map((match) => match.item),
      status: 'ambiguous',
      term: input.trim(),
    };
  }

  return {
    item: bestMatch.item,
    status: 'matched',
  };
}

function resolveContextualMenuItem(
  input: string,
  request: AiOrderRequest
): Extract<ItemMatch, { status: 'matched' | 'ambiguous' }> | undefined {
  const mentionedItems = getRecentMentionedMenuItems(request.history);

  if (mentionedItems.length === 0) {
    return undefined;
  }

  const index = getRequestedMentionIndex(input, mentionedItems.length);
  const indexedItem = index !== undefined ? mentionedItems[index] : undefined;

  if (indexedItem) {
    return {
      item: indexedItem,
      status: 'matched',
    };
  }

  const onlyMentionedItem = mentionedItems[0];

  if (onlyMentionedItem && mentionedItems.length === 1) {
    return {
      item: onlyMentionedItem,
      status: 'matched',
    };
  }

  return {
    matches: mentionedItems.slice(0, 5),
    status: 'ambiguous',
    term: input,
  };
}

function getRecentMentionedMenuItems(history: AiOrderRequest['history']) {
  const availableItems = getMenuItems().filter((item) => item.available);

  for (const message of [...history].reverse()) {
    const normalizedContent = normalizeText(message.content);
    const matches = availableItems
      .map((item) => ({
        item,
        index: findMenuItemMentionIndex(normalizedContent, item),
      }))
      .filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index)
      .map((match) => match.item);

    if (matches.length > 0) {
      return matches;
    }
  }

  return [];
}

function findMenuItemMentionIndex(input: string, item: MenuItem) {
  const candidates = [
    item.name,
    item.id.replace(/_/g, ' '),
    ...(itemAliases[item.id] ?? []).filter(isSpecificAlias),
  ].map(normalizeText);
  const indexes = candidates
    .map((candidate) => input.indexOf(candidate))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function isSpecificAlias(alias: string) {
  const normalizedAlias = normalizeText(alias);

  return (
    normalizedAlias.split(' ').length > 1 &&
    !['burger', 'sandwich', 'drink', 'fries', 'water', 'soda', 'cake'].includes(normalizedAlias)
  );
}

function getRequestedMentionIndex(input: string, totalMentions: number) {
  if (/\b(first|1st)\b/.test(input)) {
    return 0;
  }

  if (/\b(second|2nd)\b/.test(input)) {
    return totalMentions > 1 ? 1 : undefined;
  }

  if (/\b(third|3rd)\b/.test(input)) {
    return totalMentions > 2 ? 2 : undefined;
  }

  if (/\blast\b/.test(input)) {
    return totalMentions - 1;
  }

  return undefined;
}

function getGenericAmbiguity(input: string, menuItems: MenuItem[]): ItemMatch | undefined {
  const meaningfulTokens = input
    .split(' ')
    .filter((token) => token.length > 2 && !fillerWords.has(token));

  if (meaningfulTokens.length !== 1) {
    return undefined;
  }

  const [token] = meaningfulTokens;
  const matches = getGenericMatches(token, menuItems);

  if (matches.length <= 1) {
    return undefined;
  }

  return {
    matches,
    status: 'ambiguous',
    term: input.trim(),
  };
}

function getGenericMatches(token: string | undefined, menuItems: MenuItem[]) {
  switch (token) {
    case 'chicken':
      return menuItems.filter((item) => normalizeText(item.name).split(' ').includes('chicken'));
    case 'drink':
    case 'drinks':
      return menuItems.filter((item) => item.category === 'Drinks');
    case 'sandwich':
    case 'sandwiches':
      return menuItems.filter((item) => item.category === 'Sandwiches');
    case 'dessert':
    case 'desserts':
      return menuItems.filter((item) => item.category === 'Desserts');
    default:
      return [];
  }
}

function scoreItemMatch(input: string, item: MenuItem) {
  const normalizedName = normalizeText(item.name);
  const aliases = itemAliases[item.id] ?? [];
  const normalizedAliases = aliases.map(normalizeText);

  if (input.includes(normalizedName)) {
    return normalizedName.length + 80;
  }

  const exactAlias = normalizedAliases.find((alias) => input.includes(alias));

  if (exactAlias) {
    return exactAlias.length + 60;
  }

  const tokens = input
    .split(' ')
    .filter((token) => token.length > 2 && !fillerWords.has(token));
  const nameTokens = normalizedName.split(' ');
  const matchedNameTokens = tokens.filter((token) => nameTokens.includes(token)).length;

  return matchedNameTokens >= 2 ? matchedNameTokens * 10 : 0;
}

function isAmbiguousCategoryTerm(input: string, matches: MenuItem[]) {
  const uniqueCategories = new Set(matches.map((item) => item.category));

  if (matches.length <= 1) {
    return false;
  }

  return (
    uniqueCategories.size === 1 &&
    ['burger', 'burgers', 'sandwich', 'sandwiches', 'drink', 'drinks', 'fries'].some((term) =>
      input.split(' ').includes(term)
    )
  );
}

function extractQuantity(input: string, defaultToOne = true) {
  const tokens = input.split(' ');
  const numericToken = tokens.find((token) => /^\d+$/.test(token));

  if (numericToken) {
    return Number(numericToken);
  }

  const wordToken = tokens.find((token) => numberWords.has(token));

  if (wordToken) {
    return numberWords.get(wordToken);
  }

  return defaultToOne ? 1 : undefined;
}

function extractModifiers(input: string) {
  const modifiers: string[] = [];

  if (/\blarge\b/.test(input)) {
    modifiers.push('large');
  }

  if (/\bextra spicy\b|\bspicier\b/.test(input)) {
    modifiers.push('extra spicy');
  }

  if (/\bno onions?\b|\bwithout onions?\b/.test(input)) {
    modifiers.push('no onions');
  }

  if (/\bregular\b/.test(input)) {
    modifiers.push('regular');
  }

  return modifiers;
}

function splitOrderSegments(input: string) {
  return input
    .split(/\s+and\s+|,\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function stripIntentWords(input: string, words: string[]) {
  return words.reduce(
    (updatedInput, word) => updatedInput.replace(new RegExp(`\\b${word}\\b`, 'g'), ' '),
    input
  );
}

function removeQuantityWords(input: string) {
  return input
    .split(' ')
    .filter((token) => !numberWords.has(token) && !/^\d+$/.test(token))
    .join(' ');
}

function isAdd(input: string) {
  return /\b(add|get|want|need|have|grab|give|like)\b/.test(input) || isDirectOrder(input);
}

function isRemove(input: string) {
  return /\b(remove|delete|hata)\b|\btake\s+out\b|\bhata\s+do\b/.test(input);
}

function isUpdate(input: string) {
  return /\b(make|change|set|update)\b|\bquantity\s+to\b|\bkar\s+do\b/.test(input);
}

function isClearCart(input: string) {
  return /\b(clear|empty)\b.*\bcart\b/.test(input);
}

function isCartQuery(input: string) {
  return (
    /\bwhat'?s\s+in\s+my\s+cart\b/.test(input) ||
    /\bwhat\s+s\s+in\s+my\s+cart\b/.test(input) ||
    /\bwhat\s+is\s+in\s+my\s+cart\b/.test(input) ||
    /\bshow\s+my\s+cart\b/.test(input) ||
    /\bcart\s+summary\b/.test(input)
  );
}

function isGreeting(input: string) {
  return /^(hi|hello|hey|yo|namaste|sup|good morning|good afternoon|good evening)\b/.test(input);
}

function isMenuQuery(input: string) {
  return (
    /\b(menu|menus|available|recommend|suggest|popular|best|special|specials|options?)\b/.test(input) ||
    /\bwhat\s+(can|could|should)\s+i\s+(order|get|eat|try)\b/.test(input) ||
    /\bwhat\s+do\s+you\s+(have|serve|recommend)\b/.test(input) ||
    /\bwhat\s+(burgers|sandwiches|drinks|sides|desserts|options)\b/.test(input) ||
    /\bwhat'?s\s+good\b/.test(input) ||
    /\bshow\s+me\b.*\b(burgers|sandwiches|drinks|sides|desserts|menu|options)\b/.test(input) ||
    /\bdo\s+you\s+have\b|\bhave\s+you\s+got\b/.test(input) ||
    /\bis\s+there\b.*\b(vegan|vegetarian|veg|gluten free|gluten-free|spicy|healthy)\b/.test(input) ||
    /\bany\b.*\b(vegan|vegetarian|veg|gluten free|gluten-free|spicy|healthy)\b/.test(input) ||
    /\b(i'?m|i\s+am)\s+(vegan|vegetarian|veg)\b/.test(input)
  );
}

function isDirectOrder(input: string) {
  return /\b(order)\b/.test(input) && looksLikeFoodOrder(input);
}

function createCartSummaryMessage(request: AiOrderRequest) {
  if (request.cart.length === 0) {
    return 'Your cart is currently empty.';
  }

  const itemNamesById = Object.fromEntries(getMenuItems().map((item) => [item.id, item.name]));
  const summary = request.cart
    .map((line) => `${line.quantity}x ${itemNamesById[line.itemId] ?? line.itemId}`)
    .join(', ');

  return `Your cart has ${summary}.`;
}

function createMenuQueryResponse(input: string) {
  const itemInfoResponse = createMenuItemInfoResponse(input);

  if (itemInfoResponse) {
    return itemInfoResponse;
  }

  const availableItems = getMenuItems().filter((item) => item.available);
  const category = findRequestedCategory(input);
  const tag = findRequestedTag(input);
  const scopedItems = availableItems.filter((item) => {
    const categoryMatches = category ? item.category === category : true;
    const tagMatches = tag ? item.tags.includes(tag) : true;

    return categoryMatches && tagMatches;
  });

  if (scopedItems.length > 0 && (category || tag)) {
    return createResponse({
      actions: [],
      assistantMessage: `You can order ${formatMenuItems(scopedItems.slice(0, 6))}.`,
      confidence: 0.9,
      intent: 'menu_query',
    });
  }

  if ((category || tag) && scopedItems.length === 0) {
    return createResponse({
      actions: [],
      assistantMessage:
        'I do not see an available menu item that matches that preference right now.',
      confidence: 0.82,
      intent: 'menu_query',
    });
  }

  if (/\b(recommend|suggest|popular|best|special|specials|good)\b/.test(input)) {
    const popularItems = availableItems.filter((item) => item.tags.includes('popular')).slice(0, 5);

    return createResponse({
      actions: [],
      assistantMessage: `Popular picks are ${formatMenuItems(popularItems)}. I can add any of them if you tell me the quantity.`,
      confidence: 0.88,
      intent: 'menu_query',
    });
  }

  return createResponse({
    actions: [],
    assistantMessage: `You can order from Burgers, Sandwiches, Drinks, Sides, and Desserts. Popular picks include ${formatMenuItems(
      availableItems.filter((item) => item.tags.includes('popular')).slice(0, 4)
    )}.`,
    confidence: 0.9,
    intent: 'menu_query',
  });
}

function createMenuItemInfoResponse(input: string) {
  if (!/\b(price|cost|how much|tell me|describe|details?|do you have|have you got|is there)\b/.test(input)) {
    return undefined;
  }

  const match = resolveMenuItem(input);

  if (match.status === 'matched') {
    return createResponse({
      actions: [],
      assistantMessage: `${match.item.name} is ${formatPrice(match.item.price)}. ${match.item.description}`,
      confidence: 0.9,
      intent: 'menu_query',
    });
  }

  if (match.status === 'ambiguous') {
    return createResponse({
      actions: [],
      assistantMessage: `I found a few matches: ${formatMenuItems(match.matches.slice(0, 5))}. Which one do you mean?`,
      confidence: 0.7,
      errors: [createMatchError(match)],
      intent: 'clarification',
    });
  }

  return undefined;
}

function looksLikeFoodOrder(input: string) {
  return getMenuItems()
    .filter((item) => item.available)
    .some((item) => scoreItemMatch(normalizeText(removeQuantityWords(input)), item) > 0);
}

function findRequestedCategory(input: string): MenuItem['category'] | undefined {
  if (/\bburgers?\b/.test(input)) {
    return 'Burgers';
  }

  if (/\bsandwich(es)?\b|\bpanini\b/.test(input)) {
    return 'Sandwiches';
  }

  if (/\bdrinks?\b|\bbeverages?\b|\bsoda\b|\bwater\b/.test(input)) {
    return 'Drinks';
  }

  if (/\bsides?\b|\bfries\b|\bsalad\b/.test(input)) {
    return 'Sides';
  }

  if (/\bdesserts?\b|\bsweets?\b|\bcake\b|\bbrownie\b|\bcheesecake\b/.test(input)) {
    return 'Desserts';
  }

  return undefined;
}

function findRequestedTag(input: string): MenuItem['tags'][number] | undefined {
  if (/\bspicy\b|\bhot\b/.test(input)) {
    return 'spicy';
  }

  if (/\bvegan\b/.test(input)) {
    return 'vegan';
  }

  if (/\bvegetarian\b|\bveg\b/.test(input)) {
    return 'vegetarian';
  }

  if (/\bpopular\b|\bbest\b|\bspecial\b/.test(input)) {
    return 'popular';
  }

  if (/\bpremium\b/.test(input)) {
    return 'premium';
  }

  if (/\bclassic\b/.test(input)) {
    return 'classic';
  }

  return undefined;
}

function formatMenuItems(items: MenuItem[]) {
  return items.map((item) => `${item.name} (${formatPrice(item.price)})`).join(', ');
}

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`;
}

function formatActionList(actions: CartAction[]) {
  return actions
    .map((action) => {
      if (!('itemId' in action)) {
        return action.type;
      }

      const item = getMenuItems().find((menuItem) => menuItem.id === action.itemId);
      const name = item?.name ?? action.itemId;
      const quantity = 'quantity' in action ? action.quantity ?? 1 : 1;

      return `${quantity} ${pluralizeName(name, quantity)}`;
    })
    .join(' and ');
}

function pluralizeName(name: string, quantity: number) {
  if (quantity === 1) {
    return name;
  }

  if (name.endsWith('s')) {
    return name;
  }

  if (name.endsWith('y')) {
    return `${name.slice(0, -1)}ies`;
  }

  if (name.endsWith('ch') || name.endsWith('sh') || name.endsWith('x')) {
    return `${name}es`;
  }

  return `${name}s`;
}

function createMatchError(match: Exclude<ItemMatch, { status: 'matched' }>): AiOrderError {
  if (match.status === 'ambiguous') {
    return {
      code: 'ambiguous_item',
      message: `I found multiple matches for "${match.term}".`,
      suggestions: match.matches.slice(0, 5).map((item) => item.name),
    };
  }

  return {
    code: 'unknown_item',
    message: `I could not find "${match.term}" on the menu.`,
  };
}

function createResponse(response: FallbackResponseDraft) {
  return aiOrderResponseSchema.parse(response);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
