import { UIElement } from './UIElement.js';

class UISpan extends UIElement {
  constructor() {
    super(document.createElement("span"));
  }
}


class UILink extends UIElement {
  constructor( name, link, icon, external = false ) {
    super(document.createElement("a"));

    this.setClass("Link");

    this.setLink( link );

    this.setText( name );

    external? this.dom.target = "_blank" : this.dom.removeAttribute("target");

    icon? this.addIcon( icon ) : null;
    
  }

  setText(name) {
    this.dom.textContent = name;

    return this;
  }

  setLink(link) {
    this.dom.href = link;

    return this;
  }

  addIcon( icon ) {
    this.icon = new UIIcon( icon );

    this.dom.insertBefore( this.icon.dom, this.dom.firstChild );

    this.dom.style.display = "flex";

    this.dom.style.alignItems = "center";

    this.dom.style.gap = "4px";

    this.gap("4px");

    return this;
  }

  setIcon( icon ) {
    if ( this.icon ) this.icon.setIcon( icon );
    else this.addIcon( icon );
    
  }

  setValue(value) {
    this.dom.textContent = value;

    return this;
  }
}

class UIImage extends UIElement {
  constructor(path) {
    super(document.createElement("img"));

    this.dom.src = path;

    this.dom.className = "Image";
  }

  setValue(value) {
    this.dom.src = value;

    return this;
  }

  getValue() {
    return this.dom.src;
  }

  set(path) {
    this.dom.src = path;

    return this;
  }

}

class UISVG extends UIElement {
  constructor(pathOrElement) {
    super(document.createElement("div"));

    this.dom.className = "SVG";

    this.template = null;

    this.ready = Promise.resolve();

    if (typeof pathOrElement === "string") {
      this.ready = fetch(pathOrElement)
        .then((res) => res.text())
        .then((text) => {
          const parser = new DOMParser();

          const doc = parser.parseFromString(text, "image/svg+xml");

          const svg = doc.querySelector("svg");

          if (!svg) throw new Error("No svg root found in " + pathOrElement);

          const svgNode = document.importNode(svg, true);

          this.template = svgNode;

          this.dom.innerHTML = "";

          const appendedNode = svgNode.cloneNode(true);

          // Ensure the SVG scales to the container
          if (appendedNode.removeAttribute) {
            appendedNode.removeAttribute('width');

            appendedNode.removeAttribute('height');
          }

          appendedNode.style.width = '100%';

          appendedNode.style.height = '100%';

          appendedNode.style.display = 'block';

          appendedNode.setAttribute('preserveAspectRatio', 'xMidYMid meet');

          this.dom.appendChild(appendedNode);
        })
        .catch((err) => {
          console.error("Failed to load SVG:", err);
        });
    } else if (pathOrElement instanceof SVGElement) {
      this.template = pathOrElement;

      this.dom.innerHTML = "";

      const appendedNode = pathOrElement.cloneNode(true);

      if (appendedNode.removeAttribute) {
        appendedNode.removeAttribute('width');

        appendedNode.removeAttribute('height');
      }

      appendedNode.style.width = '100%';

      appendedNode.style.height = '100%';

      appendedNode.style.display = 'block';

      appendedNode.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      this.dom.appendChild(appendedNode);

      this.ready = Promise.resolve();
    } else if (pathOrElement && pathOrElement.dom) {
      const svgEl = pathOrElement.dom.querySelector("svg");

      if (svgEl) {
        this.template = svgEl;

        this.dom.innerHTML = "";

        const appendedNode = svgEl.cloneNode(true);

        if (appendedNode.removeAttribute) {
          appendedNode.removeAttribute('width');

          appendedNode.removeAttribute('height');
        }

        appendedNode.style.width = '100%';

        appendedNode.style.height = '100%';

        appendedNode.style.display = 'block';

        appendedNode.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        this.dom.appendChild(appendedNode);

        this.ready = Promise.resolve();
      }
    }
  }

  clone() {
    const cloned = new UISVG(this);

    // Give the clone unique ids to avoid conflicts when inserting multiple copies into the document
    const prefix = "aeco-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

    cloned.ready = cloned.ready.then(() => {
      cloned._makeIdsUnique(prefix);

      return cloned;
    });

    return cloned;
  }

  _makeIdsUnique(prefix) {
    const svgEl = this.getSVG();

    if (!svgEl) return;

    const nodesWithId = Array.from(svgEl.querySelectorAll('[id]'));

    const idMap = {};

    nodesWithId.forEach((el) => {
      const oldId = el.id;

      const newId = `${prefix}-${oldId}`;

      idMap[oldId] = newId;

      el.id = newId;

      // store the original id as data attribute for convenience (dataset can be undefined on some SVG elements)
      el.setAttribute('data-aeco-original-id', oldId);
    });

    // Replace references (url(#id), href="#id", xlink:href="#id", filter/url/clip-path/mask etc)
    const allNodes = Array.from(svgEl.querySelectorAll('*'));

    allNodes.forEach((node) => {
      for (const attr of Array.from(node.attributes || [])) {
        if (!attr.value) continue;

        let value = attr.value;

        Object.keys(idMap).forEach((oldId) => {
          const newId = idMap[oldId];

          // url(#oldId)
          value = value.replace(new RegExp(`url\\(#${oldId}\\)`, 'g'), `url(#${newId})`);

          // href="#oldId" or "#oldId"
          value = value.replace(new RegExp(`#${oldId}(?![\\w-])`, 'g'), `#${newId}`);
        });

        if (value !== attr.value) node.setAttribute(attr.name, value);
      }

      // also fix inline style text (style attribute)
      if (node.style && node.getAttribute('style')) {
        let styleText = node.getAttribute('style');

        Object.keys(idMap).forEach((oldId) => {
          const newId = idMap[oldId];

          styleText = styleText.replace(new RegExp(`url\\(#${oldId}\\)`, 'g'), `url(#${newId})`);
        });

        if (styleText !== node.getAttribute('style')) node.setAttribute('style', styleText);
      }
    });

    this.idMap = idMap;
  }

  _resolveId(id) {
    if (!this.idMap) return id;

    return this.idMap[id] || id;
  }

