// Tests for lib.js. Run with `node --test` (Node 20 or newer, no install).

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addMonths,
  budgetStatus,
  buildInsights,
  daysInMonth,
  money,
  monthKey,
  monthTotals,
  normalizeTransaction,
  parseDate,
  sampleTransactions,
  spendingByCategory,
  startOfMonth,
  toDateValue,
} = require("../lib.js");

const tx = (date, amount, category, extra = {}) => ({ id: `${date}-${category}-${amount}`, text: category, amount, date, category, ...extra });

test("money: whole rupees have no decimals, paise keep two", () => {
  assert.equal(money(52000), "₹52,000");
  assert.equal(money(1234.5), "₹1,234.50");
  assert.equal(money(0), "₹0");
});

test("money: uses Indian digit grouping", () => {
  assert.equal(money(1250000), "₹12,50,000");
});

test("money: negative amounts get a real minus sign, and sign adds a plus", () => {
  assert.equal(money(-450), "−₹450");
  assert.equal(money(450, { sign: true }), "+₹450");
  assert.equal(money(-450, { sign: true }), "−₹450");
});

test("dates: parse and format in local time without shifting a day", () => {
  const date = parseDate("2026-03-01");
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 2);
  assert.equal(date.getDate(), 1);
  assert.equal(toDateValue(date), "2026-03-01");
  assert.equal(toDateValue(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("dates: month arithmetic crosses year boundaries and never overflows", () => {
  assert.equal(monthKey(addMonths(new Date(2026, 0, 15), -1)), "2025-12");
  assert.equal(monthKey(addMonths(new Date(2026, 11, 1), 1)), "2027-01");
  // 31 January plus one month is February, not 3 March.
  assert.equal(monthKey(addMonths(new Date(2026, 0, 31), 1)), "2026-02");
  assert.equal(toDateValue(startOfMonth(new Date(2026, 9, 6, 18))), "2026-10-01");
});

test("dates: days in month handles leap years", () => {
  assert.equal(daysInMonth(new Date(2026, 1, 1)), 28);
  assert.equal(daysInMonth(new Date(2028, 1, 1)), 29);
  assert.equal(daysInMonth(new Date(2026, 9, 1)), 31);
});

test("normalizeTransaction: upgrades first-version entries without a category", () => {
  const spend = normalizeTransaction({ id: 1, text: " Chai ", amount: -20, date: "2024-05-02" });
  assert.deepEqual(spend, { id: "1", text: "Chai", amount: -20, date: "2024-05-02", category: "other-expense", sample: false });
  assert.equal(normalizeTransaction({ id: 2, text: "Pay", amount: "500", date: "2024-05-02" }).category, "other-income");
});

test("normalizeTransaction: drops entries it can't use", () => {
  assert.equal(normalizeTransaction(null), null);
  assert.equal(normalizeTransaction({ amount: 0, date: "2026-01-01" }), null);
  assert.equal(normalizeTransaction({ amount: "abc", date: "2026-01-01" }), null);
  assert.equal(normalizeTransaction({ amount: 10, date: "01/02/2026" }), null);
  assert.equal(normalizeTransaction({ amount: 10 }), null);
});

test("normalizeTransaction: fixes mismatched categories and only trusts sample === true", () => {
  const wrongType = normalizeTransaction({ amount: 100, date: "2026-01-01", category: "food" });
  assert.equal(wrongType.category, "other-income");
  assert.equal(wrongType.text, "Other");
  assert.equal(normalizeTransaction({ amount: -1, date: "2026-01-01", sample: "yes" }).sample, false);
  assert.equal(normalizeTransaction({ amount: -1, date: "2026-01-01", sample: true }).sample, true);
});

test("monthTotals: counts only the chosen month", () => {
  const transactions = [
    tx("2026-09-30", -500, "food"),
    tx("2026-10-01", 40000, "salary"),
    tx("2026-10-02", -1200.5, "groceries"),
    tx("2026-10-31", -300, "transport"),
    tx("2026-11-01", -999, "fun"),
  ];
  assert.deepEqual(monthTotals(transactions, new Date(2026, 9, 1)), { income: 40000, expense: 1500.5, net: 38499.5 });
  assert.deepEqual(monthTotals([], new Date(2026, 9, 1)), { income: 0, expense: 0, net: 0 });
});

test("spendingByCategory: totals spending per category, biggest first, ignoring income", () => {
  const rows = spendingByCategory([
    tx("2026-10-01", 40000, "salary"),
    tx("2026-10-02", -200, "food"),
    tx("2026-10-03", -900, "groceries"),
    tx("2026-10-04", -300, "food"),
  ], new Date(2026, 9, 1));
  assert.deepEqual(rows.map((row) => [row.id, row.total]), [["groceries", 900], ["food", 500]]);
});

test("budgetStatus: no budget set", () => {
  const status = budgetStatus({ spent: 800, budget: 0, month: new Date(2026, 9, 1), today: new Date(2026, 9, 6) });
  assert.equal(status.level, "none");
  assert.equal(status.percent, null);
  assert.equal(status.detail, "You've spent ₹800 in October.");
});

test("budgetStatus: turns amber from the 75% people see, red when over", () => {
  const month = new Date(2026, 8, 1);
  const today = new Date(2026, 9, 6);
  assert.equal(budgetStatus({ spent: 7440, budget: 10000, month, today }).level, "ok");
  // 74.6% shows as 75%, so it's already a warning.
  assert.equal(budgetStatus({ spent: 7460, budget: 10000, month, today }).level, "warn");
  const over = budgetStatus({ spent: 12500, budget: 10000, month, today });
  assert.equal(over.level, "over");
  assert.equal(over.headline, "₹2,500 over budget");
  assert.equal(over.ringValue, 100);
});

test("budgetStatus: in the current month, shows days left and a daily allowance", () => {
  // 6 October: 26 days to go, including today.
  const status = budgetStatus({ spent: 4000, budget: 30000, month: new Date(2026, 9, 1), today: new Date(2026, 9, 6) });
  assert.equal(status.headline, "₹26,000 left");
  assert.equal(status.detail, "26 days to go · about ₹1,000 a day");
});

test("budgetStatus: a future month has nothing spent yet", () => {
  const status = budgetStatus({ spent: 0, budget: 30000, month: new Date(2026, 10, 1), today: new Date(2026, 9, 6) });
  assert.equal(status.headline, "₹30,000 to spend in November");
  assert.equal(status.detail, "Nothing spent yet.");
});

test("insights: compares a category with the same point last month", () => {
  const items = buildInsights({
    transactions: [
      tx("2026-09-05", -1000, "food"),
      tx("2026-09-25", -5000, "food"), // after 20 September, so not counted yet
      tx("2026-10-03", -1400, "food"),
    ],
    month: new Date(2026, 9, 1),
    today: new Date(2026, 9, 20),
    budget: 0,
  });
  assert.ok(items.some((item) => item.text === "You spent 40% more on Food & dining than by this point last month (₹1,400 vs ₹1,000)."));
});

test("insights: compares whole months once a month is over", () => {
  const items = buildInsights({
    transactions: [tx("2026-08-05", -2000, "groceries"), tx("2026-09-05", -1000, "groceries")],
    month: new Date(2026, 8, 1),
    today: new Date(2026, 9, 20),
    budget: 0,
  });
  assert.ok(items.some((item) => item.text === "You spent 50% less on Groceries than in August."));
});

test("insights: projects the month, counting rent once", () => {
  const [pace] = buildInsights({
    transactions: [tx("2026-10-01", -15000, "rent"), tx("2026-10-05", -1000, "food")],
    month: new Date(2026, 9, 1),
    today: new Date(2026, 9, 10),
    budget: 20000,
  });
  // 15,000 + (1,000 / 10 days) × 31 days = 18,100
  assert.equal(pace.icon, "pace");
  assert.equal(pace.text, "At this pace you'll spend about ₹18,100 in October, ₹1,900 under your budget.");
});

test("insights: nothing for a future month, and never more than three", () => {
  const transactions = sampleTransactions(new Date(2026, 9, 25));
  assert.deepEqual(buildInsights({ transactions, month: new Date(2026, 10, 1), today: new Date(2026, 9, 25), budget: 30000 }), []);
  assert.ok(buildInsights({ transactions, month: new Date(2026, 9, 1), today: new Date(2026, 9, 25), budget: 30000 }).length <= 3);
});

test("sampleTransactions: four months up to today, all marked as samples", () => {
  const today = new Date(2026, 9, 6, 12);
  const samples = sampleTransactions(today);
  assert.ok(samples.length > 40);
  assert.ok(samples.every((item) => item.sample === true));
  assert.ok(samples.every((item) => item.date <= toDateValue(today)));
  assert.deepEqual([...new Set(samples.map((item) => item.date.slice(0, 7)))].sort(), ["2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.ok(samples.every((item) => normalizeTransaction(item) !== null));
});

test("sampleTransactions: the same day gives the same data", () => {
  const strip = (items) => items.map(({ id, ...rest }) => rest);
  const today = new Date(2026, 9, 6);
  assert.deepEqual(strip(sampleTransactions(today)), strip(sampleTransactions(today)));
});
