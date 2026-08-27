/**
 * Shared application chrome: ribbon header (one button per app), optional
 * in-app section ribbon, main column, footer, and a floating minimize control.
 */
import { DrawUI } from '../drawUI/index.js';
import { CORE_APPS, hrefTo, isHub } from '../apps.js';
import { createAppFooter } from './appFooter.js';

const RIBBON_MINIMIZED_KEY = 'corevital.ribbonMinimized';

function readMinimized() {
    try {
        return globalThis.localStorage?.getItem(RIBBON_MINIMIZED_KEY) === '1';
    } catch {
        return false;
    }
}

function writeMinimized(minimized) {
    try {
        globalThis.localStorage?.setItem(RIBBON_MINIMIZED_KEY, minimized ? '1' : '0');
    } catch {
        /* private mode / disabled storage */
    }
}

function asRibbonButton(label, { icon, active = false, ariaLabel } = {}) {
    const btn = DrawUI.ribbonButton(label, { icon, active });
    btn.dom.type = 'button';
    btn.dom.setAttribute('aria-label', ariaLabel || label);
    return btn;
}

/**
 * @typedef {{ id: string, label: string, icon: string }} AppSectionSpec
 *
 * @param {object} opts
 * @param {string | null} [opts.currentApp] - Catalog id, or `'hub'` / `null` on the launcher
 * @param {AppSectionSpec[]} [opts.sections]
 * @param {string} [opts.initialSection]
 * @param {(sectionId: string) => void} [opts.onSection]
 * @param {Parameters<typeof createAppFooter>[0]} [opts.footer]
 * @param {boolean} [opts.clock=true] - Drive the footer clock
 * @param {boolean} [opts.panel=true] - Use the DrawUI Panel chrome for main
 * @param {boolean} [opts.scroll=true] - Wrap main content in `.app-panel-scroll`
 * @param {string} [opts.mainClass]
 * @param {string} [opts.sectionNavLabel]
 */
export function createAppShell(opts = {}) {
    const {
        currentApp = 'hub',
        sections = [],
        initialSection = sections[0]?.id,
        onSection,
        footer: footerOpts = {},
        clock = true,
        panel = true,
        scroll = true,
        mainClass = '',
        sectionNavLabel = 'App sections',
    } = opts;

    const shell = DrawUI.div();
    shell.setClass('app-shell');

    const ribbonMenu = DrawUI.div();
    ribbonMenu.setId('RibbonMenu');
    ribbonMenu.setClass('RibbonMenu app-ribbon-menu');
    ribbonMenu.dom.setAttribute('role', 'banner');
    ribbonMenu.dom.setAttribute('aria-label', 'CoreVital apps');

    const headerBar = DrawUI.div();
    headerBar.setId('HeaderBar');
    headerBar.setClass('HeaderBar app-header-bar');

    const title = DrawUI.hyperlink('CoreVital', hrefTo('hub', currentApp));
    title.setClass('app-header-title');
    title.dom.setAttribute('aria-label', 'CoreVital home');
    headerBar.add(title);

    const appRibbon = DrawUI.ribbonBar([], 'flex-start');
    appRibbon.setId('RibbonBar');
    appRibbon.addClass('app-app-ribbon');
    appRibbon.dom.setAttribute('role', 'navigation');
    appRibbon.dom.setAttribute('aria-label', 'Apps');

    for (const app of CORE_APPS) {
        const isCurrent = app.id === currentApp;
        const btn = asRibbonButton(app.label, {
            icon: app.icon,
            active: isCurrent,
        });
        btn.dom.dataset.app = app.id;
        if (isCurrent) {
            btn.dom.setAttribute('aria-current', 'page');
        } else {
            btn.onClick(() => {
                window.location.href = hrefTo(app.id, currentApp);
            });
        }
        appRibbon.add(btn);
    }

    ribbonMenu.add(headerBar, appRibbon);

    /** @type {ReturnType<typeof DrawUI.ribbonButton>[]} */
    const sectionButtons = [];

    function setSection(sectionId) {
        for (const btn of sectionButtons) {
            const on = btn.dom.dataset.section === sectionId;
            btn.setActive(on);
            if (on) btn.dom.setAttribute('aria-current', 'true');
            else btn.dom.removeAttribute('aria-current');
        }
        onSection?.(sectionId);
    }

    if (sections.length) {
        const sectionRibbon = DrawUI.ribbonBar([], 'flex-start');
        sectionRibbon.addClass('app-section-ribbon');
        sectionRibbon.dom.setAttribute('role', 'navigation');
        sectionRibbon.dom.setAttribute('aria-label', sectionNavLabel);

        for (const spec of sections) {
            const btn = asRibbonButton(spec.label, {
                icon: spec.icon,
                active: spec.id === initialSection,
            });
            btn.dom.dataset.section = spec.id;
            btn.onClick(() => setSection(spec.id));
            sectionRibbon.add(btn);
            sectionButtons.push(btn);
        }

        ribbonMenu.add(sectionRibbon);
    }

    const mainRow = DrawUI.div();
    mainRow.setClass('app-main-row');

    const sidebar = DrawUI.div();
    sidebar.setClass('app-sidebar');
    sidebar.dom.setAttribute('role', 'complementary');
    sidebar.dom.setAttribute('aria-label', 'App sidebar');

    const main = panel ? DrawUI.panel() : DrawUI.div();
    main.addClass('app-main-panel');
    if (mainClass) main.addClass(mainClass);
    if (!panel) {
        main.dom.setAttribute('role', 'main');
    }

    let scrollInner = main;
    if (scroll) {
        scrollInner = DrawUI.div();
        scrollInner.setClass('app-panel-scroll');
        main.add(scrollInner);
    }
    mainRow.add(sidebar, main);

    const footer = createAppFooter(footerOpts);

    const toggle = DrawUI.button('');
    toggle.setClass('app-ribbon-toggle');
    toggle.dom.type = 'button';
    const toggleIcon = DrawUI.icon('expand_less');
    toggle.dom.replaceChildren();
    toggle.add(toggleIcon);

    function applyMinimized(minimized) {
        shell.toggleClass('is-ribbon-minimized', minimized);
        toggleIcon.setIcon(minimized ? 'expand_more' : 'expand_less');
        toggle.dom.setAttribute('aria-expanded', String(!minimized));
        toggle.dom.setAttribute(
            'aria-label',
            minimized ? 'Show app ribbon' : 'Hide app ribbon',
        );
        toggle.dom.title = minimized ? 'Show apps' : 'Hide apps';
        writeMinimized(minimized);
    }

    toggle.dom.setAttribute('aria-controls', 'RibbonMenu');
    toggle.onClick(() => {
        applyMinimized(!shell.dom.classList.contains('is-ribbon-minimized'));
    });

    shell.add(ribbonMenu, mainRow);
    shell.dom.appendChild(footer.el);
    shell.add(toggle);

    applyMinimized(readMinimized());

    const stopClock = clock ? footer.startClock() : null;

    return {
        root: shell,
        sidebar,
        main,
        scrollInner,
        footer,
        setSection,
        isHub: isHub(currentApp),
        dispose() {
            stopClock?.();
        },
    };
}
