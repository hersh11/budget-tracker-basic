document.addEventListener('DOMContentLoaded', () => {
    let transactions = [];
    try {
      const stored = JSON.parse(localStorage.getItem('transactions'));
      transactions = Array.isArray(stored) ? stored : [];
    } catch (error) {
      // Unreadable storage: show an empty chart instead of failing.
    }
  
    const spendingChartCanvas = document.getElementById('spendingChart');
  
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
  
    new Chart(spendingChartCanvas, {
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
  });
  