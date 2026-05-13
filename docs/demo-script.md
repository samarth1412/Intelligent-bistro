# Demo Walkthrough

Use this flow to review the project quickly.

## 1. Start the App

Run the backend and mobile app from the repository root:

```bash
npm run dev:server
npm run dev:mobile
```

Open the Expo web preview or use Expo Go.

## 2. Menu Browsing

Open the Menu tab.

Show:

- Category tiles
- Search input
- Popular picks
- Full category list
- Add buttons

Add one or two items from the menu.

## 3. Cart Controls

Open the Cart tab.

Show:

- Cart item cards
- Quantity increase and decrease
- Remove item
- Clear cart
- Subtotal, tax, and total
- Checkout button as UI-only

## 4. Assistant Cart Updates

Open the AI tab.

Try:

```text
Add two spicy chicken sandwiches and a large water
```

Expected result:

- Assistant returns a structured response.
- Cart action history appears in the chat.
- Items are applied to the cart.

Try:

```text
Make the coke large
Change chicken sandwich quantity to 3
Remove the fries
What's in my cart?
Clear my cart
```

## 5. Error Handling

Try:

```text
Add pizza
Add chicken
```

Expected result:

- Unknown items return a structured error.
- Ambiguous items return suggestions.
- The app does not crash or apply unsafe cart actions.

## 6. OpenAI Behavior

With `OPENAI_API_KEY` configured, the backend attempts OpenAI parsing first.

Without a key, or if OpenAI fails, the deterministic fallback parser handles the supported demo prompts.
