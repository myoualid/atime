import { enhanceQuizzes } from './quizEnhancer.js';

import { enhanceXMLViewer } from './xmlreader.js';

const CALLOUT_TYPES = [
  { key: "Tip", className: "callout-tip", icon: "lightbulb", aria: "Tip" },
  { key: "Important", className: "callout-important", icon: "priority_high", aria: "Important" },
  { key: "Warning", className: "callout-warning", icon: "warning", aria: "Warning" },
  { key: "Info", className: "callout-info", icon: "info", aria: "Info" },
  { key: "Note", className: "callout-note", icon: "description", aria: "Note" },
  { key: "Hints", className: "callout-hints", icon: "lightbulb", aria: "Hints" },
  { key: "Hint", className: "callout-hints", icon: "lightbulb", aria: "Hint" }
];

const createEl = (tag, cls, html) => { const el = document.createElement(tag);

 if (cls) el.className = cls;

 if (html) el.innerHTML = html;

 return el; };

const getOrCreateModal = (id, styles, html) => document.getElementById(id) || Object.assign(createEl('div'), { id, innerHTML: html }, styles);

const walkTextNodes = (node, fn) => node.nodeType === 3 ? fn(node) : Array.from(node.childNodes).forEach(child => walkTextNodes(child, fn));

/**
 * Extract and apply injected styles from markdown content.
 * Handles:
 * 1. Existing <style> elements - moves them to container start to ensure proper application
 * 2. Raw CSS text patterns that should be wrapped in <style> tags
 * 3. CSS within code blocks that are marked for style injection
 */
