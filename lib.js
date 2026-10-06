// Budget Buddy's logic: categories, dates, money, totals, budget status,
// insights and sample data. Nothing here touches the page, so the same file
// runs in the browser (as window.BudgetLib) and in the tests under Node.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BudgetLib = factory();
})(typeof self !== "undefined" ? self : this, function () {
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

  // Spending that lands once a month rather than accumulating day by day.
  const FIXED_CATEGORIES = new Set(["rent", "bills"]);

  // ---------- Ids, dates and money ----------

  function createId() {
    const crypto = globalThis.crypto;
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

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

  function daysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  const monthName = (date) => date.toLocaleDateString("en-IN", { month: "long" });

  // ₹1,234.50 and ₹52,000 (no decimals for whole rupees). A real minus sign,
  // and an explicit + when `sign` is set.
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

  const roundTo100 = (value) => Math.round(value / 100) * 100;

  // ---------- Transactions ----------

  // Accepts anything the old or new version saved and drops what can't be used.
  // Entries from the first version have no category; they become "Other".
  function normalizeTransaction(raw) {
    const amount = Number(raw && raw.amount);
    const date = raw && typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
    if (!Number.isFinite(amount) || amount === 0 || !date) return null;
    const type = amount < 0 ? "expense" : "income";
    const category = CATEGORIES[type].some((item) => item.id === raw.category)
      ? raw.category
      : type === "expense" ? "other-expense" : "other-income";
    return {
      id: String(raw.id ?? createId()),
      text: String(raw.text ?? "").trim() || categoryById.get(category).label,
      amount,
      date,
      category,
      sample: raw.sample === true,
    };
  }

  const isInMonth = (transaction, month) => transaction.date.slice(0, 7) === monthKey(month);
  const dayOf = (transaction) => Number(transaction.date.slice(8, 10));

  function monthTotals(transactions, month) {
    let income = 0;
    let expense = 0;
    transactions.forEach((transaction) => {
      if (!isInMonth(transaction, month)) return;
      if (transaction.amount > 0) income += transaction.amount;
      else expense -= transaction.amount;
    });
    return { income, expense, net: income - expense };
  }

  // Spending per category for a month, optionally only up to a day of the month.
  function categoryTotals(transactions, month, upToDay) {
    const totals = new Map();
    transactions.forEach((transaction) => {
      if (transaction.amount >= 0 || !isInMonth(transaction, month)) return;
      if (upToDay && dayOf(transaction) > upToDay) return;
      totals.set(transaction.category, (totals.get(transaction.category) || 0) - transaction.amount);
    });
    return totals;
  }

  function spendingByCategory(transactions, month) {
    return [...categoryTotals(transactions, month).entries()]
      .map(([id, total]) => ({ ...categoryById.get(id), total }))
      .sort((a, b) => b.total - a.total);
  }

  // ---------- Budget ----------

  function budgetStatus({ spent, budget, month, today }) {
    const name = monthName(month);
    if (!budget) {
      return {
        level: "none",
        percent: null,
        ringValue: 0,
        headline: "Set a monthly budget to see how much you have left.",
        detail: spent ? `You've spent ${money(spent)} in ${name}.` : "",
      };
    }

    const exact = (spent / budget) * 100;
    const percent = Math.round(exact);
    const remaining = budget - spent;
    const isCurrent = monthKey(month) === monthKey(today);
    const isFuture = startOfMonth(month) > today;

    let headline = `${money(remaining)} left`;
    if (remaining < 0) headline = `${money(-remaining)} over budget`;
    else if (isFuture) headline = `${money(budget)} to spend in ${name}`;

    let detail = `Spent ${money(spent)} of ${money(budget)} in ${name}.`;
    if (isFuture) {
      detail = "Nothing spent yet.";
    } else if (isCurrent) {
      const daysLeft = daysInMonth(today) - today.getDate() + 1;
      const days = `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
      detail = remaining > 0
        ? `${days} to go · about ${money(Math.floor(remaining / daysLeft))} a day`
        : `${days} still to go this month`;
    }

    return {
      // The colour follows the rounded number people see, so "75%" is never green.
      level: remaining < 0 ? "over" : percent >= 75 ? "warn" : "ok",
      percent,
      ringValue: Math.min(exact, 100),
      headline,
      detail,
    };
  }

  // ---------- Insights ----------

  // Up to three plain-language observations about a month. In the current
  // month, comparisons with last month only count days up to today, so a
  // half-finished month isn't compared with a whole one.
  function buildInsights({ transactions, month, today, budget }) {
    const items = [];
    if (startOfMonth(month) > today) return items;

    const isCurrent = monthKey(month) === monthKey(today);
    const previous = addMonths(month, -1);
    const upToDay = isCurrent ? today.getDate() : null;
    const thisMonth = categoryTotals(transactions, month, upToDay);
    const lastMonth = categoryTotals(transactions, previous, upToDay ? Math.min(upToDay, daysInMonth(previous)) : null);
    const name = monthName(month);
    const compared = isCurrent ? "by this point last month" : `in ${monthName(previous)}`;
    const when = isCurrent ? "this month" : `in ${name}`;

    // Where the month is heading. Rent and bills are counted once; everyday
    // spending is projected from the daily rate so far.
    if (isCurrent && budget && today.getDate() >= 4) {
      let fixed = 0;
      let everyday = 0;
      thisMonth.forEach((amount, id) => {
        if (FIXED_CATEGORIES.has(id)) fixed += amount;
        else everyday += amount;
      });
      const projected = fixed + (everyday / today.getDate()) * daysInMonth(month);
      const gap = budget - projected;
      items.push({
        tone: gap < 0 ? "warn" : "good",
        icon: "pace",
        text: `At this pace you'll spend about ${money(roundTo100(projected))} in ${name}, ${money(roundTo100(Math.abs(gap)))} ${gap < 0 ? "over" : "under"} your budget.`,
      });
    }

    // The biggest swing in a category, in each direction.
    const changes = [...new Set([...thisMonth.keys(), ...lastMonth.keys()])]
      .map((id) => {
        const now = thisMonth.get(id) || 0;
        const before = lastMonth.get(id) || 0;
        return { id, now, before, change: before ? ((now - before) / before) * 100 : null };
      })
      .filter((item) => item.before >= 500 && item.change !== null && Math.abs(item.now - item.before) >= 300);
    const rise = changes.filter((item) => item.change >= 20).sort((a, b) => b.change - a.change)[0];
    const fall = changes.filter((item) => item.change <= -20).sort((a, b) => a.change - b.change)[0];

    if (rise) {
      items.push({
        tone: "warn",
        icon: "up",
        text: `You spent ${Math.round(rise.change)}% more on ${categoryById.get(rise.id).label} than ${compared} (${money(rise.now)} vs ${money(rise.before)}).`,
      });
    }
    if (fall) {
      items.push({
        tone: "good",
        icon: "down",
        text: `You spent ${Math.round(-fall.change)}% less on ${categoryById.get(fall.id).label} than ${compared}.`,
      });
    }

    const totals = monthTotals(transactions, month);
    if (totals.income > 0) {
      if (totals.net >= 0) {
        items.push({
          tone: "good",
          icon: "save",
          text: `${isCurrent ? "So far you've kept" : "You kept"} ${Math.round((totals.net / totals.income) * 100)}% of your income ${when} (${money(totals.net)}).`,
        });
      } else {
        items.push({ tone: "warn", icon: "save", text: `You've spent ${money(-totals.net)} more than you earned ${when}.` });
      }
    }

    // Rent is nearly always the biggest line, so look at everyday spending.
    const everyday = spendingByCategory(transactions, month).filter((row) => !FIXED_CATEGORIES.has(row.id));
    const everydayTotal = everyday.reduce((sum, row) => sum + row.total, 0);
    if (everyday.length > 1) {
      items.push({
        tone: "info",
        icon: "top",
        text: `${everyday[0].label} is your biggest everyday expense ${when}: ${money(everyday[0].total)}, or ${Math.round((everyday[0].total / everydayTotal) * 100)}% of spending outside rent and bills.`,
      });
    }

    return items.slice(0, 3);
  }

  // ---------- Sample data ----------

  // Four months of example transactions ending today, marked as samples so
  // they can be cleared without touching the visitor's own entries. Seeded,
  // so the same day always gives the same data.
  function sampleTransactions(today = new Date(), seed = 7) {
    let state = seed;
    const random = () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
    const pick = (items) => items[Math.floor(random() * items.length)];
    const transactions = [];
    const add = (date, amount, category, text) => {
      if (date > today) return;
      transactions.push({ id: createId(), text, amount, date: toDateValue(date), category, sample: true });
    };

    for (let back = 3; back >= 0; back -= 1) {
      const month = addMonths(today, -back);
      const day = (d) => new Date(month.getFullYear(), month.getMonth(), d);
      add(day(1), 55000, "salary", "Monthly salary");
      add(day(1), -15000, "rent", "Rent");
      add(day(5), -1899, "bills", pick(["Electricity bill", "Phone and internet", "Gas bill"]));
      if (random() > 0.4) add(day(12 + Math.floor(random() * 10)), 6000 + Math.round((random() * 9000) / 100) * 100, "freelance", pick(["Logo design", "Website fix", "Tutoring"]));
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

  return {
    CATEGORIES,
    categoryById,
    createId,
    parseDate,
    toDateValue,
    monthKey,
    startOfMonth,
    addMonths,
    daysInMonth,
    money,
    normalizeTransaction,
    monthTotals,
    spendingByCategory,
    budgetStatus,
    buildInsights,
    sampleTransactions,
  };
});
