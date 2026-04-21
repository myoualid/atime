import { DrawUI } from '../../../shared/drawUI/index.js';
import * as repos from '../store/repos.js';
import { shoppingRollup } from '../nutrition/calc.js';
import { toIsoDate, addDays, startOfWeek, formatWeekRange } from '../dates.js';
import { STRINGS } from '../strings.js';

const gFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/**
 * Open a shopping-list panel for the currently visible date range.
 * @param {{ fromDate:Date, toDate:Date, foodItemsById:Record<string,any>, recipesById:Record<string,any> }} opts
 */
export async function openShoppingList({ fromDate, toDate, foodItemsById, recipesById }) {
    const from = toIsoDate(fromDate);
    const to = toIsoDate(toDate);

    const host = document.createElement('div');
    host.className = 'health-shopping-list';
    host.innerHTML = `
        <div style="display:flex; gap:0.4rem; align-items:center;">
            <strong style="color:var(--health-accent);">${formatWeekRange(fromDate, toDate)}</strong>
            <button type="button" data-act="copy" style="margin-left:auto;">Copy text</button>
            <button type="button" data-act="print">${STRINGS.print}</button>
            <button type="button" data-act="export">Export JSON</button>
        </div>
        <div data-items></div>
    `;

    const entries = await repos.plan.listByRange(from, to);
    const rollup = shoppingRollup(entries, recipesById);
    const existingChecks = await repos.shoppingChecks.getByRange(from, to);
    const checkedSet = new Set(existingChecks.map((c) => c.foodItemId));

    const itemsHost = host.querySelector('[data-items]');
    if (rollup.length === 0) {
        const empty = document.createElement('div');
        empty.style.color = 'var(--health-text-dim)';
        empty.style.fontSize = '0.85rem';
        empty.style.textAlign = 'center';
        empty.style.padding = '0.75rem';
        empty.textContent = 'No planned meals in this range.';
        itemsHost.appendChild(empty);
    } else {
        for (const item of rollup) {
            const food = foodItemsById[item.foodItemId];
            const row = document.createElement('label');
            row.className = 'health-shopping-item';
            if (checkedSet.has(item.foodItemId)) row.classList.add('is-checked');
            row.innerHTML = `
                <input type="checkbox">
                <span class="health-shopping-item-name"></span>
                <span class="health-shopping-item-qty"></span>
            `;
            row.querySelector('.health-shopping-item-name').textContent = food?.name || '(missing)';
            row.querySelector('.health-shopping-item-qty').textContent = `${gFmt.format(item.totalAmountG)} g`;
            const cb = row.querySelector('input');
            cb.checked = checkedSet.has(item.foodItemId);
            cb.addEventListener('change', async () => {
                row.classList.toggle('is-checked', cb.checked);
                await repos.shoppingChecks.setCheck({ from, to, foodItemId: item.foodItemId }, cb.checked);
            });
            itemsHost.appendChild(row);
        }
    }

    host.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        const lines = rollup.map((item) => {
            const food = foodItemsById[item.foodItemId];
            return `${gFmt.format(item.totalAmountG)} g  ${food?.name || '(missing)'}`;
        });
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            DrawUI.toast('Copied to clipboard', 'success').showIn(document.body);
        } catch {
            DrawUI.toast('Clipboard unavailable', 'error').showIn(document.body);
        }
    });
    host.querySelector('[data-act="export"]').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({ from, to, items: rollup }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shopping-${from}-to-${to}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    host.querySelector('[data-act="print"]').addEventListener('click', () => {
        const printWindow = window.open('', '_blank', 'noopener,noreferrer');
        if (!printWindow) {
            DrawUI.toast('Pop-up blocked: unable to open print view', 'error').showIn(document.body);
            return;
        }
        const rows = rollup.map((item) => {
            const food = foodItemsById[item.foodItemId];
            return {
                name: food?.name || '(missing)',
                amountG: item.totalAmountG,
                checked: checkedSet.has(item.foodItemId),
            };
        });
        printWindow.document.open();
        printWindow.document.write(renderPrintableHtml({ fromDate, toDate, rows }));
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 0);
    });

    const panel = DrawUI.floatingPanel({ title: STRINGS.shoppingList, closable: true });
    panel.content.appendChild(host);
    panel.show(document.body);

    // Provide a way to also use startOfWeek, addDays from consumers.
    void startOfWeek; void addDays;
}

function renderPrintableHtml({ fromDate, toDate, rows }) {
        const title = `Shopping list - ${formatWeekRange(fromDate, toDate)}`;
        const rowHtml = rows.length
                ? rows.map((r) => `<tr><td>${r.checked ? '&#10003;' : ''}</td><td>${escapeHtml(r.name)}</td><td>${gFmt.format(r.amountG)} g</td></tr>`).join('')
                : '<tr><td></td><td>No planned meals in this range.</td><td></td></tr>';
        return `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
        body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111; }
        h1 { margin: 0 0 6px; font-size: 20px; }
        p { margin: 0 0 16px; color: #444; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
        th:last-child, td:last-child { text-align: right; width: 110px; }
        th:first-child, td:first-child { width: 34px; text-align: center; }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <p>Printed ${escapeHtml(new Date().toLocaleString())}</p>
    <table>
        <thead>
            <tr><th>Done</th><th>Item</th><th>Amount</th></tr>
        </thead>
        <tbody>
            ${rowHtml}
        </tbody>
    </table>
</body>
</html>`;
}

function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