  setFillById(id, color) {
    const svgEl = this.dom.querySelector("svg");

    if (!svgEl) return this;

    const resolvedId = this._resolveId(id);

    let el = null;

    if (svgEl.getElementById) el = svgEl.getElementById(resolvedId);

    if (!el) el = svgEl.querySelector(`#${resolvedId}`);

    if (!el) {
      // try to find by original id stored in dataset
      el = svgEl.querySelector(`[data-aeco-original-id="${id}"]`);
    }

    if (el) {
      // override any inline style fill and presentation attribute
      el.style.fill = color;

      el.setAttribute('fill', color);

      // also remove any fill:... from style attribute that might override
      const styleAttr = el.getAttribute('style');

      if (styleAttr && /fill\s*:\s*url\(#/.test(styleAttr)) {
        const cleaned = styleAttr.replace(/fill\s*:\s*url\(#.*?\)\s*;?\s*/g, '');

        el.setAttribute('style', cleaned);
      }
    }

    return this;
  }

  setFill(selector, color) {
    const svgEl = this.dom.querySelector("svg");

    if (!svgEl) return this;

    const el = svgEl.querySelector(selector);

    if (el) {
      el.style.fill = color;

      el.setAttribute('fill', color);
    }

    return this;
  }

  getFillByOriginalId(originalId) {
    const svgEl = this.dom.querySelector("svg");

    if (!svgEl) return null;

    const resolvedId = this._resolveId(originalId);

    let el = svgEl.getElementById(resolvedId);

    if (!el) el = svgEl.querySelector(`[data-aeco-original-id="${originalId}"]`);

    if (el) {
      const fill = el.style.fill || el.getAttribute('fill');

      return fill;
    }

    return null;
  }

  setFillByOriginalId(originalId, color) {
    // helper to set fill using the original id before uniqueing
    const svgEl = this.dom.querySelector("svg");

    if (!svgEl) return this;

    const resolvedId = this._resolveId(originalId);

    let el = svgEl.getElementById(resolvedId);

    if (!el) el = svgEl.querySelector(`[data-aeco-original-id="${originalId}"]`);

    if (el) {
      el.style.fill = color;

      el.setAttribute('fill', color);
    }

    return this;
  }

  setGradientStopsByOriginalId(originalGradientId, colors = []) {
    const svgEl = this.dom.querySelector("svg");

    if (!svgEl) return this;

    const resolvedId = this._resolveId(originalGradientId);

    let grad = svgEl.getElementById(resolvedId);

    if (!grad) grad = svgEl.querySelector(`[data-aeco-original-id="${originalGradientId}"]`);

    if (!grad) return this;

    const stops = Array.from(grad.querySelectorAll('stop'));

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];

      const color = colors[i] !== undefined ? colors[i] : colors[colors.length - 1] || null;

      if (color) {
        // prefer style attribute or stop-color attribute
        stop.style.stopColor = color;

        stop.setAttribute('stop-color', color);
      }
    }

    return this;
  }

  getSVG() {
    return this.dom.querySelector("svg");
  }
}


class UIParagraph extends UIElement {
  constructor(text) {
    super(document.createElement("p"));

    this.setValue(text);
  }

  getValue() {
    return this.dom.textContent;
  }

  setValue(value) {
    if (value !== undefined) {
      this.dom.textContent = value;
    }

    return this;
  }
}

class UIDiv extends UIElement {
  constructor() {
    super(document.createElement("div"));
  }
}

class UIRow extends UIDiv {
  constructor() {
    super();

    this.dom.className = "Row";
  }

  gap(size) {
    this.dom.style.gap = size;

    return this;
  }
}

class UIColumn extends UIDiv {
  constructor() {
    super();

    this.dom.className = "Column";
  }

  gap(size) {
    this.dom.style.gap = size;

    return this;
  }
}


class UIPanel extends UIDiv {
  constructor() {
    super();

    this.dom.className = "Panel";
  }
}

class UILabel extends UIElement {
  constructor(text = '') {
    super(document.createElement('label'));

    if (text) this.dom.textContent = text;
  }

  setFor(id) {
    this.dom.htmlFor = id;

    return this;
  }

  getValue() {
    return this.dom.textContent;
  }

  setValue(value) {
    this.dom.textContent = value;

    return this;
  }
}

class UIForm extends UIElement {
  constructor() {
    super(document.createElement('form'));
  }

  setAction(url) {
    this.dom.action = url;

    return this;
  }

  setMethod(method) {
    this.dom.method = method;

    return this;
  }

  addHiddenInput(name, value) {
    const input = document.createElement('input');

    input.type = 'hidden';

    input.name = name;

    input.value = value;

    this.dom.appendChild(input);

    return this;
  }

  getFormData() {
    return new FormData(this.dom);
  }

  onSubmit(callback) {
    this.dom.addEventListener('submit', callback);

    return this;
  }
}

class UIText extends UISpan {
  constructor(text) {
    super();

    this.dom.className = "Text";

    this.dom.style.display = "inline-block";

    this.setValue(text);
  }

  getValue() {
    return this.dom.textContent;
  }

  setValue(value) {
    if (value !== undefined) {
      this.dom.textContent = value;
    }

    return this;
  }
}

class UISmallText extends UIElement {
  constructor(text) {
    super(document.createElement("small"));

    this.setValue(text);
  }

  getValue() {
    return this.dom.textContent;
  }

  setValue(value) {
    if (value !== undefined) {
      this.dom.textContent = value;
    }

    return this;
  }
}

class UIInput extends UIElement {
  constructor(text) {
    super(document.createElement("input"));

    this.dom.className = "Input";

    this.dom.style.border = "1px solid transparent";

    this.dom.setAttribute("autocomplete", "off");

    this.dom.addEventListener("keydown", function (event) {
      event.stopPropagation();
    });

    if (text !== undefined && text !== null) {
      this.setValue(text);
    }
  }

  getValue() {
    return this.dom.value;
  }

  setValue(value) {
    this.dom.value = value !== undefined && value !== null ? value : '';

    return this;
  }

  onEnter(callback) {
    this.dom.addEventListener("change", callback);

    return this;
  }
}

class UITextArea extends UIElement {
  constructor() {
    super(document.createElement("textarea"));

    this.dom.className = "TextArea";

    this.dom.style.padding = "2px";

    this.dom.spellcheck = false;

    this.dom.setAttribute("autocomplete", "off");

    this.dom.addEventListener("keydown", function (event) {
      event.stopPropagation();

      if (event.code === "Tab") {
        event.preventDefault();

        const cursor = this.selectionStart;

        this.value =
          this.value.substring(0, cursor) + "\t" + this.value.substring(cursor);

        this.selectionStart = cursor + 1;

        this.selectionEnd = this.selectionStart;
      }
    });
  }

