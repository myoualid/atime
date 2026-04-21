import { DrawUI, ICONS } from "./index.js";

import { makeResizable, makeDraggable } from "./utils/panelResizer.js";

export class BasePanel {
  constructor(options = {}) {
    const {
      context,
      operators,
      parentId,
      panelStyles = {},
      resizeHandles = ['e', 's', 'se'],
      resizable = true,
      stopPropagation = true,
      testing = false,
      draggable = false,
      position = 'auto'
    } = options;

    this.positionStrategy = position;

    this.resizeHandles = resizeHandles;

    this.context = context;

    this.operators = operators;

    this.isActive = false;

    this.stopPropagation = stopPropagation;

    // Store parentId and get parent element
    this.parentId = parentId;

    // Track if we have a valid parent element (for positioning)
    this.hasParentElement = Boolean(parentId);

    this.parent = parentId ? document.getElementById(parentId) : null;

    // Create panel with flex layout for header/content/footer structure
    this.panel = DrawUI.panel();

    this.panel.setStyle('display', ['flex']);

    this.panel.setStyle('flex-direction', ['column']);

    // Create header container (fixed, non-scrolling)
    this.header = DrawUI.div();

    this.header.addClass('PanelHeader');

    this.header.setStyle('flex-shrink', ['0']);

    this.panel.add(this.header);

    // Create content container (scrollable)
    this.content = DrawUI.div();

    this.content.addClass('PanelContent');

    this.content.setStyle('flex', ['1']);

    this.content.setStyle('overflow-y', ['auto']);

    this.content.setStyle('min-height', ['0']); // Important for flex overflow

    this.panel.add(this.content);

    // Create footer container (fixed, non-scrolling)
    this.footer = DrawUI.row();

    this.footer.addClass('PanelFooter');

    this.footer.setStyle('flex-shrink', ['0']);

    this.panel.add(this.footer);

    // Apply resizable if enabled
    if (resizable && resizeHandles.length > 0) {
      makeResizable(this.panel.dom, resizeHandles);
    }

    if (draggable) {
      makeDraggable(this.panel.dom, this.header.dom);
    }

    // Apply default styles
    const defaultStyles = {
      height: 'fit-content',
      maxHeight: '100vh',
      maxWidth: '100vw',
      overflow: 'hidden', // Changed from 'auto' - scrolling handled by content area
      ...panelStyles
    };

    for (const [key, value] of Object.entries(defaultStyles)) {
      this.panel.setStyle(key, [value]);
    }

    // Setup parent click listener
    if (this.parent) {
      this.setupParentListener(context);
    }

    if (testing) {
      this.toggle(context);
    }
  }

  clearPanel() {

    this.content.clear();

  }

  createHeader(title, iconName, actions = []) {
    const headerRow = DrawUI.row();

    headerRow
      .addClass('fill-parent')
      .setStyle('justify-content', ['space-between'])
      .setStyle('align-items', ['center'])
      .setStyle('padding', ['0.5rem 0.75rem'])

    const headerLeft = DrawUI.row();

    headerLeft.setStyle('align-items', ['center']).setStyle('gap', ['0.5rem']);

    if (iconName) {
      const icon = DrawUI.icon(iconName);

      icon.setStyle('font-size', ['1.2rem']);

      headerLeft.add(icon);
    }

    const titleText = DrawUI.text(title);

    titleText.setStyle('font-weight', ['600']).setStyle('font-size', ['0.9rem']);

    headerLeft.add(titleText);

    headerRow.add(headerLeft);

    if (actions.length > 0) {
      const actionsRow = DrawUI.row();

      actionsRow.setStyle('gap', ['0.5rem']);

      for (const action of actions) {
        actionsRow.add(action);
      }

      headerRow.add(actionsRow);
    }

    return headerRow;
  }

