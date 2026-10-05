// Budget Buddy
//
// Transactions live in localStorage under "transactions", the same key and
// shape the first version used ({ id, text, amount, date }), now with a
// category. Income is stored as a positive amount and spending as negative.

const STORAGE_KEYS = {
  transactions: "transactions",
  budget: "budget-buddy.budget",
  theme: "budget-buddy.theme",
};

const CATEGORIES = {
  expense: [
    { id: "food", label: "Food & dining", emoji: "🍔", color: "#f97316" },
    { id: "groceries", label: "Groceries", emoji: "🛒", color: "#22c55e" },
    { id: "transport", label: "Transport", emoji: "🚕", color: "#eab308" },
    { id: "rent", label: "Rent", emoji: "🏠", color: "#8b5cf6" },
    { id: "bills", label: "Bills", emoji: "💡", color: "#06b6d4" },
    { id: "shopping", label: "Shopping", emoji: "🛍️", color: "#ec4899" },
    { id: "health", label: "Health", emoji: "💊", color: "#ef4444" },
    { id: "fun", label: "Fun", emoji: "🎬", color: "#a855f7" },
    { id: "travel", label: "Travel", emoji: "✈️", color: "#0ea5e9" },
    { id: "education", label: "Education", emoji: "📚", color: "#14b8a6" },
    { id: "other-expense", label: "Other", emoji: "📦", color: "#94a3b8" },
  ],
  income: [
    { id: "salary", label: "Salary", emoji: "💼", color: "#16a34a" },
    { id: "freelance", label: "Freelance", emoji: "💻", color: "#0d9488" },
    { id: "gift", label: "Gift", emoji: "🎁", color: "#db2777" },
    { id: "refund", label: "Refund", emoji: "↩️", color: "#2563eb" },
    { id: "interest", label: "Interest", emoji: "🏦", color: "#ca8a04" },
    { id: "other-income", label: "Other", emoji: "💰", color: "#64748b" },
  ],
};
const categoryById = new Map([...CATEGORIES.expense, ...CATEGORIES.income].map((category) => [category.id, category]));

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (selector) => document.querySelector(selector);

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

function createId() {
  return window.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Accepts anything the old or new version saved and drops what can't be used.
function normalizeTransaction(raw) {
  const amount = Number(raw?.amount);
  const date = typeof raw?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
  if (!Number.isFinite(amount) || amount === 0 || !date) return null;
  const type = amount < 0 ? "expense" : "income";
  const category = categoryById.has(raw.category) && CATEGORIES[type].some((item) => item.id === raw.category)
    ? raw.category
    : type === "expense" ? "other-expense" : "other-income";
  return {
    id: String(raw.id ?? createId()),
    text: String(raw.text ?? "").trim() || categoryById.get(category).label,
    amount,
    date,
    category,
  };
}

function loadTransactions() {
  const stored = readStorage(STORAGE_KEYS.transactions, []);
  return Array.isArray(stored) ? stored.map(normalizeTransaction).filter(Boolean) : [];
}

function saveTransactions() {
  writeStorage(STORAGE_KEYS.transactions, state.transactions);
}

// ---------- Dates and money ----------

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

const formatMonth = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const formatShortMonth = new Intl.DateTimeFormat("en-IN", { month: "short" });
const formatDay = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });

function money(value, { sign = false } = {}) {
  const absolute = Math.abs(value);
  const text = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: absolute % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(absolute);
  if (sign) return `${value < 0 ? "−" : "+"}${text}`;
  return value < 0 ? `−${text}` : text;
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
};

const charts = {};

function inMonth(transaction, month = state.month) {
  return transaction.date.slice(0, 7) === monthKey(month);
}

function monthTotals(month) {
  let income = 0;
  let expense = 0;
  state.transactions.forEach((transaction) => {
    if (!inMonth(transaction, month)) return;
    if (transaction.amount > 0) income += transaction.amount;
    else expense -= transaction.amount;
  });
  return { income, expense, net: income - expense };
}

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

  const totals = monthTotals(state.month);
  $("#monthIncome").textContent = money(totals.income);
  $("#monthExpense").textContent = money(totals.expense);
  $("#monthNet").textContent = money(totals.net, { sign: totals.net !== 0 });
  $(".stat.net").classList.toggle("is-negative", totals.net < 0);
}

