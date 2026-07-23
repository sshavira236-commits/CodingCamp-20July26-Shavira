# Expense & Budget Visualizer — Project Steering

## Project Overview

A client-side single-page application for tracking personal expenses, visualising spending by category, and enforcing a monthly budget limit. No build tools, no backend, no frameworks. Everything runs directly in the browser.

**Stack:** HTML5 · CSS3 (custom properties) · Vanilla JavaScript (ES2021) · Chart.js 4.4.3 (CDN)  
**Storage:** Browser LocalStorage only — no network requests  
**Compatibility:** Chrome, Firefox, Edge, Safari

---

## File Structure

```
CodingCamp-20July26-Shavira/
├── index.html          # Single HTML file — all markup lives here
├── css/
│   └── style.css       # Only CSS file — all styling lives here
└── js/
    └── script.js       # Only JS file — all logic lives here
```

**Folder rule:** exactly one file per folder. Never add a second CSS or JS file.

---

## HTML Conventions

### Layout skeleton
```
<body>
  <header class="app-header">
    <div class="header-inner">
      <h1 class="app-title">
      <div class="header-controls">          ← groups toggle + balance
        <button id="themeToggle" class="btn btn-theme-toggle">
        <div class="balance-card">
          <span id="totalBalance">
  <main class="app-main">                    ← CSS grid, two columns
    <section class="left-panel">             ← limit card + form + list
    <section class="right-panel">            ← chart card
  <footer class="app-footer">
```

### Element IDs — never rename these, JS targets them directly
| ID | Element | Purpose |
|----|---------|---------|
| `themeToggle` | `<button>` | Dark/light toggle |
| `totalBalance` | `<span>` | Live balance display |
| `transactionForm` | `<form>` | Add-transaction form |
| `itemName` | `<input>` | Transaction name field |
| `amount` | `<input type="number">` | Amount field |
| `category` | `<select>` | Category picker |
| `itemNameError` | `<span>` | Inline name error |
| `amountError` | `<span>` | Inline amount error |
| `categoryError` | `<span>` | Inline category error |
| `transactionList` | `<ul>` | Scrollable transaction list |
| `transactionCount` | `<span>` | Count badge in heading |
| `emptyState` | `<p>` | "No transactions" placeholder |
| `sortSelect` | `<select>` | Sort order picker |
| `spendingLimit` | `<input type="number">` | Monthly limit input |
| `spendingWarning` | `<div>` | Over-limit warning banner |
| `warningText` | `<span>` | Warning message text |
| `spendingChart` | `<canvas>` | Chart.js pie chart |
| `chartEmptyState` | `<p>` | "Add transactions" placeholder |
| `categorySummary` | `<div>` | Per-category rows below chart |

### Chart.js CDN — do not change the version
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
```

---

## CSS Conventions

### Theme system — CSS custom properties on `:root` and `[data-theme="dark"]`

Light theme (`:root`) is the default. Dark theme is activated by setting `data-theme="dark"` on `<html>`. Never toggle a class — always use the attribute.

**Light token set (`:root`)**
```css
--clr-bg, --clr-surface, --clr-primary, --clr-primary-hov,
--clr-danger, --clr-danger-hov, --clr-text, --clr-muted,
--clr-border, --clr-success,
--clr-food, --clr-transport, --clr-fun,
--radius, --radius-sm, --shadow, --transition
```

**Dark overrides (`[data-theme="dark"]`)** — redefine only the semantic colour tokens; category colours and radii stay the same.

### Transitions on theme switch
Key surfaces carry `transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease` so the theme flip is smooth. Always add this to new surfaces.

### Category dot classes
`dot-Food`, `dot-Transport`, `dot-Fun` — set `background-color` from the matching CSS variable.

### Visibility pattern
Use `.hidden { display: none }` toggled by JS. Never use `visibility: hidden` or `opacity: 0` for show/hide logic.

### Responsive breakpoints
- `≤ 760px` — single-column grid, chart unsticks
- `≤ 420px` — header stacks vertically, `.header-controls` takes full width

---

## JavaScript Conventions

### Module structure — `script.js` is one flat file, no imports
Sections in order:
1. Configuration (constants)
2. State variables
3. LocalStorage helpers
4. UID generator
5. DOM references
6. Validation
7. CRUD (add / delete)
8. Calculations
9. Render — balance
10. Sort helpers
11. Render — transaction list
12. Render — pie chart
13. Render — category summary rows
14. Spending limit helpers & render
15. Master `render()`
16. Event listeners
17. Utility functions
18. Theme (apply / load / toggle)
19. `init()` IIFE

### LocalStorage keys — never change these
| Constant | Key string | Stores |
|----------|-----------|--------|
| `STORAGE_KEY` | `ebv_transactions` | `JSON.stringify(transactions[])` |
| `THEME_KEY` | `ebv_theme` | `'light'` \| `'dark'` |
| `SORT_KEY` | `ebv_sort` | sort option value string |
| `LIMIT_KEY` | `ebv_limit` | number string |

### State variables
```js
let transactions = [];    // Array<{ id, name, amount, category }>
let chartInstance = null; // Chart.js instance or null
```

### Category configuration — `CATEGORY_META`
```js
const CATEGORY_META = {
  Food:      { emoji: '🍔', color: '#f97316' },
  Transport: { emoji: '🚗', color: '#3b82f6' },
  Fun:       { emoji: '🎉', color: '#a855f7' },
};
```
Category colour values here are the ground truth — they feed both the Chart.js datasets and the CSS swatch `style` attributes. Do not define category colours anywhere else.

### Sort options — `SORT_COMPARATORS`
```js
'default'      → newest-first (reverse insertion order)
'amount-asc'   → low to high
'amount-desc'  → high to low
'category-az'  → alphabetical by category
```
Add new sort options by extending `SORT_COMPARATORS` and adding a matching `<option>` in the HTML `#sortSelect`.

