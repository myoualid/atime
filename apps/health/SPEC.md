# CoreVital Meal Planner — Specification

> Version 1.0 · Module: `food/` · Integration: new section `section-food` in [ui.js](../ui.js)

## 1. Overview

CoreVital Meal Planner is an offline-first food & meal planning module. It maintains a local library of **foods** (atomic ingredients) and **recipes** (compositions of foods), organised into **categories**. Users plan meals on a day / week / month calendar by dragging library items into meal slots. All data is persisted in **IndexedDB** and can be exported/imported as **JSON**. The module is integrated as a new section alongside Weather and Tides in the existing CoreVital shell and is built entirely with `DrawUI` primitives to match the application's visual language (dark gradient + gold accent).

## 2. Goals & Non-goals

### Goals

- Zero-build: plain ES modules, no dependencies beyond what the repo ships.
- Offline-capable: no network calls required for core flows.
- Reuse DrawUI primitives; no new UI framework.
- Gram-based nutrition accounting; recipe totals derived from ingredients.
- Drag-and-drop meal assignment across day/week views with keyboard fallback.
- Lossless JSON export/import with schema versioning.

### Non-goals (v1)

- Cloud sync, multi-user, sharing, or authentication.
- External nutrition API lookups (hook reserved).
- Barcode scanning or photo OCR.
- Native mobile wrapper.
- AI meal suggestions (hook reserved).

## 3. Ontology / Data Model

All entities share these base fields: `id` (UUIDv4 string), `createdAt`, `updatedAt` (ISO-8601), `version` (int, optimistic concurrency), `tags` (string[]).

### 3.1 `Nutrition`

```
Nutrition {
  kcal: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  fiber_g: number | null,
  sugar_g: number | null,
  sodium_mg: number | null,
  saturatedFat_g: number | null,
  micros: Record<string, { amount: number, unit: string }>
}
```

### 3.2 `FoodItem` (atomic ingredient)

```
FoodItem {
  ...base,
  name: string,
  aliases: string[],
  categoryId: string | null,              // FK Category(kind="food")
  unit: "g",                              // canonical
  densityGPerMl: number | null,
  nutritionPerGram: Nutrition,            // stored per 1 g
  defaultServingG: number,
  notes: string,                          // markdown
  imageBlobKey: string | null,
  source: { kind: "manual"|"imported"|"api", ref?: string }
}
```

UI inputs accept per-100 g for ergonomics; persisted per-gram.

### 3.3 `Recipe` (composed meal)

```
Recipe {
  ...base,
  name: string,
  categoryId: string | null,              // FK Category(kind="meal")
  description: string,                    // markdown
  instructions: string,                   // markdown
  prepTimeMin: number | null,
  cookTimeMin: number | null,
  servings: number,                       // yields N servings
  totalYieldG: number | null,
  ingredients: RecipeIngredient[],
  imageBlobKey: string | null,
  cuisine: string | null,
  difficulty: "easy"|"medium"|"hard" | null,
  _computed: {
    totalNutrition: Nutrition,
    perServingNutrition: Nutrition,
    totalWeightG: number,
    computedAt: string
  } | null
}
RecipeIngredient {
  foodItemId: string,                     // FK FoodItem
  amountG: number,
  note: string | null,
  optional: boolean,
  group: string | null
}
```

`_computed` is invalidated when ingredients or any referenced `FoodItem` mutate.

### 3.4 `Category`

```
Category {
  ...base,
  name: string,
  kind: "meal" | "food",
  color: string | null,                   // hex
  icon: string | null,
  sortOrder: number
}
```

**Seeded defaults** on first run:

- `kind="meal"` — Breakfast, Lunch, Dinner, Snack, Dessert, Drink.
- `kind="food"` — Protein, Vegetable, Fruit, Grain, Dairy, Fat, Spice, Beverage.

### 3.5 `PlanEntry`