function extractAndApplyInjectedStyles(container) {
  if (!container) return;

  // 1. Handle existing <style> elements - collect and re-inject at container start
  const existingStyles = container.querySelectorAll('style');

  existingStyles.forEach(style => {
    const cssText = style.textContent || style.innerText;

    if (cssText && cssText.trim()) {
      const scopedStyle = document.createElement('style');

      scopedStyle.setAttribute('data-lesson-injected', 'true');

      scopedStyle.textContent = cssText;

      container.insertBefore(scopedStyle, container.firstChild);
    }

    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  });

  // 2. Look for raw CSS text patterns in the content
  // This handles cases where markdown renders CSS as plain text
  const processTextContent = (text) => {
    if (!text || text.length < 20) return null;
    
    // Check if text looks like CSS (has selectors and declarations)
    const hasCSSStructure = (
      (text.includes('{') && text.includes('}') && text.includes(':')) &&
      (text.includes('.') || text.includes('#') || text.includes('@media'))
    );
    
    if (!hasCSSStructure) return null;
    
    // Validate it's likely CSS by checking for common patterns
    const cssIndicators = [
      /\.[a-zA-Z_-][\w-]*\s*\{/,      // .class {
      /#[a-zA-Z_-][\w-]*\s*\{/,       // #id {
      /@media\s*\(/,                   // @media (
      /:\s*(flex|grid|block|none|absolute|relative|fixed)/,  // common CSS values
      /:\s*\d+px/,                     // pixel values
      /:\s*#[0-9a-fA-F]{3,6}/,        // hex colors
      /:\s*rgba?\(/,                   // rgb/rgba colors
      /:\s*var\(--/                    // CSS variables
    ];
    
    const matchCount = cssIndicators.filter(pattern => pattern.test(text)).length;

    if (matchCount < 2) return null;
    
    return text;
  };

  // Extract CSS from a text string - finds CSS blocks that start with comments or selectors
  const extractCSSFromText = (text) => {
    if (!text) return null;
    
    // Pattern to match CSS that starts with a comment or selector
    // This captures from the first CSS-like pattern to the end of the last closing brace
    const cssStartPattern = /(\/\*[\s\S]*?\*\/\s*)?(\.[a-zA-Z_-][\w-]*|\#[a-zA-Z_-][\w-]*|@media)\s*[\{\(]/;

    const match = text.match(cssStartPattern);
    
    if (!match) return null;
    
    // Find the start index of the CSS
    const startIdx = text.indexOf(match[0]);

    if (startIdx === -1) return null;
    
    // Extract from start to find all CSS rules
    const possibleCSS = text.slice(startIdx);
    
    // Validate it's actual CSS
    if (processTextContent(possibleCSS)) {
      return {
        css: possibleCSS,
        startIdx: startIdx,
        beforeText: text.slice(0, startIdx).trim()
      };
    }
    
    return null;
  };

  // 2a. Check for raw text nodes directly in the container (not wrapped in elements)
  const childNodes = Array.from(container.childNodes);

  const nodesToProcess = [];
  
  childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';

      const extracted = extractCSSFromText(text);

      if (extracted) {
        nodesToProcess.push({ node, extracted, type: 'text' });
      }
    }
  });
  
  // Process raw text nodes with CSS
  nodesToProcess.forEach(({ node, extracted }) => {
    const scopedStyle = document.createElement('style');

    scopedStyle.setAttribute('data-lesson-injected', 'true');

    scopedStyle.textContent = extracted.css;

    container.insertBefore(scopedStyle, container.firstChild);
    
    // Replace the text node with just the non-CSS content (if any)
    if (extracted.beforeText) {
      node.textContent = extracted.beforeText;
    } else {
      node.parentNode.removeChild(node);
    }
  });

  // 2b. Check paragraphs and code blocks for CSS content that should be injected
  const elementsToCheck = container.querySelectorAll('p, pre, code');

  const elementsToRemove = [];
  
  elementsToCheck.forEach(el => {
    const text = el.textContent || el.innerText || '';

    const cssContent = processTextContent(text);
    
    if (cssContent) {
      // Check if this element or its parent should be treated as injectable CSS
      const isCodeBlock = el.tagName === 'CODE' || el.tagName === 'PRE';

      const parentPre = el.closest('pre');
      
      // For code blocks, check if they have a css/style language indicator
      const hasStyleClass = (
        el.classList.contains('language-css') ||
        el.classList.contains('language-style') ||
        el.classList.contains('css') ||
        (parentPre && (parentPre.classList.contains('language-css') || parentPre.classList.contains('css')))
      );
      
      // For plain paragraphs with CSS-looking content, inject if it looks complete
      const trimmedCSS = cssContent.trim();

      const isPlainCSSParagraph = el.tagName === 'P' && (trimmedCSS.startsWith('/*') || trimmedCSS.startsWith('.') || trimmedCSS.startsWith('@'));
      
      if (hasStyleClass || isPlainCSSParagraph) {
        const scopedStyle = document.createElement('style');

        scopedStyle.setAttribute('data-lesson-injected', 'true');

        scopedStyle.textContent = cssContent;

        container.insertBefore(scopedStyle, container.firstChild);
        
        // Mark element for removal if it was purely CSS
        if (isPlainCSSParagraph || hasStyleClass) {
          elementsToRemove.push(isCodeBlock && parentPre ? parentPre : el);
        }
      }
    }
  });
  
  // Remove elements that were converted to style tags
  elementsToRemove.forEach(el => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // 2c. Also check innerHTML for CSS that might be mixed with other content
  // This handles cases where CSS appears after other HTML elements as raw text
  const htmlContent = container.innerHTML;

  const cssInHTMLPattern = /(\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*)?((?:\.[a-zA-Z_-][\w-]*|#[a-zA-Z_-][\w-]*|@media[^{]+)\s*\{[^}]+\}[\s\S]*?)(?=<[a-zA-Z]|$)/g;
  
  let cssMatches = [];

  let cssMatch;

  const tempDiv = document.createElement('div');

  tempDiv.innerHTML = htmlContent;
  
  // Look for text content that appears after the last element
  const allElements = Array.from(container.querySelectorAll('*'));

  if (allElements.length > 0) {
    const lastElement = allElements[allElements.length - 1];

    let nextSibling = lastElement.nextSibling;
    
    while (nextSibling) {
      if (nextSibling.nodeType === Node.TEXT_NODE) {
        const text = nextSibling.textContent || '';

        const extracted = extractCSSFromText(text);

        if (extracted && !nodesToProcess.some(p => p.node === nextSibling)) {
          const scopedStyle = document.createElement('style');

          scopedStyle.setAttribute('data-lesson-injected', 'true');

          scopedStyle.textContent = extracted.css;

          container.insertBefore(scopedStyle, container.firstChild);
          
          if (extracted.beforeText) {
            nextSibling.textContent = extracted.beforeText;
          } else if (nextSibling.parentNode) {
            nextSibling.parentNode.removeChild(nextSibling);
          }
        }
      }

      nextSibling = nextSibling?.nextSibling;
    }
  }

  // 3. Handle [STYLE]...[/STYLE] or [CSS]...[/CSS] markers that might be in the content
  const styleMarkerPatterns = [
    /\[STYLE\]([\s\S]*?)\[\/STYLE\]/gi,
    /\[CSS\]([\s\S]*?)\[\/CSS\]/gi
  ];
  
  let html = container.innerHTML;

  let hasMarkers = false;
  
  for (const styleMarkerRegex of styleMarkerPatterns) {
    if (styleMarkerRegex.test(html)) {
      hasMarkers = true;

      styleMarkerRegex.lastIndex = 0;

      let match;

      while ((match = styleMarkerRegex.exec(html)) !== null) {
        const cssContent = match[1].trim();

        if (cssContent) {
          const scopedStyle = document.createElement('style');

          scopedStyle.setAttribute('data-lesson-injected', 'true');

          scopedStyle.textContent = cssContent;

          container.insertBefore(scopedStyle, container.firstChild);
        }
      }

      // Remove the markers from HTML
      html = html.replace(styleMarkerRegex, '');
    }
  }
  
  if (hasMarkers) {
    container.innerHTML = html;
  }
}

function ensureLinksOpenExternally(root) {
  if (!root) return;

  root.querySelectorAll('a[href]').forEach(a => {
    const href = (a.getAttribute('href') || '').trim();

    if (!href || href.startsWith('#')) return;

    a.setAttribute('target', '_blank');

    const rel = (a.getAttribute('rel') || '').trim();

    const relSet = new Set(rel ? rel.split(/\s+/) : []);

    relSet.add('noopener');

    relSet.add('noreferrer');

    a.setAttribute('rel', Array.from(relSet).filter(Boolean).join(' '));
  });
}

export function enhanceContainer(container, highlightCallback = null) {
  if (!container) return;

  extractAndApplyInjectedStyles(container);

  enhanceMarkdownImages(container);

  enhanceMarkdownLinks(container);

  enhanceCallouts(container);

  enhanceIconsAndButtons(container);

  enhanceQuizzes(container);

  enhanceLearnMore(container);

  enhanceTables(container, highlightCallback);

  processLinkSyntax(container, highlightCallback);

  enhanceExplanations(container);

  enhancePrintButtons(container);

  enhanceIFCDocumentation(container);

  if (typeof window !== 'undefined' && window.hljs) window.hljs.highlightAll();

  enhanceCodeBlocks(container);

  scheduleContainerCodeMirrorRefresh(container);

  enableImageModal(container);

  enhanceXMLViewer(container);

  ensureLinksOpenExternally(container);
}


export function enhanceMarkdownImages(root) {
  if (!root) return;
  
  const imgRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;

      if (!imgRegex.test(text)) return;

      imgRegex.lastIndex = 0;
      
      const fragment = document.createDocumentFragment();

      let lastIndex = 0;

      let match;
      
      while ((match = imgRegex.exec(text))) {
        const [fullMatch, alt, src, title] = match;
        
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        
        const img = document.createElement('img');

        img.src = src;

        img.alt = alt || '';

        if (title) img.title = title;

        img.style.maxWidth = '100%';

        img.style.height = 'auto';
        
        fragment.appendChild(img);

        lastIndex = match.index + fullMatch.length;
      }
      
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      
      if (fragment.hasChildNodes()) {
        node.parentNode.replaceChild(fragment, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && !['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(node.tagName)) {
      Array.from(node.childNodes).forEach(processNode);
    }
  };
  
  processNode(root);
}


export function enhanceMarkdownLinks(root) {
  if (!root) return;
  
  const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

  const specialMarkers = /^\[(MORE|HINT|EXPECTED|TAKEAWAY|MORE_END|HINT_END|EXPECTED_END|TAKEAWAY_END|PRINT|INSERT|IFC|Icon|Button|Link)/i;
  
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;

      if (!linkRegex.test(text)) return;

      linkRegex.lastIndex = 0;
      
      const fragment = document.createDocumentFragment();

      let lastIndex = 0;

      let match;
      
      while ((match = linkRegex.exec(text))) {
        const [fullMatch, linkText, href, title] = match;
        
        if (specialMarkers.test(fullMatch)) {
          continue;
        }
        
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        
        const a = document.createElement('a');

        a.href = href;

        a.textContent = linkText;

        if (title) a.title = title;

        a.target = '_blank';

        a.rel = 'noopener noreferrer';
        
        fragment.appendChild(a);

        lastIndex = match.index + fullMatch.length;
      }
      
      if (lastIndex > 0 && lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      
      if (fragment.hasChildNodes() && lastIndex > 0) {
        node.parentNode.replaceChild(fragment, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && !['SCRIPT', 'STYLE', 'CODE', 'PRE', 'A'].includes(node.tagName)) {
      Array.from(node.childNodes).forEach(processNode);
    }
  };
  
  processNode(root);
}

export function enhancePrintButtons(root) {
  if (!root) return;

  const nodes = Array.from(root.childNodes);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.nodeType === 3 && node.textContent.includes('[PRINT]')) {
      const parts = node.textContent.split('[PRINT]');

      if (parts[0].trim()) {
        node.parentNode.insertBefore(document.createTextNode(parts[0]), node);
      }

      const btn = createPrintButton();

      node.parentNode.insertBefore(btn, node);

      if (parts[1]) {
        node.textContent = parts[1];
      } else {
        node.parentNode.removeChild(node);
      }
    } else if (node.nodeType === 1 && node.innerHTML.includes('[PRINT]')) {
      enhancePrintButtons(node);
    }
  }
}

function createPrintButton() {
  const btn = createEl('button', 'print-pdf-btn bim-button', '<span class="material-symbols-outlined">print</span> Save Cheat Sheet');

  btn.type = 'button';

  btn.title = 'Print this section as PDF';

  btn.style.margin = '10px 0 20px 0';

  btn.onclick = function(e) {
    e.preventDefault();

    const toPrint = collectPrintContent(btn);

    printContentAsPDF(toPrint, btn);
  };

  return btn;
}

function collectPrintContent(btn) {
  const parent = btn.parentNode;

  if (!parent) {
    return document.createElement('div');
  }

  const children = Array.from(parent.childNodes);

  const btnIdx = children.indexOf(btn);

  if (btnIdx === -1) {
    return document.createElement('div');
  }

  if (children.length === 1) {
    let content = [];

    let node = parent.nextSibling;

    while (node) {
      if (node.nodeType === 1 && node.querySelector && node.querySelector('.print-pdf-btn')) {
        break;
      }

      content.push(node.cloneNode(true));

      node = node.nextSibling;
    }

    const wrapper = document.createElement('div');

    content.forEach((n) => {
      if (n) {
        wrapper.appendChild(n);
      }
    });

    return wrapper;
  }

  const content = [];

  for (let i = btnIdx + 1; i < children.length; i++) {
    const node = children[i];

    if (node.nodeType === 1 && node.classList.contains('print-pdf-btn')) {
      break;
    }

    content.push(node.cloneNode(true));
  }

  if (content.length === 0 && btn.nextSibling && btn.nextSibling.nodeType === 3) {
    const text = btn.nextSibling.textContent;

    if (text && text.trim()) {
      content.push(document.createTextNode(text));
    }
  }

  const wrapper = document.createElement('div');

  content.forEach((n) => {
    if (n) {
      wrapper.appendChild(n);
    }
  });

  return wrapper;
}

function printContentAsPDF(contentNode, btn) {
  const printWindow = window.open('', '', 'width=900,height=900');

  if (!printWindow) {
    return;
  }

  let styles = '';

  const relevant = /lesson|hljs|dark|code|syntax|theme|notes/i;

  const notesCSS = '/static/styles/notes.css';

  styles += `<link rel="stylesheet" href="${notesCSS}">`;

  Array.from(document.styleSheets).forEach(sheet => {
    try {
      if (sheet.href && relevant.test(sheet.href) && !sheet.href.includes('notes.css')) {
        styles += `<link rel="stylesheet" href="${sheet.href}">`;
      } else if (sheet.ownerNode && sheet.ownerNode.tagName === 'STYLE' && relevant.test(sheet.ownerNode.innerHTML)) {
        styles += `<style>${sheet.ownerNode.innerHTML}</style>`;
      }
    } catch (e) {}
  });

  let cssVars = '';

  const lessonRoot = document.getElementById('notes') || document.body;

  const computed = window.getComputedStyle(lessonRoot);

  for (const key of computed) {
    if (key.startsWith('--')) {
      cssVars += `${key}:${computed.getPropertyValue(key)};`;
    }
  }

  if (cssVars) {
    styles += `<style>:root {${cssVars}}</style>`;
  }

  const themeClass = document.body.className;

  styles += `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      margin: 0 !important; 
      padding: 0 !important; 
      font-family: "Segoe UI", monospace, "Fira Mono" !important; 
      line-height: 1.4;
    }
    .notes { 
      margin: 0 !important; 
      padding: 20px !important; 
      font-family: "Segoe UI", monospace, "Fira Mono" !important; 
      page-break-inside: avoid;
    }
    .bim-button, .print-pdf-btn { display: none !important; }
    img { max-width: 100%; height: auto; }
    .callout { 
      page-break-inside: avoid; 
      margin: 10px 0 !important;
      padding: 10px !important;
    }
    .lesson-table { 
      page-break-inside: avoid; 
      margin: 10px 0 !important;
    }
    pre { 
      page-break-inside: avoid; 
      margin: 10px 0 !important;
    }
    h1, h2, h3, h4, h5, h6 {
      margin: 15px 0 10px 0 !important;
      page-break-after: avoid;
    }
    p, ul, ol {
      margin: 8px 0 !important;
    }
    @media print { 
      html, body { 
        width: 100% !important; 
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .notes { 
        margin: 0 !important; 
        padding: 10px !important;
      }
      .callout { margin: 5px 0 !important; }
      * { -webkit-print-color-adjust: exact !important; }
    }
  </style>`;

  const html = `<!DOCTYPE html><html><head><title>Lesson PDF</title>${styles}</head><body class="${themeClass}"><div class="notes">${contentNode.innerHTML}</div></body></html>`;

  printWindow.document.write(html);

  printWindow.document.close();

  printWindow.onload = function() {
    printWindow.focus();

    printWindow.print();

    setTimeout(() => printWindow.close(), 500);
  };
}

export function enhanceCallouts(root) {
  if (!root) return;

  root.querySelectorAll("blockquote").forEach(block => {
    const html = block.innerHTML.trim();

    const textContent = (block.querySelector("p")?.textContent || block.textContent).trim();

    let matchedType = CALLOUT_TYPES.find(({ key }) =>
      textContent.match(new RegExp(`^${key}\\b`, "i")) ||
      new RegExp(`^(<p>)?(<strong>)?(\\*\\*|\\*)?${key}(\\*\\*|\\*)?(</strong>)?:?\\s*`, "i").test(html)
    );

    if (!matchedType) {
      const prevText = block.previousElementSibling?.textContent.trim();

      matchedType = CALLOUT_TYPES.find(({ key }) => prevText?.match(new RegExp(`^\\**${key}\\**$`, "i")));

      if (matchedType) matchedType = { ...matchedType, fromPrecedingElement: true };
    }

    if (matchedType) {
      
      const keyRegex = new RegExp(`^(<p>)?(<strong>)?(\\*\\*|\\*)?${matchedType.key}(\\*\\*|\\*)?(</strong>)?:?\\s*`, "i");

      let customTitle = "";

      let content = html.replace(keyRegex, function(match) {

        const afterKey = html.slice(match.length).trim();

        let firstPart = afterKey.split(/[:.\n]/)[0].trim();

        if (firstPart.length > 0) {

          const tempDiv = document.createElement('div');

          tempDiv.innerHTML = firstPart;

          customTitle = tempDiv.textContent || tempDiv.innerText || '';
        }

        return "";
      }).trim();

      if (customTitle) {

        content = content.replace(new RegExp(`^${customTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:.\n]?\\s*`), "");
      }
      

      content = content.replace(/<code(\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_, attrs, inner) => {
        const escaped = String(inner)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        return '<code' + (attrs || '') + '>' + escaped + '</code>';
      });

      const wrapper = createEl("div", `callout ${matchedType.className} callout-animate`);

      Object.assign(wrapper, { role: "note", tabIndex: 0 });

      wrapper.setAttribute("aria-label", matchedType.aria);

      wrapper.innerHTML = `<div class="callout-header"><span class="material-symbols-outlined callout-icon">${matchedType.icon}</span><span class="callout-title">${matchedType.key}${customTitle ? ': ' + customTitle : ''}</span></div><div class="callout-body">${content}</div>`;

      if (matchedType.fromPrecedingElement) block.previousElementSibling?.remove();

      block.replaceWith(wrapper);
      
      requestAnimationFrame(() => {
        enhanceCodeBlocks(wrapper);

        scheduleContainerCodeMirrorRefresh(wrapper);
      });
    }
  });
}

/** Get language from code block class (e.g. "language-python" -> "python"). */
function getCodeBlockLanguage(codeEl) {
  if (!codeEl || !codeEl.classList) return null;

  for (const cls of codeEl.classList) {
    if (cls.startsWith('language-')) return cls.slice(9).toLowerCase();
  }

  return null;
}

/** Refresh all CodeMirror instances in a container (e.g. after tab becomes visible). Call this after notes are rendered to fix "click to show" layout. */
export function refreshContainerCodeMirrors(container) {
  if (!container) return;

  container.querySelectorAll('pre').forEach(pre => {
    const cm = pre._codeMirror;

    if (!cm || typeof cm.refresh !== 'function') return;

    try {
      cm.refresh();

      if (typeof cm.getScrollInfo !== 'function') return;

      const wrap = cm.getWrapperElement && cm.getWrapperElement();

      const info = cm.getScrollInfo();

      if (wrap && info && Number.isFinite(info.height) && info.height > 0) {
        wrap.style.height = Math.max(40, Math.ceil(info.height) + 2) + 'px';
      }
    } catch (e) { /* ignore */ }
  });
}

function scheduleContainerCodeMirrorRefresh(container) {
  if (!container) return;

  requestAnimationFrame(() => {
    refreshContainerCodeMirrors(container);

    setTimeout(() => refreshContainerCodeMirrors(container), 50);

    setTimeout(() => refreshContainerCodeMirrors(container), 200);
  });
}

/** Schedule a single refresh and optionally observe visibility so CodeMirror paints when the block becomes visible (e.g. after tab switch). */
function scheduleCodeMirrorRefresh(cm, wrapper) {
  if (!cm || !cm.refresh) return;

  const doRefresh = () => {
    try {
      cm.refresh();

      if (typeof cm.getScrollInfo !== 'function') return;

      const info = cm.getScrollInfo();

      const wrap = cm.getWrapperElement && cm.getWrapperElement();

      if (wrapper && wrap && info && Number.isFinite(info.height) && info.height > 0) {
        const h = Math.max(40, Math.ceil(info.height) + 2);

        wrap.style.height = h + 'px';
      }
    } catch (e) { /* ignore */ }
  };

  requestAnimationFrame(() => {
    doRefresh();

    setTimeout(doRefresh, 0);
  });

  if (typeof IntersectionObserver !== 'undefined' && wrapper) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            doRefresh();

            observer.disconnect();

            break;
          }
        }
      },
      { root: null, rootMargin: '0px', threshold: 0.01 }
    );

    observer.observe(wrapper);
  }
}

/** CodeMirror options for read-only notes blocks, aligned with lesson code editor (python). */
function getCodeBlockEditorOptions(lang, value) {
  const base = {
    value: value || '',
    readOnly: true,
    theme: 'monokai',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    cursorBlinkRate: -1
  };

  if (lang === 'python') {
    const opts = { ...base, mode: 'python' };

    if (typeof window !== 'undefined' && window.CodeMirror?.fold?.indent) {
      opts.foldGutter = true;

      opts.gutters = ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'];

      opts.foldOptions = { rangeFinder: window.CodeMirror.fold.indent };
    } else {
      opts.gutters = ['CodeMirror-linenumbers'];
    }

    return opts;
  }

  if (lang === 'json') {
    return { ...base, mode: 'application/json', gutters: ['CodeMirror-linenumbers'] };
  }

  return { ...base, mode: 'null', gutters: ['CodeMirror-linenumbers'] };
}

export function enhanceCodeBlocks(root) {
  if (!root) return;

  root.querySelectorAll("pre code").forEach(code => {
    const pre = code.closest('pre');

    if (!pre || pre.classList.contains("code-enhanced")) return;

    if (code.closest('.codeblock-cm-wrapper')) return;

    pre.classList.add("code-enhanced");
    
    const getTextForCopy = () => (pre._codeMirror ? pre._codeMirror.getValue() : (pre.querySelector('code')?.innerText ?? code.innerText ?? ''));

    const btn = createEl("button", "copy-code-btn code-absolute-btn Operator");

    Object.assign(btn, {
      type: "button",
      title: "Copy code",
      innerHTML: '<span class="material-symbols-outlined">content_copy</span>',
      onclick: async () => {
        let feedback = pre.querySelector('.copy-feedback');

        if (!feedback) {
          feedback = createEl('span', 'copy-feedback');

          Object.assign(feedback.style, {
            position: 'absolute',
            top: '10px',
            right: '54px',
            zIndex: 10,
            background: 'rgba(35,38,47,0.98)',
            color: 'var(--tesla-accent)',
            fontWeight: 600,
            fontSize: '1em',
            padding: '2px 10px',
            borderRadius: '4px',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px #0005',
            transition: 'opacity 0.2s',
            opacity: 0
          });

          pre.appendChild(feedback);
        }

        try {
          await navigator.clipboard.writeText(getTextForCopy());

          feedback.textContent = 'Copied!';
        } catch {
          feedback.textContent = 'Copy failed';
        }

        feedback.style.opacity = 1;

        setTimeout(() => {
          feedback.style.opacity = 0;
        }, 1200);
      }
    });

    pre.appendChild(btn);


    let hasInsertMarker = false;

    let sibling = pre.nextSibling;

    let markerNode = null;

    let tries = 0;

    while (sibling && tries < 2 && !hasInsertMarker) {
      if (sibling.nodeType === 3) {
        hasInsertMarker = sibling.textContent.includes('[INSERT]');

        if (hasInsertMarker) markerNode = sibling;

        if (sibling.textContent.match(/```/)) {
          sibling.textContent = sibling.textContent.replace(/```/g, '').replace(/\s+$/, '');
        }

        if (!hasInsertMarker && sibling.textContent.trim() === "") {
          sibling = sibling.nextSibling;

          tries++;

          continue;
        }
      } else if (sibling.nodeType === 1) {
        hasInsertMarker = sibling.textContent.includes('[INSERT]');

        if (hasInsertMarker) markerNode = sibling;

        if (!hasInsertMarker && sibling.textContent.trim() === "") {
          sibling = sibling.nextSibling;

          tries++;

          continue;
        }
      }

      break;
    }

    // 2. If not found, check if the code block itself ends with [INSERT] (for markdown renderers that put it inside)
    if (!hasInsertMarker) {
      let codeText = code.innerText;

      hasInsertMarker = codeText.includes('[INSERT]');

      if (hasInsertMarker) {
        // Remove the [INSERT] and any trailing ``` from the code block display
        codeText = codeText.replace(/\[INSERT\]/g, "").replace(/```+\s*$/, '').trimEnd();

        code.innerText = codeText;
      }
    }

    if (hasInsertMarker) {
      const insertBtn = createEl("button", "insert-code-btn code-absolute-btn Operator");

      insertBtn.type = "button";

      insertBtn.title = "Insert code at cursor position";

      insertBtn.innerHTML = '<span class="material-symbols-outlined">splitscreen_add</span>';

      pre.appendChild(insertBtn);

      pre.classList.add("code-insertable");

      // Remove the marker node from the DOM if found
      if (markerNode) {
        if (markerNode.nodeType === 3 && markerNode.parentNode) {
          // Remove only the marker text, not the whole node if it contains other text
          if (markerNode.textContent.trim() === '[INSERT]') {
            markerNode.parentNode.removeChild(markerNode);
          } else {
            markerNode.textContent = markerNode.textContent.replace(/\[INSERT\]/g, "");
          }
        } else if (markerNode.parentNode) {
          markerNode.parentNode.removeChild(markerNode);
        }
      }
    }

    // Apply CodeMirror styling to code blocks when available (same as lesson code editor for python)
    const lang = getCodeBlockLanguage(code);

    if (typeof window !== 'undefined' && window.CodeMirror && lang !== null) {
      if (lang === 'output') {
        pre.classList.add('codeblock-output');
        // Keep hljs/static styling for output; no CodeMirror
      } else {
        const codeText = (code.textContent ?? code.innerText ?? '').trimEnd();

        const wrapper = document.createElement('div');

        wrapper.className = 'codeblock-cm-wrapper';

        wrapper.setAttribute('aria-label', `Code block: ${lang}`);

        let cm = null;

        try {
          const options = getCodeBlockEditorOptions(lang, codeText);

          cm = window.CodeMirror(wrapper, options);
        } catch (err) {
          wrapper.appendChild(document.createTextNode(codeText));

          wrapper.classList.add('codeblock-cm-fallback');
        }

        code.parentNode.insertBefore(wrapper, code);

        code.remove();

        if (cm) {
          pre._codeMirror = cm;

          scheduleCodeMirrorRefresh(cm, wrapper);
        }
      }
    }
  });
}


export function enableImageModal(root) {
  if (!root) return;

  let modal = getOrCreateModal("lesson-image-modal", {
    style: "display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(10,20,40,0.92);z-index:9999;justify-content:center;align-items:center;cursor:zoom-out;transition:opacity 0.25s;opacity:0"
  }, '<figure class="image-modal-figure"><img class="image-modal-img" /><figcaption class="image-modal-caption"></figcaption></figure>');
  
  if (!modal.hasEventListener) {
    modal.hasEventListener = true;

    const closeModal = () => { modal.style.opacity = "0";

 setTimeout(() => modal.style.display = "none", 250); };

    modal.onclick = closeModal;

    document.addEventListener("keydown", e => modal.style.display === "flex" && (e.key === "Escape" || e.key === "Esc") && closeModal());

    document.body.appendChild(modal);
  }
  
  root.querySelectorAll("img").forEach(img => {
    Object.assign(img.style, { cursor: "zoom-in" });

    Object.assign(img, { tabIndex: 0, role: "button" });

    img.setAttribute("aria-label", "Expand image");

    const showModal = () => {
      modal.querySelector(".image-modal-img").src = img.src;

      modal.querySelector(".image-modal-caption").textContent = img.alt || "";

      modal.style.display = "flex";

      setTimeout(() => modal.style.opacity = "1", 10);
    };

    img.onclick = showModal;

    img.onkeydown = e => (e.key === "Enter" || e.key === " ") && showModal();
  });
}

export function enhanceExplanations(root) {
  if (!root) return;

  let tooltip = getOrCreateModal("explanation-tooltip", {
    style: "position:absolute;background:rgb(0,0,0);color:var(--text-color,#ffffff);padding:8px 12px;border-radius:4px;font-size:15px;line-height:1.4;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:1px solid var(--tesla-accent,#3be8b0);z-index:10000;display:none;pointer-events:none"
  });

  if (!tooltip.parentNode) document.body.appendChild(tooltip);
  
  const processTextNode = node => {
    if (node.nodeType !== 3) return;

    const explainRegex = /(\S+)\[Explain:\s*([^\]]+)\]/g;

    if (!explainRegex.test(node.textContent)) return;

    explainRegex.lastIndex = 0;

    const fragment = document.createDocumentFragment();

    let lastIndex = 0, match;

    while ((match = explainRegex.exec(node.textContent))) {
      const [fullMatch, word, explanation] = match;

      if (match.index > lastIndex) fragment.appendChild(document.createTextNode(node.textContent.slice(lastIndex, match.index)));

      const span = createEl("span", "explanation-term", word);

      Object.assign(span, { tabIndex: 0, role: "button" });

      span.setAttribute("aria-label", `Explanation available: ${explanation.trim()}`);

      const showTooltip = (e) => {
        e.preventDefault();

        e.stopPropagation();

        const rect = span.getBoundingClientRect();

        tooltip.textContent = explanation.trim();

        Object.assign(tooltip.style, {
          display: "block",
          left: Math.max(10, Math.min(window.innerWidth - 410, rect.left + rect.width / 2 - 200)) + "px",
          top: (rect.bottom + 8 > window.innerHeight ? rect.top - 40 : rect.bottom + 8) + "px"
        });
      };

      span.addEventListener('focus', showTooltip);

      const hideTooltip = () => tooltip.style.display = "none";

      ["mouseenter", "focus"].forEach(e => span.addEventListener(e, showTooltip));

      ["mouseleave", "blur"].forEach(e => span.addEventListener(e, hideTooltip));

      span.onkeydown = e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), showTooltip(), setTimeout(hideTooltip, 3000));

      fragment.appendChild(span);

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < node.textContent.length) fragment.appendChild(document.createTextNode(node.textContent.slice(lastIndex)));

    node.parentNode.replaceChild(fragment, node);
  };

  walkTextNodes(root, processTextNode);
}

export function enhanceLearnMore(root) {
  if (!root) return;

  // New logic for handling [MORE_END], [HINT:text], and [EXPECTED:text] sections
  const isMore = el => el.textContent.trim().match(/^\[MORE(?::([^\]]+))?\]$/);

  const isMoreEnd = el => el.textContent.trim().match(/^\[MORE_END\]$/);

  const isHint = el => el.textContent.trim().match(/^\[HINT:([^\]]+)\]$/);

  const isHintEnd = el => el.textContent.trim().match(/^\[HINT_END\]$/);

  const isExpected = el => el.textContent.trim().match(/^\[EXPECTED:([^\]]+)\]$/);

  const isExpectedEnd = el => el.textContent.trim().match(/^\[EXPECTED_END\]$/);

  const children = Array.from(root.children);

  let i = 0;

  while (i < children.length) {
    const el = children[i];

    // --- Learn More Section ---
    const moreMatch = isMore(el);

    if (moreMatch && !el.classList.contains("learn-more-enhanced")) {
      el.classList.add("learn-more-enhanced");

      const sectionName = moreMatch[1];

      const hiddenNodes = [];

      const nodesToRemove = []; // Track actual nodes to remove

      let j = i + 1;

      let foundEnd = false;

      while (j < children.length && !isMore(children[j]) && !isMoreEnd(children[j])) {
        const node = children[j];

        if (node.nodeType === 1 && node.innerHTML && node.innerHTML.includes('[MORE_END]')) {
          // Split node at marker
          const idx = node.innerHTML.indexOf('[MORE_END]');

          const before = node.innerHTML.slice(0, idx);

          if (before.trim()) {
            const clone = node.cloneNode(false);

            clone.innerHTML = before;

            hiddenNodes.push(clone);
          }

          // Remove marker from DOM and check if element should be removed entirely
          node.innerHTML = node.innerHTML.replace('[MORE_END]', '');

          if (!node.innerHTML.trim()) {
            nodesToRemove.push(node);
          }

          foundEnd = true;

          break;
        } else if (node.nodeType === 3 && node.textContent.includes('[MORE_END]')) {
          // Split text node at marker
          const idx = node.textContent.indexOf('[MORE_END]');

          const before = node.textContent.slice(0, idx);

          if (before.trim()) {
            hiddenNodes.push(document.createTextNode(before));
          }

          // Remove marker from DOM and check if text node should be removed entirely
          node.textContent = node.textContent.replace('[MORE_END]', '');

          if (!node.textContent.trim()) {
            nodesToRemove.push(node);
          }

          foundEnd = true;

          break;
        } else {
          hiddenNodes.push(node.cloneNode(true));

          nodesToRemove.push(node); // Track for removal
        }

        j++;
      }

      // Remove the [MORE_END] marker node if present and not already handled
      if (!foundEnd && j < children.length && isMoreEnd(children[j])) {
        children[j].remove();

        j++;
      }

      const wrapper = createEl("div", "learn-more-wrapper");

      const btn = createEl("button", "learn-more-btn");

      const hidden = createEl("div", "learn-more-hidden");

      const expandText = sectionName ? `Learn more about ${sectionName}` : "Learn more";

      Object.assign(btn, { type: "button", innerHTML: `<span class="material-symbols-outlined">expand_more</span> ${expandText}` });

      Object.assign(hidden.style, { display: "none" });

      hiddenNodes.forEach(node => hidden.appendChild(node));

      btn.onclick = () => {
        const isOpen = hidden.style.display === "block";

        hidden.style.display = isOpen ? "none" : "block";

        btn.innerHTML = isOpen ? `<span class="material-symbols-outlined">expand_more</span> ${expandText}` : '<span class="material-symbols-outlined">expand_less</span> Hide';
      };

      wrapper.append(btn, hidden);

      el.replaceWith(wrapper);

      // Remove all nodes that were included in the section from the DOM
      nodesToRemove.forEach(node => {
        if (node && node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });

      i = j;

      continue;
    }

    // --- Hint Section ---
    const hintMatch = isHint(el);

    if (hintMatch && !el.classList.contains("hint-enhanced")) {
      el.classList.add("hint-enhanced");

      const hintText = hintMatch[1];

      const hiddenNodes = [];

      const nodesToRemove = []; // Track actual nodes to remove

      let j = i + 1;

      let foundEnd = false;
      
      while (j < children.length && !isHintEnd(children[j])) {
        const node = children[j];
        
        if (node.nodeType === 1 && node.innerHTML && node.innerHTML.includes('[HINT_END]')) {
          // Split node at marker
          const idx = node.innerHTML.indexOf('[HINT_END]');

          const before = node.innerHTML.slice(0, idx);

          const after = node.innerHTML.slice(idx + '[HINT_END]'.length);

          if (before.trim()) {
            const clone = node.cloneNode(false);

            clone.innerHTML = before;

            hiddenNodes.push(clone);
          }

          // Replace the entire content with just the "after" part (removing both content and marker)
          node.innerHTML = after;

          if (!node.innerHTML.trim()) {
            nodesToRemove.push(node);
          }

          foundEnd = true;

          break;
        } else if (node.nodeType === 3 && node.textContent.includes('[HINT_END]')) {
          // Split text node at marker
          const idx = node.textContent.indexOf('[HINT_END]');

          const before = node.textContent.slice(0, idx);

          if (before.trim()) {
            hiddenNodes.push(document.createTextNode(before));
          }

          // Remove marker from DOM and check if text node should be removed entirely
          node.textContent = node.textContent.replace('[HINT_END]', '');

          if (!node.textContent.trim()) {
            nodesToRemove.push(node);
          }

          foundEnd = true;

          break;
        } else {
          hiddenNodes.push(node.cloneNode(true));

          nodesToRemove.push(node); // Track for removal
        }

        j++;
      }
      
      // Remove the [HINT_END] marker node if present and not already handled
      if (!foundEnd && j < children.length && isHintEnd(children[j])) {
        children[j].remove();

        j++;
      }
      
      const wrapper = createEl("div", "hint-wrapper");

      const btn = createEl("button", "hint-btn");

      const hidden = createEl("div", "hint-hidden");
      
      // Create the button with the title always visible
      btn.type = "button";

      btn.innerHTML = `
        <span class="material-symbols-outlined">lightbulb</span>
        <span class="hint-text">${hintText ? hintText : 'More information'}</span>
      `;
      
      Object.assign(hidden.style, { display: "none" });

      hiddenNodes.forEach(node => hidden.appendChild(node));
      
      btn.onclick = () => {
        const isOpen = hidden.style.display === "block";

        if (!isOpen) {
          // Opening the hint
          hidden.style.display = "block";

          wrapper.classList.add('revealed');

          btn.innerHTML = `
            <span class="material-symbols-outlined">expand_less</span>
            <span class="hint-text">Hide</span>
          `;
        } else {
          // Closing the hint
          hidden.style.display = "none";

          wrapper.classList.remove('revealed');

          btn.innerHTML = `
            <span class="material-symbols-outlined">lightbulb</span>
            <span class="hint-text">${hintText ? hintText : 'More information'}</span>
          `;
        }
      };
      
      wrapper.append(btn, hidden);

      el.replaceWith(wrapper);
      
      // Remove all nodes that were included in the hint from the DOM
      nodesToRemove.forEach((node, idx) => {
        if (node && node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
      
      i = j;

      continue;
    }

    // --- Expected Section ---
    const expectedMatch = isExpected(el);

    if (expectedMatch && !el.classList.contains("expected-enhanced")) {
      el.classList.add("expected-enhanced");

      const expectedText = expectedMatch[1];

      const hiddenNodes = [];

      const nodesToRemove = []; // Track actual nodes to remove

      let j = i + 1;

      let foundEnd = false;
      
      while (j < children.length && !isExpectedEnd(children[j])) {
        const node = children[j];
        
        if (node.nodeType === 1 && node.innerHTML && node.innerHTML.includes('[EXPECTED_END]')) {
          // Split node at marker
          const idx = node.innerHTML.indexOf('[EXPECTED_END]');

          const before = node.innerHTML.slice(0, idx);

          const after = node.innerHTML.slice(idx + '[EXPECTED_END]'.length);

          if (before.trim()) {
            const clone = node.cloneNode(false);

            clone.innerHTML = before;

            hiddenNodes.push(clone);
          }

          // Replace the entire content with just the "after" part (removing both content and marker)
          node.innerHTML = after;

          if (!node.innerHTML.trim()) {
            nodesToRemove.push(node);
          }

          foundEnd = true;

          break;
        } else if (node.nodeType === 3 && node.textContent.includes('[EXPECTED_END]')) {
          // Split text node at marker
          const idx = node.textContent.indexOf('[EXPECTED_END]');

          const before = node.textContent.slice(0, idx);

          if (before.trim()) {
            hiddenNodes.push(document.createTextNode(before));
          }

          // Remove marker from DOM and check if text node should be removed entirely
          node.textContent = node.textContent.replace('[EXPECTED_END]', '');

          if (!node.textContent.trim()) {
            nodesToRemove.push(node);
          }

          foundEnd = true;

          break;
        } else {
          hiddenNodes.push(node.cloneNode(true));

          nodesToRemove.push(node); // Track for removal
        }

        j++;
      }
      
      // Remove the [EXPECTED_END] marker node if present and not already handled
      if (!foundEnd && j < children.length && isExpectedEnd(children[j])) {
        children[j].remove();

        j++;
      }
      
      const wrapper = createEl("div", "expected-wrapper");

      const btn = createEl("button", "expected-btn");

      const hidden = createEl("div", "expected-hidden");
      
      // Create the button with the title always visible
      btn.type = "button";

      btn.innerHTML = `
        <span class="material-symbols-outlined">target</span>
        <span class="expected-text">${expectedText ? expectedText : 'Expected outcome'}</span>
      `;
      
      Object.assign(hidden.style, { display: "none" });

      hiddenNodes.forEach(node => hidden.appendChild(node));
      
      btn.onclick = () => {
        const isOpen = hidden.style.display === "block";

        if (!isOpen) {
          // Opening the expected section
          hidden.style.display = "block";

          wrapper.classList.add('revealed');

          btn.innerHTML = `
            <span class="material-symbols-outlined">expand_less</span>
            <span class="expected-text">Hide</span>
          `;
        } else {
          // Closing the expected section
          hidden.style.display = "none";

          wrapper.classList.remove('revealed');

          btn.innerHTML = `
            <span class="material-symbols-outlined">target</span>
            <span class="expected-text">${expectedText ? expectedText : 'Expected outcome'}</span>
          `;
        }
      };
      
      wrapper.append(btn, hidden);

      el.replaceWith(wrapper);
      
      // Remove all nodes that were included in the expected section from the DOM
      nodesToRemove.forEach((node, idx) => {
        if (node && node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
      
      i = j;

      continue;
    }

    i++;
  }
}

export function enhanceIFCDocumentation(root) {
  if (!root) return;
  
  // Process text nodes to find [IFC]....[/IFC] patterns
  const processTextNode = node => {
    if (node.nodeType !== 3) return;

    const ifcRegex = /\[IFC\]([^[\]]+)\[\/IFC\]/g;

    if (!ifcRegex.test(node.textContent)) return;
    
    ifcRegex.lastIndex = 0;

    const fragment = document.createDocumentFragment();

    let lastIndex = 0;

    let match;
    
    while ((match = ifcRegex.exec(node.textContent))) {
      const [fullMatch, ifcClass] = match;
      
      // Add text before the match
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(node.textContent.slice(lastIndex, match.index)));
      }
      
      // Create IFC documentation link
      const ifcLink = document.createElement('span');

      ifcLink.className = 'ifc-doc-link';

      ifcLink.textContent = ifcClass;

      ifcLink.title = `Click to view ${ifcClass} documentation`;
      
      // Add click handler to open IFC documentation popup
      ifcLink.addEventListener('click', () => showIFCDocumentationPopup(ifcClass));
      
      fragment.appendChild(ifcLink);

      lastIndex = match.index + fullMatch.length;
    }
    
    // Add remaining text
    if (lastIndex < node.textContent.length) {
      fragment.appendChild(document.createTextNode(node.textContent.slice(lastIndex)));
    }
    
    node.parentNode.replaceChild(fragment, node);
  };
  
  // Walk through all text nodes
  walkTextNodes(root, processTextNode);
}

function showIFCDocumentationPopup(ifcClass) {
  // Remove any existing popup
  const existingPopup = document.querySelector('.ifc-popup-overlay');

  if (existingPopup) {
    existingPopup.remove();
  }
  
  // Create overlay
  const overlay = document.createElement('div');

  overlay.className = 'ifc-popup-overlay';
  
  // Create popup container
  const popup = document.createElement('div');

  popup.className = 'ifc-popup';
  
  // Create close button
  const closeBtn = document.createElement('button');

  closeBtn.className = 'ifc-popup-close';

  closeBtn.innerHTML = '&times;';

  closeBtn.title = 'Close documentation';
  
  // Create title
  const title = document.createElement('h2');

  title.className = 'ifc-popup-title';

  title.textContent = `${ifcClass} Documentation`;

  title.style.marginBottom = '15px';

  title.style.fontSize = '1.8rem';

  title.style.fontWeight = '600';

  title.style.color = '#3bbbed';

  title.style.textAlign = 'center';

  // Create iframe container
  const iframeContainer = document.createElement('div');

  iframeContainer.className = 'ifc-iframe-container';

  iframeContainer.style.flex = '1';

  iframeContainer.style.overflow = 'hidden';

  iframeContainer.style.border = '1px solid #e0e0e0';

  iframeContainer.style.borderRadius = '8px';

  // Create iframe with IFC documentation URL
  const iframe = document.createElement('iframe');

  iframe.className = 'ifc-iframe';

  iframe.src = getIFCDocumentationURL(ifcClass);

  // iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
  iframe.title = `${ifcClass} Documentation`;

  iframe.style.width = '100%';

  iframe.style.height = '100%';

  iframe.style.border = 'none';
 
  
  iframe.onerror = () => {

    iframeContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary, #9ca3af); flex-direction: column; gap: 16px;">
        <div style="font-size: 48px;">📘</div>
        <div style="font-size: 18px; font-weight: 500;">Documentation Not Available</div>
        <div style="font-size: 14px; opacity: 0.7;">The documentation for ${ifcClass} could not be loaded.</div>
        <div style="font-size: 12px; opacity: 0.5;">You can search for it manually at <a href="https://standards.buildingsmart.org" target="_blank" style="color: #3bb9ed;">standards.buildingsmart.org</a></div>
      </div>
    `;
  };
  
  // Assemble popup
  iframeContainer.appendChild(iframe);

  popup.appendChild(closeBtn);

  popup.appendChild(title);

  popup.appendChild(iframeContainer);

  overlay.appendChild(popup);
  
  // Close handlers (lesson-fade-out is in exercises.css)
  const closePopup = () => {
    overlay.style.animation = 'lesson-fade-out 0.2s ease-in';

    setTimeout(() => overlay.remove(), 200);
  };
  
  closeBtn.addEventListener('click', closePopup);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closePopup();
    }
  });
  
  // Keyboard support
  document.addEventListener('keydown', function escapeHandler(event) {
    if (event.key === 'Escape') {
      closePopup();

      document.removeEventListener('keydown', escapeHandler);
    }
  });
  
  // Add to document
  document.body.appendChild(overlay);
}

function getIFCDocumentationURL(ifcClass) {
  const baseURL = 'https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical';

  return `${baseURL}/${ifcClass}.htm`;
}

export function enhanceIconsAndButtons(root) {
  if (!root) return;

  const processTextNode = node => {
    if (node.nodeType !== 3) return;

    const iconButtonRegex = /\[Icon:([^\]]+)\](?:\[Button:([^\]]+)\])?/g;

    if (!iconButtonRegex.test(node.textContent)) return;

    iconButtonRegex.lastIndex = 0;

    const fragment = document.createDocumentFragment();

    let lastIndex = 0, match;

    while ((match = iconButtonRegex.exec(node.textContent))) {
      const [fullMatch, iconName, buttonText] = match;

      if (match.index > lastIndex) fragment.appendChild(document.createTextNode(node.textContent.slice(lastIndex, match.index)));

      const element = buttonText ? createEl("div", "embedded-button", `<span class="material-symbols-outlined">${iconName}</span> ${buttonText}`) : createEl("span", "material-symbols-outlined", iconName);

      fragment.appendChild(element);

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < node.textContent.length) fragment.appendChild(document.createTextNode(node.textContent.slice(lastIndex)));

    node.parentNode.replaceChild(fragment, node);
  };

  walkTextNodes(root, processTextNode);
}

