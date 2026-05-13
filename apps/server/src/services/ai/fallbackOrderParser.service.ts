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
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
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

  if (isCartQuery(normalizedMessage)) {
    return createResponse({
      actions: [{ type: 'query' }],
      assistantMessage: createCartSummaryMessage(request),
      confidence: 0.96,
      intent: 'cart_query',
    });
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
    return parseRemoveRequest(normalizedMessage);
  }

  if (isUpdate(normalizedMessage)) {
    return parseUpdateRequest(normalizedMessage);
  }

  if (isAdd(normalizedMessage)) {
    return parseAddRequest(normalizedMessage);
  }

  return createResponse({
    actions: [],
    assistantMessage:
      'I can help add, remove, update, clear, or summarize your cart. Try "add 2 burgers" or "clear my cart".',
    confidence: 0.25,
    errors: [
      {
        code: 'validation_error',
        message: 'The fallback parser could not determine a supported cart intent.',
      },
    ],
    intent: 'unknown',
  });
}

function parseAddRequest(message: string) {
  const actions: CartAction[] = [];
  const errors: AiOrderError[] = [];
  const segments = splitOrderSegments(stripIntentWords(message, ['add', 'order', 'get']));

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

function parseRemoveRequest(message: string) {
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

function parseUpdateRequest(message: string) {
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
  return /\b(add|order|get|want|need)\b/.test(input);
}

function isRemove(input: string) {
  return /\b(remove|delete)\b|\btake\s+out\b/.test(input);
}

function isUpdate(input: string) {
  return /\b(make|change|set|update)\b|\bquantity\s+to\b/.test(input);
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