function renderBudget() {
  const { expense } = monthTotals(state.month);
  const ring = $("#budgetRing");
  const card = $(".budget-card");
  const monthName = formatMonth.format(state.month).split(" ")[0];
  $("#editBudget").textContent = state.budget ? "Edit" : "Set budget";

  if (!state.budget) {
    card.dataset.level = "none";
    ring.style.setProperty("--value", 0);
    $("#budgetPercent").textContent = "–";
    $("#budgetPercentLabel").textContent = "no budget";
    $("#budgetHeadline").textContent = "Set a monthly budget to see how much you have left.";
    $("#budgetDetail").textContent = expense ? `You've spent ${money(expense)} in ${monthName}.` : "";
    return;
  }

  const percent = (expense / state.budget) * 100;
  const shown = Math.round(percent);
  const remaining = state.budget - expense;
  card.dataset.level = remaining < 0 ? "over" : shown >= 75 ? "warn" : "ok";
  ring.style.setProperty("--value", Math.min(percent, 100));
  $("#budgetPercent").textContent = `${shown}%`;
  $("#budgetPercentLabel").textContent = "spent";

  const today = new Date();
  const current = monthKey(state.month) === monthKey(today);
  const future = state.month > today;
  if (remaining < 0) {
    $("#budgetHeadline").textContent = `${money(-remaining)} over budget`;
  } else {
    $("#budgetHeadline").textContent = future ? `${money(state.budget)} to spend in ${monthName}` : `${money(remaining)} left`;
  }

  if (current) {
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - today.getDate() + 1;
    $("#budgetDetail").textContent = remaining > 0
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} to go · about ${money(Math.floor(remaining / daysLeft))} a day`
      : `${daysLeft} day${daysLeft === 1 ? "" : "s"} still to go this month`;
  } else if (future) {
    $("#budgetDetail").textContent = "Nothing spent yet.";
  } else {
    $("#budgetDetail").textContent = `Spent ${money(expense)} of ${money(state.budget)} in ${monthName}.`;
  }
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

function spendingByCategory() {
  const totals = new Map();
  state.transactions.forEach((transaction) => {
    if (transaction.amount >= 0 || !inMonth(transaction)) return;
    totals.set(transaction.category, (totals.get(transaction.category) || 0) - transaction.amount);
  });
  return [...totals.entries()]
    .map(([id, total]) => ({ ...categoryById.get(id), total }))
    .sort((a, b) => b.total - a.total);
}

function renderCategories() {
  const rows = spendingByCategory();
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
  const totals = months.map(monthTotals);
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
            const isNew = transaction.id === state.newId;
            return `
              <li class="tx${isNew ? " is-new" : ""}" data-id="${escapeHtml(transaction.id)}" style="--i:${Math.min(index++, 12)}">
                <span class="tx-icon" style="--c:${item.color}" aria-hidden="true">${item.emoji}</span>
                <span class="tx-main">
                  <strong>${escapeHtml(transaction.text)}</strong>
                  <span>${escapeHtml(item.label)}</span>
                </span>
                <span class="tx-amount ${type}">${money(transaction.amount, { sign: true })}</span>
                <button type="button" class="tx-delete" data-delete="${escapeHtml(transaction.id)}" aria-label="Delete ${escapeHtml(transaction.text)}, ${money(transaction.amount, { sign: true })}">
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
  renderBalance();
  renderBudget();
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

function addTransaction(transaction) {
  state.transactions.push(transaction);
  saveTransactions();
  state.newId = transaction.id;
  const month = startOfMonth(parseDate(transaction.date));
  if (monthKey(month) !== monthKey(state.month)) {
    changeMonth(month, month < state.month ? -1 : 1);
    state.newId = null;
  } else {
    renderAll();
  }
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

// A small, seeded mix of the last four months so the numbers look lived in.
function sampleTransactions() {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = (items) => items[Math.floor(random() * items.length)];
  const today = new Date();
  const transactions = [];
  const add = (date, amount, category, text) => {
    if (date > today) return;
    transactions.push({ id: createId(), text, amount, date: toDateValue(date), category });
  };

  for (let back = 3; back >= 0; back -= 1) {
    const month = addMonths(today, -back);
    const day = (d) => new Date(month.getFullYear(), month.getMonth(), d);
    add(day(1), 55000, "salary", "Monthly salary");
    add(day(1), -15000, "rent", "Rent");
    add(day(5), -1899, "bills", pick(["Electricity bill", "Phone and internet", "Gas bill"]));
    if (random() > 0.4) add(day(12 + Math.floor(random() * 10)), 6000 + Math.round(random() * 9000 / 100) * 100, "freelance", pick(["Logo design", "Website fix", "Tutoring"]));
    for (let week = 0; week < 4; week += 1) {
      add(day(3 + week * 7), -(900 + Math.round(random() * 1400)), "groceries", pick(["Weekly groceries", "Vegetables and fruit", "Supermarket run"]));
      add(day(4 + week * 7 + Math.floor(random() * 3)), -(180 + Math.round(random() * 700)), "food", pick(["Lunch with friends", "Coffee", "Pizza night", "Biryani", "Street food"]));
      add(day(2 + week * 7 + Math.floor(random() * 4)), -(60 + Math.round(random() * 340)), "transport", pick(["Metro card top-up", "Auto ride", "Cab home", "Fuel"]));
    }
    add(day(9 + Math.floor(random() * 15)), -(499 + Math.round(random() * 1200)), "fun", pick(["Movie tickets", "Concert", "Streaming subscription", "Bowling"]));
    add(day(10 + Math.floor(random() * 15)), -(800 + Math.round(random() * 3200)), "shopping", pick(["New shoes", "T-shirts", "Headphones", "Books and stationery"]));
    if (random() > 0.6) add(day(15 + Math.floor(random() * 10)), -(300 + Math.round(random() * 900)), "health", pick(["Pharmacy", "Doctor visit"]));
  }
  return transactions;
}

function loadSampleData() {
  state.transactions = sampleTransactions();
  if (!state.budget) {
    state.budget = 25000;
    writeStorage(STORAGE_KEYS.budget, state.budget);
  }
  saveTransactions();
  state.month = startOfMonth(new Date());
  renderAll();
  burstFrom($(".balance-card"));
  showToast("Sample data loaded. Clear it any time from the bottom of the list.");
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

// ---------- Add transaction sheet ----------

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
  $("#submitBtn").textContent = type === "income" ? "Add income" : "Add expense";
}

function openSheet() {
  form.reset();
  form.elements.date.value = toDateValue(new Date());
  $("#formError").textContent = "";
  renderCategoryGrid();
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
  const transaction = {
    id: createId(),
    text: form.elements.note.value.trim() || categoryById.get(category).label,
    amount: type === "expense" ? -rounded : rounded,
    date,
    category,
  };
  closeSheet();
  addTransaction(transaction);
  if (type === "income") burstFrom($(".balance-card"));
  showToast(`${type === "income" ? "Added" : "Logged"} ${money(rounded)} · ${categoryById.get(category).label}`);
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
  budgetForm.hidden = true;
  renderBudget();
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
  else if (target.closest("#clearCategory")) toggleCategoryFilter(state.categoryFilter);
  else if (target.closest("[data-delete]")) removeTransaction(target.closest("[data-delete]").dataset.delete);
  else if (target.closest(".legend-item")) toggleCategoryFilter(target.closest(".legend-item").dataset.category);
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

Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
syncThemeButton();
renderAll();
document.querySelectorAll(".segmented").forEach(syncSegmented);
requestAnimationFrame(() => document.body.classList.add("is-ready"));