```
PlanEntry {
  ...base,
  date: "YYYY-MM-DD",                     // local
  mealCategoryId: string,                 // FK Category(kind="meal")
  slotOrder: number,
  target:
    | { kind: "recipe", recipeId: string, servings: number }
    | { kind: "food",   foodItemId: string, amountG: number },
  notes: string | null
}
```

### 3.6 `ShoppingListItem` (derived)

```
ShoppingListItem {
  foodItemId: string,
  totalAmountG: number,
  sources: Array<{ planEntryId, recipeId?, amountG }>,
  checked: boolean
}
```

Generated on demand from a date-range rollup.

### 3.7 `Preferences` (singleton, `id="singleton"`)

```
Preferences {
  id: "singleton",
  defaultView: "day" | "week" | "month",
  weekStartsOn: 0..6,                     // 0=Sun
  unitsDisplay: "metric",                 // v1
  calorieTarget: number | null,
  macroTargets: { protein_g, carbs_g, fat_g } | null,
  theme: "auto"|"dark"|"light",           // reserved
  showNutritionInPlanner: boolean
}
```

### 3.8 Invariants

- All masses in grams; volumes convert via `FoodItem.densityGPerMl` when provided.
- `Recipe._computed` is invalidated when any referenced `FoodItem.version` or ingredients change.
- Deleting a `FoodItem` referenced by a `Recipe` is blocked unless user confirms cascade.
- Dangling `PlanEntry` FKs render as "(missing)" chips and are cleanable via a repair action.

## 4. Frontend

### 4.1 Module layout

```
food/
  index.js                 export createFoodSection(ctx)
  section.js               top layout, view switcher, toolbar
  signals.js               local js-signals bag
  strings.js               i18n strings
  food.css                 .health-* rules (linked from index.html)
  seed.js                  default categories on first run
  views/
    dayView.js
    weekView.js
    monthView.js
  library/
    libraryPanel.js
    foodEditor.js
    recipeEditor.js
    categoryEditor.js
  planner/
    planSlot.js
    planChip.js
    dragdrop.js
  shopping/
    shoppingList.js
  nutrition/
    calc.js                pure totals aggregator
    targets.js             compare to Preferences.macroTargets
  store/
    db.js                  IDB open/upgrade (DB: corevital-health, v1)
    repos.js               foodItems/recipes/categories/plan/prefs/blobs/shoppingChecks
    io.js                  JSON import/export + schema migrations
    search.js              in-memory tokenized index
  SPEC.md                  this document
```

### 4.2 Section integration ([ui.js](../ui.js))

- Import `createFoodSection`.
- Create `sectionFood = DrawUI.div().setClass('app-section').setId('section-food')`.
- Append to `scrollInner`, add to `sectionOrder` and `sectionEls`.
- Add `navSpec` entry: `{ id: 'section-food', label: 'Food', icon: '🍽' }`.
- In `activateSection()` call `foodUI.notifyVisible()` when the tab is shown.

### 4.3 Layout

- `DrawUI.splitContainer('horizontal', [libraryPanel, plannerRoot])`.
- **Library** (left, ~320 px): search input, "+ Food" / "+ Recipe" / Import / Export / Settings, category accordions (`CollapsibleSection` per category), counts footer. Library items are draggable chips.
- **Planner** (right): toolbar (`◂` / Today / `▸`, date label, Day|Week|Month switch, Shopping list, Nutrition toggle) + active view.

### 4.4 Views

- **Day** — vertical list of meal categories, each a droppable slot list; footer totals vs targets.
- **Week** (default) — 7-day CSS grid; columns are days, rows are meal categories; each cell is a `planSlot` drop target. Stacks to one column below 640 px.
- **Month** — 6×7 calendar. Each cell shows up to 3 chips and a `+N` overflow. Click a day opens the Day view for that date.

### 4.5 Drag-and-drop (`planner/dragdrop.js`)

- HTML5 DnD. Payload is `application/x-health-drag` JSON:

