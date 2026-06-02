# Design System Control

## Source Of Truth

Visual design is controlled from:

- `src/styles/design-tokens.css`
- `src/styles/office-theme.css`
- `src/styles/README.md`

## Rules

- Keep product UI light, office-focused and mobile-first.
- Add color, radius, shadow and typography decisions as CSS variables in `design-tokens.css`.
- Map existing component classes through `[data-theme="office"]` in `office-theme.css`.
- Avoid adding one-off color decisions inside React components.
- Component code may use utility classes for layout, spacing and state, but not for creating new palettes.
- Cards and controls should stay compact, with restrained borders and 8px-radius defaults.

## Verification

After design changes:

```bash
npm run lint
npm run build
```

If a dev server is running, manually inspect:

- Login/onboarding page.
- Dashboard.
- Members list.
- Member bottom sheet.
- Store.
- Payments/cash-flow form.
