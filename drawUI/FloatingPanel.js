import {
  UIPanel,
  UITabbedPanel,
  UIIcon,
  UIDiv,
  UISpan,
  UIButton,
  UIInput,
  UIRow,
  UITooltip,
} from "./ui.js";

import { makeResizable, makeDraggable } from "./utils/panelResizer.js";

// Pin position configurations
const PIN_CONFIGS = {
  left: {
    left: '0', top: '0',
    width: '45vw', height: '100vh'
  },
  bottom: {
    left: '0', bottom: '0',
    width: '100vw', height: '30vh'
  },
  right: {
    right: '0', top: '0',
    width: '45vw', height: '100vh'
  },
  maximized: {
    left: '0', top: '0',
    width: '100vw', height: '100vh'
  }
};

// Default floating position (centered)
const DEFAULT_POSITION = {
  left: '0', top: '0',
  width: '45vw', height: '100vh'
};

class FloatingPanel extends UIPanel {
  static get isMobile() {
    return window.innerWidth <= 768;
  }

  constructor(options) {
    super();

    this.panelIcon = null;

    this.title = { icon: null, text: null };

    this.isMaximized = false;

    this.isMinimized = false;

    this.isClosed = false;

    this._pinned = null;

    this._minimizedIcon = null;

    this._onCloseCallback = null;

    /** @type {boolean} When false, the close button is hidden and the panel cannot be closed. */
    this.closable = options?.closable !== false;

    this.setClass("FloatingPanel");

    this.header = this._buildHeader();

    this._buildContentWrapper();

    if (!FloatingPanel.isMobile) {
      makeResizable(this.dom);
      makeDraggable(this.dom, this.header.dom);
    }

    if (options) this._buildContent(options);

    this._setupMobileSheet();
  }

  // ==================== Public API ====================

  get content() {
    return this.contentWrapper.dom;
  }

  setTitle(title) {
    this.title.text.dom.textContent = title;

    return this;
  }

  setIcon(iconName) {
    this.panelIcon = iconName;

    this.title.icon.setIcon(iconName);

    return this;
  }

  setContent(content) {
    this.contentWrapper.clear();

    if (content && (content instanceof Object || content.nodeType)) {
      this.contentWrapper.add(content);
    }

    return this;
  }

  addContent(content) {
    this.contentWrapper.add(content);

    return this;
  }

  minimize() {
    if (!this.isMinimized) this._toggleMinimize();

    return this;
  }

  restore() {
    if (this.isMinimized) this._restoreFromMinimized();

    return this;
  }

  maximize() {

    if (this.isMinimized) {
      this._cleanupMinimizedIcon();

      // Reset all styles that may have been set during minimize animation
      this.dom.style.display = '';

      this.dom.style.opacity = '';

      this.dom.style.transform = '';

      this.dom.style.visibility = '';

      this.dom.style.transition = '';

      this.dom.classList.remove("minimized");

      this.isMinimized = false;

    }

    if (!this.isMaximized) {

      this._toggleMaximize();
    }

    return this;
  }

  unmaximize() {
    if (this.isMaximized) this._toggleMaximize();

    return this;
  }

  pinLeft() {
    this._prepareForPin();

    this._togglePin('left');

    return this;
  }

  pinBottom() {
    this._prepareForPin();

    this._togglePin('bottom');

    return this;
  }

  pinRight() {
    this._prepareForPin();

    this._togglePin('right');

    return this;
  }

  unpin() {
    if (this._pinned || this.isMaximized) {
      this.dom.classList.remove('maximized');

      this._setDefaultPosition();

      this._pinned = null;

      this.isMaximized = false;
    }

    return this;
  }

  /**
   * Pin panel to a custom position
   * @param {Object} options - Position options
   * @param {string} [options.left] - CSS left value (e.g., '100px', '10%')
   * @param {string} [options.top] - CSS top value
   * @param {string} [options.width] - CSS width value
   * @param {string} [options.height] - CSS height value
   */
  pinToPosition({ left, top, width, height } = {}) {
    this._prepareForPin();

    this._pinned = 'custom';

    this._applyPosition({
      left: left ?? 'calc(50vw - 200px)',
      top: top ?? 'calc(50vh - 150px)',
      width: width ?? '400px',
      height: height ?? '300px'
    });

    return this;
  }

  close() {
    this._cleanupMinimizedIcon();

    this.dom.remove();

    this.isClosed = true;

    if (this._onCloseCallback) {
      this._onCloseCallback();
    }

    return this;
  }

