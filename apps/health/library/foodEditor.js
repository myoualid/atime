import { DrawUI } from '../../../shared/drawUI/index.js';
import * as repos from '../store/repos.js';
import { STRINGS } from '../strings.js';

/**
 * Open a food item editor in a FloatingPanel.
 * @param {{ item?:any, categories:Array, onSaved?:Function }} opts
 */
export function openFoodEditor({ item, categories, onSaved }) {
    const editing = !!item;
    const data = {
        id: item?.id,
        name: item?.name || '',
        categoryId: item?.categoryId || '',
        defaultServingG: item?.defaultServingG ?? 100,
        densityGPerMl: item?.densityGPerMl ?? '',
        notes: item?.notes || '',
        tags: (item?.tags || []).join(', '),
        // Display per-100 g; stored per-gram.
        per100: scalePer100FromPerGram(item?.nutritionPerGram),
        source: item?.source || null,
        aliases: item?.aliases || [],
        imageBlobKey: item?.imageBlobKey || null,
        details: item?.details || null,
    };

    const form = document.createElement('form');
    form.className = 'health-editor-form';
    form.innerHTML = `
        ${renderSourceHeader(data.source)}
        ${renderDetailsSection(data.details)}
        <label>${STRINGS.name} <input name="name" required></label>
        <label>${STRINGS.category}
            <select name="categoryId">
                <option value="">—</option>
                ${categories.filter((c) => c.kind === 'food').map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
            </select>
        </label>
        <div class="health-editor-grid2">
            <label>${STRINGS.servingG} <input name="defaultServingG" type="number" step="0.1" min="0"></label>
            <label>Density (g/ml) <input name="densityGPerMl" type="number" step="0.001" min="0"></label>
        </div>
        <fieldset style="border:1px solid var(--health-border); border-radius:6px; padding:0.5rem;">
            <legend style="padding:0 0.35rem; font-size:0.8rem; color:var(--health-text-dim);">${STRINGS.nutritionPer100g}</legend>
            <div class="health-editor-grid3">
                <label>${STRINGS.kcal} <input name="kcal" type="number" step="0.1" min="0"></label>
                <label>${STRINGS.protein} (g) <input name="protein_g" type="number" step="0.1" min="0"></label>
                <label>${STRINGS.carbs} (g) <input name="carbs_g" type="number" step="0.1" min="0"></label>
                <label>${STRINGS.fat} (g) <input name="fat_g" type="number" step="0.1" min="0"></label>
                <label>${STRINGS.fiber} (g) <input name="fiber_g" type="number" step="0.1" min="0"></label>
                <label>${STRINGS.sugar} (g) <input name="sugar_g" type="number" step="0.1" min="0"></label>
                <label>${STRINGS.sodium} (mg) <input name="sodium_mg" type="number" step="0.1" min="0"></label>
                <label>Saturated fat (g) <input name="saturatedFat_g" type="number" step="0.1" min="0"></label>
            </div>
            <div class="health-error" data-macro-warn style="margin-top:0.4rem; display:none;"></div>
        </fieldset>
        <label>Tags (comma-separated) <input name="tags"></label>
        <label>${'Notes'} <textarea name="notes"></textarea></label>
        <div class="health-editor-actions">
            ${editing ? `<button type="button" data-act="delete" style="margin-right:auto; color:#e06666;">${STRINGS.delete}</button>` : ''}
            <button type="button" data-act="cancel">${STRINGS.cancel}</button>
            <button type="submit" class="primary">${STRINGS.save}</button>
        </div>
    `;

    // Populate
    form.name.value = data.name;
    form.categoryId.value = data.categoryId;
    form.defaultServingG.value = data.defaultServingG;
    form.densityGPerMl.value = data.densityGPerMl;
    form.tags.value = data.tags;
    form.notes.value = data.notes;
    for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'saturatedFat_g']) {
        form.elements[k].value = data.per100[k] ?? 0;
    }

    const warnEl = form.querySelector('[data-macro-warn]');
    const checkMacroSanity = () => {
        const kcal = Number(form.kcal.value) || 0;
        const p = Number(form.protein_g.value) || 0;
        const c = Number(form.carbs_g.value) || 0;
        const f = Number(form.fat_g.value) || 0;
        const expected = p * 4 + c * 4 + f * 9;
        if (kcal > 0 && expected > 0 && Math.abs(kcal - expected) / Math.max(expected, 1) > 0.2) {
            warnEl.style.display = 'block';
            warnEl.textContent = `Macros (≈${Math.round(expected)} kcal) differ from stated ${Math.round(kcal)} kcal by more than 20 %.`;
        } else {
            warnEl.style.display = 'none';
        }
    };
    form.addEventListener('input', checkMacroSanity);
    checkMacroSanity();

    const panel = DrawUI.floatingPanel({ title: editing ? 'Edit food' : 'New food', closable: true });
    panel.content.appendChild(form);
    panel.show(document.body);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const perGram = scalePerGramFrom100({
            kcal: Number(form.kcal.value) || 0,
            protein_g: Number(form.protein_g.value) || 0,
            carbs_g: Number(form.carbs_g.value) || 0,
            fat_g: Number(form.fat_g.value) || 0,
            fiber_g: Number(form.fiber_g.value) || 0,
            sugar_g: Number(form.sugar_g.value) || 0,
            sodium_mg: Number(form.sodium_mg.value) || 0,
            saturatedFat_g: Number(form.saturatedFat_g.value) || 0,
        });
        const saved = await repos.foodItems.put({
            id: data.id,
            name: form.name.value.trim(),
            categoryId: form.categoryId.value || null,
            defaultServingG: Number(form.defaultServingG.value) || 100,
            densityGPerMl: form.densityGPerMl.value ? Number(form.densityGPerMl.value) : null,
            nutritionPerGram: { ...perGram, micros: {} },
            tags: form.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
            notes: form.notes.value,
            // Preserve provenance (image URL, EAN, provider) so it survives edits.
            source: data.source || undefined,
            aliases: data.aliases,
            imageBlobKey: data.imageBlobKey,
            details: data.details || undefined,
        });
        panel.close();
        onSaved?.(saved);
    });

    form.querySelector('[data-act="cancel"]').addEventListener('click', () => panel.close());
    const delBtn = form.querySelector('[data-act="delete"]');
    if (delBtn) {
        delBtn.addEventListener('click', async () => {
            if (!confirm(STRINGS.confirmDelete(data.name))) return;
            await repos.foodItems.remove(data.id);
            panel.close();
            onSaved?.(null);
        });
    }
}

