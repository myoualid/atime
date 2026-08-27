export const STRINGS = {
    sectionTitle: 'Meal planner',
    library: 'Library',
    categories: 'Categories',
    addFood: '+ Food',
    addRecipe: '+ Recipe',
    addMenu: '+ Menu',
    menus: 'Menus',
    fullLibrary: 'Full library',
    import: 'Import',
    export: 'Export',
    importFoods: 'Import foods',
    exportFoods: 'Export foods',
    importMenu: 'Import menu',
    exportMenu: 'Export menu',
    exportFoodsEmpty: 'No foods or recipes to export.',
    exportMenusEmpty: 'No menus to export. Select a menu, or create one first.',
    exportFoodsSuccess: (foods, recipes) => `Exported ${foods} food${foods === 1 ? '' : 's'} and ${recipes} recipe${recipes === 1 ? '' : 's'}`,
    exportMenusSuccess: (n, name) => (
        n === 1 ? `Exported menu "${name}"` : `Exported ${n} menus`
    ),
    importFoodsSuccess: (s) => {
        const lib = [];
        if (s.createdFoods) lib.push(`${s.createdFoods} new food${s.createdFoods === 1 ? '' : 's'}`);
        if (s.updatedFoods) lib.push(`${s.updatedFoods} updated food${s.updatedFoods === 1 ? '' : 's'}`);
        if (s.createdRecipes) lib.push(`${s.createdRecipes} new recipe${s.createdRecipes === 1 ? '' : 's'}`);
        if (s.updatedRecipes) lib.push(`${s.updatedRecipes} updated recipe${s.updatedRecipes === 1 ? '' : 's'}`);
        return lib.length ? `Imported foods · ${lib.join(', ')}` : 'No new or updated foods';
    },
    importMenusSuccess: (s) => {
        const parts = [];
        if (s.createdMenus) parts.push(`${s.createdMenus} new menu${s.createdMenus === 1 ? '' : 's'}`);
        if (s.updatedMenus) parts.push(`${s.updatedMenus} updated menu${s.updatedMenus === 1 ? '' : 's'}`);
        const lib = [];
        if (s.createdFoods) lib.push(`${s.createdFoods} new food${s.createdFoods === 1 ? '' : 's'}`);
        if (s.updatedFoods) lib.push(`${s.updatedFoods} updated food${s.updatedFoods === 1 ? '' : 's'}`);
        if (s.createdRecipes) lib.push(`${s.createdRecipes} new recipe${s.createdRecipes === 1 ? '' : 's'}`);
        if (s.updatedRecipes) lib.push(`${s.updatedRecipes} updated recipe${s.updatedRecipes === 1 ? '' : 's'}`);
        if (lib.length) parts.push(lib.join(', '));
        return parts.length ? `Imported menus · ${parts.join(' · ')}` : 'No menus imported';
    },
    fetchFromSources: 'Fetch from sources',
    fetchFromScratch: 'Fetch from scratch',
    addToExisting: 'Add to existing',
    fetchFromSourcesNote: 'Import bundled recipes from TheMealDB and CoreVital. Foods and recipes already in your library are skipped and will not be fetched again.',
    fetchFromScratchHint: 'Pull the full source catalog. Matching items you already have are left alone.',
    addToExistingHint: 'Only add missing source items. Nothing already in the library is duplicated or re-fetched.',
    fetchFromSourcesProgress: (info) => (
        `${info.mealType}: ${info.name} (${info.done}/${info.total})`
    ),
    fetchFromSourcesSuccess: (s) => {
        const parts = [];
        if (s.seeded) parts.push(`${s.seeded} new recipe${s.seeded === 1 ? '' : 's'}`);
        if (s.createdFoodItems) parts.push(`${s.createdFoodItems} new food${s.createdFoodItems === 1 ? '' : 's'}`);
        if (s.skipped) parts.push(`${s.skipped} already present`);
        return parts.length ? `Fetched sources · ${parts.join(' · ')}` : 'No new source foods or recipes to add';
    },
    online: 'Online',
    templates: 'Templates',
    today: 'Today',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    shoppingList: 'Shopping list',
    mealTemplate: 'Meal template',
    savePlan: 'Save plan',
    loadPlan: 'Load plan',
    savePlanEmpty: 'No planned meals in this view to save.',
    savePlanSuccess: (n) => `Saved ${n} planned item${n === 1 ? '' : 's'}`,
    planExportFilename: (from, to) => (
        from === to
            ? `corevital-meal-plan-${from}.json`
            : `corevital-meal-plan-${from}-to-${to}.json`
    ),
    loadPlanOriginalDates: 'Keep original dates',
    loadPlanPlaceOn: (view) => (
        view === 'day' ? 'Place on this day' : view === 'month' ? 'Place on this month' : 'Place on this week'
    ),
    loadPlanNote: (from, to, n) => (
        `This plan covers ${from === to ? from : `${from} – ${to}`} (${n} item${n === 1 ? '' : 's'}).`
    ),
    loadPlanUpdateNote: 'Matching foods and recipes will be updated. Missing ones will be added. Planned meals in the chosen dates will be replaced.',
    loadPlanSuccess: (s) => {
        const parts = [`Loaded ${s.planned} planned item${s.planned === 1 ? '' : 's'}`];
        const lib = [];
        if (s.createdFoods) lib.push(`${s.createdFoods} new food${s.createdFoods === 1 ? '' : 's'}`);
        if (s.updatedFoods) lib.push(`${s.updatedFoods} updated food${s.updatedFoods === 1 ? '' : 's'}`);
        if (s.createdRecipes) lib.push(`${s.createdRecipes} new recipe${s.createdRecipes === 1 ? '' : 's'}`);
        if (s.updatedRecipes) lib.push(`${s.updatedRecipes} updated recipe${s.updatedRecipes === 1 ? '' : 's'}`);
        if (lib.length) parts.push(lib.join(', '));
        if (s.skipped) parts.push(`${s.skipped} skipped`);
        return parts.join(' · ');
    },
    print: 'Print',
    nutrition: 'Nutrition',
    search: 'Search foods & recipes…',
    noItems: 'No items yet',
    emptyLibrary: 'Your library is empty. Open Library to add a food, recipe, or menu, or Fetch from sources.',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    name: 'Name',
    servings: 'Servings',
    servingG: 'Default serving (g)',
    kcal: 'kcal',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    fiber: 'Fiber',
    sugar: 'Sugar',
    sodium: 'Sodium',
    nutritionPer100g: 'Nutrition per 100 g',
    ingredients: 'Ingredients',
    instructions: 'Instructions',
    description: 'Description',
    addIngredient: '+ Add ingredient',
    category: 'Category',
    dropHere: 'Drop here',
    grams: 'grams',
    amountG: 'Amount (g)',
    required: 'Required',
    invalidNumber: 'Must be a number ≥ 0',
    exportFilename: (iso) => `corevital-health-${iso}.json`,
    importReplace: 'Replace all',
    importMergeImported: 'Merge (prefer imported)',
    importMergeLocal: 'Merge (prefer local)',
    importSuccess: (n) => `Imported ${n} items`,
    exportSuccess: 'Exported JSON',
    moveTo: 'Move to…',
    removeEntry: 'Remove',
    clearDay: 'Clear day',
    confirmClearDay: (label) => `Clear all planned items for ${label}?`,
    confirmDelete: (name) => `Delete "${name}"?`,
    missing: '(missing)',
    perServing: 'Per serving',
    total: 'Total',
    weekStartsOn: 'Week starts on',
    calorieTarget: 'Daily calorie target',
    macroTargets: 'Macro targets (g)',
    settings: 'Settings',
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
    dessert: 'Dessert',
    drink: 'Drink',
};