  getValue() {
    return this.dom.value;
  }

  setValue(value) {
    this.dom.value = value;

    return this;
  }
}

class UISelect extends UIElement {
  constructor() {
    super(document.createElement("select"));

    this.dom.className = "Select";

    this.dom.style.padding = "2px";

    this.dom.setAttribute("autocomplete", "off");

    this.dom.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
    });
  }

  setMultiple(boolean) {
    this.dom.multiple = boolean;

    return this;
  }

  setOptions(options) {
    const selected = this.dom.value;

    while (this.dom.children.length > 0) {
      this.dom.removeChild(this.dom.firstChild);
    }

    for (const key in options) {
      const option = document.createElement("option");

      option.value = key;

      option.innerHTML = options[key];

      this.dom.appendChild(option);
    }

    this.dom.value = selected;

    return this;
  }

  getValue() {
    return this.dom.value;
  }

  setValue(value) {
    value = String(value);

    if (this.dom.value !== value) {
      this.dom.value = value;
    }

    return this;
  }
}

class UICheckbox extends UIElement {
  constructor(boolean) {
    super(document.createElement("input"));

    this.dom.className = "Checkbox";

    this.dom.type = "checkbox";

    this.dom.addEventListener("pointerdown", function (event) {
      // Workaround for TransformControls blocking events in Viewport.Controls checkboxes

      event.stopPropagation();
    });

    this.setValue(boolean);
  }

  getValue() {
    return this.dom.checked;
  }

  setValue(value) {
    if (value !== undefined) {
      this.dom.checked = value;
    }

    return this;
  }
}

class UIColor extends UIElement {
  constructor() {
    super(document.createElement("input"));

    this.dom.className = "Color";

    this.dom.style.width = "32px";

    this.dom.style.height = "16px";

    this.dom.style.border = "0px";

    this.dom.style.padding = "2px";

    this.dom.style.backgroundColor = "transparent";

    this.dom.setAttribute("autocomplete", "off");

    try {
      this.dom.type = "color";

      this.dom.value = "#ffffff";
    } catch (exception) {}
  }

  getValue() {
    return this.dom.value;
  }

  getHexValue() {
    return parseInt(this.dom.value.substring(1), 16);
  }

  setValue(value) {
    this.dom.value = value;

    return this;
  }

  setHexValue(hex) {
    this.dom.value = "#" + ("000000" + hex.toString(16)).slice(-6);

    return this;
  }
}

class UINumber extends UIElement {
  constructor(number) {
    super(document.createElement("input"));

    this.dom.style.cursor = "ns-resize";

    this.dom.className = "Number";

    this.dom.value = "0.00";

    this.dom.setAttribute("autocomplete", "off");

    this.value = 0;

    this.min = -Infinity;

    this.max = Infinity;

    this.precision = 2;

    this.step = 1;

    this.unit = "";

    this.nudge = 0.01;

    this.setValue(number);

    const scope = this;

    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    let distance = 0;

    let onMouseDownValue = 0;

    const pointer = { x: 0, y: 0 };

    const prevPointer = { x: 0, y: 0 };

    function onMouseDown(event) {
      if (document.activeElement === scope.dom) return;

      event.preventDefault();

      distance = 0;

      onMouseDownValue = scope.value;

      prevPointer.x = event.clientX;

      prevPointer.y = event.clientY;

      document.addEventListener("mousemove", onMouseMove);

      document.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(event) {
      const currentValue = scope.value;

      pointer.x = event.clientX;

      pointer.y = event.clientY;

      distance += pointer.x - prevPointer.x - (pointer.y - prevPointer.y);

      let value =
        onMouseDownValue + (distance / (event.shiftKey ? 5 : 50)) * scope.step;

      value = Math.min(scope.max, Math.max(scope.min, value));

      if (currentValue !== value) {
        scope.setValue(value);

        scope.dom.dispatchEvent(changeEvent);
      }

      prevPointer.x = event.clientX;

      prevPointer.y = event.clientY;
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);

      document.removeEventListener("mouseup", onMouseUp);

      if (Math.abs(distance) < 2) {
        scope.dom.focus();

        scope.dom.select();
      }
    }

    function onTouchStart(event) {
      if (event.touches.length === 1) {
        distance = 0;

        onMouseDownValue = scope.value;

        prevPointer.x = event.touches[0].pageX;

        prevPointer.y = event.touches[0].pageY;

        document.addEventListener("touchmove", onTouchMove, { passive: false });

        document.addEventListener("touchend", onTouchEnd);
      }
    }

    function onTouchMove(event) {
      event.preventDefault();

      const currentValue = scope.value;

      pointer.x = event.touches[0].pageX;

      pointer.y = event.touches[0].pageY;

      distance += pointer.x - prevPointer.x - (pointer.y - prevPointer.y);

      let value =
        onMouseDownValue + (distance / (event.shiftKey ? 5 : 50)) * scope.step;

      value = Math.min(scope.max, Math.max(scope.min, value));

      if (currentValue !== value) {
        scope.setValue(value);

        scope.dom.dispatchEvent(changeEvent);
      }

      prevPointer.x = event.touches[0].pageX;

      prevPointer.y = event.touches[0].pageY;
    }

    function onTouchEnd(event) {
      if (event.touches.length === 0) {
        document.removeEventListener("touchmove", onTouchMove);

        document.removeEventListener("touchend", onTouchEnd);
      }
    }

    function onChange() {
      scope.setValue(scope.dom.value);
    }

    function onFocus() {
      scope.dom.style.backgroundColor = "";

      scope.dom.style.cursor = "";
    }

    function onBlur() {
      scope.dom.style.backgroundColor = "transparent";

      scope.dom.style.cursor = "ns-resize";
    }

    function onKeyDown(event) {
      event.stopPropagation();

      switch (event.code) {
        case "Enter":
          scope.dom.blur();

          break;

        case "ArrowUp":
          event.preventDefault();

          scope.setValue(scope.getValue() + scope.nudge);

          scope.dom.dispatchEvent(changeEvent);

          break;

        case "ArrowDown":
          event.preventDefault();

          scope.setValue(scope.getValue() - scope.nudge);

          scope.dom.dispatchEvent(changeEvent);

          break;
      }
    }

    onBlur();

    this.dom.addEventListener("keydown", onKeyDown);

    this.dom.addEventListener("mousedown", onMouseDown);

    this.dom.addEventListener("touchstart", onTouchStart, { passive: false });

    this.dom.addEventListener("change", onChange);

    this.dom.addEventListener("focus", onFocus);

    this.dom.addEventListener("blur", onBlur);
  }