function scalePer100FromPerGram(perGram) {
    if (!perGram) {
        return { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0, saturatedFat_g: 0 };
    }
    const out = {};
    for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'saturatedFat_g']) {
        out[k] = +((perGram[k] ?? 0) * 100).toFixed(3);
    }
    return out;
}

function scalePerGramFrom100(per100) {
    const out = {};
    for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'saturatedFat_g']) {
        out[k] = (per100[k] ?? 0) / 100;
    }
    return out;
}

function renderSourceHeader(source) {
    if (!source || (!source.imageUrl && !source.ean && !source.externalId && !source.provider)) return '';
    const img = source.imageUrl
        ? `<a class="health-source-thumb" href="${escapeAttr(source.imageUrl)}" target="_blank" rel="noopener"><img src="${escapeAttr(source.imageUrl)}" alt="" loading="lazy"></a>`
        : '<div class="health-source-thumb health-source-thumb--empty">🥕</div>';
    const rows = [];
    if (source.provider) rows.push(['Source', escapeHtml(String(source.provider))]);
    const ean = source.ean || source.externalId;
    if (ean) rows.push(['EAN / ID', escapeHtml(String(ean))]);
    if (source.url) rows.push(['Link', `<a href="${escapeAttr(source.url)}" target="_blank" rel="noopener">Open</a>`]);
    const body = rows.map(([k, v]) => `<div class="health-source-row"><span class="health-source-k">${k}</span><span class="health-source-v">${v}</span></div>`).join('');
    return `<div class="health-source-card">${img}<div class="health-source-meta">${body}</div></div>`;
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Rich Open Food Facts details (read-only, shown when item was imported from OFF)
// ---------------------------------------------------------------------------

function renderDetailsSection(details) {
    if (!details) return '';
    const blocks = [
        renderHealthBlock(details),
        renderIngredientsBlock(details),
        renderEnvironmentBlock(details),
        renderExtendedNutrientsBlock(details),
    ].filter(Boolean).join('');
    if (!blocks) return '';
    return `
        <details class="health-off-details" open>
            <summary>📊 Open Food Facts details</summary>
            <div class="health-off-body">${blocks}</div>
        </details>
    `;
}

function renderHealthBlock(d) {
    const rows = [];
    if (d.nutriScore) {
        const g = d.nutriScore.grade;
        rows.push(`<div class="health-off-row"><span class="health-off-k">Nutri-Score</span><span class="health-off-badge health-off-nutriscore health-off-nutriscore--${g}">${g.toUpperCase()}</span>${d.nutriScore.score != null ? `<span class="health-off-dim">(${d.nutriScore.score})</span>` : ''}</div>`);
    }
    if (d.novaGroup) {
        rows.push(`<div class="health-off-row"><span class="health-off-k">NOVA group</span><span class="health-off-badge health-off-nova health-off-nova--${d.novaGroup}">${d.novaGroup}</span><span class="health-off-dim">${novaLabel(d.novaGroup)}</span></div>`);
    }
    if (d.nutrientLevels && Object.keys(d.nutrientLevels).length) {
        const chips = Object.entries(d.nutrientLevels).map(([k, level]) => (
            `<span class="health-off-level health-off-level--${level}" title="${escapeAttr(k)}: ${escapeAttr(level)}">${levelDot(level)} ${prettyKey(k)} <em>${level}</em></span>`
        )).join('');
        rows.push(`<div class="health-off-row"><span class="health-off-k">Nutrient levels</span><div class="health-off-chips">${chips}</div></div>`);
    }
    if (!rows.length) return '';
    return `<section class="health-off-section"><h4>🩺 Health</h4>${rows.join('')}</section>`;
}

function renderIngredientsBlock(d) {
    const rows = [];
    if (d.ingredientsText) {
        rows.push(`<div class="health-off-row health-off-row--col"><span class="health-off-k">Ingredients${d.ingredientsCount ? ` (${d.ingredientsCount})` : ''}</span><p class="health-off-para">${escapeHtml(d.ingredientsText)}</p></div>`);
    }
    if (d.additives && d.additives.length) {
        const chips = d.additives.map((a) => `<span class="health-off-chip health-off-chip--warn">${escapeHtml(a)}</span>`).join('');
        rows.push(`<div class="health-off-row"><span class="health-off-k">Additives${d.additivesCount ? ` (${d.additivesCount})` : ''}</span><div class="health-off-chips">${chips}</div></div>`);
    }
    if (d.allergens && d.allergens.length) {
        const chips = d.allergens.map((a) => `<span class="health-off-chip health-off-chip--warn">⚠ ${escapeHtml(a)}</span>`).join('');
        rows.push(`<div class="health-off-row"><span class="health-off-k">Allergens</span><div class="health-off-chips">${chips}</div></div>`);
    }
    if (d.traces && d.traces.length) {
        const chips = d.traces.map((a) => `<span class="health-off-chip">${escapeHtml(a)}</span>`).join('');
        rows.push(`<div class="health-off-row"><span class="health-off-k">May contain</span><div class="health-off-chips">${chips}</div></div>`);
    }
    if (d.labels && d.labels.length) {
        const chips = d.labels.slice(0, 20).map((a) => `<span class="health-off-chip">${escapeHtml(a)}</span>`).join('');
        rows.push(`<div class="health-off-row"><span class="health-off-k">Labels</span><div class="health-off-chips">${chips}</div></div>`);
    }
    if (d.ingredientsAnalysis) {
        const a = d.ingredientsAnalysis;
        const items = [];
        if (a.vegan) items.push(`<span class="health-off-chip">🌱 ${escapeHtml(a.vegan)}</span>`);
        if (a.vegetarian) items.push(`<span class="health-off-chip">🥗 ${escapeHtml(a.vegetarian)}</span>`);
        if (a.palmOil) items.push(`<span class="health-off-chip">🌴 ${escapeHtml(a.palmOil)}</span>`);
        if (items.length) rows.push(`<div class="health-off-row"><span class="health-off-k">Analysis</span><div class="health-off-chips">${items.join('')}</div></div>`);
    }
    if (!rows.length) return '';
    return `<section class="health-off-section"><h4>🧪 Ingredients</h4>${rows.join('')}</section>`;
}

function renderEnvironmentBlock(d) {
    const rows = [];
    if (d.ecoScore) {
        const g = d.ecoScore.grade;
        rows.push(`<div class="health-off-row"><span class="health-off-k">Eco-Score</span><span class="health-off-badge health-off-ecoscore health-off-ecoscore--${g}">${g.toUpperCase()}</span>${d.ecoScore.score != null ? `<span class="health-off-dim">(${d.ecoScore.score})</span>` : ''}</div>`);
    }
    if (d.packaging && d.packaging.length) {
        const chips = d.packaging.map((a) => `<span class="health-off-chip">${escapeHtml(a)}</span>`).join('');
        rows.push(`<div class="health-off-row"><span class="health-off-k">Packaging</span><div class="health-off-chips">${chips}</div></div>`);
    }
    if (d.origins || (d.originTags && d.originTags.length)) {
        const text = d.origins || d.originTags.join(', ');
        rows.push(`<div class="health-off-row"><span class="health-off-k">Origins</span><span class="health-off-v">${escapeHtml(text)}</span></div>`);
    }
    if (d.countries && d.countries.length) {
        rows.push(`<div class="health-off-row"><span class="health-off-k">Sold in</span><span class="health-off-v">${escapeHtml(d.countries.join(', '))}</span></div>`);
    }
    if (!rows.length) return '';
    return `<section class="health-off-section"><h4>🌍 Environment</h4>${rows.join('')}</section>`;
}

function renderExtendedNutrientsBlock(d) {
    const n = d.nutrientsPer100g;
    if (!n || !Object.keys(n).length) return '';
    const order = [
        'energy-kj', 'energy-kcal',
        'fat', 'saturated-fat', 'trans-fat', 'monounsaturated-fat', 'polyunsaturated-fat', 'cholesterol',
        'carbohydrates', 'sugars', 'added-sugars', 'starch', 'polyols', 'fiber', 'proteins',
        'salt', 'sodium', 'alcohol', 'caffeine',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'copper',
        'vitamin-a', 'vitamin-c', 'vitamin-d', 'vitamin-e', 'vitamin-k',
        'vitamin-b1', 'vitamin-b2', 'vitamin-b6', 'vitamin-b9', 'vitamin-b12', 'vitamin-pp',
        'fruits-vegetables-nuts-estimate-from-ingredients',
    ];
    const keys = order.filter((k) => n[k]).concat(Object.keys(n).filter((k) => !order.includes(k)));
    if (!keys.length) return '';
    const rows = keys.map((k) => {
        const { value, unit } = n[k];
        return `<tr><td>${prettyKey(k)}</td><td class="health-off-num">${value}</td><td class="health-off-unit">${escapeHtml(unit)}</td></tr>`;
    }).join('');
    return `<section class="health-off-section"><h4>🔬 Nutrition facts (per 100 g)</h4><table class="health-off-table">${rows}</table></section>`;
}

function prettyKey(k) {
    return String(k).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function levelDot(level) {
    if (level === 'low') return '🟢';
    if (level === 'moderate') return '🟡';
    if (level === 'high') return '🔴';
    return '⚪';
}

function novaLabel(g) {
    return ({
        1: 'Unprocessed or minimally processed',
        2: 'Processed culinary ingredients',
        3: 'Processed foods',
        4: 'Ultra-processed foods',
    })[g] || '';
}
