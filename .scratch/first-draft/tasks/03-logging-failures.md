# 03 — Logging failures & in-flight feedback

**Depends on:** 02
**Spec refs:** §4 Server-side handling (non-food, refusals, errors), §6 Log (while working / on failure)

## Goal
Make the logging loop trustworthy. Bad input or a model failure never saves anything, the user's text is never lost, and the UI shows clearly that work is in progress.

## Scope

**Server**
- Non-food: if `items` is empty or `not_food_reason` is set, save nothing and return **422** `{ error: "not_food", reason }`.
- Return **502** `{ error: "model_error", reason }` and save nothing on:
  - `stop_reason` of `refusal` or `max_tokens`
  - an Anthropic API error (after the SDK's default 2 retries)
  - a schema validation failure
- Return **400** for an invalid request body (empty text, etc.).
- Log failures server-side with enough context to debug them (no API key in the logs).

**Web**
- While a submission is in flight: a spinner on the send button (and the button disabled), plus a skeleton entry card in the log.
- On 422: keep the text in the composer and show a toast with the reason ("That doesn't look like food: …").
- On 502 or a network error: keep the text and show a "Couldn't estimate that — try again" toast.
- Add a shadcn `Sonner`/toast provider to the app shell.

## Acceptance criteria
- [ ] "hello" → 422 toast, text still in the box, no DB rows.
- [ ] "ran 3 miles" → 422 toast (non-food), no DB rows.
- [ ] Simulated API failure (e.g. a bad key or a mocked client) → 502 toast, text kept, no DB rows.
- [ ] Server tests cover each failure branch with a mocked Claude client.
- [ ] Double-tapping send while in flight doesn't create duplicate entries.

## Out of scope
Clarifying questions from the model (explicitly v1 non-goal).
