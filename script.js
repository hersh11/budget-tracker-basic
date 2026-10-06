// Budget Buddy: the page. The logic (dates, money, totals, insights, sample
// data) lives in lib.js, which loads first and is shared with the tests.
//
// Transactions live in localStorage under "transactions", the same key and
// shape the first version used ({ id, text, amount, date }), now with a
// category and a sample flag. Income is positive and spending negative.

const {
  CATEGORIES,
  categoryById,
  createId,
  parseDate,
  toDateValue,
  monthKey,
  startOfMonth,
  addMonths,
  money,
  normalizeTransaction,
  monthTotals,
  spendingByCategory,
  budgetStatus,
  buildInsights,
  sampleTransactions,
} = window.BudgetLib;

const STORAGE_KEYS = {
  transactions: "transactions",
  budget: "budget-buddy.budget",
  theme: "budget-buddy.theme",
  started: "budget-buddy.started",
  sampleBudget: "budget-buddy.sample-budget",
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (selector) => document.querySelector(selector);

const formatMonth = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const formatShortMonth = new Intl.DateTimeFormat("en-IN", { month: "short" });
const formatDay = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });

// ---------- Storage ----------

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage is full or blocked; changes stay on screen for this visit.
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    /* see writeStorage */
  }
}

function loadTransactions() {
  const stored = readStorage(STORAGE_KEYS.transactions, []);
  return Array.isArray(stored) ? stored.map(normalizeTransaction).filter(Boolean) : [];
}

