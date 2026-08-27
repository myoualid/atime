import { healthSignals } from './signals.js';
import { createAppShell } from '../../shared/components/appShell.js';

const FOOD_SECTIONS = [
    { id: 'planner', label: 'Planner', icon: 'calendar_month' },
    { id: 'library', label: 'Library', icon: 'menu_book' },
    { id: 'weight', label: 'Weight', icon: 'monitor_weight' },
    { id: 'goals', label: 'Goals', icon: 'track_changes' },
    { id: 'stats', label: 'Stats', icon: 'bar_chart' },
];

async function main() {
    const views = {};

    const { root, main, sidebar, footer, setSection } = createAppShell({
        currentApp: 'food',
        sections: FOOD_SECTIONS,
        footer: { showTemp: false, showWind: false },
        panel: false,
        scroll: false,
        mainClass: 'health-app-main',
        sectionNavLabel: 'Food sections',
        onSection(mode) {
            const plannerMode = mode === 'planner';
            const libraryMode = mode === 'library';
            const statsMode = mode === 'stats';
            const weightMode = mode === 'weight';
            const goalsMode = mode === 'goals';

            if (views.food) {
                views.food.plannerRoot.style.display = plannerMode ? '' : 'none';
                views.food.libraryRoot.hidden = !plannerMode;
            }
            if (views.library) {
                views.library.root.style.display = libraryMode ? '' : 'none';
                views.library.sidebarRoot.hidden = !libraryMode;
            }
            sidebar.dom.hidden = !(plannerMode || libraryMode);
            if (views.stats) views.stats.root.style.display = statsMode ? '' : 'none';
            if (views.weight) views.weight.root.style.display = weightMode ? '' : 'none';
            if (views.goals) views.goals.root.style.display = goalsMode ? '' : 'none';

            if (plannerMode) {
                views.food.refresh().catch((error) => {
                    console.error('[health-planner] refresh failed', error);
                });
            } else if (libraryMode) {
                views.library.refresh().then(() => {
                    views.library.focusSearch();
                }).catch((error) => {
                    console.error('[health-library-review] refresh failed', error);
                });
            } else if (statsMode) {
                views.stats.refresh().catch((error) => {
                    console.error('[health-stats] refresh failed', error);
                });
            } else if (weightMode) {
                views.weight.refresh().catch((error) => {
                    console.error('[health-weight] refresh failed', error);
                });
            } else if (goalsMode) {
                views.goals.refresh().catch((error) => {
                    console.error('[health-goals] refresh failed', error);
                });
            }
        },
    });

    document.body.appendChild(root.dom);
    footer.setLocation('CoreVital Food', NaN, NaN);
    sidebar.dom.setAttribute('aria-label', 'Foods and recipes');
    sidebar.dom.hidden = true;

    const [
        { createFoodSection },
        { createLibraryReviewSection },
        { createStatsSection },
        { createWeightSection },
        { createGoalsSection },
    ] = await Promise.all([
        import('./index.js'),
        import('./library/reviewSection.js'),
        import('./stats/statsSection.js'),
        import('./weight/weightSection.js'),
        import('./goals/goalsSection.js'),
    ]);

    const core = {
        api: {
            now: () => new Date(),
        },
    };

    views.food = createFoodSection({ core, services: {} });
    sidebar.dom.appendChild(views.food.libraryRoot);
    views.food.libraryRoot.hidden = true;
    views.food.plannerRoot.style.display = 'none';
    main.dom.appendChild(views.food.plannerRoot);

    views.library = createLibraryReviewSection();
    views.library.root.style.display = 'none';
    views.library.sidebarRoot.hidden = true;
    sidebar.dom.appendChild(views.library.sidebarRoot);
    main.dom.appendChild(views.library.root);

    views.stats = createStatsSection();
    views.stats.root.style.display = 'none';
    main.dom.appendChild(views.stats.root);

    views.weight = createWeightSection();
    views.weight.root.style.display = 'none';
    main.dom.appendChild(views.weight.root);

    views.goals = createGoalsSection();
    views.goals.root.style.display = 'none';
    main.dom.appendChild(views.goals.root);

    await views.food.notifyVisible();
    setSection('planner');

    const syncLibraryReview = () => {
        if (views.library.root.style.display !== 'none') {
            views.library.refresh().catch((error) => {
                console.error('[health-library-review] sync failed', error);
            });
        }
    };

    healthSignals.onLibraryChanged.add(syncLibraryReview);
    healthSignals.onCategoriesChanged.add(syncLibraryReview);
    healthSignals.onMenusChanged.add(syncLibraryReview);
    healthSignals.onImportCompleted.add(syncLibraryReview);
}

main().catch((error) => {
    console.error('[health-app] startup failed', error);
    if (!document.querySelector('.app-shell')) {
        document.body.innerHTML = '<main class="health-app-error">Food app failed to start. Check console for details.</main>';
    }
});