```
{ kind: "library-food"|"library-recipe"|"plan-entry",
  foodItemId?, recipeId?, planEntryId?,
  defaultAmountG?, defaultServings? }
```

- Drop targets are elements with `data-date` + `data-meal-category-id`.
- library-food → prompt grams (prefill `defaultServingG`) → create `PlanEntry`.
- library-recipe → prompt servings (prefill 1) → create `PlanEntry`.
- plan-entry → move (copy if `ctrlKey`) between slots; update `slotOrder`.
- Keyboard fallback: each chip exposes a "Move…" menu.
- Visual: target gains `.health-slot--drag-over`; chip shows `.health-chip--dragging`.

### 4.6 Editors

- **Food editor** (`FloatingPanel`): name, category, default serving (g), nutrition per 100 g (stored as per-gram), density, tags, notes, image. Warns when Δ kcal vs 4P+4C+9F > 20 %.
- **Recipe editor** (`FloatingPanel`): name, category, servings, description, instructions, ingredients table (food autocomplete + grams + optional + note), live totals + per-serving nutrition.
- **Category editor**: inline in library settings.

### 4.7 Search

`store/search.js` maintains an in-memory tokenized Map rebuilt on `onLibraryChanged`. Scoring: prefix > substring; results capped at 50. Input debounced at 120 ms.

### 4.8 Shopping list (`shopping/shoppingList.js`)

`FloatingPanel` with date-range inputs (default = current week). Aggregates plan entries → per-`FoodItem` grams via `nutrition/calc.js#shoppingRollup`. Checkboxes persist in `shoppingChecks`. Export JSON / copy-as-text actions.

### 4.9 Nutrition summary

Toggleable strip above planner: totals for current view range vs `Preferences.macroTargets`. Uses `window.Chart` for a stacked-bar macros breakdown when expanded.

### 4.10 Styling

Styles live in `food/food.css`, linked from `food/index.html`:

- `.health-*` prefix for all feature classes.
- `:root` token block (scoped via `html`) defines `--health-accent: #d4af37`, slot backgrounds, drop-over highlight, chip surface. Also provides fallbacks for `--border`, `--brand-color-border`, `--brand-color-bg-secondary` referenced by `CollapsiblePanel` / `ReorderableList`.
- Responsive: week grid stacks below 640 px; library becomes a sheet (via `FloatingPanel` mobile mode) below 768 px.

### 4.11 Accessibility

- All drag interactions keyboard-operable.
- Chips: `role="button"`, `aria-grabbed`, descriptive `aria-label`.
- Focus ring `outline: 2px solid #d4af37`.
- Respect `prefers-reduced-motion`.
- Toast announcements use `DrawUI.toast` (live region).

## 5. Backend (local)

### 5.1 IndexedDB schema

- DB: `corevital-health`, version 1.
- Stores (`keyPath: 'id'` unless stated):
  - `foodItems` — indexes `by_name` (lower(name)), `by_category`, `by_tag` (multiEntry).
  - `recipes` — `by_name`, `by_category`, `by_tag`.
  - `categories` — `by_kind`.
  - `planEntries` — `by_date`, `by_date_meal` (`[date, mealCategoryId]`), `by_recipe`, `by_food`.
  - `preferences` — singleton `id="singleton"`.
  - `blobs` — `{ key, blob, mime, createdAt }` (`keyPath: 'key'`).
  - `shoppingChecks` — composite-key string (`keyPath: 'key'`).
  - `meta` — `{ key, value }` (`keyPath: 'key'`).

### 5.2 Repo API (`store/repos.js`)

All methods return Promises; writes dispatch signals on success.

```
foodItems: list({filter?}), get(id), put(item), remove(id)   → onLibraryChanged
recipes:   list, get, put, remove, recomputeAll()            → onLibraryChanged
categories:list, put, remove(id, {cascade?})                 → onCategoriesChanged
plan:      listByRange(from,to), getDay(date),
           put(entry), remove(id),
           move({id,date,mealCategoryId,slotOrder})          → onPlanChanged
prefs:     get(), put(patch)                                 → onPrefsChanged
blobs:     put(blob) → key, get(key), remove(key)
shoppingChecks: getByRange(from,to), setCheck(key, checked)
```

