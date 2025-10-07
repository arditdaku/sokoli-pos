// Expose IPC for printing and cash drawer to renderer
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  detectPrinter: () => ipcRenderer.invoke("detect-printer"),
  printInvoiceAndOpenDrawer: (printData) =>
    ipcRenderer.invoke("print-invoice-and-open-drawer", printData),
  logout: () => ipcRenderer.send('logout'),
});
