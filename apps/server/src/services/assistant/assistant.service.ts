import {
  assistantMessageResponseSchema,
  type AssistantCartAction,
  type AssistantMessageRequest,
  type AssistantMessageResponse,
  type MenuItem,
} from '@intelligent-bistro/contracts';
import OpenAI from 'openai';

import { env } from '../../config/env';
import { getMenuItems } from '../menu.service';
import { validateCartActions } from './cartActionValidator';
import {
  findItemsByCategory,
  findItemsByDietaryPreference,
  findItemsByPriceRange,
  findItemsBySearchTerms,
  findItemsByTags,
  formatMenuItems,
  getMenuItemAliases,
  fuzzyMatchMenuItem,
  normalizeText,
  resolveItemFromContext,
  resolvePronounsFromContext,
} from './menuMatching.utils';

let openaiClient: OpenAI | undefined;

type AssistantAddCartAction = Extract<AssistantCartAction, { type: 'add' }>;

const assistantSystemPrompt = [
  'You are an intelligent restaurant ordering assistant for Intelligent Bistro.',
  '',
  'Your job is to:',
  '- understand what the user wants',
  '- answer menu questions naturally',
  '- recommend items based on preferences',
  '- ask clarifying questions when requests are ambiguous',
  '- convert clear ordering requests into structured cart actions',
  '- use conversation history to resolve phrases like "that", "those", "the first one", or "make it large"',
  '- never invent menu items',
  '- never update the cart unless the user clearly asks to add, remove, or modify an item',
  '- always return valid JSON matching the schema',
  '',
  'Intent values:',
  'menu_question | cart_update | cart_question | recommendation_request | clarification_needed | small_talk | checkout_intent | unknown',
  '',
  'Cart action values:',
  'add | remove | update_quantity | update_modifiers | clear_cart',
  '',
  'Menu rules:',
  '- Only recommend items from the provided menu.',
  '- If user asks for something unavailable, suggest the closest available alternatives.',
  '- If multiple items match for an order request, ask a clarification question.',
  '- If the user asks a general question, answer conversationally without cart actions.',
  '- If the user confirms a previous suggestion, use conversation history to resolve the item.',
  '- If the user says they are done, that is all, no more, ready to pay, or wants checkout/payment, classify as checkout_intent and do not create cart actions.',
  '- When resolving ambiguous references like "burger", "sandwich", "that", "one", or "those", first look at the previous assistant message and referencedItemIds. Prefer the most recent relevant item over the full menu.',
  '- If a message clearly says add, order, take, remove, update, or make, classify it as cart_update even when it contains descriptive words like spicy, vegan, light, or large.',
  '- For multi-item order requests, return one action for each clearly matched menu item.',
  '- Treat condiments such as ketchup, mayo, sauce, no onions, and extra spicy as modifiers, not separate menu items.',
  '- Use item ids exactly as provided.',
  '- If confidence is below 0.6, return no actions and ask a clarifying question.',
  '',
  'Return exactly this JSON shape:',
  '{',
  '  "intent": "menu_question | cart_update | cart_question | recommendation_request | clarification_needed | small_talk | checkout_intent | unknown",',
  '  "assistantMessage": "natural response to user",',
  '  "actions": [],',
  '  "needsClarification": false,',
  '  "clarificationOptions": [],',
  '  "referencedItemIds": [],',
  '  "confidence": 0.0',
  '}',
  '',
  'Example cart update:',
  '{"intent":"cart_update","assistantMessage":"Added 2 Spicy Chicken Sandwiches and 1 Large Water to your cart.","actions":[{"type":"add","itemId":"spicy_chicken_sandwich","quantity":2,"modifiers":[],"reason":"User clearly ordered this item."},{"type":"add","itemId":"large_water","quantity":1,"modifiers":["large"],"reason":"User clearly ordered a large water."}],"needsClarification":false,"clarificationOptions":[],"referencedItemIds":["spicy_chicken_sandwich","large_water"],"confidence":0.92}',
  '',
  'Example clarification:',
  '{"intent":"clarification_needed","assistantMessage":"Sure. Which burger would you like?","actions":[],"needsClarification":true,"clarificationOptions":["Classic Smash Burger","Spicy Chicken Burger","BBQ Bacon Burger"],"referencedItemIds":["classic_smash_burger","spicy_chicken_burger","bbq_bacon_burger"],"confidence":0.86}',
].join('\n');

