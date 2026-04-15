Component guidelines

- Keep presentational UI as server components where possible.
- Interactive pieces (cart toggles, forms) should be `use client` components in `components/`.
- Use BEM-style class names for elements, then apply Tailwind utilities in JSX.

Example BEM classes:

- `product-card`
- `product-card__image`
- `product-card__price--old`
