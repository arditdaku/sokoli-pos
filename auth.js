const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');

  // Simple mapping of PIN codes to worker names
  const workers = {
    '1234': 'Alice',
    '5678': 'Bob'
  };

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = document.getElementById('pin').value;

    const workerName = workers[pin];
    if (workerName) {
      ipcRenderer.send('login-success', workerName);
    } else {
      errorMessage.textContent = 'Invalid PIN';
    }
  });
});