export async function handleAssistantMessage(
  request: AssistantMessageRequest
): Promise<AssistantMessageResponse> {
  const menuItems = getMenuItems().filter((item) => item.available);
  const normalizedMessage = normalizeText(request.message);

  if (isCheckoutIntent(normalizedMessage)) {
    return finalizeAssistantResponse(createCheckoutIntentResponse(request), request, menuItems);
  }

  const deterministicCartUpdate = createDeterministicCartUpdateResponse(request, menuItems);

  if (deterministicCartUpdate) {
    return finalizeAssistantResponse(deterministicCartUpdate, request, menuItems);
  }

  const deterministicRecommendation = createDeterministicRecommendationResponse(
    request,
    menuItems
  );

  if (deterministicRecommendation) {
    return finalizeAssistantResponse(deterministicRecommendation, request, menuItems);
  }

  if (shouldUseOpenAi()) {
    try {
      const openAiResponse = await requestOpenAiAssistantResponse(request, menuItems);
      return finalizeAssistantResponse(openAiResponse, request, menuItems);
    } catch {
      return finalizeAssistantResponse(createFallbackAssistantResponse(request, menuItems), request, menuItems);
    }
  }

  return finalizeAssistantResponse(createFallbackAssistantResponse(request, menuItems), request, menuItems);
}

