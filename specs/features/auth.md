# Feature: Authentication (Supabase)

## Goal

Provide **user accounts** without custom auth protocol design: **Supabase Auth** handles identity, sessions, and token refresh.

## MVP scope

- Sign in / sign up via **one** primary method (recommend **magic link email** or **OTP** to avoid password storage UX on mobile—finalize in implementation).
- Session available app-wide; **logout**.
- **Pieces and MusicXML remain on-device** — auth does **not** trigger upload of score files in MVP.

## Supabase Postgres usage

- Optional **minimal** tables, e.g. `profiles(id, display_name, created_at)` keyed by `auth.users.id`.
- No `pieces` / `sheet_xml` blob tables for MVP unless product explicitly expands.

## Android-first, Apple-ready

- Use **Supabase JS** or REST from RN in a thin `integrations/supabase` layer.
- Avoid Android-only Google Sign-In as the **only** option if we want iOS later without rework; if using OAuth, plan **Apple** provider when shipping iOS.

## Agent notes

- Store Supabase URL and anon key via **environment / build config**, never commit secrets.
- Handle **token refresh** and **signed-out** states explicitly in Zustand or a small auth store.

## Acceptance criteria

- [ ] User can sign in and out; cold start restores session when valid.
- [ ] App behaves correctly when offline **after** session established (local pieces still available; auth refresh may fail gracefully).
- [ ] No MusicXML content sent to Supabase in MVP.
