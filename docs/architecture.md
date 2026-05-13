# Architecture

Intelligent Bistro is organized as an npm workspace monorepo. The mobile app, server, and shared contracts are separate packages so each layer has clear ownership while still sharing API types.

## Packages

| Package | Responsibility |
| --- | --- |
| `apps/mobile` | Expo React Native app, screens, cart store, assistant UI |
| `apps/server` | Express API, menu routes, AI order endpoint, fallback parser |
| `packages/contracts` | Zod schemas and inferred TypeScript types shared by mobile and server |

## Data Flow

1. The mobile menu screen calls `GET /api/menu`.
2. The server loads seeded menu JSON and validates it with Zod.
3. Users add items directly from the menu or send natural-language prompts through the assistant.
4. The assistant screen posts the prompt and current cart lines to `POST /api/ai/order`.
5. The server parses the prompt through OpenAI when configured.
6. If OpenAI is unavailable, the deterministic fallback parser handles common cart commands.
7. The server validates and sanitizes cart actions before returning them.
8. The mobile app applies returned actions through the Zustand cart store.

## AI Order Endpoint

The AI endpoint always returns the shared `AiOrderResponse` contract:

```ts
{
  intent: 'cart_update' | 'cart_query' | 'clarification' | 'unknown';
  actions: CartAction[];
  assistantMessage: string;
  confidence: number;
  errors: AiOrderError[];
}
```

This keeps the frontend simple. It does not need to know whether OpenAI or the fallback parser handled the request.

## Validation Strategy

- Menu JSON is validated when loaded.
- AI requests are validated before parsing.
- AI responses are validated before returning to the frontend.
- Returned item actions are checked against the seeded menu.
- Unknown, unavailable, or ambiguous items are surfaced as structured errors.

## Fallback Parser

The fallback parser supports the core demo intents:

- Add items
- Remove items
- Update quantity
- Update modifiers
- Clear cart
- Query cart contents

It is intentionally deterministic. This makes the project reliable for reviewers who do not have an OpenAI key.

## State Management

The mobile app uses Zustand for cart state. The cart store owns:

- Cart lines
- Quantity updates
- Modifier updates
- Remove and clear actions
- AI action application
- Subtotal, tax, and total selectors

The assistant UI receives structured actions from the API and delegates all cart mutation to the store.