async function requestOpenAiAssistantResponse(
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
) {
  const completion = await getOpenAiClient().chat.completions.create({
    messages: [
      {
        content: assistantSystemPrompt,
        role: 'system',
      },
      {
        content: JSON.stringify({
          cart: request.cart,
          conversationHistory: request.conversationHistory,
          menu: menuItems.map((item) => ({
            available: item.available,
            category: item.category,
            description: item.description,
            id: item.id,
            name: item.name,
            price: item.price,
            tags: item.tags,
            variants: item.variants ?? [],
          })),
          userMessage: request.message,
        }),
        role: 'user',
      },
    ],
    model: env.openaiModel,
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message.content;

  if (!content) {
    throw new Error('OpenAI returned an empty assistant response');
  }

  return assistantMessageResponseSchema.parse(JSON.parse(content));
}

function getOpenAiClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  return openaiClient;
}

function shouldUseOpenAi() {
  return Boolean(
    env.openaiApiKey &&
      env.openaiApiKey.trim().length > 0 &&
      !env.openaiApiKey.includes('replace_with')
  );
}

function finalizeAssistantResponse(
  response: AssistantMessageResponse,
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
) {
  const inferredReferencedItemIds = inferReferencedItemIds(response, request, menuItems);
  const normalizedResponse = assistantMessageResponseSchema.parse({
    ...response,
    referencedItemIds: Array.from(
      new Set([
        ...response.referencedItemIds,
        ...inferredReferencedItemIds,
        ...response.actions.flatMap((action) => (action.itemId ? [action.itemId] : [])),
      ])
    ),
  });

  const confidenceIsTooLow = normalizedResponse.confidence < 0.6;
  const safeResponse = confidenceIsTooLow
    ? assistantMessageResponseSchema.parse({
        ...normalizedResponse,
        actions: [],
        assistantMessage:
          normalizedResponse.assistantMessage ||
          'I want to make sure I understand. Could you clarify what you want?',
        intent: 'clarification_needed',
        needsClarification: true,
      })
    : normalizedResponse;

  return validateCartActions({
    cart: request.cart,
    menuItems,
    response: safeResponse,
  });
}

function inferReferencedItemIds(
  response: AssistantMessageResponse,
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
) {
  if (response.actions.length > 0) {
    return [];
  }

  const textMatches = fuzzyMatchMenuItem(
    `${request.message} ${response.assistantMessage}`,
    menuItems
  ).map((match) => match.item);
  const preferenceMatches =
    textMatches.length === 0 &&
    (response.intent === 'menu_question' || response.intent === 'recommendation_request')
      ? getPreferenceMatches(request.message, menuItems)
      : [];
  const inferredItems = [...textMatches, ...preferenceMatches];
  const uniqueIds = new Set<string>();

  return inferredItems
    .filter((item) => {
      if (uniqueIds.has(item.id)) {
        return false;
      }

      uniqueIds.add(item.id);
      return true;
    })
    .slice(0, 6)
    .map((item) => item.id);
}

function createFallbackAssistantResponse(
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
): AssistantMessageResponse {
  const normalizedMessage = normalizeText(request.message);

  if (isSmallTalk(normalizedMessage)) {
    return buildResponse({
      assistantMessage:
        'Hi. I can help you explore the menu, suggest something based on your taste, or update your cart.',
      confidence: 0.9,
      intent: 'small_talk',
    });
  }

  if (isCheckoutIntent(normalizedMessage)) {
    return buildResponse({
      assistantMessage: 'Checkout is ready when you are. Review your cart, then tap Proceed to Checkout.',
      confidence: 0.9,
      intent: 'checkout_intent',
    });
  }

  if (isCartQuestion(normalizedMessage)) {
    return buildResponse({
      actions: [],
      assistantMessage: summarizeCart(request.cart, menuItems),
      confidence: 0.94,
      intent: 'cart_question',
    });
  }

  if (isClearCart(normalizedMessage)) {
    return buildResponse({
      actions: [
        {
          reason: 'User asked to clear the cart.',
          type: 'clear_cart',
        },
      ],
      assistantMessage: 'Cleared your cart.',
      confidence: 0.95,
      intent: 'cart_update',
    });
  }

  if (isCartMutation(normalizedMessage)) {
    return createCartMutationResponse(normalizedMessage, request, menuItems);
  }

  if (isRecommendationRequest(normalizedMessage)) {
    return createRecommendationResponse(normalizedMessage, menuItems);
  }

  if (isMenuQuestion(normalizedMessage)) {
    return createMenuQuestionResponse(normalizedMessage, menuItems);
  }

  return buildResponse({
    assistantMessage:
      'I can help with menu questions, recommendations, and cart changes. Tell me what you are craving or what you want to order.',
    confidence: 0.5,
    intent: 'unknown',
    needsClarification: true,
  });
}

function createCheckoutIntentResponse(request: AssistantMessageRequest) {
  const hasCartItems = request.cart.length > 0;

  return buildResponse({
    assistantMessage: hasCartItems
      ? 'Your order is ready. I am taking you to payment now.'
      : 'Your cart is empty right now. Add an item first, then I can take you to payment.',
    confidence: 0.94,
    intent: 'checkout_intent',
  });
}

function createDeterministicCartUpdateResponse(
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
) {
  const normalizedMessage = normalizeText(request.message);

  if (!isCartMutation(normalizedMessage) || !isAddIntent(normalizedMessage)) {
    return undefined;
  }

  return createContextAwareAddResponse(normalizedMessage, request, menuItems);
}

function createDeterministicRecommendationResponse(
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
) {
  const normalizedMessage = normalizeText(request.message);

  if (isCartMutation(normalizedMessage) || !isRecommendationRequest(normalizedMessage)) {
    return undefined;
  }

  return findItemsByCategory(normalizedMessage, menuItems).length > 0
    ? createRecommendationResponse(normalizedMessage, menuItems)
    : undefined;
}

function createRecommendationResponse(message: string, menuItems: MenuItem[]) {
  const matchedPreferenceItems = getPreferenceMatches(message, menuItems);
  const categoryMatches = findItemsByCategory(message, menuItems);
  const recommendedCategoryItem =
    categoryMatches.find((item) => item.tags.includes('popular')) ?? categoryMatches[0];
  const categoryRecommendation =
    recommendedCategoryItem && /\b(recommend|suggest)\b/.test(message)
      ? [recommendedCategoryItem]
      : [];
  const recommendedItems =
    categoryRecommendation.length > 0
      ? categoryRecommendation
      : matchedPreferenceItems.length > 0
      ? matchedPreferenceItems.slice(0, 5)
      : menuItems.filter((item) => item.tags.includes('popular')).slice(0, 5);

  return buildResponse({
    assistantMessage: `I would recommend ${formatMenuItems(recommendedItems)}. Tell me which one you want and I can add it.`,
    confidence: 0.88,
    intent: 'recommendation_request',
    referencedItemIds: recommendedItems.map((item) => item.id),
  });
}

function createContextAwareAddResponse(
  message: string,
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
) {
  const resolution = resolveItemFromContext({
    conversationHistory: request.conversationHistory,
    lastReferencedItemIds: request.lastReferencedItemIds,
    menu: menuItems,
    userMessage: message,
  });

  if (resolution.status === 'clarification_needed' && resolution.source !== 'full_menu_fuzzy') {
    return buildClarificationResponse(
      resolution.clarificationOptions,
      'Sure. Which one would you like me to add?'
    );
  }

  if (resolution.status !== 'resolved' || resolution.source !== 'context') {
    return undefined;
  }

  const directItemIds = new Set<string>([resolution.item.id]);
  const directItems = fuzzyMatchMenuItem(message, menuItems)
    .map((match) => match.item)
    .filter((item) => {
      if (directItemIds.has(item.id)) {
        return false;
      }

      directItemIds.add(item.id);
      return true;
    });
  const actions: AssistantAddCartAction[] = [
    {
      itemId: resolution.item.id,
      modifiers: extractFoodModifiers(message),
      quantity: extractQuantity(message) ?? 1,
      reason: 'User used a generic item word resolved from recent assistant context.',
      type: 'add',
    },
    ...directItems.map((item) => ({
      itemId: item.id,
      modifiers: extractModifiersForMenuItem(message, item),
      quantity: extractQuantityForMenuItem(message, item),
      reason: 'User clearly mentioned this menu item in the same request.',
      type: 'add' as const,
    })),
  ];

  return buildResponse({
    actions,
    assistantMessage: formatAddedActionsMessage(actions, menuItems),
    confidence: 0.9,
    intent: 'cart_update',
    referencedItemIds: actions.map((action) => action.itemId),
  });
}

function createMenuQuestionResponse(message: string, menuItems: MenuItem[]) {
  const itemMatches = fuzzyMatchMenuItem(message, menuItems);
  const preferenceMatches = getPreferenceMatches(message, menuItems);

  if (itemMatches[0] && /\b(spicy|price|cost|how much|what is|tell me|describe)\b/.test(message)) {
    const item = itemMatches[0].item;
    const spicyCopy = item.tags.includes('spicy') ? ' It is one of our spicy options.' : '';

    return buildResponse({
      assistantMessage: `${item.name} is $${item.price.toFixed(2)}. ${item.description}${spicyCopy}`,
      confidence: 0.9,
      intent: 'menu_question',
      referencedItemIds: [item.id],
    });
  }

  if (preferenceMatches.length > 0) {
    return buildResponse({
      assistantMessage: `Yes. You can get ${formatMenuItems(preferenceMatches.slice(0, 6))}.`,
      confidence: 0.9,
      intent: 'menu_question',
      referencedItemIds: preferenceMatches.slice(0, 6).map((item) => item.id),
    });
  }

  const popularItems = menuItems.filter((item) => item.tags.includes('popular')).slice(0, 4);

  return buildResponse({
    assistantMessage: `You can order from Burgers, Sandwiches, Drinks, Sides, and Desserts. Popular picks include ${formatMenuItems(popularItems)}.`,
    confidence: 0.88,
    intent: 'menu_question',
    referencedItemIds: popularItems.map((item) => item.id),
  });
}

function createCartMutationResponse(
  message: string,
  request: AssistantMessageRequest,
  menuItems: MenuItem[]
) {
  const contextItems = resolvePronounsFromContext(
    message,
    request.conversationHistory,
    menuItems
  );
  const directMatches = fuzzyMatchMenuItem(message, menuItems).map((match) => match.item);
  const candidateItems = contextItems.length > 0 ? contextItems : directMatches;
  const categoryMatches = findItemsByCategory(message, menuItems);
  const quantity = extractQuantity(message) ?? 1;
  const modifiers = extractModifiers(message);
  const multiAddActions =
    contextItems.length === 0 && isAddIntent(message) ? createMultiAddActions(message, menuItems) : [];

  if (multiAddActions.length > 1) {
    const menuItemsById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));
    const actionSummary = multiAddActions
      .map((action) => {
        const menuItem = menuItemsById.get(action.itemId);
        return `${action.quantity ?? 1} ${menuItem?.name ?? action.itemId}`;
      })
      .join(' and ');

    return buildResponse({
      actions: multiAddActions,
      assistantMessage: `Added ${actionSummary} to your cart.`,
      confidence: 0.84,
      intent: 'cart_update',
      referencedItemIds: multiAddActions.map((action) => action.itemId),
    });
  }

  if (candidateItems.length === 0 && categoryMatches.length > 1) {
    return buildClarificationResponse(categoryMatches.slice(0, 5), `Sure. Which ${categoryMatches[0]?.category.toLowerCase()} item would you like?`);
  }

  if (candidateItems.length > 1 && contextItems.length === 0) {
    return buildClarificationResponse(candidateItems.slice(0, 5), 'I found a few matches. Which one should I use?');
  }

  const item = candidateItems[0];

  if (!item) {
    return buildResponse({
      assistantMessage:
        'I can help with that, but I need the exact menu item. What would you like me to add or change?',
      confidence: 0.58,
      intent: 'clarification_needed',
      needsClarification: true,
    });
  }

  if (isRemoveIntent(message)) {
    return buildResponse({
      actions: [
        {
          itemId: item.id,
          modifiers,
          quantity,
          reason: 'User asked to remove this item from the cart.',
          type: 'remove',
        },
      ],
      assistantMessage: `Removed ${item.name} from your cart.`,
      confidence: 0.86,
      intent: 'cart_update',
      referencedItemIds: [item.id],
    });
  }

  if (isQuantityUpdateIntent(message)) {
    return buildResponse({
      actions: [
        {
          itemId: item.id,
          modifiers: [],
          quantity,
          reason: 'User asked to change the item quantity.',
          type: 'update_quantity',
        },
      ],
      assistantMessage: `Updated ${item.name} quantity to ${quantity}.`,
      confidence: 0.84,
      intent: 'cart_update',
      referencedItemIds: [item.id],
    });
  }

  if (isModifierUpdateIntent(message) && modifiers.length > 0) {
    return buildResponse({
      actions: [
        {
          itemId: item.id,
          modifiers,
          reason: 'User asked to change item modifiers.',
          type: 'update_modifiers',
        },
      ],
      assistantMessage: `Updated ${item.name}.`,
      confidence: 0.84,
      intent: 'cart_update',
      referencedItemIds: [item.id],
    });
  }

  return buildResponse({
    actions: [
      {
        itemId: item.id,
        modifiers,
        quantity,
        reason: contextItems.length > 0
          ? 'User referred to a previously discussed item.'
          : 'User clearly asked to add this menu item.',
        type: 'add',
      },
    ],
    assistantMessage: `Added ${quantity} ${pluralizeName(item.name, quantity)} to your cart.`,
    confidence: 0.86,
    intent: 'cart_update',
    referencedItemIds: [item.id],
  });
}