  /**
   * Set callback to be called when panel is closed
   * @param {Function} callback - Function to call on close
   */
  onClose(callback) {
    this._onCloseCallback = callback;

    return this;
  }

  /**
   * Reopen a closed panel by re-adding to DOM
   * @param {HTMLElement} [container] - Optional container to append to (defaults to document.body)
   */
  reopen(container) {
    if (!this.isClosed) return this;

    const parent = container || document.body;

    parent.appendChild(this.dom);

    this.isClosed = false;

    return this;
  }

  show(container) {
    // If panel was closed (removed from DOM), reopen it
    if (this.isClosed || !this.dom.parentElement) {
      const parent = container || document.body;

      parent.appendChild(this.dom);

      this.isClosed = false;
    }

    this.dom.style.display = '';

    return this;
  }

  hide() {
    this.dom.style.display = 'none';

    return this;
  }

  // ==================== Private Build Methods ====================

  _buildHeader() {
    const header = new UIDiv().padding("4px")
      .addClass("Row")
      .addClass("centered-vertical")
      .addClass("justify-between")
      .addClass("fill-width")
      .addClass("FloatingPanel-header")
      .setStyle("border-bottom", ["1px solid var(--theme-background-1012)"]);

    this.add(header);

    // Title row
    const titleRow = new UIRow().addClass("fill-width").addClass("justify-center");

    this.title.icon = new UIIcon();

    this.title.text = new UISpan();

    titleRow.add(this.title.icon, this.title.text);

    header.add(titleRow);

    // Tools row
    const tools = new UIRow().gap("8px");

    header.add(tools);

    // Pin buttons
    tools.add(this._createPinButton('dock_to_left', 'Pin left', 'left'));

    tools.add(this._createPinButton('dock_to_bottom', 'Pin bottom', 'bottom'));

    tools.add(this._createPinButton('dock_to_right', 'Pin right', 'right'));

    // Window control circles
    tools.add(this._createCircleButton('yellow', 'remove', () => this._toggleMinimize()));

    tools.add(this._createCircleButton('green', 'open_in_full', () => this._toggleMaximize()));

    if (this.closable) {
      tools.add(this._createCircleButton('red', 'close', () => this.close()));
    }

    return header;
  }

  _buildContentWrapper() {
    this.contentWrapper = new UIDiv().addClass("fill-height").addClass("FloatingPanel-content");

    this.add(this.contentWrapper);
  }

  _prepareForPin() {
    if (this.isMinimized) {
      this._cleanupMinimizedIcon();

      this.dom.style.display = '';

      this.isMinimized = false;
    }

    if (this.isMaximized) {
      this.dom.classList.remove('maximized');

      this.isMaximized = false;
    }
  }

  _createPinButton(iconName, title, position) {
    const btn = new UIDiv().setClass('circle').addClass('pos-btn');

    const span = new UIIcon(iconName);

    span.dom.title = title;

    btn.add(span);

    btn.dom.style.cursor = 'pointer';

    btn.dom.onclick = () => this._togglePin(position);

    return btn;
  }

  _createCircleButton(color, iconName, onClick) {
    const circle = new UIDiv().setClass("circle").addClass(color);

    circle.add(new UIIcon(iconName));

    circle.dom.onclick = onClick;

    return circle;
  }

  // ==================== Private Position Methods ====================

  /**
   * Clear all positioning styles to prevent conflicts
   */
  _clearPositioning() {
    this.dom.style.left = '';

    this.dom.style.right = '';

    this.dom.style.top = '';

    this.dom.style.bottom = '';

    this.dom.style.width = '';

    this.dom.style.height = '';
  }

  /**
   * Apply position config (clears existing first to prevent conflicts)
   */
  _applyPosition(config) {
    if (FloatingPanel.isMobile) return;
    this._clearPositioning();

    Object.entries(config).forEach(([k, v]) => {
      this.dom.style[k] = v;
    });
  }

  _setupMobileSheet() {
    if (!FloatingPanel.isMobile) return;
    this.dom.style.cssText = '';
    this.header.dom.style.cursor = 'pointer';
    this.header.dom.addEventListener('click', () => {
      this.dom.classList.toggle('sheet-expanded');
    });
  }

  /**
   * Set to default floating position (centered)
   */
  _setDefaultPosition() {
    this._applyPosition(DEFAULT_POSITION);
  }

  _cleanupMinimizedIcon() {
    if (!this._minimizedIcon) return;

    try {
      this._minimizedIcon.dom?.parentElement?.removeChild(this._minimizedIcon.dom);

      // Properly destroy UITooltip instance
      if (this._minimizedIcon._tooltip?.destroy) {
        this._minimizedIcon._tooltip.destroy();
      } else if (this._minimizedIcon._tooltip?.dom?.parentElement) {
        this._minimizedIcon._tooltip.dom.parentElement.removeChild(this._minimizedIcon._tooltip.dom);
      }
    } catch (e) {
    }

    this._minimizedIcon = null;
  }

