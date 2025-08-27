// Expose IPC for printing and cash drawer to renderer
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  printInvoiceAndOpenDrawer: (printData) =>
    ipcRenderer.invoke("print-invoice-and-open-drawer", printData),
  logout: () => ipcRenderer.send('logout'),
});
