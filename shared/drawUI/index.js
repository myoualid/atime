/**
 * CoreVital DrawUI entry.
 *
 * JavaScript and CSS come from the built DrawUI bundle at vendor/drawui,
 * which is a junction to the DrawUI repo's docs/dist (see scripts/link-drawui.ps1).
 * CamelCase factories keep existing CoreVital call sites working.
 */
import {
  DrawUI as DrawUICore,
  FloatingWindow,
} from "../../vendor/drawui/drawui.min.js";

/**
 * @typedef {ReturnType<typeof DrawUI.div>} UIDiv
 */

export class DrawUI extends DrawUICore {
  /** @returns {UIDiv} */
  static div() {
    return DrawUICore.Container();
  }

  /** @returns {UIDiv} */
  static panel() {
    return DrawUICore.Container().setClass("Panel");
  }

  static h1(text = "") {
    return DrawUICore.H1(text);
  }

  static h2(text = "") {
    return DrawUICore.H2(text);
  }

  static h3(text = "") {
    return DrawUICore.H3(text);
  }

  static h4(text = "") {
    return DrawUICore.H4(text);
  }

  static h5(text = "") {
    return DrawUICore.H5(text);
  }

  static h6(text = "") {
    return DrawUICore.H6(text);
  }

  static text(text = "") {
    return DrawUICore.TextBlock(text);
  }

  static span(text = "") {
    const span = DrawUICore.Span();
    if (text) span.setTextContent(text);
    return span;
  }

  static toast(message, type = "info", options = {}) {
    return DrawUICore.Toast(message, type, { autoMount: false, ...options });
  }

  static tabbedPanel() {
    const tabs = DrawUICore.TabView();
    tabs.addClass("TabbedPanel");
    tabs.tabsDiv?.addClass("Tabs");
    tabs.panelsDiv?.addClass("Panels");
    return tabs;
  }

  static floatingPanel(options = {}) {
    const panel = new FloatingWindow(options);
    panel.addClass("FloatingPanel");
    panel.header?.addClass("FloatingPanel-header");
    panel.contentWrapper?.addClass("FloatingPanel-content");
    return panel;
  }
}

for (const name of Object.getOwnPropertyNames(DrawUICore)) {
  if (typeof DrawUICore[name] !== "function") continue;
  if (name === "length" || name === "name" || name === "prototype") continue;
  const camel = name[0].toLowerCase() + name.slice(1);
  if (Object.prototype.hasOwnProperty.call(DrawUI, camel)) continue;
  DrawUI[camel] = (...args) => DrawUICore[name](...args);
}