  // ==================== Private Toggle Methods ====================

  _togglePin(position) {
    // If clicking same pin, unpin to default position
    if (this._pinned === position) {
      this.dom.classList.remove('maximized');

      this._setDefaultPosition();

      this._pinned = null;

      this.isMaximized = false;

      return;
    }

    // Clear maximized state
    if (this.isMaximized) {
      this.dom.classList.remove('maximized');

      this.isMaximized = false;
    }

    this._pinned = position;

    this._applyPosition(PIN_CONFIGS[position]);
  }

  _toggleMaximize() {
    if (this.isMaximized) {
      this.dom.classList.remove("maximized");

      this._setDefaultPosition();

      this._pinned = null;

      this.isMaximized = false;
    } else {

      this.dom.classList.add("maximized");

      this._applyPosition(PIN_CONFIGS.maximized);

      this._pinned = null;

      this.isMaximized = true;
    }

  }

  _toggleMinimize() {
    if (this.isMinimized) {
      this._restoreFromMinimized();
    } else {
      this._minimizePanel();
    }
  }

  _minimizePanel() {
    if (this.isMaximized) {
      this.dom.classList.remove('maximized');

      this.isMaximized = false;
    }

    const panelRect = this.dom.getBoundingClientRect();

    const icon = this._createMinimizedIcon();

    const iconRect = icon.dom.getBoundingClientRect();

    const translateX = (iconRect.left + iconRect.width / 2) - (panelRect.left + panelRect.width / 2);

    const translateY = (iconRect.top + iconRect.height / 2) - (panelRect.top + panelRect.height / 2);

    this.dom.style.transition = 'transform 500ms cubic-bezier(.2,.8,.2,1), opacity 320ms linear';

    this.dom.style.transformOrigin = 'center center';

    requestAnimationFrame(() => {
      this.dom.style.transform = `translate(${translateX}px, ${translateY}px) scale(0.08)`;

      this.dom.style.opacity = '0';
    });

    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return;

      this.dom.removeEventListener('transitionend', onEnd);

      this.dom.style.display = 'none';

      this.dom.style.transform = '';

      this.dom.style.opacity = '';

      this.dom.style.transition = '';

      // Show icon
      icon.dom.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 160ms linear';

      icon.dom.style.opacity = '1';

      icon.dom.style.transform = '';

      icon.dom.onclick = () => this._restoreFromMinimized();

      this.dom.classList.add("minimized");

      this.isMinimized = true;

    };