  createFooter(elements = [], justify = 'flex-end') {
    const footerRow = DrawUI.row();

    footerRow
      .setStyle('justify-content', [justify])
      .setStyle('align-items', ['center'])
      .setStyle('padding', ['0.5rem 0.75rem'])
      .setStyle('gap', ['0.5rem'])

    for (const element of elements) {
      footerRow.add(element);
    }

    return footerRow;
  }

  setupParentListener(context) {
    this.parent.style.cursor = 'pointer';

    this.parent.addEventListener('click', (e) => {
      e.stopPropagation();

      e.preventDefault();

      this.toggle(context);
    });
  }

  toggle(context, options = {}) {
    if (this.isActive) {
      this.hidePanel();
    } else {
      this.showPanel(context, options);
    }
  }

  showPanel(context, options = {}) {
    // Store anchor options for positioning
    this.anchorOptions = options;

    context.dom.appendChild(this.panel.dom);

    this.positionPanel();

    if (this.parent) {
      this.parent.classList.add('Active');
    }

    // Stop propagation inside panel
    if (this.stopPropagation) {
      this.panel.dom.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    this.isActive = true;

    this.onShow();
  }

  positionPanel() {
    const panelDom = this.panel.dom;

    panelDom.style.position = 'absolute';

    if (this.anchorOptions && this.anchorOptions.anchor) {
      this.positionAtAnchor(this.anchorOptions);

      return;
    }

    if (!this.parent) {
      this.positionDefault();

      return;
    }

    const rect = this.parent.getBoundingClientRect();

    if (this.panel.dom.style.top !== '') return;

    let effectivePosition = this.positionStrategy;

    if (effectivePosition === 'auto') {
      effectivePosition = this.determinePositionFromContext(rect);
    }

    switch (effectivePosition) {
      case 'left':
        this.positionLeft(rect);

        break;

      case 'right':
        this.positionRight(rect);

        break;

      case 'above':
        this.positionAbove(rect);

        break;

      case 'above-center':
        this.positionAboveCenter(rect);

        break;

      case 'above-left':
        this.positionAboveLeft(rect);

        break;

      case 'below-left':
        this.positionBelowLeft(rect);

        break;

      case 'below-center':
        this.positionBelowCenter(rect);

        break;

      case 'below':

      default:
        this.positionBelow(rect);

        break;
    }
  }

  determinePositionFromContext(rect) {
    const viewportWidth = window.innerWidth;

    const viewportHeight = window.innerHeight;

    const parentCenterX = rect.left + rect.width / 2;

    const parentCenterY = rect.top + rect.height / 2;

    const isInRightSide = parentCenterX > viewportWidth * 0.7;

    const isInBottomSide = parentCenterY > viewportHeight * 0.6;

    if (isInRightSide && isInBottomSide) return 'above-left';

    if (this.resizeHandles.includes('n')) return isInRightSide ? 'above-left' : 'above';

    if (this.resizeHandles.includes('w') && !this.resizeHandles.includes('e')) {
      return isInBottomSide ? 'above-left' : 'left';
    }

    if (parentCenterX > viewportWidth * 0.85) return 'left';

    if (parentCenterX < viewportWidth * 0.3) return 'below';

    return 'below-center';
  }

  positionBelow(rect) {
    const panelDom = this.panel.dom;

    panelDom.style.top = (rect.bottom + 5) + 'px';

    panelDom.style.left = rect.left + 'px';

    panelDom.style.right = 'auto';

    panelDom.style.bottom = 'auto';

    panelDom.style.transform = 'none';
  }

  positionBelowCenter(rect) {
    const panelDom = this.panel.dom;

    panelDom.style.top = (rect.bottom + 5) + 'px';

    panelDom.style.left = (rect.left + rect.width / 2) + 'px';

    panelDom.style.right = 'auto';

    panelDom.style.bottom = 'auto';

    panelDom.style.transform = 'translateX(-50%)';
  }

  positionBelowLeft(rect) {
    const panelDom = this.panel.dom;

    const gap = 10;

    panelDom.style.transform = 'none';

    panelDom.style.top = rect.top + 'px';

    panelDom.style.bottom = 'auto';

    panelDom.style.left = 'auto';

    panelDom.style.right = (window.innerWidth - rect.left + gap) + 'px';

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      if (panelRect.bottom > window.innerHeight - 10) {
        panelDom.style.top = 'auto';

        panelDom.style.bottom = '10px';
      }

      if (panelRect.left < 10) {
        panelDom.style.right = (window.innerWidth - panelRect.width - 10) + 'px';
      }
    });
  }

  positionLeft(rect) {
    const panelDom = this.panel.dom;

    const gap = 10;

    panelDom.style.transform = 'none';

    panelDom.style.top = rect.top + 'px';

    panelDom.style.bottom = 'auto';

    panelDom.style.left = 'auto';

    panelDom.style.right = (window.innerWidth - rect.left + gap) + 'px';

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      if (panelRect.bottom > window.innerHeight - 10) {
        const overflow = panelRect.bottom - window.innerHeight + 10;

        panelDom.style.top = (rect.top - overflow) + 'px';
      }

      if (panelRect.top < 10) {
        panelDom.style.top = '10px';
      }

      if (panelRect.left < 10) {
        panelDom.style.right = (window.innerWidth - panelRect.width - 10) + 'px';
      }
    });
  }

  positionRight(rect) {
    const panelDom = this.panel.dom;

    const gap = 10;

    panelDom.style.transform = 'none';

    panelDom.style.top = rect.top + 'px';

    panelDom.style.bottom = 'auto';

    panelDom.style.right = 'auto';

    panelDom.style.left = (rect.right + gap) + 'px';

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      if (panelRect.right > window.innerWidth - 10) {
        panelDom.style.left = (window.innerWidth - panelRect.width - 10) + 'px';
      }
    });
  }

  positionAbove(rect) {
    const panelDom = this.panel.dom;

    const gap = 10;

    panelDom.style.transform = 'none';

    panelDom.style.left = rect.left + 'px';

    panelDom.style.right = 'auto';

    panelDom.style.bottom = 'auto';

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      panelDom.style.top = (rect.top - panelRect.height - gap) + 'px';

      if (panelRect.top < 10) panelDom.style.top = '10px';

      if (panelRect.left < 10) panelDom.style.left = '10px';

      if (panelRect.right > window.innerWidth - 10) {
        panelDom.style.left = (window.innerWidth - panelRect.width - 10) + 'px';
      }
    });
  }

  positionAboveCenter(rect) {
    const panelDom = this.panel.dom;

    const gap = 10;

    panelDom.style.left = (rect.left + rect.width / 2) + 'px';

    panelDom.style.transform = 'translateX(-50%)';

    panelDom.style.right = 'auto';

    panelDom.style.bottom = 'auto';

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      panelDom.style.top = (rect.top - panelRect.height - gap) + 'px';

      if (panelRect.top < 10) panelDom.style.top = '10px';

      if (panelRect.left < 10) {
        panelDom.style.left = (panelRect.width / 2 + 10) + 'px';
      }

      if (panelRect.right > window.innerWidth - 10) {
        panelDom.style.left = (window.innerWidth - panelRect.width / 2 - 10) + 'px';
      }
    });
  }

  positionAboveLeft(rect) {
    const panelDom = this.panel.dom;

    const gap = 10;

    panelDom.style.transform = 'none';

    panelDom.style.top = 'auto';

    panelDom.style.left = 'auto';

    panelDom.style.bottom = (window.innerHeight - rect.bottom) + 'px';

    panelDom.style.right = (window.innerWidth - rect.left + gap) + 'px';

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      if (panelRect.top < 10) {
        const overflow = 10 - panelRect.top;

        panelDom.style.bottom = (parseInt(panelDom.style.bottom) - overflow) + 'px';
      }

      if (panelRect.left < 10) {
        const overflow = 10 - panelRect.left;

        panelDom.style.right = (parseInt(panelDom.style.right) - overflow) + 'px';
      }
    });
  }

  positionDefault() {
    const panelDom = this.panel.dom;

    panelDom.style.transform = 'none';

    panelDom.style.top = 'auto';

    panelDom.style.bottom = 'auto';

    panelDom.style.left = 'auto';

    panelDom.style.right = 'auto';

    switch (this.positionStrategy) {
      case 'left':
        panelDom.style.top = '80px';

        panelDom.style.left = '80px';

        break;

      case 'right':
        panelDom.style.top = '80px';

        panelDom.style.right = '80px';

        break;

      case 'above-left':

      case 'below-left':
        panelDom.style.bottom = '80px';

        panelDom.style.right = '80px';

        break;

      default:
        panelDom.style.top = '50%';

        panelDom.style.left = '50%';

        panelDom.style.transform = 'translate(-50%, -50%)';

        break;
    }

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      if (panelRect.top < 10) {
        panelDom.style.top = '10px';

        panelDom.style.transform = panelDom.style.transform.replace('translateY(-50%)', '').replace('translate(-50%, -50%)', 'translateX(-50%)');
      }

      if (panelRect.left < 10) {
        panelDom.style.left = '10px';

        panelDom.style.transform = panelDom.style.transform.replace('translateX(-50%)', '').replace('translate(-50%, -50%)', 'translateY(-50%)');
      }

      if (panelRect.right > window.innerWidth - 10) {
        panelDom.style.left = 'auto';

        panelDom.style.right = '10px';

        panelDom.style.transform = panelDom.style.transform.replace('translateX(-50%)', '');
      }

      if (panelRect.bottom > window.innerHeight - 10) {
        panelDom.style.top = 'auto';

        panelDom.style.bottom = '10px';

        panelDom.style.transform = panelDom.style.transform.replace('translateY(-50%)', '');
      }
    });
  }

  positionAtAnchor(options) {
    const { anchor, horizontal = 'left', vertical = 'bottom' } = options;

    const panelDom = this.panel.dom;

    const gap = 10;

    let anchorRect;

    if (anchor instanceof Event) {
      anchorRect = { top: anchor.clientY, bottom: anchor.clientY, left: anchor.clientX, right: anchor.clientX, width: 0, height: 0 };
    } else if (anchor.getBoundingClientRect) {
      anchorRect = anchor.getBoundingClientRect();
    } else if (anchor.dom && anchor.dom.getBoundingClientRect) {
      anchorRect = anchor.dom.getBoundingClientRect();
    } else {
      this.positionDefault();

      return;
    }

    panelDom.style.transform = 'none';

    panelDom.style.top = 'auto';

    panelDom.style.bottom = 'auto';

    panelDom.style.left = 'auto';

    panelDom.style.right = 'auto';

    requestAnimationFrame(() => {
      const panelRect = panelDom.getBoundingClientRect();

      if (horizontal === 'right') {
        let leftPos = anchorRect.right + gap;

        if (leftPos + panelRect.width > window.innerWidth - 10) {
          leftPos = anchorRect.left - panelRect.width - gap;
        }

        if (leftPos < 10) leftPos = 10;

        panelDom.style.left = leftPos + 'px';
      } else {
        panelDom.style.right = (window.innerWidth - anchorRect.left + gap) + 'px';

        const updatedRect = panelDom.getBoundingClientRect();

        if (updatedRect.left < 10) {
          panelDom.style.right = 'auto';

          panelDom.style.left = (anchorRect.right + gap) + 'px';
        }
      }

      if (vertical === 'top') {
        let bottomPos = window.innerHeight - anchorRect.bottom;

        if (anchorRect.bottom - panelRect.height < 10) {
          panelDom.style.bottom = 'auto';

          panelDom.style.top = anchorRect.top + 'px';
        } else {
          panelDom.style.bottom = bottomPos + 'px';
        }
      } else {
        let topPos = anchorRect.top;

        if (topPos + panelRect.height > window.innerHeight - 10) {
          panelDom.style.top = 'auto';

          panelDom.style.bottom = (window.innerHeight - anchorRect.bottom) + 'px';
        } else {
          panelDom.style.top = topPos + 'px';
        }
      }
    });
  }

  hidePanel() {
    if (this.panel.dom.parentNode) {
      this.panel.dom.parentNode.removeChild(this.panel.dom);
    }

    if (this.parent) {
      this.parent.classList.remove('Active');
    }

    this.isActive = false;

    this.onHide();
  }

  clearContent() {
    this.content.clear();
  }

  refresh() {
    this.clearPanel();

    this.draw();
  }

  draw() {
    // Implement in subclass
  }

  onShow() {
    // Implement in subclass
  }

  onHide() {
    // Implement in subclass
  }

  destroy() {
    this.hidePanel();
    
    if (this.parent) {
      // Remove event listeners would require storing references
      // For now, just clean up the panel
    }
  }
}

