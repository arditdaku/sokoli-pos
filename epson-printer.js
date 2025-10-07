// Epson printer and cash drawer integration for Electron main process
const { ipcMain } = require("electron");
const escpos = require("escpos");

// Set the adapter for your printer (USB, Serial, Network)
// Example for USB:
let device;
let printer;

// Function to detect and initialize printer
function detectPrinter() {
  try {
    device = new escpos.USB();
    printer = new escpos.Printer(device);
    return { success: true, message: "Printer detected successfully" };
  } catch (e) {
    device = null;
    printer = null;
    return { success: false, message: "Printer not found. Please check connection." };
  }
}

// Initial printer detection
const initialDetection = detectPrinter();

// ESC/POS command to open cash drawer
const OPEN_DRAWER_CMD = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

// Handler to detect printer status
ipcMain.handle("detect-printer", async () => {
  return detectPrinter();
});

ipcMain.handle("print-invoice-and-open-drawer", async (event, printData) => {
  if (!printer || !device) {
    return { success: false, error: "Printer not found" };
  }
  return new Promise((resolve) => {
    device.open((err) => {
      if (err) {
        resolve({ success: false, error: "Failed to open printer: " + err.message });
        return;
      }
      
      try {
        // Print the invoice text
        printer
          .align("ct")
          .text(printData.header)
          .text(printData.customer)
          .text(printData.items)
          .text(printData.summary)
          .text(printData.footer)
          .cut();
        
        // Open the cash drawer after printing
        device.write(OPEN_DRAWER_CMD);
        
        printer.close(() => {
          resolve({ success: true, message: "Printed successfully and cash drawer opened" });
        });
      } catch (error) {
        resolve({ success: false, error: "Print error: " + error.message });
      }
    });
  });
});
