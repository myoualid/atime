/**
 * @typedef {Object} StyleProperties
 * @property {string} [position]
 * @property {string} [left]
 * @property {string} [top]
 * @property {string} [right]
 * @property {string} [bottom]
 * @property {string} [width]
 * @property {string} [height]
 * @property {string} [display]
 * @property {string} [background]
 * @property {string} [color]
 * @property {string} [padding]
 * @property {string} [margin]
 * @property {string} [gap]
 * @property {string} [border]
 * @property {string} [borderRadius]
 * @property {string} [fontSize]
 * @property {string} [fontWeight]
 * @property {string} [textAlign]
 * @property {string} [cursor]
 * @property {string} [zIndex]
 * @property {string} [overflow]
 * @property {string} [opacity]
 */

/**
 * Base UI element wrapper for DOM elements with chainable methods.
 * All UI components extend this class.
 */
export class UIElement {
  /**
   * @param {HTMLElement} dom - The DOM element to wrap
   */
  constructor(dom) {
    /** @type {HTMLElement} */
    this.dom = dom;
  }

  /**
   * Clone this element
   * @returns {UIElement}
   */
  clone() {
    return new UIElement(this.dom.cloneNode(true));
  }

  /**
   * Add child UIElements
   * @param {...UIElement} children - Elements to add
   * @returns {this}
   */
  add() {
    for (let i = 0; i < arguments.length; i++) {
      const argument = arguments[i];

      if (argument instanceof UIElement) {
        this.dom.appendChild(argument.dom);
      } else {
        console.error(
          "UIElement:",
          argument,
          "is not an instance of UIElement."
        );
      }
    }

    return this;
  }

  contains(child) {
    return this.dom.contains(child.dom);
  }

  /**
   * Remove child UIElements
   * @param {...UIElement} children - Elements to remove
   * @returns {this}
   */
  remove() {
    for (let i = 0; i < arguments.length; i++) {
      const argument = arguments[i];

      if (argument instanceof UIElement) {
        this.dom.removeChild(argument.dom);
      } else {
        console.error(
          "UIElement:",
          argument,
          "is not an instance of UIElement."
        );
      }
    }

    return this;
  }

  /**
   * Clear all children from this element
   * @returns {void}
   */
  clear() {
    while (this.dom.children.length) {
      this.dom.removeChild(this.dom.lastChild);
    }
  }

  /**
   * Set the DOM element id
   * @param {string} id - The id to set
   * @returns {this}
   */
  setId(id) {
    this.dom.id = id;

    return this;
  }

  setTooltip(title) {
    this.dom.title = title;

    return this;
  }

  /**
   * Get the DOM element id
   * @returns {string}
   */
  getId() {
    return this.dom.id;
  }

  /**
   * Set CSS class name (replaces existing classes)
   * @param {string} name - Class name
   * @returns {this}
   */
  setClass(name) {
    this.dom.className = name;

    return this;
  }

  /**
   * Add a CSS class
   * @param {string} name - Class name to add
   * @returns {this}
   */
  addClass(name) {
    this.dom.classList.add(name);

    return this;
  }

  /**
   * Remove a CSS class
   * @param {string} name - Class name to remove
   * @returns {this}
   */
  removeClass(name) {
    this.dom.classList.remove(name);

    return this;
  }

  /**
   * Toggle a CSS class
   * @param {string} name - Class name to toggle
   * @param {boolean} [toggle] - Force add/remove
   * @returns {this}
   */
  toggleClass(name, toggle) {
    this.dom.classList.toggle(name, toggle);

    return this;
  }

  /**
   * Set a single style property
   * @param {string} style - CSS property name
   * @param {string[]} array - Array of values (uses last valid)
   * @returns {this}
   */
  setStyle(style, array) {
    for (let i = 0; i < array.length; i++) {
      this.dom.style[style] = array[i];
    }

    return this;
  }

