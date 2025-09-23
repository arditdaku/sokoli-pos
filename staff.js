document.addEventListener('DOMContentLoaded', () => {
  const workerForm = document.getElementById('workerForm');
  const workerList = document.getElementById('workerList');

  const loadWorkers = () => JSON.parse(localStorage.getItem('workers') || '[]');
  const saveWorkers = (workers) => localStorage.setItem('workers', JSON.stringify(workers));

  const renderWorkers = () => {
    const workers = loadWorkers();
    workerList.innerHTML = workers
      .map((w) => `<li>${w.name} - ${'*'.repeat(w.pin.length)}</li>`) 
      .join('');
  };

  workerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('workerName').value.trim();
    const pin = document.getElementById('workerPin').value.trim();
    if (!name || !pin) return;

    const workers = loadWorkers();
    if (workers.some((w) => w.pin === pin)) {
      alert('PIN already in use');
      return;
    }

    workers.push({ name, pin });
    saveWorkers(workers);
    workerForm.reset();
    renderWorkers();
  });

  renderWorkers();
});
