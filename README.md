# Budget Buddy

**Live demo: [budget-buddy-hersh.vercel.app](https://budget-buddy-hersh.vercel.app)**

Budget Buddy is a friendly income and expense tracker that runs entirely in the browser. Log what you earn and spend by category, set a monthly budget, and see where your money goes, month by month.

It's plain HTML, CSS and JavaScript with Chart.js for the charts. There's no framework, no build step and no server.

## Features

- **Balance that rolls.** The total balance animates digit by digit, like an odometer, whenever it changes. Underneath are this month's income, spending and savings.
- **Monthly budget.** Set a budget once and a ring shows how much of it you've used, turning amber at 75% and red when you go over, with what's left per day for the rest of the month.
- **Where it went.** A donut chart and ranked list of this month's spending by category. Click a category to filter the transaction list by it.
- **Last six months.** Income against spending for the six months up to the one you're viewing. Click a month to jump to it.
- **Transactions.** Grouped by day with daily totals, searchable, and filterable by income or expense. Delete has an undo.
- **Quick add.** A sheet with an expense/income toggle, a big amount field, emoji categories, an optional note and the date. Adding income sets off a small confetti burst.
- **Months.** Step through months with the arrows (or Shift + ← / →). Click the month name to come back to today.
- **Sample data.** A "try it with sample data" button fills four months of example transactions, so there's something to look at straight away.
- **Light and dark mode.** Follows your system setting, remembers your choice, and switches with a circular reveal.
- **Export.** Download every transaction as CSV.
- Works on phones (the add form becomes a bottom sheet), keyboard accessible, and respects reduced motion.

Keyboard: press **N** to add a transaction.

## Tech

- HTML, CSS and JavaScript, no dependencies to install
- Chart.js 4.5.1, included in the repo so the app works offline
- Bricolage Grotesque (variable font), self-hosted
- Animations use CSS, the Web Animations API and the View Transitions API; no animation library

## Run locally

No installation is required.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

You can also open `index.html` directly.

## Data

Transactions are saved in the browser's `localStorage` under `transactions`, as `{ id, text, amount, date, category }`. Income is positive and spending is negative. Data saved by the first version of the app (which had no categories) still loads; those entries go into "Other".

The monthly budget and theme are saved as `budget-buddy.budget` and `budget-buddy.theme`.

## Files

```
index.html        the app
style.css         layout, themes and animations
script.js         data, rendering, charts and interactions
chart.umd.min.js  Chart.js
fonts/            Bricolage Grotesque and its licence
favicon.svg       site icon
404.html          not-found page
robots.txt        crawler rules
llms.txt          summary for AI assistants
```

## Deployment

It's a static site with no backend, build command or environment variables. The live site is the `budget-buddy` project on Vercel, which redeploys on every push to `main`. Netlify or GitHub Pages would work just as well.

## Privacy

The app makes no requests to other sites and sets no cookies. Transactions stay in the visitor's own browser, so it doesn't need a cookie banner.

## Limitations

- Data is stored per browser and device; there's no account or sync
- One currency (Indian rupees)
- No automated tests
