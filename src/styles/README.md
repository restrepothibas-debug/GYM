# Design Control

This folder owns the visual system for the web app.

- `design-tokens.css` defines the source-of-truth variables: colors, radius, shadows and typography.
- `office-theme.css` maps the current Tailwind-heavy UI to the office theme through `[data-theme="office"]`.

Rules:

1. Add or change colors in `design-tokens.css`, not inside components.
2. Prefer semantic theme selectors in `office-theme.css` when adapting existing UI.
3. Component-level classes should handle layout and state only.
4. Keep the default product theme light, office-focused and mobile-first.