function saveTransactions() {
  writeStorage(STORAGE_KEYS.transactions, state.transactions);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// ---------- State ----------

const state = {
  transactions: loadTransactions(),
  month: startOfMonth(new Date()),
  typeFilter: "all",
  categoryFilter: "",
  search: "",
  budget: Number(readStorage(STORAGE_KEYS.budget, 0)) || 0,
  newId: null,
  editingId: null,
};

const charts = {};

const inMonth = (transaction, month = state.month) => transaction.date.slice(0, 7) === monthKey(month);
const totalsFor = (month) => monthTotals(state.transactions, month);
const hasSamples = () => state.transactions.some((transaction) => transaction.sample);

// ---------- Odometer ----------

// Each digit is a column of 0–9 that slides to its new value.
function renderOdometer(element, text) {
  const previousDigits = [...(element.dataset.value || "0")].filter((char) => /\d/.test(char));
  const nextDigits = [...text].filter((char) => /\d/.test(char));
  let digitIndex = 0;
  element.innerHTML = [...text].map((char) => {
    if (!/\d/.test(char)) return `<span class="odo-symbol">${escapeHtml(char)}</span>`;
    const fromRight = nextDigits.length - digitIndex;
    const start = previousDigits[previousDigits.length - fromRight] ?? "0";
    digitIndex += 1;
    return `<span class="odo-digit" style="--k:${fromRight}"><span class="odo-strip" style="--d:${start}">${"0123456789".split("").map((d) => `<span>${d}</span>`).join("")}</span></span>`;
  }).join("");
  element.dataset.value = text;
  const strips = element.querySelectorAll(".odo-strip");
  const settle = () => strips.forEach((strip, i) => strip.style.setProperty("--d", nextDigits[i]));
  if (prefersReducedMotion) settle();
  else requestAnimationFrame(() => requestAnimationFrame(settle));
}

// ---------- Rendering ----------

function renderMonthLabel(direction = 0) {
  const label = $("#monthLabel");
  label.textContent = formatMonth.format(state.month);
  const isCurrent = monthKey(state.month) === monthKey(new Date());
  label.classList.toggle("is-current", isCurrent);
  label.title = isCurrent ? "This month" : "Back to this month";
  if (direction && !prefersReducedMotion) {
    label.animate(
      [{ opacity: 0, transform: `translateX(${direction * 14}px)` }, { opacity: 1, transform: "none" }],
      { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }
}

function renderSampleBanner() {
  const banner = $("#sampleBanner");
  const count = state.transactions.filter((transaction) => transaction.sample).length;
  banner.hidden = count === 0;
  if (count) {
    const own = state.transactions.length - count;
    $("#sampleText").textContent = own
      ? `${count} example transactions are mixed in with your ${own}. They're tagged “Sample”, and clearing them keeps yours.`
      : `These ${count} transactions are examples. Add your own any time, then clear the samples to start fresh.`;
  }
}

function renderBalance() {
  const total = state.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const text = money(total);
  renderOdometer($("#balance"), text);
  $("#balanceText").textContent = text;
  $(".balance-card").classList.toggle("is-negative", total < 0);
  const count = state.transactions.length;
  $("#balanceNote").innerHTML = count
    ? `Across ${count} transaction${count === 1 ? "" : "s"}`
    : `Add your first transaction, or <button type="button" class="inline-link" data-load-sample>try it with sample data</button>`;

  const totals = totalsFor(state.month);
  $("#monthIncome").textContent = money(totals.income);
  $("#monthExpense").textContent = money(totals.expense);
  $("#monthNet").textContent = money(totals.net, { sign: totals.net !== 0 });
  $(".stat.net").classList.toggle("is-negative", totals.net < 0);
}

function renderBudget() {
  const status = budgetStatus({
    spent: totalsFor(state.month).expense,
    budget: state.budget,
    month: state.month,
    today: new Date(),
  });
  $(".budget-card").dataset.level = status.level;
  $("#budgetRing").style.setProperty("--value", status.ringValue);
  $("#budgetPercent").textContent = status.percent === null ? "–" : `${status.percent}%`;
  $("#budgetPercentLabel").textContent = status.percent === null ? "no budget" : "spent";
  $("#budgetHeadline").textContent = status.headline;
  $("#budgetDetail").textContent = status.detail;
  $("#editBudget").textContent = state.budget ? "Edit" : "Set budget";
}

const insightIcons = {
  pace: '<path d="M4 17l6-6 4 4 6-8" /><path d="M14 7h6v6" />',
  up: '<path d="M12 19V5M5 12l7-7 7 7" />',
  down: '<path d="M12 5v14M5 12l7 7 7-7" />',
  save: '<path d="M5 11a7 7 0 0 1 13-3h2v4h-2a7 7 0 0 1-3 4v3h-3v-2h-2v2H7v-3a7 7 0 0 1-2-5z" /><circle cx="15" cy="10" r="1" />',
  top: '<path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" />',
};

function renderInsights() {
  const items = buildInsights({
    transactions: state.transactions,
    month: state.month,
    today: new Date(),
    budget: state.budget,
  });
  $("#insightsTitle").textContent = `Insights for ${formatMonth.format(state.month).split(" ")[0]}`;
  $("#insightList").innerHTML = items.length
    ? items.map((item, index) => `
      <li class="insight ${item.tone}" style="--i:${index}">
        <span class="insight-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${insightIcons[item.icon]}</svg></span>
        <p>${escapeHtml(item.text)}</p>
      </li>`).join("")
    : `<li class="insight-empty">Add a few weeks of spending to see how this month compares with the last.</li>`;
}

function themeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue("--muted").trim(),
    grid: styles.getPropertyValue("--chart-grid").trim(),
    surface: styles.getPropertyValue("--surface-solid").trim(),
    income: styles.getPropertyValue("--income").trim(),
    expense: styles.getPropertyValue("--expense").trim(),
    tooltip: styles.getPropertyValue("--ink").trim(),
    tooltipText: styles.getPropertyValue("--surface-solid").trim(),
  };
}

function renderCategories() {
  const rows = spendingByCategory(state.transactions, state.month);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const colors = themeColors();
  $("#donutTotal").textContent = money(total);
  $(".category-card").classList.toggle("is-empty", !rows.length);

  const data = rows.length ? rows.map((row) => row.total) : [1];
  const backgroundColor = rows.length ? rows.map((row) => row.color) : [colors.grid];
  if (charts.category) {
    charts.category.data.labels = rows.map((row) => row.label);
    charts.category.data.datasets[0].data = data;
    charts.category.data.datasets[0].backgroundColor = backgroundColor;
    charts.category.data.datasets[0].borderColor = colors.surface;
    charts.category.options.plugins.tooltip.enabled = rows.length > 0;
    charts.category.$rows = rows;
    charts.category.update();
  } else {
    charts.category = new Chart($("#categoryChart"), {
      type: "doughnut",
      data: {
        labels: rows.map((row) => row.label),
        datasets: [{ data, backgroundColor, borderColor: colors.surface, borderWidth: 3, hoverOffset: 10, borderRadius: 6 }],
      },
      options: {
        cutout: "72%",
        maintainAspectRatio: false,
        animation: prefersReducedMotion ? false : { animateRotate: true, duration: 900, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: rows.length > 0,
            backgroundColor: colors.tooltip,
            titleColor: colors.tooltipText,
            bodyColor: colors.tooltipText,
            padding: 10,
            cornerRadius: 10,
            callbacks: { label: (ctx) => ` ${money(ctx.parsed)}` },
          },
        },
        onHover: (event, elements) => {
          event.native.target.style.cursor = elements.length && charts.category.$rows.length ? "pointer" : "default";
        },
        onClick: (event, elements) => {
          const row = elements.length ? charts.category.$rows[elements[0].index] : null;
          if (row) toggleCategoryFilter(row.id);
        },
      },
    });
    charts.category.$rows = rows;
  }

  $("#categoryLegend").innerHTML = rows.length
    ? rows.map((row, index) => `
      <li style="--i:${index}">
        <button type="button" class="legend-item" data-category="${row.id}" data-index="${index}" aria-pressed="${state.categoryFilter === row.id}">
          <span class="legend-emoji" style="--c:${row.color}" aria-hidden="true">${row.emoji}</span>
          <span class="legend-name">${escapeHtml(row.label)}</span>
          <span class="legend-amount">${money(row.total)}</span>
          <span class="legend-bar" aria-hidden="true"><i style="--w:${(row.total / rows[0].total) * 100}%; --c:${row.color}"></i></span>
          <span class="legend-share">${Math.round((row.total / total) * 100)}%</span>
        </button>
      </li>`).join("")
    : `<li class="legend-empty">No spending in ${formatMonth.format(state.month).split(" ")[0]} yet.</li>`;
}