Multi-store writes use a single `readwrite` transaction.

### 5.3 JSON import/export (`store/io.js`)

Export payload:

```
{
  "app": "corevital-health",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601",
  "preferences": { ... },
  "categories": [ ... ],
  "foodItems": [ ... ],
  "recipes": [ ... ],
  "planEntries": [ ... ]
}
```

- Download via `Blob` + `URL.createObjectURL`, filename `corevital-health-YYYY-MM-DD.json`.
- Import: parse → validate → user strategy (**Replace all**, **Merge prefer imported**, **Merge prefer local**) → migrate → single-txn apply → signals. Images are not inlined in v1.

### 5.4 `nutrition/calc.js` — pure functions

```
sumNutrition(a, b) → Nutrition
scaleNutrition(n, factor) → Nutrition
zeroNutrition() → Nutrition
recipeTotals(recipe, foodItemsById) → { total, perServing, weightG }
planEntryTotals(entry, recipesById, foodItemsById) → Nutrition
planDayTotals(entries, ...) → Nutrition
planRangeTotals(entries, ..., from, to) → Nutrition
shoppingRollup(entries, recipesById) → ShoppingListItem[]
```

No DOM, no IndexedDB. Unit-testable.

### 5.5 Error handling

- Storage failures → `DrawUI.toast(msg,'error')`.
- Validators return `{ ok:false, errors:[{path,msg}] }`; editors render per-field messages.
- A "Repair data integrity" action in Settings cleans dangling FKs.

## 6. Signals (`food/signals.js`)

Local js-signals bag:

- `onLibraryChanged` (foods + recipes)
- `onCategoriesChanged`
- `onPlanChanged({ date? })`
- `onPrefsChanged`
- `onImportCompleted({ stats })`

Not added to `core.signals` in v1.

## 7. Performance

- Recipe `_computed` cached on disk; invalidate on dependency change.
- Views mount/unmount cells on date navigation; diff by `(date, mealCategoryId)` key.
- Debounce search 120 ms.
- Virtualize lists only if > 200 items (profile first; not required for v1).

## 8. Testing strategy

- Pure modules (`nutrition/calc.js`, `store/io.js` validators, `store/search.js`) are loadable by a throwaway `food/__tests__/run.html` harness using plain `assert` and DOM output.
- Manual QA script: seed → add food → add recipe → drag to week → export → reset → import → verify parity.

## 9. A11y & i18n

- All interactive elements have discernible labels.
- Numbers via `Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })`.
- Dates via `tools/time.js` helpers (extend with `addDays`, `startOfWeek`, `formatIsoDate`).
- Strings centralized in `food/strings.js` (v1 English only).

## 10. Future hooks (deferred)

- Nutrition API adapter (`FoodItem.source.kind="api"`).
- Cloud sync adapter behind repo interface.
- Photo OCR / barcode.
- AI meal suggestions driven by `macroTargets`.
- Multiple profiles.

## 11. Acceptance criteria (v1)

1. A **Food** tab appears in the side nav and activates a section built by `createFoodSection`.
2. Library panel lists seeded categories with empty state; the user can create a `FoodItem` and see it under its category.
3. The user can create a `Recipe` with ≥ 2 ingredients and see live total + per-serving nutrition.
4. The user can drag a recipe from the library into a week-view meal slot; a chip appears with correct label and kcal.
5. The user can drag a chip between slots and across days.
6. Day / Week / Month views render the same plan correctly; Month shows overflow counts.
7. Shopping list for the current week aggregates ingredient grams correctly.
8. Export produces valid JSON; importing into a fresh DB reproduces state.
9. Data persists across reloads (IndexedDB).
10. No console errors; Weather/Tide sections continue to work.