  getValue() {
    return this.value;
  }

  setValue(value) {
    if (value !== undefined) {
      value = parseFloat(value);

      if (value < this.min) value = this.min;

      if (value > this.max) value = this.max;

      this.value = value;

      this.dom.value = value.toFixed(this.precision);

      if (this.unit !== "") this.dom.value += " " + this.unit;
    }

    return this;
  }

  setPrecision(precision) {
    this.precision = precision;

    return this;
  }

  setStep(step) {
    this.step = step;

    return this;
  }

  setNudge(nudge) {
    this.nudge = nudge;

    return this;
  }

  setRange(min, max) {
    this.min = min;

    this.max = max;

    return this;
  }

  setUnit(unit) {
    this.unit = unit;

    this.setValue(this.value);

    return this;
  }

  onblur(callback) {
    this.dom.addEventListener("blur", callback);
  }
}

class UIInteger extends UIElement {
  constructor(number) {
    super(document.createElement("input"));

    this.dom.style.cursor = "ns-resize";

    this.dom.className = "Number";

    this.dom.value = "0";

    this.dom.setAttribute("autocomplete", "off");

    this.value = 0;

    this.min = -Infinity;

    this.max = Infinity;

    this.step = 1;

    this.nudge = 1;

    this.setValue(number);

    const scope = this;

    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    let distance = 0;

    let onMouseDownValue = 0;

    const pointer = { x: 0, y: 0 };

    const prevPointer = { x: 0, y: 0 };

    function onMouseDown(event) {
      if (document.activeElement === scope.dom) return;

      event.preventDefault();

      distance = 0;

      onMouseDownValue = scope.value;

      prevPointer.x = event.clientX;

      prevPointer.y = event.clientY;

      document.addEventListener("mousemove", onMouseMove);

      document.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(event) {
      const currentValue = scope.value;

      pointer.x = event.clientX;

      pointer.y = event.clientY;

      distance += pointer.x - prevPointer.x - (pointer.y - prevPointer.y);

      let value =
        onMouseDownValue + (distance / (event.shiftKey ? 5 : 50)) * scope.step;

      value = Math.min(scope.max, Math.max(scope.min, value)) | 0;

      if (currentValue !== value) {
        scope.setValue(value);

        scope.dom.dispatchEvent(changeEvent);
      }

      prevPointer.x = event.clientX;

      prevPointer.y = event.clientY;
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);

      document.removeEventListener("mouseup", onMouseUp);

      if (Math.abs(distance) < 2) {
        scope.dom.focus();

        scope.dom.select();
      }
    }

    function onChange() {
      scope.setValue(scope.dom.value);
    }

    function onFocus() {
      scope.dom.style.backgroundColor = "";

      scope.dom.style.cursor = "";
    }

    function onBlur() {
      scope.dom.style.backgroundColor = "transparent";

      scope.dom.style.cursor = "ns-resize";
    }

    function onKeyDown(event) {
      event.stopPropagation();

      switch (event.code) {
        case "Enter":
          scope.dom.blur();

          break;

        case "ArrowUp":
          event.preventDefault();

          scope.setValue(scope.getValue() + scope.nudge);

          scope.dom.dispatchEvent(changeEvent);

          break;

        case "ArrowDown":
          event.preventDefault();

          scope.setValue(scope.getValue() - scope.nudge);

          scope.dom.dispatchEvent(changeEvent);

          break;
      }
    }

    onBlur();

    this.dom.addEventListener("keydown", onKeyDown);

    this.dom.addEventListener("mousedown", onMouseDown);

    this.dom.addEventListener("change", onChange);

    this.dom.addEventListener("focus", onFocus);

    this.dom.addEventListener("blur", onBlur);
  }

  getValue() {
    return this.value;
  }

  setValue(value) {
    if (value !== undefined) {
      value = parseInt(value);

      this.value = value;

      this.dom.value = value;
    }

    return this;
  }

  setStep(step) {
    this.step = parseInt(step);

    return this;
  }

  setNudge(nudge) {
    this.nudge = nudge;

    return this;
  }

  setRange(min, max) {
    this.min = min;

    this.max = max;

    return this;
  }

  onBlur(callback) {
    this.dom.addEventListener("blur", callback);
  }
}

class UIBreak extends UIElement {
  constructor() {
    super(document.createElement("br"));

    this.dom.className = "Break";
  }
}

class UIHorizontalRule extends UIElement {
  constructor() {
    super(document.createElement("hr"));

    this.dom.className = "HorizontalRule";
  }
}

class UIButton extends UIElement {
  constructor(value) {
    super(document.createElement("button"));

    this.dom.className = "Button";

    this.dom.textContent = value;
  }

  setIcon(iconClass) {
    const span = new UISpan();

    span.addClass("material-symbols-outlined");

    span.setTextContent(iconClass);

    // prepend icon span before the button text
    this.dom.insertBefore(span.dom, this.dom.firstChild);

    this.gap("4px");

    return this;
  }

  setValue(value) {
    this.setTextContent(value);

    return this;
  }
}

class UIIcon extends UISpan {
  constructor(icon) {
    super();

    this.dom.className = "material-symbols-outlined";

    this.addClass("Icon");

    this.setIcon(icon);
  }

  setIcon(icon) {
    this.dom.textContent = icon;

    return this;
  }

  modify(icon) {
    this.setIcon(icon);

    return this;
  }
}

class UIProgress extends UIElement {
  constructor(value) {
    super(document.createElement("progress"));

    this.dom.value = value;
  }

  setValue(value) {
    this.dom.value = value;
  }
}

