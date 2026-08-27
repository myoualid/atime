/**
 * Single catalog of CoreVital apps. The ribbon header, hub, and in-app
 * navigation all read from this list so labels, icons, and paths stay in sync.
 */
export const CORE_APPS = [
    {
        id: 'time',
        label: 'Time',
        icon: 'schedule',
        folder: 'time',
        description: 'Clocks, lunar/solar views, and simulation controls.',
    },
    {
        id: 'food',
        label: 'Food',
        icon: 'nutrition',
        folder: 'health',
        description: 'Meal planner, food library, weight, and goals.',
    },
    {
        id: 'sports',
        label: 'Sports',
        icon: 'directions_run',
        folder: 'sports',
        description: 'Sports library and training planner.',
    },
    {
        id: 'local-environment',
        label: 'Local',
        icon: 'partly_cloudy_day',
        folder: 'local-environment',
        description: 'Local weather and marine tide forecasting.',
    },
];

const APP_BY_ID = new Map(CORE_APPS.map((app) => [app.id, app]));

/**
 * @param {string | null | undefined} currentApp
 * @returns {boolean}
 */
export function isHub(currentApp) {
    return !currentApp || currentApp === 'hub';
}

/**
 * Relative href from the current page to an app (or the hub).
 *
 * @param {string} targetId - App id, or `'hub'`
 * @param {string | null | undefined} currentApp
 * @returns {string}
 */
export function hrefTo(targetId, currentApp) {
    const fromHub = isHub(currentApp);

    if (targetId === 'hub') {
        return fromHub ? './' : '../../';
    }

    const app = APP_BY_ID.get(targetId);
    if (!app) {
        throw new Error(`Unknown CoreVital app: ${targetId}`);
    }

    const folder = app.folder || app.id;
    if (fromHub) return `./apps/${folder}/`;
    if (currentApp === targetId) return './';
    return `../${folder}/`;
}
