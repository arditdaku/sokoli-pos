// Epson printer and cash drawer integration for Electron main process
const { ipcMain } = require("electron");
const escpos = require("escpos");

// Set the adapter for your printer (USB, Serial, Network)
// Example for USB:
let device;
try {
  device = new escpos.USB();
} catch (e) {
  device = null;
}
const printer = device ? new escpos.Printer(device) : null;

// ESC/POS command to open cash drawer
const OPEN_DRAWER_CMD = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

ipcMain.handle("print-invoice-and-open-drawer", async (event, printData) => {
  if (!printer || !device) {
    return { success: false, error: "Printer not found" };
  }
  return new Promise((resolve) => {
    device.open(() => {
      // Print the invoice text
      printer
        .align("ct")
        .text(printData.header)
        .text(printData.customer)
        .text(printData.items)
        .text(printData.summary)
        .text(printData.footer)
        .cut();
      // Open the cash drawer
      device.write(OPEN_DRAWER_CMD);
      printer.close(() => {
        resolve({ success: true });
      });
    });
  });
});