class UITabbedPanel extends UIDiv {
  constructor() {
    super();

    this.dom.className = "TabbedPanel";

    this.tabs = [];

    this.panels = [];

    this.tabsDiv = new UIDiv();

    this.tabsDiv.setClass("Tabs");

    this.panelsDiv = new UIDiv();

    this.panelsDiv.setClass("Panels");

    this.add(this.tabsDiv);

    this.add(this.panelsDiv);

    this.selected = "";
  }

  select(id) {
    let tab;

    let panel;

    const scope = this;

    // Deselect current selection
    if (this.selected && this.selected.length) {
      tab = this.tabs.find(function (item) {
        return item.dom.id === scope.selected;
      });

      panel = this.panels.find(function (item) {
        return item.dom.id === scope.selected;
      });

      if (tab) {
        tab.removeClass("selected");
      }

      if (panel) {
        panel.setDisplay("none");
      }
    }

    tab = this.tabs.find(function (item) {
      return item.dom.id === id;
    });

    panel = this.panels.find(function (item) {
      return item.dom.id === id;
    });

    if (tab) {
      tab.addClass("selected");
    }

    if (panel) {
      panel.setDisplay("");
    }

    this.selected = id;

    // Notify any viewers/editors inside the newly visible tab to recalculate size
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });

    // Scrolls to tab
    if (tab) {
      const tabOffsetRight = tab.dom.offsetLeft + tab.dom.offsetWidth;

      const containerWidth = this.tabsDiv.dom.getBoundingClientRect().width;

      if (tabOffsetRight > containerWidth) {
        this.tabsDiv.dom.scrollTo({
          left: tabOffsetRight - containerWidth,
          behavior: "smooth",
        });
      }

      if (tab.dom.offsetLeft < this.tabsDiv.dom.scrollLeft) {
        this.tabsDiv.dom.scrollTo({ left: 0, behavior: "smooth" });
      }
    }

    return this;
  }

  addTab(id, label, items, styles) {
    const tab = new UITab(label, this);

    tab.setId(id);

    this.tabs.push(tab);

    this.tabsDiv.add(tab);

    const panel = new UIDiv();

    panel.setId(id);

    styles? panel.setStyles(styles) : null;

    panel.add(items);

    panel.setDisplay("none");

    this.panels.push(panel);

    this.panelsDiv.add(panel);

    this.select(id);
  }

  removeTab(id) {
    const tabIndex = this.tabs.findIndex((item) => item.dom.id === id);
    const panelIndex = this.panels.findIndex((item) => item.dom.id === id);
    if (tabIndex === -1 || panelIndex === -1) return this;

    const tab = this.tabs[tabIndex];
    const panel = this.panels[panelIndex];
    const wasSelected = this.selected === id;

    this.tabs.splice(tabIndex, 1);
    this.panels.splice(panelIndex, 1);
    this.tabsDiv.remove(tab);
    this.panelsDiv.remove(panel);

    if (wasSelected) {
      this.selected = "";
      if (this.tabs.length > 0) {
        this.select(this.tabs[0].dom.id);
      }
    }
    return this;
  }

  reorderTabs(orderedIds) {
    const idSet = new Set(orderedIds);
    const orderedTabs = [];
    const orderedPanels = [];
    for (const id of orderedIds) {
      const ti = this.tabs.findIndex((item) => item.dom.id === id);
      const pi = this.panels.findIndex((item) => item.dom.id === id);
      if (ti !== -1 && pi !== -1) {
        orderedTabs.push(this.tabs[ti]);
        orderedPanels.push(this.panels[pi]);
      }
    }
    for (let i = 0; i < this.tabs.length; i++) {
      if (!idSet.has(this.tabs[i].dom.id)) {
        orderedTabs.push(this.tabs[i]);
        orderedPanels.push(this.panels[i]);
      }
    }
    this.tabs = orderedTabs;
    this.panels = orderedPanels;

    for (const tab of this.tabs) {
      this.tabsDiv.remove(tab);
    }
    for (const panel of this.panels) {
      this.panelsDiv.remove(panel);
    }
    for (const tab of this.tabs) {
      this.tabsDiv.add(tab);
    }
    for (const panel of this.panels) {
      this.panelsDiv.add(panel);
    }

    if (this.selected && this.tabs.some((t) => t.dom.id === this.selected)) {
      this.select(this.selected);
    }
    return this;
  }
}

class UITab extends UIText {
  constructor(text, parent) {
    super(text);

    this.dom.className = "Tab";

    this.parent = parent;

    const scope = this;

    this.dom.addEventListener("click", function () {
      scope.parent.select(scope.dom.id);
    });
  }
}

class UIListbox extends UIDiv {
  constructor() {
    super();

    this.dom.className = "Listbox";

    this.dom.tabIndex = 0;

    this.items = [];

    this.listitems = [];

    this.selectedIndex = 0;

    this.selectedValue = null;
  }

  setItems(items) {
    if (Array.isArray(items)) {
      this.items = items;
    }

    this.render();
  }

  render() {
    while (this.listitems.length) {
      const item = this.listitems[0];

      item.dom.remove();

      this.listitems.splice(0, 1);
    }

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];

      const listitem = new ListboxItem(this);

      listitem.setId(item.id || `Listbox-${i}`);

      listitem.setTextContent(item.name || item.type);

      this.add(listitem);
    }
  }

  add() {
    const items = Array.from(arguments);

    this.listitems = this.listitems.concat(items);

    UIElement.prototype.add.apply(this, items);
  }

  selectIndex(index) {
    if (index >= 0 && index < this.items.length) {
      this.setValue(this.listitems[index].getId());
    }

    this.selectedIndex = index;
  }

  getValue() {
    return this.selectedValue;
  }

  setValue(value) {
    for (let i = 0; i < this.listitems.length; i++) {
      const element = this.listitems[i];

      if (element.getId() === value) {
        element.addClass("active");
      } else {
        element.removeClass("active");
      }
    }

    this.selectedValue = value;

    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    this.dom.dispatchEvent(changeEvent);
  }
}

class ListboxItem extends UIDiv {
  constructor(parent) {
    super();

    this.dom.className = "ListboxItem";

    this.parent = parent;

    const scope = this;

    function onClick() {
      if (scope.parent) {
        scope.parent.setValue(scope.getId());
      }
    }

    this.dom.addEventListener("click", onClick);
  }
}

