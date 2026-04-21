import { createFoodSection } from './index.js';
import { createLibraryReviewSection } from './library/reviewSection.js';
import { createStatsSection } from './stats/statsSection.js';
import { createWeightSection } from './weight/weightSection.js';
import { createGoalsSection } from './goals/goalsSection.js';
import { createSportsSection } from './sports/sportsSection.js';
import { healthSignals } from './signals.js';
import { createAppFooter } from '../../shared/components/appFooter.js';

function createFoodAppShell() {
    const shell = document.createElement('div');
    shell.className = 'health-app-shell';

    const sidebar = document.createElement('aside');
    sidebar.className = 'health-app-sidebar';
    sidebar.setAttribute('role', 'navigation');
    sidebar.setAttribute('aria-label', 'Meal planner navigation');

    const nav = document.createElement('nav');
    nav.className = 'health-app-nav';
    sidebar.appendChild(nav);

    const main = document.createElement('main');
    main.className = 'health-app-main';

    shell.append(sidebar, main);

    return { shell, sidebar, nav, main };
}

function makeAppLinkButton({ href, label, icon }) {
    const link = document.createElement('a');
    link.className = 'health-app-nav-btn health-app-nav-link';
    link.href = href;
    link.setAttribute('aria-label', label);
    link.innerHTML = `<span class="health-app-nav-icon" aria-hidden="true">${icon}</span><span class="health-app-nav-label">${label}</span>`;
    return link;
}

function activateButton(buttons, activeId) {
    for (const btn of buttons) {
        const isActive = btn.dataset.target === activeId;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    }
}

function makeAnchorButton({ label, icon, targetId, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'health-app-nav-btn';
    btn.dataset.target = targetId;
    btn.innerHTML = `<span class="health-app-nav-icon" aria-hidden="true">${icon}</span><span class="health-app-nav-label">${label}</span>`;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', onClick);
    return btn;
}

async function main() {
    const root = createFoodAppShell();
    document.body.appendChild(root.shell);
    const footer = createAppFooter({ showTemp: false, showWind: false });
    footer.setLocation('CoreVital Health', NaN, NaN);
    document.body.appendChild(footer.el);

    const tickFooterClock = () => {
        const now = new Date();
        footer.setTime(now.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        }));
    };
    tickFooterClock();
    setInterval(tickFooterClock, 1000);

    const core = {
        api: {
            now: () => new Date(),
        },
    };

    const foodUI = createFoodSection({ core, services: {} });
    root.main.appendChild(foodUI.root.dom);

    const libraryReview = createLibraryReviewSection();
    libraryReview.root.style.display = 'none';
    root.main.appendChild(libraryReview.root);

    const statsSection = createStatsSection();
    statsSection.root.style.display = 'none';
    root.main.appendChild(statsSection.root);

    const weightSection = createWeightSection();
    weightSection.root.style.display = 'none';
    root.main.appendChild(weightSection.root);

    const goalsSection = createGoalsSection();
    goalsSection.root.style.display = 'none';
    root.main.appendChild(goalsSection.root);

    const sportsSection = createSportsSection();
    sportsSection.root.style.display = 'none';
    root.main.appendChild(sportsSection.root);

    await foodUI.notifyVisible();

    function setViewMode(mode) {
        const plannerMode = mode === 'planner';
        const libraryMode = mode === 'library';
        const statsMode = mode === 'stats';
        const weightMode = mode === 'weight';
        const goalsMode = mode === 'goals';
        const sportsMode = mode === 'sports';
        foodUI.root.dom.style.display = plannerMode ? '' : 'none';
        libraryReview.root.style.display = libraryMode ? '' : 'none';
        statsSection.root.style.display = statsMode ? '' : 'none';
        weightSection.root.style.display = weightMode ? '' : 'none';
        goalsSection.root.style.display = goalsMode ? '' : 'none';
        sportsSection.root.style.display = sportsMode ? '' : 'none';

        if (libraryMode) {
            libraryReview.refresh().then(() => {
                libraryReview.focusSearch();
            }).catch((error) => {
                console.error('[health-library-review] refresh failed', error);
            });
        } else if (statsMode) {
            statsSection.refresh().catch((error) => {
                console.error('[health-stats] refresh failed', error);
            });
        } else if (weightMode) {
            weightSection.refresh().catch((error) => {
                console.error('[health-weight] refresh failed', error);
            });
        } else if (goalsMode) {
            goalsSection.refresh().catch((error) => {
                console.error('[health-goals] refresh failed', error);
            });
        } else if (sportsMode) {
            sportsSection.refresh().catch((error) => {
                console.error('[health-sports] refresh failed', error);
            });
        }
    }

    root.nav.appendChild(
        makeAppLinkButton({ href: '../../', label: 'Launcher', icon: '⌂' }),
    );
    root.nav.appendChild(
        makeAppLinkButton({ href: '../time/', label: 'Time', icon: '⌚' }),
    );
    root.nav.appendChild(
        makeAppLinkButton({ href: '../local-environment/', label: 'Local', icon: '☁' }),
    );

    const divider = document.createElement('div');
    divider.className = 'health-app-nav-divider';
    root.nav.appendChild(divider);

    const buttons = [];

    const plannerBtn = makeAnchorButton({
        label: 'Planner',
        icon: '◫',
        targetId: 'planner',
        onClick: () => {
            setViewMode('planner');
            activateButton(buttons, 'planner');
        },
    });
    buttons.push(plannerBtn);
    root.nav.appendChild(plannerBtn);

    const libraryBtn = makeAnchorButton({
        label: 'Library',
        icon: '☰',
        targetId: 'library',
        onClick: () => {
            setViewMode('library');
            activateButton(buttons, 'library');
        },
    });
    buttons.push(libraryBtn);
    root.nav.appendChild(libraryBtn);

    const weightBtn = makeAnchorButton({
        label: 'Weight',
        icon: '⚖',
        targetId: 'weight',
        onClick: () => {
            setViewMode('weight');
            activateButton(buttons, 'weight');
        },
    });
    buttons.push(weightBtn);
    root.nav.appendChild(weightBtn);

    const sportsBtn = makeAnchorButton({
        label: 'Sports',
        icon: '🏃',
        targetId: 'sports',
        onClick: () => {
            setViewMode('sports');
            activateButton(buttons, 'sports');
        },
    });
    buttons.push(sportsBtn);
    root.nav.appendChild(sportsBtn);

    const goalsBtn = makeAnchorButton({
        label: 'Goals',
        icon: '◎',
        targetId: 'goals',
        onClick: () => {
            setViewMode('goals');
            activateButton(buttons, 'goals');
        },
    });
    buttons.push(goalsBtn);
    root.nav.appendChild(goalsBtn);

    const statsBtn = makeAnchorButton({
        label: 'Stats',
        icon: '📊',
        targetId: 'stats',
        onClick: () => {
            setViewMode('stats');
            activateButton(buttons, 'stats');
        },
    });
    buttons.push(statsBtn);
    root.nav.appendChild(statsBtn);

    setViewMode('planner');
    activateButton(buttons, 'planner');

    const syncLibraryReview = () => {
        if (libraryReview.root.style.display !== 'none') {
            libraryReview.refresh().catch((error) => {
                console.error('[health-library-review] sync failed', error);
            });
        }
    };

    healthSignals.onLibraryChanged.add(syncLibraryReview);
    healthSignals.onCategoriesChanged.add(syncLibraryReview);
}

main().catch((error) => {
    console.error('[health-app] startup failed', error);
    document.body.innerHTML = '<main class="health-app-error">Meal planner failed to start. Check console for details.</main>';
});