function buildClarificationResponse(items: MenuItem[], assistantMessage: string) {
  return buildResponse({
    assistantMessage,
    clarificationOptions: items.map((item) => item.name),
    confidence: 0.82,
    intent: 'clarification_needed',
    needsClarification: true,
    referencedItemIds: items.map((item) => item.id),
  });
}

function getPreferenceMatches(message: string, menuItems: MenuItem[]) {
  const dietaryMatches = findItemsByDietaryPreference(message, menuItems);
  const priceMatches = findItemsByPriceRange(message, menuItems);
  const tagMatches = findItemsByTags(message, menuItems);
  const categoryMatches = findItemsByCategory(message, menuItems);
  const searchMatches = findItemsBySearchTerms(message, menuItems);
  const combinedMatches = [
    ...dietaryMatches,
    ...priceMatches,
    ...tagMatches,
    ...categoryMatches,
    ...searchMatches,
  ];
  const uniqueIds = new Set<string>();

  return combinedMatches.filter((item) => {
    if (uniqueIds.has(item.id)) {
      return false;
    }

    uniqueIds.add(item.id);
    return true;
  });
}

function buildResponse(response: Partial<AssistantMessageResponse> & {
  assistantMessage: string;
  confidence: number;
  intent: AssistantMessageResponse['intent'];
}) {
  return assistantMessageResponseSchema.parse({
    actions: [],
    clarificationOptions: [],
    needsClarification: false,
    referencedItemIds: [],
    ...response,
  });
}

