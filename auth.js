const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // In a real application, you would validate against a database or API.
    if (username === 'admin' && password === 'password') {
      ipcRenderer.send('login-success');
    } else {
      errorMessage.textContent = 'Invalid username or password';
    }
  });
});