function renderTrend() {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(state.month, i - 5));
  const totals = months.map(totalsFor);
  const colors = themeColors();
  const alpha = (hex, value) => `${hex}${Math.round(value * 255).toString(16).padStart(2, "0")}`;
  const selected = months.length - 1;
  const incomeColors = months.map((_, i) => (i === selected ? colors.income : alpha(colors.income, 0.45)));
  const expenseColors = months.map((_, i) => (i === selected ? colors.expense : alpha(colors.expense, 0.45)));
  const labels = months.map((month) => formatShortMonth.format(month));

  if (charts.trend) {
    charts.trend.data.labels = labels;
    charts.trend.data.datasets[0].data = totals.map((t) => t.income);
    charts.trend.data.datasets[0].backgroundColor = incomeColors;
    charts.trend.data.datasets[1].data = totals.map((t) => t.expense);
    charts.trend.data.datasets[1].backgroundColor = expenseColors;
    charts.trend.$months = months;
    charts.trend.update();
    return;
  }

  charts.trend = new Chart($("#trendChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Income", data: totals.map((t) => t.income), backgroundColor: incomeColors, borderRadius: 8, borderSkipped: false, maxBarThickness: 26 },
        { label: "Spent", data: totals.map((t) => t.expense), backgroundColor: expenseColors, borderRadius: 8, borderSkipped: false, maxBarThickness: 26 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: prefersReducedMotion ? false : { duration: 800, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.text, font: { weight: 600 } }, border: { display: false } },
        y: {
          beginAtZero: true,
          suggestedMax: 1000,
          grid: { color: colors.grid },
          border: { display: false },
          ticks: { color: colors.text, maxTicksLimit: 5, callback: (value) => (value >= 1000 ? `₹${Math.round(value / 1000)}k` : `₹${value}`) },
        },
      },
      plugins: {
        legend: { position: "bottom", labels: { color: colors.text, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, padding: 16 } },
        tooltip: {
          backgroundColor: colors.tooltip,
          titleColor: colors.tooltipText,
          bodyColor: colors.tooltipText,
          padding: 10,
          cornerRadius: 10,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}` },
        },
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const month = charts.trend.$months[elements[0].index];
        if (monthKey(month) !== monthKey(state.month)) changeMonth(month, month < state.month ? -1 : 1);
      },
    },
  });
  charts.trend.$months = months;
}

function retheme() {
  const colors = themeColors();
  if (charts.trend) {
    const { scales, plugins } = charts.trend.options;
    scales.x.ticks.color = colors.text;
    scales.y.ticks.color = colors.text;
    scales.y.grid.color = colors.grid;
    plugins.legend.labels.color = colors.text;
    Object.assign(plugins.tooltip, { backgroundColor: colors.tooltip, titleColor: colors.tooltipText, bodyColor: colors.tooltipText });
  }
  if (charts.category) {
    Object.assign(charts.category.options.plugins.tooltip, { backgroundColor: colors.tooltip, titleColor: colors.tooltipText, bodyColor: colors.tooltipText });
  }
  renderCategories();
  renderTrend();
  Object.values(charts).forEach((chart) => chart.update("none"));
}

function visibleTransactions() {
  const query = state.search.trim().toLowerCase();
  const order = new Map(state.transactions.map((transaction, index) => [transaction.id, index]));
  return state.transactions
    .filter((transaction) => inMonth(transaction))
    .filter((transaction) => state.typeFilter === "all" || (state.typeFilter === "income" ? transaction.amount > 0 : transaction.amount < 0))
    .filter((transaction) => !state.categoryFilter || transaction.category === state.categoryFilter)
    .filter((transaction) => !query || `${transaction.text} ${categoryById.get(transaction.category).label}`.toLowerCase().includes(query))
    // Newest date first; on the same day, the most recently added first.
    .sort((a, b) => b.date.localeCompare(a.date) || order.get(b.id) - order.get(a.id));
}

function dayHeading(value) {
  const date = parseDate(value);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (value === toDateValue(today)) return "Today";
  if (value === toDateValue(yesterday)) return "Yesterday";
  return formatDay.format(date);
}

function emptyState() {
  if (!state.transactions.length) {
    return `
      <div class="empty">
        <svg class="empty-art" viewBox="0 0 160 120" aria-hidden="true">
          <ellipse cx="80" cy="108" rx="52" ry="7" class="empty-shadow" />
          <rect x="30" y="34" width="100" height="66" rx="16" class="empty-wallet" />
          <path d="M30 52c0-10 8-18 18-18h64l-8-14H50c-11 0-20 9-20 20z" class="empty-flap" />
          <rect x="94" y="56" width="36" height="22" rx="11" class="empty-clasp" />
          <circle cx="108" cy="67" r="4" class="empty-dot" />
          <circle class="empty-coin" cx="62" cy="22" r="9" />
          <text x="62" y="26" class="empty-rupee">₹</text>
        </svg>
        <h3>Your wallet is waiting</h3>
        <p>Add what you earn and spend, and Budget Buddy shows where your money goes.</p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" data-open-sheet>Add a transaction</button>
          <button type="button" class="btn btn-ghost" data-load-sample>Try with sample data</button>
        </div>
      </div>`;
  }
  const filtered = state.search || state.typeFilter !== "all" || state.categoryFilter;
  return `
    <div class="empty compact">
      <h3>${filtered ? "No matches" : `Nothing in ${formatMonth.format(state.month)} yet`}</h3>
      <p>${filtered ? "Try a different search or filter." : "Transactions you add for this month will show up here."}</p>
    </div>`;
}

function renderList() {
  const rows = visibleTransactions();
  const list = $("#transactionList");

  const category = state.categoryFilter ? categoryById.get(state.categoryFilter) : null;
  $("#activeFilter").innerHTML = category
    ? `<button type="button" class="chip" id="clearCategory" aria-label="Stop filtering by ${escapeHtml(category.label)}">${category.emoji} ${escapeHtml(category.label)} <span aria-hidden="true">×</span></button>`
    : "";

  if (!rows.length) {
    list.innerHTML = emptyState();
    return;
  }

  const groups = [];
  rows.forEach((transaction) => {
    const last = groups[groups.length - 1];
    if (last && last.date === transaction.date) last.items.push(transaction);
    else groups.push({ date: transaction.date, items: [transaction] });
  });

  let index = 0;
  list.innerHTML = groups.map((group) => {
    const dayTotal = group.items.reduce((sum, item) => sum + item.amount, 0);
    return `
      <section class="day">
        <h3 class="day-head"><span>${dayHeading(group.date)}</span><span class="day-total">${money(dayTotal, { sign: true })}</span></h3>
        <ul class="day-list">
          ${group.items.map((transaction) => {
            const item = categoryById.get(transaction.category);
            const type = transaction.amount < 0 ? "expense" : "income";
            const amount = money(transaction.amount, { sign: true });
            const classes = ["tx", transaction.id === state.newId ? "is-new" : "", transaction.sample ? "is-sample" : ""].filter(Boolean).join(" ");
            return `
              <li class="${classes}" data-id="${escapeHtml(transaction.id)}" style="--i:${Math.min(index++, 12)}">
                <button type="button" class="tx-open" data-edit="${escapeHtml(transaction.id)}" aria-label="Edit ${escapeHtml(transaction.text)}, ${amount}${transaction.sample ? ", sample" : ""}">
                  <span class="tx-icon" style="--c:${item.color}" aria-hidden="true">${item.emoji}</span>
                  <span class="tx-main">
                    <strong>${escapeHtml(transaction.text)}</strong>
                    <span>${escapeHtml(item.label)}${transaction.sample ? ' <span class="sample-tag">Sample</span>' : ""}</span>
                  </span>
                  <span class="tx-amount ${type}">${amount}</span>
                </button>
                <button type="button" class="tx-delete" data-delete="${escapeHtml(transaction.id)}" aria-label="Delete ${escapeHtml(transaction.text)}, ${amount}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                </button>
              </li>`;
          }).join("")}
        </ul>
      </section>`;
  }).join("");
  state.newId = null;
}

function renderAll() {
  renderMonthLabel();
  renderSampleBanner();
  renderBalance();
  renderBudget();
  renderInsights();
  renderCategories();
  renderTrend();
  renderList();
}

// ---------- Actions ----------

function changeMonth(month, direction) {
  state.month = startOfMonth(month);
  state.categoryFilter = "";
  renderMonthLabel(direction);
  renderBalance();
  renderBudget();
  renderInsights();
  renderCategories();
  renderTrend();
  renderList();
}

function toggleCategoryFilter(id) {
  state.categoryFilter = state.categoryFilter === id ? "" : id;
  if (state.categoryFilter && state.typeFilter === "income") setTypeFilter("all");
  renderCategories();
  renderList();
  if (state.categoryFilter) {
    $(".list-card").scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }
}

function setTypeFilter(value) {
  state.typeFilter = value;
  const input = document.querySelector(`input[name="typeFilter"][value="${value}"]`);
  if (input) input.checked = true;
  syncSegmented(input.closest(".segmented"));
}

// Shows the month a transaction belongs to, highlighting it.
function showTransaction(transaction) {
  state.newId = transaction.id;
  const month = startOfMonth(parseDate(transaction.date));
  if (monthKey(month) !== monthKey(state.month)) {
    changeMonth(month, month < state.month ? -1 : 1);
    renderSampleBanner();
    state.newId = null;
  } else {
    renderAll();
  }
}

function addTransaction(transaction) {
  state.transactions.push(transaction);
  saveTransactions();
  showTransaction(transaction);
}

function updateTransaction(id, changes) {
  const index = state.transactions.findIndex((transaction) => transaction.id === id);
  if (index === -1) return null;
  // Once edited, an entry is the visitor's own rather than a sample.
  state.transactions[index] = { ...state.transactions[index], ...changes, sample: false };
  saveTransactions();
  showTransaction(state.transactions[index]);
  return state.transactions[index];
}

function removeTransaction(id) {
  const index = state.transactions.findIndex((transaction) => transaction.id === id);
  if (index === -1) return;
  const [removed] = state.transactions.splice(index, 1);
  saveTransactions();

  const finish = () => {
    renderAll();
    showToast(`Deleted “${removed.text}”`, {
      action: "Undo",
      onAction: () => {
        state.transactions.splice(Math.min(index, state.transactions.length), 0, removed);
        saveTransactions();
        state.newId = removed.id;
        renderAll();
      },
    });
  };

  const row = document.querySelector(`.tx[data-id="${CSS.escape(id)}"]`);
  if (!row || prefersReducedMotion) {
    finish();
    return;
  }
  row.style.height = `${row.offsetHeight}px`;
  row.classList.add("is-leaving");
  row.addEventListener("animationend", finish, { once: true });
}

function loadSampleData({ quiet = false } = {}) {
  state.transactions = [...state.transactions.filter((transaction) => !transaction.sample), ...sampleTransactions()];
  if (!state.budget) {
    state.budget = 30000;
    writeStorage(STORAGE_KEYS.budget, state.budget);
    writeStorage(STORAGE_KEYS.sampleBudget, true);
  }
  saveTransactions();
  state.month = startOfMonth(new Date());
  renderAll();
  if (!quiet) {
    burstFrom($(".balance-card"));
    showToast("Sample data loaded. You can clear it any time from the banner at the top.");
  }
}

// Removes only the sample entries (and the budget they set), with undo.
function clearSamples() {
  const samples = state.transactions.filter((transaction) => transaction.sample);
  const hadSampleBudget = readStorage(STORAGE_KEYS.sampleBudget, false);
  const budgetBefore = state.budget;
  state.transactions = state.transactions.filter((transaction) => !transaction.sample);
  if (hadSampleBudget) {
    state.budget = 0;
    removeStorage(STORAGE_KEYS.budget);
    removeStorage(STORAGE_KEYS.sampleBudget);
  }
  saveTransactions();
  renderAll();
  showToast(state.transactions.length ? "Sample data cleared. Your own entries are still here." : "Sample data cleared. Over to you!", {
    action: "Undo",
    onAction: () => {
      state.transactions = [...samples, ...state.transactions];
      if (hadSampleBudget && !state.budget) {
        state.budget = budgetBefore;
        writeStorage(STORAGE_KEYS.budget, budgetBefore);
        writeStorage(STORAGE_KEYS.sampleBudget, true);
      }
      saveTransactions();
      renderAll();
    },
  });
}

function exportCsv() {
  if (!state.transactions.length) {
    showToast("There's nothing to export yet.");
    return;
  }
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [["Date", "Description", "Category", "Type", "Amount (INR)"].map(quote).join(",")];
  [...state.transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((transaction) => {
      lines.push([
        transaction.date,
        transaction.text,
        categoryById.get(transaction.category).label,
        transaction.amount < 0 ? "Expense" : "Income",
        transaction.amount,
      ].map(quote).join(","));
    });
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `budget-buddy-${toDateValue(new Date())}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearAll() {
  if (!state.transactions.length) return;
  if (!window.confirm("Delete every transaction saved in this browser?")) return;
  const backup = state.transactions;
  state.transactions = [];
  saveTransactions();
  renderAll();
  showToast("All transactions deleted", {
    action: "Undo",
    onAction: () => {
      state.transactions = backup;
      saveTransactions();
      renderAll();
    },
  });
}

// ---------- Toasts and effects ----------

function showToast(message, { action, onAction, duration = 5000 } = {}) {
  const region = $("#toasts");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button type="button">${escapeHtml(action)}</button>` : ""}`;
  region.append(toast);
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    if (prefersReducedMotion) {
      toast.remove();
      return;
    }
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };
  toast.querySelector("button")?.addEventListener("click", () => {
    onAction?.();
    dismiss();
  });
  timer = setTimeout(dismiss, duration);
}

