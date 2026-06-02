# Auth And Workspace Loading

This flow controls what must happen after a user enters valid credentials.

## Contract

- Auth loading validates the Supabase session only.
- Workspace loading validates tenant membership, tenant data and license metadata.
- A user with no tenant can see the tenant creation form only after workspace loading completed successfully.
- A workspace request failure must show an error with retry/sign-out controls.
- No Auth or workspace request may leave the UI in an indefinite loading state.

## Code Rules

- Keep remote Auth and workspace calls bounded with a timeout.
- Use a stable user id for post-login effects; do not depend on the full Supabase session/user object for loading loops.
- Track whether the workspace completed separately from whether `activeTenant` exists.
- When changing tenant membership, license or RLS queries, test login with `manolo@gmail.com`.

## Validation

Run:

```bash
npm run lint
npm run build
npm run qa:operational
```

Then verify locally that login does one of these:

- Opens the app with the active tenant.
- Shows tenant creation when the authenticated user has no tenant.
- Shows a recoverable error if Supabase/Auth/RLS fails.