class UIDatePicker extends UIElement {
  constructor(date) {
    super(document.createElement("div"));

    this.dom.className = "DatePicker";

    this.dom.style.position = "relative";

    this.dom.style.display = "inline-block";

    this.value = date ? new Date(date) : new Date();

    this.includeTime = true; // Include time selection by default

    // Create input field
    this.input = document.createElement("input");

    this.input.className = "DatePicker-input";

    this.input.readOnly = true;

    // Create calendar icon
    this.icon = document.createElement("span");

    this.icon.innerHTML = "📅";

    this.icon.style.marginLeft = "5px";

    this.icon.style.cursor = "pointer";

    this.icon.style.userSelect = "none";

    // Create container for input and icon
    this.inputContainer = document.createElement("div");

    this.inputContainer.style.display = "flex";

    this.inputContainer.style.alignItems = "center";

    this.inputContainer.appendChild(this.input);

    this.inputContainer.appendChild(this.icon);

    this.dom.appendChild(this.inputContainer);

    // Create calendar popup
    this.calendarPopup = document.createElement("div");

    this.calendarPopup.className = "DatePicker-calendar";

    this.dom.appendChild(this.calendarPopup);

    this.updateDisplay();

    const scope = this;

    // Toggle calendar on input click
    this.input.addEventListener("click", function () {
      scope.toggleCalendar();
    });

    // Toggle calendar on icon click
    this.icon.addEventListener("click", function () {
      scope.toggleCalendar();
    });

    // Close calendar when clicking outside
    document.addEventListener("click", function (event) {
      if (!scope.dom.contains(event.target)) {
        scope.hideCalendar();
      }
    });

    this.renderCalendar();
  }

  toggleCalendar() {
    if (this.calendarPopup.style.display === "none") {
      this.showCalendar();
    } else {
      this.hideCalendar();
    }
  }

  showCalendar() {
    this.renderCalendar();

    this.calendarPopup.style.display = "block";
  }

  hideCalendar() {
    this.calendarPopup.style.display = "none";
  }

  renderCalendar() {
    this.calendarPopup.innerHTML = "";

    const header = document.createElement("div");

    header.style.display = "flex";

    header.style.justifyContent = "space-between";

    header.style.alignItems = "center";

    header.style.marginBottom = "10px";

    // Month/Year navigation
    const prevButton = document.createElement("button");

    prevButton.innerHTML = "‹";

    prevButton.style.border = "none";

    prevButton.style.background = "none";

    prevButton.style.cursor = "pointer";

    prevButton.style.fontSize = "18px";

    prevButton.style.padding = "0 5px";

    const nextButton = document.createElement("button");

    nextButton.innerHTML = "›";

    nextButton.style.border = "none";

    nextButton.style.background = "none";

    nextButton.style.cursor = "pointer";

    nextButton.style.fontSize = "18px";

    nextButton.style.padding = "0 5px";

    const monthYear = document.createElement("span");

    monthYear.style.fontWeight = "bold";

    monthYear.style.fontSize = "14px";

    header.appendChild(prevButton);

    header.appendChild(monthYear);

    header.appendChild(nextButton);

    this.calendarPopup.appendChild(header);

    // Calendar grid
    const calendarGrid = document.createElement("div");

    calendarGrid.style.display = "grid";

    calendarGrid.style.gridTemplateColumns = "repeat(7, 1fr)";

    calendarGrid.style.gap = "2px";

    // Day headers
    const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    days.forEach((day) => {
      const dayHeader = document.createElement("div");

      dayHeader.textContent = day;

      dayHeader.style.textAlign = "center";

      dayHeader.style.fontWeight = "bold";

      dayHeader.style.fontSize = "12px";

      dayHeader.style.padding = "5px";

      calendarGrid.appendChild(dayHeader);
    });

    this.calendarPopup.appendChild(calendarGrid);

    // Time selection (if enabled)
    if (this.includeTime) {
      const timeSection = document.createElement("div");

      timeSection.style.marginTop = "10px";

      timeSection.style.paddingTop = "10px";

      timeSection.style.borderTop = "1px solid #eee";

      const timeLabel = document.createElement("div");

      timeLabel.textContent = "Time:";

      timeLabel.style.fontSize = "12px";

      timeLabel.style.fontWeight = "bold";

      timeLabel.style.marginBottom = "5px";

      timeSection.appendChild(timeLabel);

      const timeInput = document.createElement("input");

      timeInput.type = "time";

      timeInput.value = this.formatTime(this.value);

      timeInput.style.width = "100%";

      timeInput.style.padding = "2px";

      timeInput.style.border = "1px solid #ccc";

      timeInput.style.borderRadius = "3px";

      const scope = this;

      timeInput.addEventListener("change", function () {
        const [hours, minutes] = this.value.split(":");

        scope.value.setHours(parseInt(hours), parseInt(minutes));

        scope.updateDisplay();

        // Dispatch change event
        const changeEvent = new CustomEvent("change", {
          detail: { value: scope.value },
        });

        scope.dom.dispatchEvent(changeEvent);
      });

      timeSection.appendChild(timeInput);

      this.calendarPopup.appendChild(timeSection);
    }

    // Today button
    const todayButton = document.createElement("button");

    todayButton.textContent = "Today";

    todayButton.style.marginTop = "10px";

    todayButton.style.padding = "5px 10px";

    todayButton.style.border = "1px solid #ccc";

    todayButton.style.borderRadius = "3px";

    todayButton.style.backgroundColor = "#f9f9f9";

    todayButton.style.cursor = "pointer";

    todayButton.style.width = "100%";

    todayButton.addEventListener("click", () => {
      this.setValue(new Date());

      this.hideCalendar();
    });

    this.calendarPopup.appendChild(todayButton);

    // Set up navigation
    let currentMonth = this.value.getMonth();

    let currentYear = this.value.getFullYear();

    const updateCalendar = () => {
      monthYear.textContent = new Date(
        currentYear,
        currentMonth
      ).toLocaleDateString("en-US", { month: "long", year: "numeric" });

      this.renderCalendarDays(calendarGrid, currentMonth, currentYear);
    };

    prevButton.addEventListener("click", () => {
      currentMonth--;

      if (currentMonth < 0) {
        currentMonth = 11;

        currentYear--;
      }

      updateCalendar();
    });

    nextButton.addEventListener("click", () => {
      currentMonth++;

      if (currentMonth > 11) {
        currentMonth = 0;

        currentYear++;
      }

      updateCalendar();
    });

    updateCalendar();
  }

