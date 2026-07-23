'use strict';

/* ============================================================
   CONFIGURATION
   ============================================================ */

/** Key used to read/write data in LocalStorage. */
const STORAGE_KEY = 'ebv_transactions';

/** Key used to persist the chosen colour theme. */
const THEME_KEY = 'ebv_theme';

/** Key used to persist the chosen sort order. */
const SORT_KEY = 'ebv_sort';

/** Key used to persist the spending limit. */
const LIMIT_KEY = 'ebv_limit';

/**
 * Valid sort values and their comparator functions.
 * 'default' uses insertion order (newest-first via [...].reverse()).
 */
const SORT_COMPARATORS = {
  'default':      null,                                          // handled separately
  'amount-asc':   (a, b) => a.amount - b.amount,
  'amount-desc':  (a, b) => b.amount - a.amount,
  'category-az':  (a, b) => a.category.localeCompare(b.category),
};

/**
 * Display settings for each category.
 * The color values are shared between Chart.js and the CSS swatches.
 */
const CATEGORY_META = {
  Food:      { emoji: '🍔', color: '#f97316' },
  Transport: { emoji: '🚗', color: '#3b82f6' },
  Fun:       { emoji: '🎉', color: '#a855f7' },
};

/* ============================================================
   STATE
   Each transaction: { id: string, name: string,
                        amount: number, category: string }
   ============================================================ */

let transactions = [];   // in-memory array, mirrored to LocalStorage
let chartInstance = null; // active Chart.js instance (null = none)

/* ============================================================
   LOCALSTORAGE — load & save
   ============================================================ */

/**
 * Load the saved transactions array from LocalStorage.
 * Returns [] when nothing is stored or the data is corrupt.
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Write the current in-memory transactions array to LocalStorage.
 */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* ============================================================
   UNIQUE ID GENERATOR
   ============================================================ */

/** Returns a collision-resistant string ID. */
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ============================================================
   DOM REFERENCES
   All IDs and class names match the existing HTML exactly.
   ============================================================ */

const formEl            = document.getElementById('transactionForm');
const itemNameEl        = document.getElementById('itemName');
const amountEl          = document.getElementById('amount');
const categoryEl        = document.getElementById('category');
const itemNameErrorEl   = document.getElementById('itemNameError');
const amountErrorEl     = document.getElementById('amountError');
const categoryErrorEl   = document.getElementById('categoryError');

const totalBalanceEl    = document.getElementById('totalBalance');
const listEl            = document.getElementById('transactionList');
const countEl           = document.getElementById('transactionCount');
const emptyStateEl      = document.getElementById('emptyState');

const chartCanvas       = document.getElementById('spendingChart');
const chartEmptyEl      = document.getElementById('chartEmptyState');
const chartWrapperEl    = chartCanvas.parentElement; // div.chart-wrapper
const summarySectionEl  = document.getElementById('categorySummary');

const themeToggleBtn    = document.getElementById('themeToggle');
const sortSelectEl      = document.getElementById('sortSelect');
const spendingLimitEl   = document.getElementById('spendingLimit');
const spendingWarningEl = document.getElementById('spendingWarning');
const warningTextEl     = document.getElementById('warningText');

/* ============================================================
   VALIDATION
   ============================================================ */

/**
 * Validate all three form fields.
 * Marks each field with .is-invalid and fills its error <span>
 * when invalid; clears both when valid.
 *
 * @returns {boolean} true when every field is valid.
 */
