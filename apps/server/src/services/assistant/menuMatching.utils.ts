import type {
  AssistantConversationMessage,
  MenuItem,
  MenuTag,
} from '@intelligent-bistro/contracts';

type ScoredMenuItem = {
  item: MenuItem;
  score: number;
};

type GenericFoodType = 'burger' | 'dessert' | 'drink' | 'fries' | 'sandwich' | 'side';

export type ContextItemResolution =
  | {
      clarificationOptions: MenuItem[];
      item: MenuItem;
      referencedItemIds: string[];
      source: 'context' | 'full_menu_fuzzy';
      status: 'resolved';
    }
  | {
      clarificationOptions: MenuItem[];
      referencedItemIds: string[];
      source: 'context' | 'full_menu_category' | 'full_menu_fuzzy';
      status: 'clarification_needed';
    }
  | {
      clarificationOptions: [];
      referencedItemIds: [];
      source: 'none';
      status: 'not_found';
    };

const genericTerms = new Set([
  'burger',
  'burgers',
  'sandwich',
  'sandwiches',
  'drink',
  'drinks',
  'dessert',
  'desserts',
  'side',
  'sides',
  'fries',
  'item',
  'option',
  'options',
]);

const searchStopWords = new Set([
  'add',
  'all',
  'any',
  'are',
  'can',
  'could',
  'do',
  'for',
  'get',
  'have',
  'in',
  'me',
  'menu',
  'of',
  'one',
  'option',
  'options',
  'order',
  'please',
  'pls',
  'show',
  'the',
  'there',
  'what',
  'with',
  'you',
]);