export function enhanceTables(root, highlightCallback = null) {
  if (!root) {
    return;
  }

  function isTable(text) {
    return Boolean(text.includes('|') && text.split('\n').length > 1);
  }
  
  root.querySelectorAll('p').forEach((p, index) => {
    const text = p.innerHTML.trim();

    if (isTable(text)) {
      const tableLines = text.split('\n').filter(line => line.trim() && line.includes('|'));

      convertMarkdownTableToHTML(p, tableLines, highlightCallback);
    }
  });

}

function processLinkSyntax(container, highlightCallback) {
  if (!container || container.tagName === 'TABLE' || container.closest('.lesson-table')) return;
  
  const isInsideMarkdownTable = (textNode) => {
    const paragraph = textNode.parentElement;

    if (!paragraph || paragraph.tagName !== 'P') return false;
    
    const text = paragraph.textContent;

    const lines = text.split('\n').filter(line => line.trim());

    const tableLines = lines.filter(line => line.includes('|'));
    
    if (tableLines.length >= 2) {
      const hasSeparator = lines.some(line => /^[\s\|\-\:]+$/.test(line) && line.includes('-'));

      if (hasSeparator) {
        return true;
      }
    }
    
    return false;
  };
  
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      if (node.parentElement?.closest('.lesson-table')) return NodeFilter.FILTER_REJECT;

      if (isInsideMarkdownTable(node)) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];

  let node;

  while (node = walker.nextNode()) /\[Link:Line:\d+(?:-\d+)?\]/.test(node.textContent) && textNodes.push(node);
  
  textNodes.forEach(textNode => {
    const linkRegex = /\[Link:Line:(\d+)(?:-(\d+))?\]/g;

    if (!linkRegex.test(textNode.textContent)) return;

    linkRegex.lastIndex = 0;

    const fragment = document.createDocumentFragment();

    let lastIndex = 0, match;

    while ((match = linkRegex.exec(textNode.textContent))) {
      const [fullMatch, start, end] = match;

      if (match.index > lastIndex) fragment.appendChild(document.createTextNode(textNode.textContent.slice(lastIndex, match.index)));

      const button = createEl("button", "highlight-lines-btn embedded-button");

      button.dataset.lines = `${start}-${end || start}`;

      button.id = `highlight-btn-${start}-${end || start}`;

      button.innerHTML = `<span class="material-symbols-outlined">link</span>${end ? `Lines ${start}-${end}` : `Line ${start}`}`;

      button.onclick = e => {
        e.preventDefault();

        e.stopPropagation();

        const [lineStart, lineEnd] = button.dataset.lines.split('-').map(Number);

        (highlightCallback || window.editor?.highlightLines || window.editorInstance?.highlightLines)?.(lineStart, lineEnd);
      };

      fragment.appendChild(button);

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < textNode.textContent.length) fragment.appendChild(document.createTextNode(textNode.textContent.slice(lastIndex)));

    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

function processTableLinkSyntax(table, highlightCallback) {
  if (!table) {
    return;
  }

  table.querySelectorAll('td, th').forEach((cell, index) => {
    processCellLinkSyntax(cell, index);
  });

  attachHighlightEvents(table, highlightCallback);
}

function processCellLinkSyntax(cell, index) {
  const linkRegex = /\[Link:Line:(\d+)(?:-(\d+))?\]/g;

  if (!linkRegex.test(cell.innerHTML)) {
    return;
  }

  cell.innerHTML = cell.innerHTML.replace(linkRegex, (fullMatch, start, end) => {
    return createHighlightButtonHTML(start, end);
  });
}

function createHighlightButtonHTML(start, end) {
  const buttonId = `highlight-btn-${start}-${end || start}`;

  const buttonText = end ? `Lines ${start}-${end}` : `Line ${start}`;

  return `<button class="highlight-lines-btn embedded-button" data-lines="${start}-${end || start}" id="${buttonId}">
            <span class="material-symbols-outlined">link</span>${buttonText}
          </button>`;
}

function attachHighlightEvents(table, highlightCallback) {
  table.querySelectorAll('.highlight-lines-btn').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();

      e.stopPropagation();

      const [lineStart, lineEnd] = btn.dataset.lines.split('-').map(Number);

      (highlightCallback || window.editor?.highlightLines || window.editorInstance?.highlightLines)?.(lineStart, lineEnd);
    };
  });
  

}