export class SimpleFloatingWindow extends BasePanel {
  static get isMobile() {
    return window.innerWidth <= 768;
  }

  constructor({ context, operators }) {
    const mobile = window.innerWidth <= 768;
    super({
      context,
      operators,
      parentId: null,
      draggable: !mobile,
      resizable: !mobile,
      resizeHandles: mobile ? [] : ["e", "s", "se"],
      panelStyles: mobile
        ? { background: "var(--glass-surface)" }
        : {
            width: mobile ? "45vw" : "25vw",
            left: "0",
            height: "fit-content",
            top: "calc( var(--headerbar-height) )",
            maxHeight: "calc(100vh - var(--headerbar-height))",
            maxWidth: mobile ? "90vw" : "50vw",
            background: "var(--glass-surface)",
          },
    });

    this.dom.id = "ExerciseNotes";

    this.context = context;

    this.titleText = null;

    this.titleIcon = null;

    this.isHidden = true;

    this._buildNotesHeader();

    this.panel.dom.style.display = "none";
  }

  _buildNotesHeader() {

    const headerRow = DrawUI.row();

    headerRow
      .addClass("fill-width")
      .setStyle("justify-content", ["space-between"])
      .setStyle("align-items", ["center"])
      .setStyle("padding", ["0.75rem 1rem"])
      .setStyle("background", ["var(--surface-dim)"])
      .setStyle("border-bottom", ["1px solid var(--outline)"])
      .setStyle("cursor", ["move"])
      .setStyle("border-radius", ["0.75rem 0.75rem 0 0"]);

    const titleRow = DrawUI.row();

    titleRow.setStyle("align-items", ["center"]).setStyle("gap", ["0.5rem"]);

    this.titleIcon = DrawUI.icon(ICONS.check);

    this.titleIcon.setStyle("font-size", ["1.1rem"]);

    this.titleText = DrawUI.span("Notes");

    this.titleText
      .setStyle("font-weight", ["600"])
      .setStyle("font-size", ["0.95rem"]);

    titleRow.add(this.titleIcon, this.titleText);

    headerRow.add(titleRow);

    // Right side: close button
    const closeBtn = DrawUI.icon("close");

    closeBtn.setStyle("cursor", ["pointer"]);

    closeBtn.setStyle("opacity", ["0.7"]);

    closeBtn.dom.addEventListener("mouseenter", () =>
      closeBtn.setStyle("opacity", ["1"]),
    );

    closeBtn.dom.addEventListener("mouseleave", () =>
      closeBtn.setStyle("opacity", ["0.7"]),
    );

    closeBtn.dom.addEventListener("click", () => this.hide());

    headerRow.add(closeBtn);

    this.header.add(headerRow);
  }