// Confetti-style burst of coloured coins from the middle of an element.
function burstFrom(element) {
  if (prefersReducedMotion || !element) return;
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const colors = ["#f97316", "#facc15", "#ec4899", "#22c55e", "#a855f7"];
  for (let i = 0; i < 26; i += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.background = colors[i % colors.length];
    document.body.append(particle);
    const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.4;
    const distance = 70 + Math.random() * 110;
    particle.animate(
      [
        { transform: "translate(-50%, -50%) scale(1) rotate(0)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance + 40}px)) scale(0.3) rotate(${Math.random() * 540}deg)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    ).onfinish = () => particle.remove();
  }
}

// Sliding highlight behind the checked option of a segmented control.
function syncSegmented(group) {
  if (!group) return;
  const checked = group.querySelector("input:checked")?.closest("label");
  const pill = group.querySelector(".segmented-pill");
  if (!checked || !pill) return;
  pill.style.width = `${checked.offsetWidth}px`;
  pill.style.transform = `translateX(${checked.offsetLeft}px)`;
}

// ---------- Add and edit sheet ----------

const sheet = $("#sheet");
const form = $("#transactionForm");

function currentType() {
  return form.elements.type.value;
}

function renderCategoryGrid(selectedId) {
  const type = currentType();
  const selected = selectedId && CATEGORIES[type].some((item) => item.id === selectedId) ? selectedId : CATEGORIES[type][0].id;
  $("#categoryGrid").innerHTML = CATEGORIES[type].map((item, index) => `
    <label class="category-option" style="--c:${item.color}; --i:${index}">
      <input type="radio" name="category" value="${item.id}" ${item.id === selected ? "checked" : ""} />
      <span class="category-emoji" aria-hidden="true">${item.emoji}</span>
      <span class="category-name">${escapeHtml(item.label)}</span>
    </label>`).join("");
  sheet.dataset.type = type;
  const verb = state.editingId ? "Save" : "Add";
  $("#submitBtn").textContent = state.editingId ? "Save changes" : `${verb} ${type === "income" ? "income" : "expense"}`;
}

// Opens the sheet empty, or filled in with an existing transaction to edit.
function openSheet(transaction = null) {
  form.reset();
  state.editingId = transaction ? transaction.id : null;
  $("#sheetTitle").textContent = transaction ? "Edit transaction" : "New transaction";
  $("#deleteFromSheet").hidden = !transaction;
  $("#formError").textContent = "";
  if (transaction) {
    form.elements.type.value = transaction.amount < 0 ? "expense" : "income";
    form.elements.amount.value = Math.abs(transaction.amount);
    form.elements.note.value = transaction.text === categoryById.get(transaction.category).label ? "" : transaction.text;
    form.elements.date.value = transaction.date;
  } else {
    form.elements.date.value = toDateValue(new Date());
  }
  renderCategoryGrid(transaction?.category);
  sheet.showModal();
  requestAnimationFrame(() => {
    syncSegmented(sheet.querySelector(".type-toggle"));
    form.elements.amount.focus();
  });
}

function closeSheet() {
  if (!sheet.open || sheet.classList.contains("is-closing")) return;
  if (prefersReducedMotion) {
    sheet.close();
    return;
  }
  sheet.classList.add("is-closing");
  const done = (event) => {
    if (event.target !== sheet) return;
    sheet.removeEventListener("animationend", done);
    sheet.classList.remove("is-closing");
    sheet.close();
  };
  sheet.addEventListener("animationend", done);
}

form.addEventListener("change", (event) => {
  if (event.target.name === "type") {
    renderCategoryGrid();
    syncSegmented(event.target.closest(".segmented"));
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(form.elements.amount.value);
  const date = form.elements.date.value;
  const category = form.elements.category.value;
  const type = currentType();
  const error = $("#formError");

  if (!(amount > 0)) {
    error.textContent = "Enter an amount above zero.";
    form.elements.amount.focus();
    return;
  }
  if (amount > 1e9) {
    error.textContent = "That amount is too large.";
    form.elements.amount.focus();
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    error.textContent = "Pick a date.";
    form.elements.date.focus();
    return;
  }

  const rounded = Math.round(amount * 100) / 100;
  const fields = {
    text: form.elements.note.value.trim() || categoryById.get(category).label,
    amount: type === "expense" ? -rounded : rounded,
    date,
    category,
  };
  const editingId = state.editingId;
  closeSheet();

  if (editingId) {
    updateTransaction(editingId, fields);
    showToast(`Saved changes to “${fields.text}”`);
    return;
  }

  addTransaction({ id: createId(), ...fields, sample: false });
  if (type === "income") burstFrom($(".balance-card"));
  showToast(`${type === "income" ? "Added" : "Logged"} ${money(rounded)} · ${categoryById.get(category).label}`);
});

$("#deleteFromSheet").addEventListener("click", () => {
  const id = state.editingId;
  closeSheet();
  if (id) removeTransaction(id);
});

sheet.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSheet();
});

sheet.addEventListener("click", (event) => {
  if (event.target === sheet || event.target.closest("[data-close-sheet]")) closeSheet();
});

// ---------- Budget form ----------

const budgetForm = $("#budgetForm");

$("#editBudget").addEventListener("click", () => {
  const opening = budgetForm.hidden;
  budgetForm.hidden = !opening;
  $("#editBudget").textContent = opening ? "Cancel" : state.budget ? "Edit" : "Set budget";
  if (opening) {
    $("#budgetInput").value = state.budget || "";
    $("#budgetInput").focus();
  }
});

budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = Math.round(Number($("#budgetInput").value));
  if (!(value > 0)) {
    $("#budgetInput").focus();
    return;
  }
  state.budget = value;
  writeStorage(STORAGE_KEYS.budget, value);
  // A budget the visitor chose themselves stays when samples are cleared.
  removeStorage(STORAGE_KEYS.sampleBudget);
  budgetForm.hidden = true;
  renderBudget();
  renderInsights();
  showToast(`Monthly budget set to ${money(value)}`);
});