function validateForm() {
  let ok = true;

  // ── Item Name ───────────────────────────────────────────
  const name = itemNameEl.value.trim();

  if (name === '') {
    markInvalid(itemNameEl, itemNameErrorEl, 'Item name is required.');
    ok = false;
  } else if (name.length > 80) {
    markInvalid(itemNameEl, itemNameErrorEl, 'Name must be 80 characters or fewer.');
    ok = false;
  } else {
    markValid(itemNameEl, itemNameErrorEl);
  }

  // ── Amount ──────────────────────────────────────────────
  const rawAmt = amountEl.value.trim();
  const amt    = parseFloat(rawAmt);

  if (rawAmt === '') {
    markInvalid(amountEl, amountErrorEl, 'Amount is required.');
    ok = false;
  } else if (isNaN(amt) || amt <= 0) {
    markInvalid(amountEl, amountErrorEl, 'Enter a positive number.');
    ok = false;
  } else if (amt > 1_000_000) {
    markInvalid(amountEl, amountErrorEl, 'Amount exceeds the maximum of $1,000,000.');
    ok = false;
  } else {
    markValid(amountEl, amountErrorEl);
  }

  // ── Category ────────────────────────────────────────────
  if (categoryEl.value === '') {
    markInvalid(categoryEl, categoryErrorEl, 'Please select a category.');
    ok = false;
  } else {
    markValid(categoryEl, categoryErrorEl);
  }

  return ok;
}

/** Add .is-invalid to a field and show an error message. */
function markInvalid(inputEl, errorEl, message) {
  inputEl.classList.add('is-invalid');
  errorEl.textContent = message;
}

/** Remove .is-invalid from a field and clear its error message. */
function markValid(inputEl, errorEl) {
  inputEl.classList.remove('is-invalid');
  errorEl.textContent = '';
}

/* ============================================================
   CRUD — ADD & DELETE
   ============================================================ */

/**
 * Add a new transaction, persist it, and refresh the UI.
 *
 * @param {string} name
 * @param {number} amount
 * @param {string} category  'Food' | 'Transport' | 'Fun'
 */
function addTransaction(name, amount, category) {
  transactions.push({ id: uid(), name, amount, category });
  saveToStorage();
  render();
}

/**
 * Remove the transaction with the given id, persist, and refresh the UI.
 *
 * @param {string} id
 */
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveToStorage();
  render();
}

/* ============================================================
   CALCULATIONS
   ============================================================ */

