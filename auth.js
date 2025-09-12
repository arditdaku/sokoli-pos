const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = document.getElementById('pin').value;
    const workers = JSON.parse(localStorage.getItem('workers') || '[]');
    const worker = workers.find((w) => w.pin === pin);

    if (worker) {
      localStorage.setItem('currentWorker', worker.name);
      ipcRenderer.send('login-success');
    } else {
      errorMessage.textContent = 'Invalid PIN';
    }
  });
});