  renderCalendarDays(grid, month, year) {
    // Clear existing days (keep headers)
    while (grid.children.length > 7) {
      grid.removeChild(grid.lastChild);
    }

    const firstDay = new Date(year, month, 1);

    const lastDay = new Date(year, month + 1, 0);

    const startDate = new Date(firstDay);

    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const scope = this;

    for (let i = 0; i < 42; i++) {
      const dayDiv = document.createElement("div");

      dayDiv.style.textAlign = "center";

      dayDiv.style.padding = "5px";

      dayDiv.style.cursor = "pointer";

      dayDiv.style.borderRadius = "3px";

      dayDiv.style.fontSize = "14px";

      const currentDate = new Date(startDate);

      currentDate.setDate(startDate.getDate() + i);

      dayDiv.textContent = currentDate.getDate();

      // Style for current month vs other months
      if (currentDate.getMonth() !== month) {
        dayDiv.style.color = "#ccc";
      } else {
        dayDiv.style.color = "#333";

        dayDiv.addEventListener("mouseenter", () => {
          dayDiv.style.backgroundColor = "#e6f3ff";
        });

        dayDiv.addEventListener("mouseleave", () => {
          dayDiv.style.backgroundColor = "";
        });
      }

      // Highlight today
      const today = new Date();

      if (currentDate.toDateString() === today.toDateString()) {
        dayDiv.style.backgroundColor = "#fff3cd";

        dayDiv.style.fontWeight = "bold";
      }

      // Highlight selected date
      if (currentDate.toDateString() === this.value.toDateString()) {
        dayDiv.style.backgroundColor = "#007bff";

        dayDiv.style.color = "white";
      }

      dayDiv.addEventListener("click", function () {
        if (currentDate.getMonth() === month) {
          scope.value.setFullYear(currentDate.getFullYear());

          scope.value.setMonth(currentDate.getMonth());

          scope.value.setDate(currentDate.getDate());

          scope.updateDisplay();

          scope.hideCalendar();

          // Dispatch change event
          const changeEvent = new CustomEvent("change", {
            detail: { value: scope.value },
          });

          scope.dom.dispatchEvent(changeEvent);
        }
      });

      grid.appendChild(dayDiv);
    }
  }

  updateDisplay() {
    if (this.includeTime) {
      this.input.value = this.formatDateTime(this.value);
    } else {
      this.input.value = this.formatDate(this.value);
    }
  }