/** Sum of all transaction amounts. */
function calcTotal() {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Totals grouped by category.
 * Every category key is always present (defaulting to 0).
 *
 * @returns {{ Food: number, Transport: number, Fun: number }}
 */
function calcByCategory() {
  const totals = Object.fromEntries(
    Object.keys(CATEGORY_META).map(k => [k, 0])
  );
  for (const t of transactions) {
    totals[t.category] += t.amount;
  }
  return totals;
}

/* ============================================================
   RENDER — BALANCE
   ============================================================ */

/** Update the header total-balance display. */
function renderBalance() {
  totalBalanceEl.textContent = formatCurrency(calcTotal());
}

/* ============================================================
   SORT — helpers
   ============================================================ */

/**
 * Return the active sort value from the dropdown.
 * @returns {string}
 */
function currentSort() {
  return sortSelectEl.value;
}

/**
 * Return a sorted copy of the transactions array according to
 * the active sort selection.  The original array is never mutated.
 *
 * @returns {Array}
 */
function getSortedList() {
  const comparator = SORT_COMPARATORS[currentSort()];
  if (!comparator) {
    // 'default' → newest first (original insertion order reversed)
    return [...transactions].reverse();
  }
  return [...transactions].sort(comparator);
}

/* ============================================================
   RENDER — TRANSACTION LIST
   ============================================================ */

/**
 * Rebuild the <ul> from current state using the active sort order.
 */
function renderList() {
  // Update the count badge
  countEl.textContent = transactions.length;

  // Nothing to show
  if (transactions.length === 0) {
    listEl.innerHTML = '';
    emptyStateEl.classList.remove('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');

  // Build all <li> elements in a fragment (one DOM update)
  const frag = document.createDocumentFragment();

  getSortedList().forEach(t => {
    const li = document.createElement('li');
    li.className  = 'transaction-item';
    li.dataset.id = t.id;

    li.innerHTML = `
      <span class="transaction-category-dot dot-${t.category}" aria-hidden="true"></span>
      <div class="transaction-info">
        <div class="transaction-name" title="${escHtml(t.name)}">${escHtml(t.name)}</div>
        <div class="transaction-category">${CATEGORY_META[t.category].emoji} ${t.category}</div>
      </div>
      <span class="transaction-amount">-${formatCurrency(t.amount)}</span>
      <button
        class="btn btn-delete"
        data-id="${t.id}"
        aria-label="Delete transaction: ${escHtml(t.name)}"
        title="Delete"
      >&#x2715;</button>
    `;

    frag.appendChild(li);
  });

  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

/* ============================================================
   RENDER — PIE CHART
   ============================================================ */

/**
 * Create or update the Chart.js pie chart.
 * When there is no data, destroy any existing chart and show the
 * placeholder text instead.
 */
function renderChart() {
  const byCategory    = calcByCategory();
  const activeEntries = Object.entries(byCategory).filter(([, v]) => v > 0);

  // ── No data ──────────────────────────────────────────────
  if (activeEntries.length === 0) {
    chartWrapperEl.classList.add('hidden');
    chartEmptyEl.classList.remove('hidden');
    summarySectionEl.classList.add('hidden');

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  // ── Has data ─────────────────────────────────────────────
  chartWrapperEl.classList.remove('hidden');
  chartEmptyEl.classList.add('hidden');
  summarySectionEl.classList.remove('hidden');

  const labels = activeEntries.map(([k]) => `${CATEGORY_META[k].emoji} ${k}`);
  const data   = activeEntries.map(([, v]) => +v.toFixed(2));
  const colors = activeEntries.map(([k]) => CATEGORY_META[k].color);

  if (chartInstance) {
    // Update in-place for smooth animation — no flicker
    chartInstance.data.labels                      = labels;
    chartInstance.data.datasets[0].data            = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
  } else {
    // First time: create the Chart.js instance
    chartInstance = new Chart(chartCanvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor:     '#ffffff',
          borderWidth:     3,
          hoverOffset:     14,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        animation: { duration: 420 },
        plugins: {
          legend: { display: false }, // replaced by our own summary rows
          tooltip: {
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0
                  ? ((ctx.parsed / total) * 100).toFixed(1)
                  : '0.0';
                return ` ${formatCurrency(ctx.parsed)}  (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  renderSummary(byCategory);
}

/* ============================================================
   RENDER — CATEGORY SUMMARY ROWS
   ============================================================ */

/**
 * Render the per-category breakdown below the pie chart.
 *
 * @param {{ Food: number, Transport: number, Fun: number }} byCategory
 */
function renderSummary(byCategory) {
  const total = calcTotal();
  const frag  = document.createDocumentFragment();

  for (const [cat, amount] of Object.entries(byCategory)) {
    if (amount === 0) continue;

    const pct = total > 0
      ? ((amount / total) * 100).toFixed(1)
      : '0.0';

    const cfg = CATEGORY_META[cat];
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <span class="category-swatch" style="background:${cfg.color}" aria-hidden="true"></span>
      <span class="category-row-label">${cfg.emoji} ${cat}</span>
      <span class="category-row-amount">${formatCurrency(amount)}</span>
      <span class="category-row-pct">${pct}%</span>
    `;
    frag.appendChild(row);
  }

  summarySectionEl.innerHTML = '';
  summarySectionEl.appendChild(frag);
}

/* ============================================================
   SPENDING LIMIT — helpers & render
   ============================================================ */

/**
 * Read the saved limit from LocalStorage.
 * Returns null when nothing is stored or the value is invalid.
 *
 * @returns {number|null}
 */
function loadLimit() {
  const raw = localStorage.getItem(LIMIT_KEY);
  const val = parseFloat(raw);
  return (!isNaN(val) && val > 0) ? val : null;
}

/**
 * Persist the current value of the limit input to LocalStorage.
 * Removes the key entirely when the field is blank or zero.
 */
function saveLimit() {
  const val = parseFloat(spendingLimitEl.value);
  if (!isNaN(val) && val > 0) {
    localStorage.setItem(LIMIT_KEY, val);
  } else {
    localStorage.removeItem(LIMIT_KEY);
  }
}

/**
 * Show or hide the warning banner based on whether total spending
 * exceeds the active limit.  Automatically disappears when the
 * total drops back below the limit or when no limit is set.
 */
function renderWarning() {
  const limit = loadLimit();
  const total = calcTotal();

  if (limit !== null && total > limit) {
    const over = formatCurrency(total - limit);
    warningTextEl.textContent =
      `You've exceeded your ${formatCurrency(limit)} spending limit by ${over}!`;
    spendingWarningEl.classList.remove('hidden');
  } else {
    spendingWarningEl.classList.add('hidden');
    warningTextEl.textContent = '';
  }
}

/* ============================================================
   MASTER RENDER
   Call this after every state mutation.
   ============================================================ */

function render() {
  renderBalance();
  renderList();
  renderChart();
  renderWarning();
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

// 1. Form submit → validate then add transaction
formEl.addEventListener('submit', function (e) {
  e.preventDefault();

  if (!validateForm()) return;

  const name     = itemNameEl.value.trim();
  const amount   = parseFloat(parseFloat(amountEl.value).toFixed(2));
  const category = categoryEl.value;

  addTransaction(name, amount, category);

  // Reset form and clear any leftover error state
  formEl.reset();
  [itemNameEl, amountEl, categoryEl].forEach(el => el.classList.remove('is-invalid'));
  [itemNameErrorEl, amountErrorEl, categoryErrorEl].forEach(el => (el.textContent = ''));

  // Focus first field for quick back-to-back entry
  itemNameEl.focus();
});

// 2. Delete — event delegation on the <ul> (one listener for all rows)
listEl.addEventListener('click', function (e) {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;
  const id = btn.dataset.id;
  if (id) deleteTransaction(id);
});

// 3. Live validation — clear each field's error as soon as the user edits it
itemNameEl.addEventListener('input',  () => markValid(itemNameEl,  itemNameErrorEl));
amountEl.addEventListener('input',    () => markValid(amountEl,    amountErrorEl));
categoryEl.addEventListener('change', () => markValid(categoryEl,  categoryErrorEl));

// 4. Sort — re-render the list and persist the chosen order
sortSelectEl.addEventListener('change', function () {
  localStorage.setItem(SORT_KEY, this.value);
  renderList();
});

// 5. Spending limit — persist on every change and re-evaluate warning
spendingLimitEl.addEventListener('input', function () {
  saveLimit();
  renderWarning();
});

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/**
 * Format a number as a USD currency string.
 * Uses the browser's built-in Intl API for correct localisation.
 *
 * @param   {number} value
 * @returns {string}  e.g. "$1,234.56"
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Escape HTML special characters to prevent XSS when inserting
 * user-supplied strings via innerHTML.
 *
 * @param   {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* ============================================================
   THEME — Dark / Light Mode
   ============================================================ */

/**
 * Apply a theme by setting data-theme on <html> and updating
 * the toggle button's label/icon/aria-label to reflect the
 * *opposite* mode (what clicking it will switch to next).
 *
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggleBtn.querySelector('.theme-icon').textContent  = '☀️';
    themeToggleBtn.querySelector('.theme-label').textContent = 'Light';
    themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeToggleBtn.querySelector('.theme-icon').textContent  = '🌙';
    themeToggleBtn.querySelector('.theme-label').textContent = 'Dark';
    themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
  }
}

/**
 * Load the saved theme preference from LocalStorage.
 * Falls back to 'light' when nothing is stored.
 *
 * @returns {'light'|'dark'}
 */
function loadTheme() {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

/**
 * Toggle between dark and light, persist the choice, and apply it.
 */
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'light'
    : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Wire up the toggle button
themeToggleBtn.addEventListener('click', toggleTheme);

/* ============================================================
   INITIALISE
   Load persisted data then paint the full UI on page load.
   ============================================================ */

(function init() {
  // Restore theme first — before first paint — to avoid a flash
  applyTheme(loadTheme());

  // Restore saved sort order (default to 'default' if nothing stored)
  const savedSort = localStorage.getItem(SORT_KEY);
  if (savedSort && sortSelectEl.querySelector(`option[value="${savedSort}"]`)) {
    sortSelectEl.value = savedSort;
  }

  // Restore saved spending limit
  const savedLimit = loadLimit();
  if (savedLimit !== null) {
    spendingLimitEl.value = savedLimit;
  }

  transactions = loadFromStorage();
  render();
}());