function convertMarkdownTableToHTML(element, lines, highlightCallback = null) {
  const actualTableLines = extractActualTableLines(lines);

  if (actualTableLines.length < 2) {
    return;
  }

  const hasHeaders = detectTableHeaders(actualTableLines);

  const headers = extractTableHeaders(actualTableLines, hasHeaders);

  const table = createEl('table', 'lesson-table');

  if (hasHeaders) {
    table.appendChild(buildTableHead(headers));
  }

  const dataLines = actualTableLines.slice(hasHeaders ? 2 : 0);

  table.appendChild(buildTableBody(dataLines, headers.length));

  element.replaceWith(table);

  processTableLinkSyntax(table, highlightCallback);
}

function extractActualTableLines(lines) {
  let actualTableLines = [];

  let buffer = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimEnd();

    if (/^\|\s*$/.test(line) || !line.trim()) continue;

    if (buffer) buffer += ' ' + line.trim();
    else buffer = line.trim();

    if (/^\|/.test(buffer) && /\|$/.test(buffer)) {
      actualTableLines.push(buffer);

      buffer = '';
    }
  }

  if (buffer && /^\|/.test(buffer) && /\|$/.test(buffer)) actualTableLines.push(buffer);

  return actualTableLines.filter(l => l.replace(/\|/g, '').trim().length > 0);
}

function detectTableHeaders(actualTableLines) {
  return actualTableLines.length >= 2 && /^[\s\|\-\:]+$/.test(actualTableLines[1]) && actualTableLines[1].includes('-');
}

function extractTableHeaders(actualTableLines, hasHeaders) {
  if (hasHeaders) {
    return actualTableLines[0]
      .split('|')
      .map(h => h.trim())
      .filter((h, i, arr) => i !== 0 && i !== arr.length - 1);
  } else {
    return Array(actualTableLines[0].split('|').length - 2).fill('');
  }
}

function buildTableHead(headers) {
  const thead = createEl('thead');

  const headerRow = createEl('tr');

  headers.forEach(header => {
    headerRow.appendChild(createEl('th', '', header));
  });

  thead.appendChild(headerRow);

  return thead;
}

function buildTableBody(dataLines, columnCount) {
  const tbody = createEl('tbody');

  dataLines.forEach(line => {
    let cells = line.split('|');

    if (cells.length && cells[0].trim() === '') cells.shift();

    if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();

    while (cells.length < columnCount) cells.push('');

    const row = createEl('tr');

    
    cells.forEach(cellContent => {
      row.appendChild(createEl('td', '', cellContent));
    });

    tbody.appendChild(row);
  });

  return tbody;
}