  /**
   * Set multiple style properties
   * @param {StyleProperties} defaultStyles - Object of style properties
   * @returns {this}
   */
  setStyles(defaultStyles) {
    for (const [key, value] of Object.entries(defaultStyles))
    {
     this.setStyle(key, [value]);
    }

    return this;
     
  }

  /**
   * Set width and height (deprecated, use setSize)
   * @param {string} width 
   * @param {string} height 
   * @returns {this}
   */
  setsize(width, height) {
    this.setStyles({ "width": width, "height": height });

    return this;
  }
  
  /**
   * Set width and height
   * @param {string|null} width - Width value or null to skip
   * @param {string|null} height - Height value or null to skip
   * @returns {this}
   */
  setSize(width, height) {
    if (width !== null) this.dom.style.width = width;

    if (height !== null) this.dom.style.height = height;

    return this
  }

  /**
   * Set position properties
   * @param {Object} options - Position options
   * @param {string} [options.left]
   * @param {string} [options.top]
   * @param {string} [options.right]
   * @param {string} [options.bottom]
   * @returns {this}
   */
  setPosition({left, top, right, bottom} = {}) {
    if (left !== null) this.dom.style.left = left;

    if (top !== null) this.dom.style.top = top;

    if (right !== null) this.dom.style.right = right;

    if (bottom !== null) this.dom.style.bottom = bottom;

    return this;
  }

  /**
   * Set hidden state
   * @param {boolean} isHidden
   * @returns {this}
   */
  setHidden(isHidden) {
    this.dom.hidden = isHidden;

    return this;
  }

  /**
   * Check if element is hidden
   * @returns {boolean}
   */
  isHidden() {
    return this.dom.hidden;
  }

  /**
   * Set disabled state
   * @param {boolean} value
   * @returns {this}
   */
  setDisabled(value) {
    this.dom.disabled = value;

    return this;
  }

  /**
   * Set text content
   * @param {string} value
   * @returns {this}
   */
  setTextContent(value) {
    this.dom.textContent = value;

    return this;
  }

  /**
   * Set inner HTML
   * @param {string} value
   * @returns {void}
   */
  setInnerHTML(value) {
    this.dom.innerHTML = value;
  }

  /**
   * Get index of child element
   * @param {UIElement} element
   * @returns {number}
   */
  getIndexOfChild(element) {
    return Array.prototype.indexOf.call(this.dom.children, element.dom);
  }

  /**
   * Add blur event listener
   * @param {Function} callback
   * @returns {void}
   */
  onBlur(callback) {
    this.dom.addEventListener("blur", callback);
  }

  /**
   * Add click event listener
   * @param {Function} callback
   * @returns {void}
   */
  onClick(callback) {
    this.dom.addEventListener("click", callback);
  }

  /**
   * Set padding
   * @param {string} size
   * @returns {this}
   */
  padding(size) {
    this.dom.style.padding = size;

    return this;
  }

  /**
   * Set gap for flex/grid containers
   * @param {string} size
   * @returns {this}
   */
  gap(size) {
    this.dom.style.gap = size;

    return this;
  }
}

// properties

const properties = [
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "display",
  "verticalAlign",
  "overflow",
  "color",
  "background",
  "backgroundColor",
  "opacity",
  "border",
  "borderLeft",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderColor",
  "margin",
  "marginLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "padding",
  "paddingLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "fontSize",
  "fontWeight",
  "textAlign",
  "textDecoration",
  "textTransform",
  "cursor",
  "zIndex",
];

properties.forEach(function (property) {
  const method =
    "set" + property.substring(0, 1).toUpperCase() + property.substring(1);

  UIElement.prototype[method] = function () {
    this.setStyle(property, arguments);

    return this;
  };
});

// events

const events = [
  "KeyUp",
  "KeyDown",
  "MouseOver",
  "MouseOut",
  "Click",
  "DblClick",
  "Change",
  "Input",
];

events.forEach(function (event) {
  const method = "on" + event;

  UIElement.prototype[method] = function (callback) {
    this.dom.addEventListener(event.toLowerCase(), callback.bind(this));

    return this;
  };
});

