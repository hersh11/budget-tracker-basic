// Elements
const balance = document.getElementById("balance");
const money_plus = document.getElementById("money-plus");
const money_minus = document.getElementById("money-minus");
const list = document.getElementById("list");
const emptyList = document.getElementById("empty-list");
const form = document.getElementById("form");
const formError = document.getElementById("form-error");
const text = document.getElementById("text");
const amount = document.getElementById("amount");
const date = document.getElementById("date");
const filterDate = document.getElementById("filter-date");
const spendingChartCanvas = document.getElementById('spendingChart');

// Declare spendingChart variable at the top
let spendingChart;

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// Retrieve transactions from local storage, or start empty if there are none
// or the stored value can't be read
function loadTransactions() {
  try {
    const stored = JSON.parse(localStorage.getItem('transactions'));
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

let transactions = loadTransactions();

// Add transaction
function addTransaction(type) {
  const value = Number(amount.value);

  if (text.value.trim() === '' || amount.value.trim() === '' || date.value.trim() === '') {
    formError.textContent = 'Please add a description, amount and date.';
    return;
  }

  if (!(value > 0)) {
    formError.textContent = 'The amount must be more than zero.';
    return;
  }

  formError.textContent = '';

  const transaction = {
    id: generateID(),
    text: text.value.trim(),
    amount: type === 'income' ? value : -value,
    date: date.value
  };

  transactions.push(transaction);

  init();
  updateLocalStorage();

  text.value = '';
  amount.value = '';
  date.value = '';
}

// Generate random ID
function generateID() {
  return Math.floor(Math.random() * 1000000000);
}

// Add transaction to DOM list. Built with DOM methods rather than innerHTML so
// that whatever the user typed is shown as text, never parsed as HTML.
function addTransactionDOM(transaction) {
  const sign = transaction.amount < 0 ? '-' : '+';
  const item = document.createElement("li");
  item.classList.add(transaction.amount < 0 ? "minus" : "plus");

  const label = document.createElement("span");
  label.className = "transaction-text";
  label.textContent = transaction.text;

  const dateLabel = document.createElement("span");
  dateLabel.className = "transaction-date";
  dateLabel.textContent = transaction.date;
  label.append(dateLabel);

  const value = document.createElement("span");
  value.textContent = `${sign}${currency.format(Math.abs(transaction.amount))}`;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-btn";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `Delete ${transaction.text}`);
  deleteButton.addEventListener("click", () => removeTransaction(transaction.id));

  item.append(deleteButton, label, value);
  list.appendChild(item);
}

// Show the list's empty message when there's nothing to list
function updateEmptyState(count) {
  emptyList.hidden = count > 0;
}

// Update the balance, income, and expense
function updateValues() {
  const amounts = transactions.map(transaction => transaction.amount);
  const total = amounts.reduce((acc, item) => (acc += item), 0);
  const income = amounts.filter(item => item > 0).reduce((acc, item) => (acc += item), 0);
  const expense = amounts.filter(item => item < 0).reduce((acc, item) => (acc += item), 0) * -1;

  balance.innerText = currency.format(total);
  money_plus.innerText = `+${currency.format(income)}`;
  money_minus.innerText = `-${currency.format(expense)}`;
}

// Remove transaction by ID
function removeTransaction(id) {
  transactions = transactions.filter(transaction => transaction.id !== id);
  updateLocalStorage();
  init();
}

// Update local storage transactions
function updateLocalStorage() {
  try {
    localStorage.setItem('transactions', JSON.stringify(transactions));
  } catch (error) {
    // Storage is full or blocked; the transactions stay on screen for this visit.
  }
}

// Filter transactions by date
function filterTransactions() {
  const filterDateValue = filterDate.value;
  if (filterDateValue) {
    const filteredTransactions = transactions.filter(transaction => transaction.date === filterDateValue);
    list.innerHTML = '';
    filteredTransactions.forEach(addTransactionDOM);
    emptyList.textContent = 'No transactions on this date.';
    updateEmptyState(filteredTransactions.length);
  }
}

// Clear date filter
function clearFilter() {
  filterDate.value = '';
  init();
}

// Initialize app
function init() {
  list.innerHTML = '';
  transactions.forEach(addTransactionDOM);
  emptyList.textContent = 'No transactions yet. Add one below.';
  updateEmptyState(transactions.length);
  updateValues();
  updateSpendingChart();
}

init();

form.addEventListener('submit', (e) => e.preventDefault());

// Chart.js: Generate spending chart
function updateSpendingChart() {
  const monthlyExpenses = new Array(12).fill(0);
  const monthlyIncome = new Array(12).fill(0);

  transactions.forEach(transaction => {
    const month = new Date(transaction.date).getMonth();
    if (transaction.amount < 0) {
      monthlyExpenses[month] += Math.abs(transaction.amount);
    } else {
      monthlyIncome[month] += transaction.amount;
    }
  });

  const data = {
    labels: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ],
    datasets: [
      {
        label: 'Expenses',
        data: monthlyExpenses,
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1
      },
      {
        label: 'Income',
        data: monthlyIncome,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      }
    ]
  };

  if (spendingChart) {
    spendingChart.destroy();
  }

  spendingChart = new Chart(spendingChartCanvas, {
    type: 'bar',
    data: data,
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}
