/**
 * Pure statistical aggregation helpers for the planner.
 * No DOM. No IDB.
 */

import { planDayTotals, planEntryTotals, zeroNutrition, sumNutrition } from '../nutrition/calc.js';
import { toIsoDate, eachDayOfRange } from '../dates.js';

const NUM_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'saturatedFat_g'];

function mean(xs) {
    if (!xs.length) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdDev(xs) {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
    return Math.sqrt(v);
}

function percentile(xs, p) {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * Build per-day aggregates for a date range.
 * @param {{ fromDate:Date, toDate:Date, entries:Array, recipesById:Object, foodItemsById:Object }} opts
 * @returns {{ days:Array<{date:string, entries:Array, nutrition:any, count:number}>, totals:any }}
 */
export function buildDaySeries({ fromDate, toDate, entries, recipesById, foodItemsById }) {
    const byDate = {};
    for (const e of entries) (byDate[e.date] = byDate[e.date] || []).push(e);
    const days = eachDayOfRange(fromDate, toDate).map((d) => {
        const iso = toIsoDate(d);
        const dayEntries = byDate[iso] || [];
        return {
            date: iso,
            entries: dayEntries,
            nutrition: planDayTotals(dayEntries, recipesById, foodItemsById),
            count: dayEntries.length,
        };
    });
    let totals = zeroNutrition();
    for (const d of days) totals = sumNutrition(totals, d.nutrition);
    return { days, totals };
}

/**
 * Descriptive statistics for a single nutrient key across the day series.
 */
export function nutrientStats(days, key) {
    const vals = days.map((d) => d.nutrition[key] || 0);
    const planned = days.filter((d) => d.count > 0).map((d) => d.nutrition[key] || 0);
    return {
        all: vals,
        planned,
        sum: vals.reduce((a, b) => a + b, 0),
        mean: mean(vals),
        meanPlanned: mean(planned),
        median: median(vals),
        stdDev: stdDev(vals),
        min: Math.min(...vals, 0),
        max: Math.max(...vals, 0),
        p25: percentile(vals, 0.25),
        p75: percentile(vals, 0.75),
        plannedDays: planned.length,
    };
}

/**
 * Compute all nutrient stats at once.
 */
export function allNutrientStats(days) {
    const out = {};
    for (const k of NUM_KEYS) out[k] = nutrientStats(days, k);
    return out;
}

/**
 * Adherence to a target value for a nutrient.
 * Returns { hits, overs, unders, adherencePct, avgDeviationPct } considering planned days only.
 */
export function adherence(days, key, target, tolerancePct = 0.1) {
    if (!target || target <= 0) return null;
    const lo = target * (1 - tolerancePct);
    const hi = target * (1 + tolerancePct);
    let hits = 0, overs = 0, unders = 0, dev = 0, n = 0;
    for (const d of days) {
        if (d.count === 0) continue;
        n++;
        const v = d.nutrition[key] || 0;
        dev += Math.abs(v - target) / target;
        if (v < lo) unders++;
        else if (v > hi) overs++;
        else hits++;
    }
    return {
        target,
        hits, overs, unders,
        plannedDays: n,
        adherencePct: n ? (hits / n) * 100 : 0,
        avgDeviationPct: n ? (dev / n) * 100 : 0,
    };
}

/**
 * Macro energy breakdown from totals (protein+carbs 4 kcal/g, fat 9 kcal/g).
 */
export function macroEnergy(nutrition) {
    const p = (nutrition.protein_g || 0) * 4;
    const c = (nutrition.carbs_g || 0) * 4;
    const f = (nutrition.fat_g || 0) * 9;
    const sum = p + c + f || 1;
    return {
        protein_kcal: p, carbs_kcal: c, fat_kcal: f,
        protein_pct: (p / sum) * 100,
        carbs_pct: (c / sum) * 100,
        fat_pct: (f / sum) * 100,
    };
}

/**
 * Frequency counts of recipes/foods in the entries.
 */
export function frequency(entries, recipesById, foodItemsById) {
    const recipes = new Map();
    const foods = new Map();
    for (const e of entries) {
        if (e.target?.kind === 'recipe') {
            const r = recipesById[e.target.recipeId];
            if (!r) continue;
            const cur = recipes.get(r.id) || { id: r.id, name: r.name, count: 0, servings: 0 };
            cur.count += 1;
            cur.servings += Number(e.target.servings) || 0;
            recipes.set(r.id, cur);
        } else if (e.target?.kind === 'food') {
            const f = foodItemsById[e.target.foodItemId];
            if (!f) continue;
            const cur = foods.get(f.id) || { id: f.id, name: f.name, count: 0, grams: 0 };
            cur.count += 1;
            cur.grams += Number(e.target.amountG) || 0;
            foods.set(f.id, cur);
        }
    }
    return {
        recipes: [...recipes.values()].sort((a, b) => b.count - a.count),
        foods: [...foods.values()].sort((a, b) => b.count - a.count),
    };
}

/**
 * Energy contribution per meal category (category name -> kcal) for a date span.
 */
export function mealCategoryBreakdown(entries, mealCategories, recipesById, foodItemsById) {
    const byCat = new Map();
    for (const mc of mealCategories) byCat.set(mc.id, { id: mc.id, name: mc.name, color: mc.color, kcal: 0, count: 0 });
    for (const e of entries) {
        const cur = byCat.get(e.mealCategoryId);
        if (!cur) continue;
        const n = planEntryTotals(e, recipesById, foodItemsById);
        cur.kcal += n.kcal || 0;
        cur.count += 1;
    }
    return [...byCat.values()].sort((a, b) => b.kcal - a.kcal);
}

/**
 * Weight trend stats: linear regression slope (kg/day) + latest vs first.
 * @param {Array<{date:string, weightKg:number}>} points sorted by date
 */
export function weightStats(points) {
    if (!points.length) return null;
    const first = points[0];
    const last = points[points.length - 1];
    const vals = points.map((p) => p.weightKg);
    // Linear regression against day index.
    const n = points.length;
    const xs = points.map((_, i) => i);
    const mx = mean(xs);
    const my = mean(vals);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        num += (xs[i] - mx) * (vals[i] - my);
        den += (xs[i] - mx) ** 2;
    }
    const slopePerIndex = den ? num / den : 0;
    // Span in days from first to last
    const d0 = new Date(first.date).getTime();
    const d1 = new Date(last.date).getTime();
    const spanDays = Math.max(1, (d1 - d0) / 86400000);
    // Approximate slope/day from the regression over entries (assumes roughly even sampling)
    const avgDelta = (last.weightKg - first.weightKg) / spanDays;
    // Moving average (7-point)
    const win = Math.min(7, n);
    const ma = points.map((_, i) => {
        const start = Math.max(0, i - win + 1);
        return mean(vals.slice(start, i + 1));
    });
    return {
        n,
        first, last,
        min: Math.min(...vals),
        max: Math.max(...vals),
        mean: my,
        stdDev: stdDev(vals),
        totalChangeKg: last.weightKg - first.weightKg,
        ratePerDayKg: avgDelta,
        ratePerWeekKg: avgDelta * 7,
        regressionSlopePerIndex: slopePerIndex,
        movingAverage: ma,
        spanDays,
    };
}