    this.dom.addEventListener('transitionend', onEnd);
  }

  _restoreFromMinimized() {
    if (!this._minimizedIcon?.dom?.parentElement) {
      this.dom.style.display = '';

      this.dom.classList.remove("minimized");

      this.isMinimized = false;

      return;
    }

    const iconRect = this._minimizedIcon.dom.getBoundingClientRect();

    const iconCenterX = iconRect.left + iconRect.width / 2;

    const iconCenterY = iconRect.top + iconRect.height / 2;

    // Show panel hidden for measurement - MUST set to empty string or 'flex', NOT keep 'none'!
    this.dom.style.display = '';

    this.dom.style.visibility = 'hidden';

    this.dom.style.transform = '';

    this.dom.style.opacity = '0';

    const panelRect = this.dom.getBoundingClientRect();

    this._cleanupMinimizedIcon();

    const startX = iconCenterX - (panelRect.left + panelRect.width / 2);

    const startY = iconCenterY - (panelRect.top + panelRect.height / 2);

    this.dom.classList.remove('minimized');

    this.dom.style.visibility = 'visible';

    this.dom.style.transition = 'none';

    this.dom.style.transformOrigin = 'center center';

    this.dom.style.transform = `translate(${startX}px, ${startY}px) scale(0.08)`;

    this.dom.style.opacity = '0';

    void this.dom.offsetWidth; // Force reflow

    requestAnimationFrame(() => {
      this.dom.style.transition = 'transform 500ms cubic-bezier(.2,.8,.2,1), opacity 320ms linear';

      this.dom.style.transform = '';

      this.dom.style.opacity = '1';
    });

    const onEnd = (ev) => {
      if (ev.propertyName !== 'transform') return;

      this.dom.removeEventListener('transitionend', onEnd);

      this.dom.style.transition = '';

      this.dom.style.opacity = '';

      this.isMinimized = false;
    };

    this.dom.addEventListener('transitionend', onEnd);
  }

  _createMinimizedIcon() {
    const icon = new UIDiv();

    icon.dom.classList.add('minimized-pill');

    // Pill container styling
    Object.assign(icon.dom.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 8px',
      borderRadius: '12px',
      background: 'transparent',
      cursor: 'pointer',
      zIndex: '1',
      transition: 'transform 200ms ease, opacity 200ms ease'
    });

    // Dragon pill SVG
    const pillImg = document.createElement('img');

    pillImg.src = '/static/data/resources/icons/dragon_pill.svg';

    Object.assign(pillImg.style, {
      width: '36px',
      height: '16px',
      flexShrink: '0'
    });

    icon.dom.appendChild(pillImg);

    // Small panel icon (subtle, shown next to pill)
    const panelIconSpan = new UIIcon(this.panelIcon || 'open_in_full');

    Object.assign(panelIconSpan.dom.style, {
      fontSize: '14px',
      opacity: '0.7',
      transition: 'opacity 200ms ease'
    });

    icon.dom.appendChild(panelIconSpan.dom);

    icon.dom.style.opacity = '0';

    icon.dom.style.transform = 'scale(0.08)';

    // Tooltip showing panel name on hover using UITooltip component
    const tooltip = new UITooltip(this.title.text.dom.textContent || '', {
      position: 'right',
      theme: 'orange'
    });

    tooltip.attachTo(icon.dom, { followMouse: true });

    const container = document.getElementById('Windows') || document.body;

    container.appendChild(icon.dom);

    icon._tooltip = tooltip;

    // Hover effects - enhance icon appearance
    icon.dom.addEventListener('mouseenter', () => {
      // Enhance panel icon visibility on hover
      panelIconSpan.dom.style.opacity = '1';

      icon.dom.style.transform = 'scale(1.05)';
    });

    icon.dom.addEventListener('mouseleave', () => {
      // Restore subtle icon appearance
      panelIconSpan.dom.style.opacity = '0.7';

      icon.dom.style.transform = 'scale(1)';
    });

    this._minimizedIcon = icon;

    return icon;
  }

  // ==================== Content Building ====================

  _buildContent(options) {
    if (options.title) this.setTitle(options.title);

    if (options.icon) this.setIcon(options.icon);

    if (options.startMinimized) {
      requestAnimationFrame(() => this._initializeMinimized());
    }

    if (options.input) {
      const input = new UIInput(options.input.defaultValue || "");

      input.dom.placeholder = options.input.placeholder;

      this.input = input;

      this.contentWrapper.add(input);
    }

    if (options.fileInput) {
      const fileInput = new UIInput();

      fileInput.dom.type = "file";

      fileInput.dom.accept = options.fileInput.accept || "";

      this.fileInput = fileInput;

      this.contentWrapper.add(fileInput);
    }

    if (options.panel) {
      const tabbedPanel = new UITabbedPanel();

      for (const tab of options.panel.tabs) {
        const tabContent = new UIPanel();

        for (const element of tab.content) {
          tabContent.add(element);
        }

        tabbedPanel.addTab(tab.title, tabContent);
      }

      this.contentWrapper.add(tabbedPanel);
    }

    if (options.content) {
      this.contentWrapper.add(options.content);
    }

    if (options.confirm || options.cancel) {
      const buttonContainer = new UIPanel();

      buttonContainer.dom.style.display = "flex";

      buttonContainer.dom.style.gap = "var(--spacing-md)";

      buttonContainer.dom.style.justifyContent = "flex-end";

      if (options.confirm) {
        const confirmButton = new UIButton(options.confirm.text);

        confirmButton.onClick(() => {
          const value = this.input ? this.input.getValue() : this.fileInput?.files[0];

          options.confirm.onClick(value);

          this.close();
        });

        buttonContainer.add(confirmButton);
      }

      if (options.cancel) {
        const cancelButton = new UIButton(options.cancel.text);

        cancelButton.onClick(() => this.close());

        buttonContainer.add(cancelButton);
      }

      this.add(buttonContainer);
    }
  }

  _initializeMinimized() {
    if (this.isMinimized) return;

    const icon = this._createMinimizedIcon();

    icon.dom.style.opacity = '1';

    icon.dom.style.transform = '';

    icon.dom.onclick = () => this._restoreFromMinimized();

    this.dom.style.display = 'none';

    this.dom.classList.add('minimized');

    this.isMinimized = true;

    this._pinned = null;
  }

}

export { FloatingPanel };
