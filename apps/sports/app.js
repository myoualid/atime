import { createAppShell } from '../../shared/components/appShell.js';
import { createSportsSection } from './sportsSection.js';

async function main() {
    const { root, main, sidebar, footer } = createAppShell({
        currentApp: 'sports',
        footer: { showTemp: false, showWind: false },
        panel: false,
        scroll: false,
        mainClass: 'sports-app-main',
    });

    document.body.appendChild(root.dom);
    footer.setLocation('CoreVital Sports', NaN, NaN);
    sidebar.dom.setAttribute('aria-label', 'Sports library');

    const sports = createSportsSection();
    sidebar.dom.appendChild(sports.libraryRoot);
    main.dom.appendChild(sports.plannerRoot);
    await sports.refresh();
}

main().catch((error) => {
    console.error('[sports-app] startup failed', error);
    if (!document.querySelector('.app-shell')) {
        document.body.innerHTML = '<main class="sports-app-error">Sports planner failed to start. Check console for details.</main>';
    }
});