  setTitle(title) {
    if (this.titleText) {
      this.titleText.dom.textContent = title;
    }

    return this;
  }

  setIcon(iconName) {
    if (this.titleIcon) {
      this.titleIcon.dom.textContent = iconName;
    }

    return this;
  }


  setContent(content) {
    this.content.clear();

    if (content) {
      this.content.add(content);
    }

    return this;
  }

  addContent(content) {
    if (content) {
      this.content.add(content);
    }

    return this;
  }

  get contentWrapper() {
    return this.content;
  }

  show() {
    if (!this.panel.dom.parentNode) {
      this.context.dom.appendChild(this.panel.dom);
    }

    this.panel.dom.style.display = "flex";

    this.isHidden = false;

    return this;
  }

  restore() {
    return this.show();
  }

  hide() {
    this.panel.dom.style.display = "none";

    this.isHidden = true;

    return this;
  }

  minimize() {
    return this.hide();
  }

  get isMinimized() {
    return this.isHidden;
  }

  position({ top, left, right, bottom, width, height } = {}) {
    const panelDom = this.panel.dom;

    panelDom.style.position = "absolute";

    if (top !== undefined) panelDom.style.top = top;

    if (left !== undefined) panelDom.style.left = left;

    if (right !== undefined) panelDom.style.right = right;

    if (bottom !== undefined) panelDom.style.bottom = bottom;

    if (width !== undefined) panelDom.style.width = width;

    if (height !== undefined) panelDom.style.height = height;

    return this;
  }

