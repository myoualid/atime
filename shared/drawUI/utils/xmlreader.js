export function enhanceXMLViewer(root) {
  if (!root) return;

  // Patterns for XML, IFC, IFCZIP
  const patterns = [
    { type: 'XML', regex: /\[XML:([^\]]+)\]/g, label: 'Show XML File Contents' },
    { type: 'IFC', regex: /\[IFC:([^\]]+)\]/g, label: 'Show STEP File Contents' },
    { type: 'IFCZIP', regex: /\[IFCZIP:([^\]]+)\]/g, label: 'Show IFCZIP File Contents' }
  ];

  const nodes = Array.from(root.childNodes);

  // Helper to insert button
  function insertFileButton(parent, beforeNode, filePath, type, label) {
    const btn = document.createElement('button');

    btn.textContent = `${label}: ${filePath.split('/').pop()}`;

    btn.className = `show-${type.toLowerCase()}-btn show-file-btn`;

    btn.style = 'margin:8px 0;padding:6px 16px;background:#222;color:#fff;border-radius:6px;border:none;cursor:pointer;font-size:14px;';

    btn.onclick = async () => {
      const fileContent = await fetchFileContents(filePath, type);

      console.warn("todo: handle large files appropriately");
    };

    parent.insertBefore(btn, beforeNode);
  }

  // Scan text nodes and element nodes for all patterns
  nodes.forEach(node => {
    patterns.forEach(({ type, regex, label }) => {
      if (node.nodeType === 3 && regex.test(node.textContent)) {
        let match;

        regex.lastIndex = 0;

        while ((match = regex.exec(node.textContent)) !== null) {
          const filePath = match[1];

          insertFileButton(node.parentNode, node, filePath, type, label);

          node.textContent = node.textContent.replace(match[0], '');
        }
      }

      if (node.nodeType === 1 && regex.test(node.innerHTML)) {
        let match;

        regex.lastIndex = 0;

        while ((match = regex.exec(node.innerHTML)) !== null) {
          const filePath = match[1];

          insertFileButton(node.parentNode, node, filePath, type, label);

          node.innerHTML = node.innerHTML.replace(match[0], '');
        }
      }
    });
  });

  // Recursively scan child elements (for deeply nested cases)
  root.querySelectorAll('*').forEach(el => {
    patterns.forEach(({ type, regex, label }) => {
      if (regex.test(el.innerHTML)) {
        let match;

        regex.lastIndex = 0;

        while ((match = regex.exec(el.innerHTML)) !== null) {
          const filePath = match[1];

          insertFileButton(el, el.firstChild, filePath, type, label);

          el.innerHTML = el.innerHTML.replace(match[0], '');
        }
      }
    });
  });
}

async function fetchFileContents(filePath, type) {
  try {
    const res = await fetch(filePath);

    if (!res.ok) throw new Error('Failed to fetch file');

    if (type === 'IFCZIP') {
      // For ZIP, show as base64 string (or just indicate download)
      const blob = await res.blob();

      const reader = new FileReader();

      return await new Promise((resolve) => {
        reader.onload = () => {
          resolve(reader.result);
        };

        reader.readAsDataURL(blob);
      });
    } else {
      const text = await res.text();

      return text;
    }
  } catch (e) {
    return '<!-- Unable to load file -->';
  }
}


function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}
