# Budget Buddy

Budget Buddy is a browser-based budget tracker for recording income and expenses. It stores transactions in `localStorage` and uses Chart.js to show monthly income and expense totals.

## Features

- Add income and expense transactions, with inline validation
- Transaction history saved in the browser
- Remove transactions (the delete button shows on hover or keyboard focus, and is always visible on touch screens)
- Filter transactions by date
- Monthly income and expense chart, also available on its own page
- Amounts formatted as Indian rupees (₹1,23,456.00)

## Tech stack

- HTML5
- CSS3
- JavaScript
- Chart.js 4.5.1, included in the repo

## Run locally

No installation is required.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

You can also open `index.html` directly, although a local server is cleaner for browser testing.

## Files

```
index.html        the tracker
chart.html        the monthly chart on its own page
script.js         transactions, totals, filter and chart
chart-script.js   chart for chart.html
style.css         styles for both pages
chart.umd.min.js  Chart.js, so the app works offline
favicon.svg       site icon
404.html          not-found page
robots.txt        crawler rules
llms.txt          summary for AI assistants
```

## Deployment

It's a static site with no backend, build command or environment variables, so GitHub Pages, Netlify and Vercel all work.

GitHub Pages currently serves the `gh-pages` branch. To publish changes from `main`:

```bash
git push origin main:gh-pages
```

## Privacy

The app makes no requests to other sites and sets no cookies. Transactions stay in the visitor's own browser, so it doesn't need a cookie banner.

## Limitations

- Data is stored per browser and device
- No authentication or cloud sync
- The chart groups by calendar month, so the same month in different years is added together
- No automated tests