budgetForm.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    budgetForm.hidden = true;
    renderBudget();
  }
});

// ---------- Theme ----------

function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  $("#themeToggle").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  document.querySelector('meta[name="theme-color"]').content = dark ? "#16111c" : "#fff7ef";
}

function toggleTheme(event) {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  const apply = () => {
    root.dataset.theme = next;
    try {
      // Stored as plain text: the script in <head> reads it before this file loads.
      localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch (error) {
      /* the theme still applies for this visit */
    }
    syncThemeButton();
    retheme();
  };
  if (!document.startViewTransition || prefersReducedMotion) {
    apply();
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.style.setProperty("--vt-r", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  root.classList.add("theme-transition");
  document.startViewTransition(apply).finished.finally(() => root.classList.remove("theme-transition"));
}

// ---------- Events ----------

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target.closest("[data-open-sheet]")) openSheet();
  else if (target.closest("[data-load-sample]")) loadSampleData();
  else if (target.closest("#clearSamples")) clearSamples();
  else if (target.closest("#clearCategory")) toggleCategoryFilter(state.categoryFilter);
  else if (target.closest("[data-delete]")) removeTransaction(target.closest("[data-delete]").dataset.delete);
  else if (target.closest("[data-edit]")) {
    const transaction = state.transactions.find((item) => item.id === target.closest("[data-edit]").dataset.edit);
    if (transaction) openSheet(transaction);
  } else if (target.closest(".legend-item")) toggleCategoryFilter(target.closest(".legend-item").dataset.category);
});