function summarizeCart(cart: AssistantMessageRequest['cart'], menuItems: MenuItem[]) {
  if (cart.length === 0) {
    return 'Your cart is empty right now.';
  }

  const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
  const summary = cart
    .map((line) => {
      const itemName = menuItemsById.get(line.itemId)?.name ?? line.itemId;
      return `${line.quantity} x ${itemName}`;
    })
    .join(', ');

  return `Your cart has ${summary}.`;
}

function extractQuantity(input: string) {
  const normalizedInput = normalizeText(input);
  const numericMatch = normalizedInput.match(/\b(\d+)\b/);

  if (numericMatch?.[1]) {
    return Number(numericMatch[1]);
  }

  const quantityWords = new Map([
    ['a', 1],
    ['an', 1],
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
    ['five', 5],
  ]);
  const wordMatch = normalizedInput
    .split(' ')
    .find((token) => quantityWords.has(token));

  return wordMatch ? quantityWords.get(wordMatch) : undefined;
}

function extractModifiers(input: string) {
  const normalizedInput = normalizeText(input);
  const modifiers: string[] = [];

  if (/\blarge\b/.test(normalizedInput)) {
    modifiers.push('large');
  }

  if (/\bregular\b/.test(normalizedInput)) {
    modifiers.push('regular');
  }

  if (/\bno ice\b|\bwithout ice\b/.test(normalizedInput)) {
    modifiers.push('no ice');
  }

  if (/\bketchup\b/.test(normalizedInput)) {
    modifiers.push('ketchup');
  }

  if (/\bmayo\b|\bmayonnaise\b/.test(normalizedInput)) {
    modifiers.push('mayo');
  }

  if (/\bsauce\b/.test(normalizedInput)) {
    modifiers.push(/\bextra sauce\b/.test(normalizedInput) ? 'extra sauce' : 'sauce');
  }

  if (/\bextra spicy\b|\bspicier\b/.test(normalizedInput)) {
    modifiers.push('extra spicy');
  }

  if (/\bno onions?\b|\bwithout onions?\b/.test(normalizedInput)) {
    modifiers.push('no onions');
  }

  return modifiers;
}

