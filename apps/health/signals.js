/**
 * Local signal bag for the food module.
 * Uses the globally-loaded js-signals library (`globalThis.signals.Signal`).
 */

const SignalCtor = globalThis.signals?.Signal;

if (!SignalCtor) {
    console.warn('[food] signals library not found on globalThis.signals');
}

function make() {
    return SignalCtor ? new SignalCtor() : { add() {}, remove() {}, dispatch() {} };
}

export const healthSignals = {
    onLibraryChanged: make(),
    onCategoriesChanged: make(),
    onMenusChanged: make(),
    onPlanChanged: make(),
    onPrefsChanged: make(),
    onImportCompleted: make(),
    onWeightChanged: make(),
    onGoalsChanged: make(),
    onSportsLibraryChanged: make(),
    onSportsPlanChanged: make(),
};