export function fuzzyMatchMenuItem(input: string, menuItems: MenuItem[]) {
  const normalizedInput = normalizeText(input);
  const scoredMatches = menuItems
    .map<ScoredMenuItem>((item) => ({
      item,
      score: scoreMenuItem(normalizedInput, item),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  return scoredMatches;
}

export function resolvePronounsFromContext(
  input: string,
  conversationHistory: AssistantConversationMessage[],
  menuItems: MenuItem[]
) {
  if (!/\b(that|those|it|one|first|second|third|last|recommended)\b/i.test(input)) {
    return [];
  }

  const referencedIds = [...conversationHistory]
    .reverse()
    .flatMap((message) => message.referencedItemIds ?? [])
    .filter(Boolean);

  const uniqueReferencedIds = Array.from(new Set(referencedIds));
  const referencedItems = uniqueReferencedIds
    .map((itemId) => menuItems.find((item) => item.id === itemId))
    .filter((item): item is MenuItem => Boolean(item));

  if (referencedItems.length === 0) {
    return [];
  }

  const requestedIndex = getRequestedIndex(input, referencedItems.length);
  const indexedItem = requestedIndex !== undefined ? referencedItems[requestedIndex] : undefined;

  return indexedItem ? [indexedItem] : referencedItems;
}

export function resolveItemFromContext({
  conversationHistory,
  lastReferencedItemIds,
  menu,
  userMessage,
}: {
  conversationHistory: AssistantConversationMessage[];
  lastReferencedItemIds: string[];
  menu: MenuItem[];
  userMessage: string;
}): ContextItemResolution {
  const normalizedMessage = normalizeText(userMessage);
  const genericType = extractGenericFoodType(normalizedMessage);
  const recentReferencedItems = collectReferencedItems(
    lastReferencedItemIds,
    conversationHistory,
    menu
  );

  if (recentReferencedItems.length > 0) {
    const contextMatches = genericType
      ? recentReferencedItems.filter((item) => itemMatchesGenericType(item, genericType))
      : getContextReferenceMatches(normalizedMessage, recentReferencedItems);

    const contextMatch = contextMatches[0];

    if (contextMatches.length === 1 && contextMatch) {
      return {
        clarificationOptions: [],
        item: contextMatch,
        referencedItemIds: [contextMatch.id],
        source: 'context',
        status: 'resolved',
      };
    }

    if (contextMatches.length > 1) {
      return {
        clarificationOptions: contextMatches,
        referencedItemIds: contextMatches.map((item) => item.id),
        source: 'context',
        status: 'clarification_needed',
      };
    }
  }

  const fuzzyMatches = fuzzyMatchMenuItem(userMessage, menu).map((match) => match.item);
  const fuzzyMatch = fuzzyMatches[0];

  if (fuzzyMatches.length === 1 && fuzzyMatch) {
    return {
      clarificationOptions: [],
      item: fuzzyMatch,
      referencedItemIds: [fuzzyMatch.id],
      source: 'full_menu_fuzzy',
      status: 'resolved',
    };
  }

  if (fuzzyMatches.length > 1) {
    return {
      clarificationOptions: fuzzyMatches.slice(0, 5),
      referencedItemIds: fuzzyMatches.slice(0, 5).map((item) => item.id),
      source: 'full_menu_fuzzy',
      status: 'clarification_needed',
    };
  }

  if (genericType) {
    const categoryMatches = menu.filter((item) => itemMatchesGenericType(item, genericType));
    const categoryMatch = categoryMatches[0];

    if (categoryMatches.length === 1 && categoryMatch) {
      return {
        clarificationOptions: [],
        item: categoryMatch,
        referencedItemIds: [categoryMatch.id],
        source: 'full_menu_fuzzy',
        status: 'resolved',
      };
    }

    if (categoryMatches.length > 1) {
      return {
        clarificationOptions: categoryMatches.slice(0, 5),
        referencedItemIds: categoryMatches.slice(0, 5).map((item) => item.id),
        source: 'full_menu_category',
        status: 'clarification_needed',
      };
    }
  }

  return {
    clarificationOptions: [],
    referencedItemIds: [],
    source: 'none',
    status: 'not_found',
  };
}

export function findItemsByDietaryPreference(input: string, menuItems: MenuItem[]) {
  const normalizedInput = normalizeText(input);
  const tags: MenuTag[] = [];

  if (/\bvegan\b/.test(normalizedInput)) {
    tags.push('vegan');
  }

  if (/\bvegetarian\b|\bveg\b/.test(normalizedInput)) {
    tags.push('vegetarian');
  }

  if (/\bgluten\s*free\b|\bgluten-free\b/.test(normalizedInput)) {
    tags.push('gluten-free');
  }

  if (tags.length === 0) {
    return [];
  }

  return menuItems.filter((item) => tags.some((tag) => item.tags.includes(tag)));
}

export function findItemsByPriceRange(input: string, menuItems: MenuItem[]) {
  const normalizedInput = normalizeText(input);
  const underMatch = normalizedInput.match(/\b(?:under|below|less than)\s*\$?(\d+(?:\.\d{1,2})?)/);
  const overMatch = normalizedInput.match(/\b(?:over|above|more than)\s*\$?(\d+(?:\.\d{1,2})?)/);

  if (underMatch?.[1]) {
    const maxPrice = Number(underMatch[1]);
    return menuItems.filter((item) => item.price <= maxPrice);
  }

  if (overMatch?.[1]) {
    const minPrice = Number(overMatch[1]);
    return menuItems.filter((item) => item.price >= minPrice);
  }

  return [];
}

export function findItemsByTags(input: string, menuItems: MenuItem[]) {
  const normalizedInput = normalizeText(input);
  const requestedTags: MenuTag[] = [];

  if (/\bspicy\b|\bhot\b|\bbold\b/.test(normalizedInput)) {
    requestedTags.push('spicy');
  }

  if (/\bpopular\b|\bfavorite\b|\bfavourite\b|\bbest\b|\bgood\b/.test(normalizedInput)) {
    requestedTags.push('popular');
  }

  if (/\bpremium\b/.test(normalizedInput)) {
    requestedTags.push('premium');
  }

  if (/\bclassic\b|\bsafe\b/.test(normalizedInput)) {
    requestedTags.push('classic');
  }

  if (requestedTags.length === 0) {
    return [];
  }

  return menuItems.filter((item) => requestedTags.some((tag) => item.tags.includes(tag)));
}

export function findItemsBySearchTerms(input: string, menuItems: MenuItem[]) {
  const normalizedInput = normalizeText(input);
  const searchTerms = normalizedInput
    .split(' ')
    .filter((token) => token.length > 2)
    .filter((token) => !searchStopWords.has(token))
    .filter((token) => !genericTerms.has(token));

  if (searchTerms.length === 0) {
    return [];
  }

  return menuItems.filter((item) => {
    const searchableText = normalizeText(`${item.name} ${item.description} ${item.category}`);

    return searchTerms.some((term) => searchableText.includes(term));
  });
}

export function findItemsByCategory(input: string, menuItems: MenuItem[]) {
  const normalizedInput = normalizeText(input);

  if (/\bburgers?\b/.test(normalizedInput)) {
    return menuItems.filter((item) => item.category === 'Burgers');
  }

  if (/\bsandwich(?:es)?\b|\bpanini\b/.test(normalizedInput)) {
    return menuItems.filter((item) => item.category === 'Sandwiches');
  }

  if (/\bdrinks?\b|\bbeverages?\b|\bsoda\b|\bwater\b/.test(normalizedInput)) {
    return menuItems.filter((item) => item.category === 'Drinks');
  }

  if (/\bsides?\b|\bfries\b|\bsalad\b/.test(normalizedInput)) {
    return menuItems.filter((item) => item.category === 'Sides');
  }

  if (/\bdesserts?\b|\bsweets?\b|\bcake\b|\bbrownie\b|\bcheesecake\b/.test(normalizedInput)) {
    return menuItems.filter((item) => item.category === 'Desserts');
  }

  return [];
}

export function getMenuItemAliases(item: MenuItem) {
  const normalizedName = normalizeText(item.name);
  const aliases = new Set([normalizedName, normalizeText(item.id.replace(/_/g, ' '))]);
  const nameTokens = normalizedName.split(' ');

  if (nameTokens.includes('burger')) {
    aliases.add(`${nameTokens.slice(0, -1).join(' ')} burger`.trim());
  }

  if (nameTokens.includes('sandwich')) {
    aliases.add(`${nameTokens.slice(0, -1).join(' ')} sandwich`.trim());
  }

  if (normalizedName.includes('coke')) {
    aliases.add('cola');
    aliases.add('soda');
  }

  if (normalizedName.includes('water')) {
    aliases.add('water');
  }

  if (normalizedName.includes('fries')) {
    aliases.add('fries');
  }

  return Array.from(aliases).filter(Boolean);
}

export function formatMenuItems(items: MenuItem[]) {
  return items.map((item) => `${item.name} ($${item.price.toFixed(2)})`).join(', ');
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s.$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMenuItem(normalizedInput: string, item: MenuItem) {
  const aliases = getMenuItemAliases(item);
  const specificAliases = aliases.filter((alias) => !genericTerms.has(alias));
  const exactSpecificAlias = specificAliases.find((alias) => normalizedInput.includes(alias));

  if (exactSpecificAlias) {
    return 100 + exactSpecificAlias.length;
  }

  const normalizedName = normalizeText(item.name);
  const inputTokens = normalizedInput.split(' ').filter((token) => token.length > 2);
  const nameTokens = normalizedName.split(' ').filter((token) => token.length > 2);
  const matchingTokens = inputTokens.filter((token) => nameTokens.includes(token));

  return matchingTokens.length >= 2 ? matchingTokens.length * 15 : 0;
}

function getRequestedIndex(input: string, total: number) {
  const normalizedInput = normalizeText(input);

  if (/\b(first|1st)\b/.test(normalizedInput)) {
    return 0;
  }

  if (/\b(second|2nd)\b/.test(normalizedInput)) {
    return total > 1 ? 1 : undefined;
  }

  if (/\b(third|3rd)\b/.test(normalizedInput)) {
    return total > 2 ? 2 : undefined;
  }

  if (/\blast\b/.test(normalizedInput)) {
    return total - 1;
  }

  return undefined;
}

function collectReferencedItems(
  lastReferencedItemIds: string[],
  conversationHistory: AssistantConversationMessage[],
  menuItems: MenuItem[]
) {
  const referencedIds =
    lastReferencedItemIds.length > 0
      ? lastReferencedItemIds
      : [...conversationHistory]
          .reverse()
          .find((message) => message.role === 'assistant' && message.referencedItemIds?.length)
          ?.referencedItemIds ?? [];

  const uniqueReferencedIds = Array.from(new Set(referencedIds));

  return uniqueReferencedIds
    .map((itemId) => menuItems.find((item) => item.id === itemId))
    .filter((item): item is MenuItem => Boolean(item));
}

function getContextReferenceMatches(input: string, referencedItems: MenuItem[]) {
  if (!/\b(that|those|it|one|first|second|third|last|recommended)\b/.test(input)) {
    return [];
  }

  const requestedIndex = getRequestedIndex(input, referencedItems.length);
  const indexedItem = requestedIndex !== undefined ? referencedItems[requestedIndex] : undefined;

  if (indexedItem) {
    return [indexedItem];
  }

  return referencedItems.length === 1 ? referencedItems : [];
}

function extractGenericFoodType(input: string): GenericFoodType | undefined {
  if (/\bburgers?\b/.test(input)) {
    return 'burger';
  }

  if (/\bsandwich(?:es)?\b|\bpanini\b/.test(input)) {
    return 'sandwich';
  }

  if (/\bdrinks?\b|\bbeverages?\b/.test(input)) {
    return 'drink';
  }

  if (/\bfries\b/.test(input)) {
    return 'fries';
  }

  if (/\bsides?\b/.test(input)) {
    return 'side';
  }

  if (/\bdesserts?\b|\bsweets?\b/.test(input)) {
    return 'dessert';
  }

  return undefined;
}

function itemMatchesGenericType(item: MenuItem, type: GenericFoodType) {
  const normalizedName = normalizeText(item.name);

  switch (type) {
    case 'burger':
      return item.category === 'Burgers' || normalizedName.includes('burger');
    case 'sandwich':
      return item.category === 'Sandwiches' || normalizedName.includes('sandwich');
    case 'drink':
      return item.category === 'Drinks';
    case 'fries':
      return normalizedName.includes('fries');
    case 'side':
      return item.category === 'Sides';
    case 'dessert':
      return item.category === 'Desserts';
  }
}