function extractFoodModifiers(input: string) {
  const normalizedInput = normalizeText(input);
  const modifiers: string[] = [];

  if (/\bketchup\b/.test(normalizedInput)) {
    modifiers.push('ketchup');
  }

  if (/\bmayo\b|\bmayonnaise\b/.test(normalizedInput)) {
    modifiers.push('mayo');
  }

  if (/\bsauce\b/.test(normalizedInput)) {
    modifiers.push(/\bextra sauce\b/.test(normalizedInput) ? 'extra sauce' : 'sauce');
  }

  if (/\bextra spicy\b|\bspicier\b/.test(normalizedInput)) {
    modifiers.push('extra spicy');
  }

  if (/\bno onions?\b|\bwithout onions?\b/.test(normalizedInput)) {
    modifiers.push('no onions');
  }

  return modifiers;
}

function extractModifiersForMenuItem(message: string, item: MenuItem) {
  const segment = getSegmentMentioningItem(message, item) ?? message;

  if (item.category === 'Drinks') {
    return extractDrinkModifiers(segment);
  }

  return extractFoodModifiers(segment);
}

function extractDrinkModifiers(input: string) {
  const normalizedInput = normalizeText(input);
  const modifiers: string[] = [];

  if (/\blarge\b/.test(normalizedInput)) {
    modifiers.push('large');
  }

  if (/\bregular\b/.test(normalizedInput)) {
    modifiers.push('regular');
  }

  if (/\bno ice\b|\bwithout ice\b/.test(normalizedInput)) {
    modifiers.push('no ice');
  }

  return modifiers;
}

function extractQuantityForMenuItem(message: string, item: MenuItem) {
  const segment = getSegmentMentioningItem(message, item);

  return segment ? extractQuantity(segment) ?? 1 : 1;
}

function getSegmentMentioningItem(message: string, item: MenuItem) {
  const aliases = getMenuItemAliases(item);

  return splitOrderSegments(message).find((segment) =>
    aliases.some((alias) => normalizeText(segment).includes(alias))
  );
}