  pinToPosition(options) {
    return this.position(options);
  }

  get dom() {
    return this.panel.dom;
  }

  setStyles(styles) {
    for (const [key, value] of Object.entries(styles)) {
      this.panel.dom.style[key] = value;
    }

    return this;
  }
}


export class AccountPanel {
  constructor(options = {}) {
    const { parentId, title, icon } = options;

    this.parentId = parentId;
    this.parent = parentId ? document.getElementById(parentId) : null;
    this.isActive = false;
    this.title = title;
    this.icon = icon;

    
    this.panel = DrawUI.panel();

    
    this.content = DrawUI.div();
    this.content.addClass('PanelContent');
    this.content.setStyles({
      flex: '1',
      overflowY: 'auto',
      overflowX: 'hidden',
    });
    this.panel.add(this.content);

    
    this.footer = DrawUI.row();
    this.footer.addClass('PanelFooter');
    this.panel.add(this.footer);
  }

  createHeader(title, iconName, actions = []) {
    const headerRow = DrawUI.row();
    headerRow
      .addClass('fill-parent')
      .setStyle('justify-content', ['space-between'])
      .setStyle('align-items', ['center'])
      .gap('var(--phi-1)');

    const headerLeft = DrawUI.row();
    headerLeft.setStyle('align-items', ['center']).gap('var(--phi-1)');

    if (iconName) {
      const icon = DrawUI.icon(iconName);
      icon.setStyle('font-size', ['1.2rem']);
      headerLeft.add(icon);
    }

    const titleText = DrawUI.h5(title);
    headerLeft.add(titleText);

    headerRow.add(headerLeft);

    if (actions.length > 0) {
      const actionsRow = DrawUI.row();
      actionsRow.gap('var(--phi-1)');
      for (const action of actions) {
        actionsRow.add(action);
      }
      headerRow.add(actionsRow);
    }

    return headerRow;
  }

  setupParentListener(context, onToggle) {
    if (!this.parent) return;

    this.parent.style.cursor = 'pointer';
    this.parent.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (onToggle) {
        onToggle(this);

      } else {
        this.toggle(context);
      }
    });
  }

  toggle(context) {
    if (this.isActive) {
      this.hide();
    } else {
      this.show(context);
    }
  }

  show(context) {
    context.dom.appendChild(this.panel.dom);
    if (this.parent) {
      this.parent.classList.add('Active');
    }
    this.isActive = true;
    this.onShow();
  }

  hide() {
    if (this.panel.dom.parentNode) {
      this.panel.dom.parentNode.removeChild(this.panel.dom);
    }
    if (this.parent) {
      this.parent.classList.remove('Active');
    }
    this.isActive = false;
    this.onHide();
  }

  onShow() {}
  onHide() {}

  clearContent() {
    this.content.clear();
  }
}

export default { BasePanel, SimpleFloatingWindow, AccountPanel };
