import { DrawUI } from './shared/drawUI/index.js';
import { createAppShell } from './shared/components/appShell.js';

const { root, scrollInner } = createAppShell({
    currentApp: 'hub',
    footer: { showLocation: false, showTemp: false, showWind: false },
    panel: false,
});

const welcome = DrawUI.div();
welcome.setClass('app-hub-welcome');
welcome.add(
    DrawUI.h1('CoreVital'),
    DrawUI.text('Use the ribbon buttons to open an app. Hide the ribbon with the control at the top right.'),
);

scrollInner.add(welcome);
document.body.appendChild(root.dom);