function formatAddedActionsMessage(actions: AssistantAddCartAction[], menuItems: MenuItem[]) {
  const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
  const actionSummary = actions
    .map((action) => {
      const itemName = menuItemsById.get(action.itemId)?.name ?? action.itemId;

      return `${action.quantity} ${itemName}`;
    })
    .join(' and ');
  const foodModifiers = Array.from(
    new Set(
      actions.flatMap((action) =>
        action.modifiers.filter((modifier) => !['large', 'no ice', 'regular'].includes(modifier))
      )
    )
  );

  if (foodModifiers.length === 0) {
    return `Added ${actionSummary} to your cart.`;
  }

  const modifierSummary = foodModifiers.join(', ');
  const modifierNoun = foodModifiers.length === 1 ? 'a modifier' : 'modifiers';

  return `Added ${actionSummary} to your cart. I added ${modifierSummary} as ${modifierNoun}.`;
}

function createMultiAddActions(message: string, menuItems: MenuItem[]): AssistantAddCartAction[] {
  const orderSegments = splitOrderSegments(message);

  if (orderSegments.length < 2) {
    return [];
  }

  return orderSegments
    .map((segment) => {
      const match = fuzzyMatchMenuItem(segment, menuItems)[0];

      if (!match) {
        return undefined;
      }

      return {
        itemId: match.item.id,
        modifiers: extractModifiers(segment),
        quantity: extractQuantity(segment) ?? 1,
        reason: 'Fallback parser matched one item from a multi-item add request.',
        type: 'add',
      } satisfies AssistantAddCartAction;
    })
    .filter((action): action is AssistantAddCartAction => Boolean(action));
}

function splitOrderSegments(message: string) {
  return normalizeText(message)
    .replace(/^(add|get|order|take|i ll take|i will take|i want|i would like)\s+/, '')
    .split(/\s+and\s+|,/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isSmallTalk(input: string) {
  return /^(hi|hello|hey|yo|namaste|good morning|good afternoon|good evening)\b/.test(input);
}

function isCheckoutIntent(input: string) {
  return (
    /\b(checkout|check out|pay|payment|place order|finish order|complete order|complete my order)\b/.test(input) ||
    /\b(order is done|order done|i'?m done|i am done|done ordering|that'?s all|thats all|no more|ready to pay)\b/.test(input)
  );
}

function isCartQuestion(input: string) {
  return /\b(what'?s|what is|show|summarize|summary)\b.*\bcart\b/.test(input);
}

function isClearCart(input: string) {
  return /\b(clear|empty|remove everything|delete everything)\b.*\b(cart|everything|all)\b/.test(input);
}

function isRecommendationRequest(input: string) {
  return /\b(recommend|suggest|what'?s good|whats good|combo|light|healthy|under|below|less than|best)\b/.test(input);
}

function isMenuQuestion(input: string) {
  return (
    /\b(menu|menus|options?|available|vegetarian|vegan|spicy|under|below|less than)\b/.test(input) ||
    /\bwhat\s+(can|could|should)\s+i\s+(order|get|eat|try)\b/.test(input) ||
    /\bdo\s+you\s+have\b|\bis\s+there\b|\bhow much\b/.test(input)
  );
}

function isCartMutation(input: string) {
  return (
    /\b(add|take|remove|make|change|update|replace|clear|i'?ll take|i will take|actually)\b/.test(input) ||
    /\b(that|those|it|first|second|third|last)\b/.test(input)
  );
}

function isAddIntent(input: string) {
  return /\b(add|take|get|order|i'?ll take|i will take|i want|i would like)\b/.test(input);
}

function isRemoveIntent(input: string) {
  return /\b(remove|delete|take out)\b/.test(input);
}

function isQuantityUpdateIntent(input: string) {
  return /\b(quantity|qty|make that|actually make|change.*\d+|update.*\d+)\b/.test(input);
}

function isModifierUpdateIntent(input: string) {
  return /\b(make|change|update)\b/.test(input);
}

function pluralizeName(name: string, quantity: number) {
  if (quantity === 1 || name.endsWith('s')) {
    return name;
  }

  if (name.endsWith('y')) {
    return `${name.slice(0, -1)}ies`;
  }

  if (name.endsWith('ch') || name.endsWith('sh')) {
    return `${name}es`;
  }

  return `${name}s`;
}