### Validation rules
- **Item name**: required, ≤ 80 characters
- **Amount**: required, positive number, ≤ 1,000,000
- **Category**: must be a non-empty selection
- On error: add `.is-invalid` to the input and fill the sibling `<span class="field-error">`.
- On correction: call `markValid()` immediately via `input`/`change` listener.

### Render cycle
Always call the master `render()` after any state mutation. `render()` calls:
```
renderBalance() → renderList() → renderChart() → renderWarning()
```
Never call individual render functions directly except from `render()` or when only that slice needs updating (e.g. `renderList()` after a sort change).

### Chart.js integration
- First render: create a new `Chart` instance and store it in `chartInstance`.
- Subsequent renders: update `chartInstance.data` in-place then call `chartInstance.update()`. Never destroy and recreate — it causes visible flicker.
- When transactions are empty: call `chartInstance.destroy()`, set `chartInstance = null`, and show `#chartEmptyState`.
- Chart border colour is always `#ffffff` regardless of theme (the canvas background is transparent).

### Theme implementation
- `applyTheme(theme)` — sets/removes `data-theme` on `document.documentElement` and updates the button icon (`🌙` / `☀️`), label, and `aria-label`.
- `loadTheme()` — reads `THEME_KEY` from LocalStorage, defaults to `'light'`.
- `toggleTheme()` — reads current attribute, flips it, persists, calls `applyTheme()`.
- `applyTheme()` is called **first** in `init()`, before the first `render()`, to avoid a flash of the wrong theme on page load.

### Spending limit
- Stored as a plain number string under `LIMIT_KEY`.
- `loadLimit()` returns `null` when not set or invalid — always null-check before using.
- `renderWarning()` compares `calcTotal()` against `loadLimit()`. Shows `#spendingWarning` when `total > limit`.
- The warning uses `role="alert"` and `aria-live="polite"` — keep those attributes in place.

### XSS prevention
All user-supplied strings rendered via `innerHTML` must be passed through `escHtml()` first. Never skip this.

### Currency formatting
Always use `formatCurrency(value)` — it uses `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. Never construct currency strings manually.

### Event wiring summary
| Event | Target | Handler |
|-------|--------|---------|
| `submit` | `#transactionForm` | validate → `addTransaction()` → reset |
| `click` | `#transactionList` (delegation) | `.btn-delete` → `deleteTransaction()` |
| `input` | `#itemName`, `#amount` | `markValid()` |
| `change` | `#category` | `markValid()` |
| `change` | `#sortSelect` | save to `SORT_KEY` → `renderList()` |
| `input` | `#spendingLimit` | `saveLimit()` → `renderWarning()` |
| `click` | `#themeToggle` | `toggleTheme()` |

---

## Known Issue
The closing `</script>` tag in `index.html` has a stray `pt>` after it:
```html
<script src="js/script.js"></script>pt>
```
This is a typo in the source. Browsers are tolerant of trailing text before `</body>` but it should be cleaned up. When touching `index.html`, remove the `pt>` artefact.

---

## What Not To Do
- Do not add a second CSS or JS file.
- Do not introduce a bundler, framework, or npm.
- Do not use `localStorage` keys other than the four defined in the constants.
- Do not rename any HTML element ID — JS is bound to them by string.
- Do not toggle a CSS class for dark mode — only `data-theme` on `<html>`.
- Do not recreate the Chart.js instance on every render — update in-place.
- Do not skip `escHtml()` when inserting user data via `innerHTML`.
- Do not use `visibility: hidden` for the show/hide pattern — use `.hidden`.