$("#categoryLegend").addEventListener("pointerover", (event) => {
  const item = event.target.closest(".legend-item");
  if (!item || !charts.category) return;
  const index = Number(item.dataset.index);
  charts.category.setActiveElements([{ datasetIndex: 0, index }]);
  charts.category.tooltip.setActiveElements([{ datasetIndex: 0, index }], { x: 0, y: 0 });
  charts.category.update();
});

$("#categoryLegend").addEventListener("pointerleave", () => {
  if (!charts.category) return;
  charts.category.setActiveElements([]);
  charts.category.tooltip.setActiveElements([], { x: 0, y: 0 });
  charts.category.update();
});

$("#prevMonth").addEventListener("click", () => changeMonth(addMonths(state.month, -1), -1));
$("#nextMonth").addEventListener("click", () => changeMonth(addMonths(state.month, 1), 1));
$("#monthLabel").addEventListener("click", () => {
  const now = startOfMonth(new Date());
  if (monthKey(now) !== monthKey(state.month)) changeMonth(now, now < state.month ? -1 : 1);
});

document.querySelectorAll('input[name="typeFilter"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.typeFilter = input.value;
    syncSegmented(input.closest(".segmented"));
    renderList();
  });
});

$("#search").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderList();
});

$("#themeToggle").addEventListener("click", toggleTheme);
$("#exportCsv").addEventListener("click", exportCsv);
$("#clearAll").addEventListener("click", clearAll);

document.addEventListener("keydown", (event) => {
  const typing = event.target.closest?.("input, textarea, select, [contenteditable]");
  if (typing || sheet.open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    openSheet();
  } else if (event.key === "ArrowLeft" && event.shiftKey) {
    changeMonth(addMonths(state.month, -1), -1);
  } else if (event.key === "ArrowRight" && event.shiftKey) {
    changeMonth(addMonths(state.month, 1), 1);
  }
});

window.addEventListener("resize", () => document.querySelectorAll(".segmented").forEach(syncSegmented));

// ---------- Start ----------

// First visit: fill the app with clearly labelled sample data so there's
// something to look at. Anyone who already has data (or cleared the samples
// before) is left alone.
if (readStorage(STORAGE_KEYS.started, false) !== true) {
  writeStorage(STORAGE_KEYS.started, true);
  if (!state.transactions.length) loadSampleData({ quiet: true });
}

Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
syncThemeButton();
renderAll();
document.querySelectorAll(".segmented").forEach(syncSegmented);
requestAnimationFrame(() => document.body.classList.add("is-ready"));
