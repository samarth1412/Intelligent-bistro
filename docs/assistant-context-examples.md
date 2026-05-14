# Assistant Context Examples

These examples cover the contextual resolver used before the OpenAI response is trusted.

## Chicken Burger Context

User: `what chicken options do you have?`

Assistant references:

- `spicy_chicken_burger`
- `spicy_chicken_sandwich`

User: `add one burger with coke and ketchup`

Expected actions:

```json
[
  {
    "type": "add",
    "itemId": "spicy_chicken_burger",
    "quantity": 1,
    "modifiers": ["ketchup"]
  },
  {
    "type": "add",
    "itemId": "coke",
    "quantity": 1,
    "modifiers": []
  }
]
```

## Spicy Sandwich Context

User: `what spicy items do you have?`

Assistant references:

- `spicy_chicken_burger`
- `spicy_chicken_sandwich`

User: `add that sandwich`

Expected action: add `spicy_chicken_sandwich`.

## Drink Recommendation Context

User: `recommend a drink`

Assistant references one drink, for example `sparkling_lemonade`.

User: `add one`

Expected action: add the referenced drink.

## No Previous Context

User: `add burger`

Expected response: ask which burger the user wants, with burger options as clarification buttons.
