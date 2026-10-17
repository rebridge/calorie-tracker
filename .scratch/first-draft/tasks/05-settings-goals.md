# 05 — Settings & goals

**Depends on:** 01
**Spec refs:** §3 settings, §5 `/api/settings`, §6 Settings, §9

## Goal
Let the user set their own calorie and macro goals, which the Day view's progress UI compares against.

## Scope

**Shared**
- `Settings` schema: `{ calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g }` as positive integers.

**Server**
- `GET /api/settings` returns the goals plus read-only info: `{ model: "claude-haiku-5-5", database_path }`.
- `PUT /api/settings` validates and updates row `id = 1`, then returns the updated settings.

**Web**
- `/settings` page (reached from the header gear) with four numeric inputs (`inputmode="numeric"`) and a Save button.
- Read-only section showing the model in use and the DB path.
- On save: show a toast, then invalidate the `['settings']` query and all `['day', *]` queries (goals show up on every day).

## Acceptance criteria
- [ ] Defaults show on first run (2000 / 150 / 200 / 65).
- [ ] Changed goals persist across a container restart.
- [ ] Invalid values (0, negative, empty) are rejected client- and server-side with a clear message.

## Out of scope
Goal history (past days use current goals), BMR/TDEE.
