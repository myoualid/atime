import { makeDraggable } from './dragdrop.js?v=20260421';
import { STRINGS } from '../strings.js';
import { planEntryTotals, recipeTotals, scaleNutrition } from '../nutrition/calc.js';

const kcalFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const gFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const mgFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hasNutrition(n) {
    if (!n) return false;
    return [
        n.kcal,
        n.protein_g,
        n.carbs_g,
        n.fat_g,
        n.fiber_g,
        n.sugar_g,
        n.sodium_mg,
        n.saturatedFat_g,
    ].some((v) => Number(v) > 0)
    || Object.values(n.micros || {}).some((v) => Number(v?.amount) > 0);
}

function formatNutritionFacts(n) {
    if (!n) return '';
    const facts = [];
    if ((n.protein_g || 0) > 0.05) facts.push(`P ${gFmt.format(n.protein_g)}g`);
    if ((n.carbs_g || 0) > 0.05) facts.push(`C ${gFmt.format(n.carbs_g)}g`);
    if ((n.fat_g || 0) > 0.05) facts.push(`F ${gFmt.format(n.fat_g)}g`);
    if ((n.fiber_g || 0) > 0.05) facts.push(`Fiber ${gFmt.format(n.fiber_g)}g`);
    if ((n.sugar_g || 0) > 0.05) facts.push(`Sugar ${gFmt.format(n.sugar_g)}g`);
    if ((n.sodium_mg || 0) > 0.5) facts.push(`Na ${mgFmt.format(n.sodium_mg)}mg`);

    if (facts.length === 0) {
        const micros = Object.entries(n.micros || {}).filter(([, v]) => Number(v?.amount) > 0);
        for (const [k, v] of micros.slice(0, 3)) {
            const label = k.replace(/[_-]+/g, ' ');
            facts.push(`${label}: ${gFmt.format(v.amount)}${v.unit || ''}`);
        }
    }
    return facts.join(' · ');
}

/**
 * Build a draggable chip representing a library food/recipe.
 * @param {{ kind:'food'|'recipe', item:any, foodItemsById?:Record<string,any>, onClick?:Function }} opts
 * @returns {HTMLElement}
 */
export function libraryChip({ kind, item, foodItemsById = {}, onClick }) {
    const el = document.createElement('div');
    el.className = 'health-chip health-chip--library';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${kind === 'food' ? 'Food' : 'Recipe'}: ${item.name}`);
    const kindLabel = kind === 'food' ? 'FOOD' : 'RECIPE';
    const isTemplate = kind === 'recipe' && item.source?.kind === 'template';
    const imageUrl = item.source?.imageUrl || item.imageUrl || '';
    const placeholderIcon = kind === 'food' ? '🥕' : '🍽';
    const thumbHtml = imageUrl
        ? `<img class="health-chip-thumb" src="${escapeAttr(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="health-chip-thumb health-chip-thumb--placeholder">${placeholderIcon}</span>`;

    let servingText = '';
    let servingNutrition = null;
    if (kind === 'food') {
        const servingG = Math.max(1, Number(item.defaultServingG) || 100);
        servingText = `${gFmt.format(servingG)} g serving`;
        servingNutrition = scaleNutrition(item.nutritionPerGram, servingG);
    } else {
        servingText = '1 serving';
        servingNutrition = recipeTotals(item, foodItemsById).perServing;
    }

    const metaText = `${kcalFmt.format(servingNutrition?.kcal || 0)} ${STRINGS.kcal} / ${servingText}`;
    const factsText = hasNutrition(servingNutrition)
        ? (formatNutritionFacts(servingNutrition) || 'Nutrition recorded')
        : 'No nutrition facts recorded';

    el.innerHTML = `
        ${thumbHtml}
        <span class="health-chip-content">
            <span class="health-chip-top">
                <span class="health-chip-kind">${kindLabel}</span>
                <span class="health-chip-name"></span>
                ${isTemplate ? '<span class="health-chip-badge" title="Template recipe">TPL</span>' : ''}
            </span>
            <span class="health-chip-meta"></span>
            <span class="health-chip-facts"></span>
        </span>
    `;
    el.querySelector('.health-chip-name').textContent = item.name;
    el.querySelector('.health-chip-meta').textContent = metaText;
    el.querySelector('.health-chip-facts').textContent = factsText;
    el.setAttribute('aria-label', `${kind === 'food' ? 'Food' : 'Recipe'}: ${item.name}. ${metaText}. ${factsText}`);
    makeDraggable(el, () => ({
        kind: kind === 'food' ? 'library-food' : 'library-recipe',
        foodItemId: kind === 'food' ? item.id : undefined,
        recipeId: kind === 'recipe' ? item.id : undefined,
        defaultAmountG: kind === 'food' ? (item.defaultServingG || 100) : undefined,
        defaultServings: kind === 'recipe' ? 1 : undefined,
        label: item.name,
    }));
    if (onClick) {
        el.addEventListener('click', () => onClick(item));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(item);
            }
        });
    }
    return el;
}

/**
 * Build a chip representing a plan entry in a slot.
 * @param {{ entry:any, recipesById:Record<string,any>, foodItemsById:Record<string,any>, onOpen?:Function, showCalories?:boolean, onDragEnd?:Function }} opts
 */
export function planEntryChip({ entry, recipesById, foodItemsById, onOpen, showCalories = true, onDragEnd }) {
    const el = document.createElement('div');
    el.className = 'health-chip';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');

    let label = STRINGS.missing;
    let meta = '';
    let missing = false;
    let imageUrl = '';
    let placeholderIcon = '';

    if (entry.target?.kind === 'recipe') {
        const recipe = recipesById[entry.target.recipeId];
        if (recipe) {
            label = recipe.name;
            imageUrl = recipe.source?.imageUrl || recipe.imageUrl || '';
            placeholderIcon = '🍽';
            const nutrition = planEntryTotals(entry, recipesById, foodItemsById);
            meta = `${entry.target.servings || 0}×`;
            if (showCalories) meta = `${meta} · ${kcalFmt.format(nutrition.kcal)} ${STRINGS.kcal}`;
        } else {
            missing = true;
        }
    } else if (entry.target?.kind === 'food') {
        const food = foodItemsById[entry.target.foodItemId];
        if (food) {
            label = food.name;
            imageUrl = food.source?.imageUrl || food.imageUrl || '';
            placeholderIcon = '🥕';
            const nutrition = planEntryTotals(entry, recipesById, foodItemsById);
            meta = `${entry.target.amountG || 0} g`;
            if (showCalories) meta = `${meta} · ${kcalFmt.format(nutrition.kcal)} ${STRINGS.kcal}`;
        } else {
            missing = true;
        }
    }

    if (missing) el.classList.add('health-chip--missing');

    const thumbHtml = imageUrl
        ? `<img class="health-chip-thumb" src="${escapeAttr(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : (placeholderIcon ? `<span class="health-chip-thumb health-chip-thumb--placeholder">${placeholderIcon}</span>` : '');
    el.innerHTML = `
        ${thumbHtml}
        <span class="health-chip-name"></span>
        <span class="health-chip-meta"></span>
    `;
    el.querySelector('.health-chip-name').textContent = label;
    el.querySelector('.health-chip-meta').textContent = meta;
    el.setAttribute('aria-label', `${label}, ${meta || ''}`);

    if (onOpen) {
        el.addEventListener('click', () => onOpen(entry));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(entry);
            }
        });
    }

    makeDraggable(el, () => ({
        kind: 'plan-entry',
        planEntryId: entry.id,
        label,
    }), {
        onDragEnd,
    });

    return el;
}
