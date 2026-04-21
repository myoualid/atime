/**
 * HTML5 drag-and-drop helpers for planner slots and library chips.
 *
 * Payloads travel via a configurable MIME (defaults to
 * `application/x-health-drag` for meal planner). Drop targets advertise
 * `data-date` and `data-meal-category-id` for meals, or any custom attrs
 * for other planners (sports etc.).
 */

export const DND_MIME = 'application/x-health-drag';

/**
 * @param {HTMLElement} el
 * @param {() => object} getPayload
 * @param {{ onDragEnd?: (ctx:{event:DragEvent,payload:object,dropEffect:string}) => void|Promise<void>, mime?: string, dragClass?: string }} [opts]
 */
export function makeDraggable(el, getPayload, opts = {}) {
    const mime = opts.mime || DND_MIME;
    const dragClass = opts.dragClass || 'health-chip--dragging';
    let payloadForDrag = null;
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
        const payload = getPayload();
        payloadForDrag = payload;
        try {
            e.dataTransfer.setData(mime, JSON.stringify(payload));
            e.dataTransfer.setData('text/plain', payload.label || '');
        } catch { /* ignore */ }
        e.dataTransfer.effectAllowed = 'copyMove';
        el.classList.add(dragClass);
    });
    el.addEventListener('dragend', (event) => {
        const dropEffect = event.dataTransfer?.dropEffect || 'none';
        el.classList.remove(dragClass);
        if (payloadForDrag && opts.onDragEnd) {
            opts.onDragEnd({ event, payload: payloadForDrag, dropEffect });
        }
        payloadForDrag = null;
    });
}

/**
 * @param {HTMLElement} el slot
 * @param {(payload:object, opts:{copy:boolean}) => void} onDrop
 * @param {{ mime?: string, overClass?: string }} [opts]
 */
export function makeDropTarget(el, onDrop, opts = {}) {
    const mime = opts.mime || DND_MIME;
    const overClass = opts.overClass || 'health-slot--drag-over';
    el.addEventListener('dragover', (e) => {
        // Accept drops of our MIME (or fallback to text/plain).
        if (!Array.from(e.dataTransfer?.types || []).some((t) => t === mime || t === 'text/plain')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
        el.classList.add(overClass);
    });
    el.addEventListener('dragenter', (e) => {
        if (!Array.from(e.dataTransfer?.types || []).some((t) => t === mime)) return;
        el.classList.add(overClass);
    });
    el.addEventListener('dragleave', (e) => {
        // Only remove highlight if actually leaving the slot, not entering a child.
        if (!el.contains(e.relatedTarget)) el.classList.remove(overClass);
    });
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove(overClass);
        const raw = e.dataTransfer?.getData(mime);
        if (!raw) return;
        let payload;
        try { payload = JSON.parse(raw); } catch { return; }
        onDrop(payload, { copy: e.ctrlKey });
    });
}

/**
 * Position a small popover near a reference rect, clamped to viewport.
 */
export function positionPopover(popover, anchorRect) {
    popover.style.position = 'fixed';
    popover.style.visibility = 'hidden';
    document.body.appendChild(popover);
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchorRect.left + anchorRect.width / 2 - pw / 2;
    let top = anchorRect.bottom + 6;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > vh - 8) top = anchorRect.top - ph - 6;
    if (top < 8) top = 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.visibility = 'visible';
}

/**
 * Prompt for a numeric amount (grams or servings) near the drop point.
 * @returns {Promise<number|null>}
 */
export function promptForNumber({ label, initial, unit, anchorRect }) {
    return new Promise((resolve) => {
        const popover = document.createElement('div');
        popover.className = 'health-drop-prompt';
        popover.innerHTML = `
            <label>${label}</label>
            <input type="number" step="0.1" min="0" value="${initial}">
            <div class="health-drop-prompt-actions">
                <button type="button" data-act="cancel">Cancel</button>
                <button type="button" class="primary" data-act="ok">Add${unit ? ` (${unit})` : ''}</button>
            </div>
        `;
        const input = popover.querySelector('input');
        const close = (val) => {
            document.removeEventListener('mousedown', onOutside, true);
            document.removeEventListener('keydown', onKey, true);
            popover.remove();
            resolve(val);
        };
        const onOutside = (e) => { if (!popover.contains(e.target)) close(null); };
        const onKey = (e) => {
            if (e.key === 'Escape') close(null);
            if (e.key === 'Enter') close(Number(input.value) || 0);
        };
        popover.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
        popover.querySelector('[data-act="ok"]').addEventListener('click', () => close(Number(input.value) || 0));
        positionPopover(popover, anchorRect);
        setTimeout(() => {
            input.focus();
            input.select();
            document.addEventListener('mousedown', onOutside, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
    });
}