  formatDate(date) {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  formatDateTime(date) {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  formatTime(date) {
    return date.toTimeString().substring(0, 5);
  }

  getValue() {
    return this.value;
  }

  setValue(date) {
    this.value = new Date(date);

    this.updateDisplay();

    return this;
  }

  setIncludeTime(includeTime) {
    this.includeTime = includeTime;

    this.updateDisplay();

    return this;
  }
}

class UIHeader extends UIElement {
  constructor(header) {
    super(document.createElement(header));
  }

  setValue(text) {
    this.dom.textContent = text;

    return this;
  }
}

class UIH1 extends UIHeader {
  constructor(text) {
    super("h1");

    this.setValue(text);
  }
}

class UIH2 extends UIHeader {
  constructor(text) {
    super("h2");

    this.setValue(text);
  }
}

class UIH3 extends UIHeader {
  constructor(text) {
    super("h3");

    this.setValue(text);
  }
}

class UIH4 extends UIHeader {
  constructor(text) {
    super("h4");

    this.setValue(text);
  }
}

class UIH5 extends UIHeader {
  constructor(text) {
    super("h5");

    this.setValue(text);
  }
}

class UIH6 extends UIHeader {
  constructor(text) {
    super("h6");

    this.setValue(text);
  }
}

let spinnerStyle = null;


class UISpinner extends UIElement {
  constructor(options = {}) {
    super(document.createElement('div'));

    this.dom.className = 'spinner-container';

    this._options = options;

    this.dom.innerHTML = `
      <div class="spinner-wrapper">
        <div class="spinner">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <div></div>
        </div>
        <div class="spinner-text" style="${options.text ? '' : 'display: none;'}">${options.text || ''}</div>
        <div class="spinner-percentage" style="display: none;"></div>
      </div>
    `;

    // Spinner CSS lives in drawUI/drawUI.css; ensure it is linked once.
    if (!spinnerStyle) {
      spinnerStyle = document.getElementById('drawui-spinner-css');
      if (!spinnerStyle) {
        spinnerStyle = document.createElement('link');
        spinnerStyle.id = 'drawui-spinner-css';
        spinnerStyle.rel = 'stylesheet';
        spinnerStyle.href = new URL('../drawUI.css', import.meta.url).href;
        document.head.appendChild(spinnerStyle);
      }
    }
  }

  /**
   * Show the spinner in a target container as an overlay
   * @param {string|HTMLElement} target - CSS selector or DOM element
   * @returns {UISpinner} this for chaining
   */
  show(target = 'body') {

    if (this.dom.parentNode) {
      return this;
    }

    const targetEl = typeof target === 'string' 
      ? document.querySelector(target) || document.body 
      : target;

    const isBody = targetEl === document.body;

    // Use fixed for body (viewport overlay), absolute for containers
    this.dom.style.position = isBody ? 'fixed' : 'absolute';

    this.dom.style.top = '0';

    this.dom.style.left = '0';

    this.dom.style.width = isBody ? '100vw' : '100%';

    this.dom.style.height = isBody ? '100vh' : '100%';

    this.dom.style.backgroundColor = 'var(--game-hud-background, rgba(0, 0, 0, 0.6))';

    this.dom.style.backdropFilter = 'blur(5px)';

    this.dom.style.display = 'flex';

    this.dom.style.alignItems = 'center';

    this.dom.style.justifyContent = 'center';

    this.dom.style.zIndex = '9999';

    targetEl.appendChild(this.dom);

    return this;
  }

  /**
   * Hide and remove the spinner from DOM
   * @returns {UISpinner} this for chaining
   */
  hide() {
    if (this.dom.parentNode) {
      this.dom.parentNode.removeChild(this.dom);
    }

    return this;
  }

  /**
   * Update the spinner text
   * @param {string} text - New text to display
   * @returns {UISpinner} this for chaining
   */
  updateText(text) {
    const textElement = this.dom.querySelector('.spinner-text');

    if (textElement) {
      textElement.textContent = text;

      textElement.style.display = text ? '' : 'none';
    }

    return this;
  }

  /**
   * Set the spinner text (alias for updateText)
   * @param {string} text - Text to display
   * @returns {UISpinner} this for chaining
   */
  setText(text) {
    return this.updateText(text);
  }

  /**
   * Update the percentage display
   * @param {number} percentage - Percentage value (0-100)
   * @returns {UISpinner} this for chaining
   */
  updatePercentage(percentage) {
    const percentageElement = this.dom.querySelector('.spinner-percentage');

    if (percentageElement) {
      percentageElement.textContent = `${Math.round(percentage)}%`;

      percentageElement.style.display = 'block';
    }

    return this;
  }

  /**
   * Hide the percentage display
   * @returns {UISpinner} this for chaining
   */
  hidePercentage() {
    const percentageElement = this.dom.querySelector('.spinner-percentage');

    if (percentageElement) {
      percentageElement.style.display = 'none';
    }

    return this;
  }

  /**
   * Set the spinner color
   * @param {string} color - CSS color value
   * @returns {UISpinner} this for chaining
   */
  setColor(color) {
    this.dom.style.setProperty('--spinner-color', color);

    return this;
  }

  /**
   * Set the background color of the overlay
   * @param {string} color - CSS color value
   * @returns {UISpinner} this for chaining
   */
  setBackground(color) {
    this.dom.style.backgroundColor = color;

    return this;
  }

  /**
   * Set the size of the spinner cube
   * @param {string} size - CSS size value (e.g., '60px')
   * @returns {UISpinner} this for chaining
   */
  setSize(size) {
    const spinner = this.dom.querySelector('.spinner');

    if (spinner) {
      spinner.style.width = size;

      spinner.style.height = size;
    }

    return this;
  }

  /**
   * Check if spinner is currently visible
   * @returns {boolean} true if spinner is in DOM
   */
  isVisible() {
    return this.dom.parentNode !== null;
  }
}

/**
 * Blender-style splash screen: full-screen overlay with centered image during load.
 * No blur; optional loading text below image.
 */
class UISplash extends UIElement {
  constructor(options = {}) {
    super(document.createElement('div'));
    this.dom.id = 'AECOSplashScreen';
    this._options = {
      imageUrl: options.imageUrl || '/static/ifc/splash.png',
      text: options.text != null ? options.text : 'Loading...',
    };
    this.dom.style.cssText = [
      'position:fixed;top:0;left:0;width:100vw;height:100vh;',
      'background:#1a1a1a;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'z-index:10000;',
    ].join('');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1rem;';
    const img = document.createElement('img');
    img.alt = 'AECO';
    img.src = this._options.imageUrl;
    img.style.cssText = 'max-width:90vw;max-height:70vh;object-fit:contain;';
    img.onerror = () => { img.style.display = 'none'; };
    const textEl = document.createElement('span');
    textEl.className = 'splash-text';
    textEl.textContent = this._options.text;
    textEl.style.cssText = 'color:rgba(255,255,255,0.7);font-size:0.8rem;';
    wrap.appendChild(img);
    wrap.appendChild(textEl);
    this.dom.appendChild(wrap);
    this._textEl = textEl;
  }

  show(target = document.body) {
    const el = typeof target === 'string' ? (document.querySelector(target) || document.body) : target;
    if (this.dom.parentNode) return this;
    el.appendChild(this.dom);
    return this;
  }

  hide() {
    if (this.dom.parentNode) this.dom.parentNode.removeChild(this.dom);
    return this;
  }

  setText(text) {
    if (this._textEl) this._textEl.textContent = text;
    return this;
  }
}

class UITooltip extends UIElement {
  constructor(text = '', options = {}) {
    super(document.createElement('div'));

    this._target = null;

    this._boundShow = null;

    this._boundHide = null;

    this._boundMove = null;

    this._followMouse = false;

    this.dom.className = 'Tooltip';

    if (options.theme) this.dom.classList.add(`Tooltip--${options.theme}`);

    this.dom.textContent = text;
  }

  setText(text) {
    this.dom.textContent = text;

    return this;
  }

  setTheme(theme) {
    this.dom.className = 'Tooltip';

    if (theme) this.dom.classList.add(`Tooltip--${theme}`);

    return this;
  }

  attachTo(target, options = {}) {
    const targetDom = target.dom || target;

    this._target = targetDom;

    this._followMouse = options.followMouse || false;

    this.detach();

    const computedStyle = window.getComputedStyle(targetDom);

    if (computedStyle.position === 'static') {
      targetDom.style.position = 'relative';
    }

    targetDom.appendChild(this.dom);

    this._boundShow = () => this.show();

    this._boundHide = () => this.hide();

    targetDom.addEventListener('mouseenter', this._boundShow);

    targetDom.addEventListener('mouseleave', this._boundHide);

    return this;
  }

  detach() {
    if (this._target && this._boundShow) {
      this._target.removeEventListener('mouseenter', this._boundShow);

      this._target.removeEventListener('mouseleave', this._boundHide);

      this._target.removeEventListener('mousemove', this._boundMove);
    }

    this._target = null;

    this._boundShow = null;

    this._boundHide = null;

    this._boundMove = null;

    return this;
  }

  show() {
    this.dom.classList.add('visible');

    return this;
  }

  hide() {
    this.dom.classList.remove('visible');

    return this;
  }

  destroy() {
    this.detach();

    if (this.dom.parentElement) {
      this.dom.parentElement.removeChild(this.dom);
    }
  }
}

export {
  UIElement,
  UILink,
  UIImage,
  UISVG,
  UIParagraph,
  UIH1,
  UIH2,
  UIH3,
  UIH4,
  UIH5,
  UIH6,
  UISpan,
  UIDiv,
  UIRow,
  UIColumn,
  UIPanel,
  UILabel,
  UIForm,
  UIText,
  UISmallText,
  UIInput,
  UIIcon,
  UITextArea,
  UISelect,
  UICheckbox,
  UIColor,
  UINumber,
  UIInteger,
  UIBreak,
  UIHorizontalRule,
  UIButton,
  UIProgress,
  UITabbedPanel,
  UIListbox,
  ListboxItem,
  UIDatePicker,
  UISpinner,
  UISplash,
  UITooltip,
};
