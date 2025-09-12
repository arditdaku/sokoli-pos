// POS System JavaScript

class POSSystem {
  constructor() {
    this.orderItems = [];
    this.selectedPaymentMethod = "cash";
    this.taxRate = 0.0825; // 8.25%

    this.initializeEventListeners();
    this.updateDateTime();
    this.showServices("haircut");

    // Update time every second
    setInterval(() => this.updateDateTime(), 1000);
  }

  initializeEventListeners() {
    // Service category buttons
    document.querySelectorAll(".category-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.selectCategory(e.target.dataset.category);
      });
    });

    // Service items
    document.querySelectorAll(".service-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        this.addServiceToOrder(e.currentTarget);
      });
    });

    // Payment method buttons
    document.querySelectorAll(".payment-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.selectPaymentMethod(e.target.dataset.method);
      });
    });

    // Action buttons
    document.getElementById("clearOrder").addEventListener("click", () => {
      this.clearOrder();
    });

    document.getElementById("processPayment").addEventListener("click", () => {
      this.showPaymentModal();
    });

    document.getElementById('logout').addEventListener('click', () => {
      window.electronAPI.logout();
    });

    document.getElementById('selectAppointment').addEventListener('click', () => {
      this.showAppointmentsModal();
    });

    // Modal buttons
    document.getElementById("cancelPayment").addEventListener("click", () => {
      this.hidePaymentModal();
    });

    document.getElementById("confirmPayment").addEventListener("click", () => {
      this.processPayment();
    });

    document.getElementById("amountReceived").addEventListener("input", (e) => {
      this.calculateChange();
    });

    document.getElementById("printReceipt").addEventListener("click", () => {
      this.printReceipt();
    });

    document.getElementById("newTransaction").addEventListener("click", () => {
      this.newTransaction();
    });

    document.getElementById("cancelSelectAppointment").addEventListener("click", () => {
      this.hideAppointmentsModal();
    });

    // Close modals when clicking outside
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("show");
        }
      });
    });
  }

  updateDateTime() {
    const now = new Date();
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    document.getElementById("dateTime").textContent = now.toLocaleDateString(
      "en-US",
      options
    );
  }

  selectCategory(category) {
    // Update active button
    document.querySelectorAll(".category-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document
      .querySelector(`[data-category="${category}"]`)
      .classList.add("active");

    // Show/hide services
    this.showServices(category);
  }

  showServices(category) {
    document.querySelectorAll(".service-item").forEach((item) => {
      if (item.dataset.category === category) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
      }
    });
  }

  addServiceToOrder(serviceElement) {
    const serviceName = serviceElement.dataset.name;
    const servicePrice = parseFloat(serviceElement.dataset.price);

    // Check if service already exists in order
    const existingItem = this.orderItems.find(
      (item) => item.name === serviceName
    );
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      this.orderItems.push({
        name: serviceName,
        price: servicePrice,
        quantity: 1,
      });
    }

    this.updateOrderDisplay();
    this.updateOrderSummary();
  }

  removeItemFromOrder(index) {
    this.orderItems.splice(index, 1);
    this.updateOrderDisplay();
    this.updateOrderSummary();
  }

  updateOrderDisplay() {
    const orderItemsContainer = document.getElementById("orderItems");

    if (this.orderItems.length === 0) {
      orderItemsContainer.innerHTML =
        '<div class="empty-order">No items added</div>';
      return;
    }

    orderItemsContainer.innerHTML = this.orderItems
      .map(
        (item, index) => `
      <div class="order-item">
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          ${item.quantity > 1 ? `<div class="item-quantity">Qty: ${item.quantity}</div>` : ""}
        </div>
        <div class="item-price">${(item.price * item.quantity).toFixed(2)}</div>
        <button class="remove-item" onclick="pos.removeItemFromOrder(${index})">×</button>
      </div>
    `
      )
      .join("");
  }

  updateOrderSummary() {
    const subtotal = this.orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const tax = subtotal * this.taxRate;
    const total = subtotal + tax;

    document.getElementById("subtotal").textContent = `${subtotal.toFixed(2)}`;
    document.getElementById("tax").textContent = `${tax.toFixed(2)}`;
    document.getElementById("total").textContent = `${total.toFixed(2)}`;
  }

  selectPaymentMethod(method) {
    this.selectedPaymentMethod = method;

    // Update button states
    document.querySelectorAll(".payment-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });
    document
      .querySelector(`[data-method="${method}"]`)
      .classList.add("selected");
  }

  clearOrder() {
    this.orderItems = [];
    this.updateOrderDisplay();
    this.updateOrderSummary();

    // Clear customer info
    document.getElementById("customerName").value = "";
    document.getElementById("customerPhone").value = "";
  }

  showPaymentModal() {
    if (this.orderItems.length === 0) {
      alert("Please add items to the order first.");
      return;
    }

    const total = this.getTotal();
    document.getElementById("modalTotal").textContent = `${total.toFixed(2)}`;

    const paymentMethods = {
      cash: "💵 Cash",
      card: "💳 Card",
      digital: "📱 Digital",
    };
    document.getElementById("modalPaymentMethod").textContent =
      paymentMethods[this.selectedPaymentMethod];

    // Show/hide cash payment section
    const cashPayment = document.getElementById("cashPayment");
    if (this.selectedPaymentMethod === "cash") {
      cashPayment.style.display = "block";
      document.getElementById("amountReceived").value = "";
      document.getElementById("change").textContent = "$0.00";
    } else {
      cashPayment.style.display = "none";
    }

    document.getElementById("paymentModal").classList.add("show");
  }

  hidePaymentModal() {
    document.getElementById("paymentModal").classList.remove("show");
  }

  async showAppointmentsModal() {
    const appointmentsModal = document.getElementById("appointmentsModal");
    appointmentsModal.classList.add("show");
    await this.fetchAppointments();
  }

  hideAppointmentsModal() {
    const appointmentsModal = document.getElementById("appointmentsModal");
    appointmentsModal.classList.remove("show");
  }

  async fetchAppointments() {
    const appointmentsList = document.getElementById("appointmentsList");
    appointmentsList.innerHTML = "<p>Loading appointments...</p>";

    try {
      const accessToken = sessionStorage.getItem("accessToken");
      const response = await fetch("http://localhost:3000/appointments", {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch appointments");
      }

      const appointments = await response.json();
      this.displayAppointments(appointments);
    } catch (error) {
      appointmentsList.innerHTML = `<p>Error: ${error.message}</p>`;
      console.error("Error fetching appointments:", error);
    }
  }

  displayAppointments(appointments) {
    const appointmentsList = document.getElementById("appointmentsList");
    appointmentsList.innerHTML = "";

    if (appointments.length === 0) {
      appointmentsList.innerHTML = "<p>No appointments found.</p>";
      return;
    }

    appointments.forEach(appointment => {
      const appointmentElement = document.createElement("div");
      appointmentElement.classList.add("appointment-item");
      appointmentElement.innerHTML = `
        <div class="appointment-info">
          <p><strong>Customer:</strong> ${appointment.customer.name}</p>
          <p><strong>Date:</strong> ${new Date(appointment.date).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${appointment.startTime} - ${appointment.endTime}</p>
        </div>
        <button class="btn btn-primary select-appointment-btn" data-appointment-id="${appointment.id}">Select</button>
      `;
      appointmentsList.appendChild(appointmentElement);
    });

    document.querySelectorAll(".select-appointment-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const appointmentId = e.target.dataset.appointmentId;
        this.selectAppointment(appointmentId);
      });
    });
  }

  async selectAppointment(appointmentId) {
    try {
      const accessToken = sessionStorage.getItem("accessToken");
      const response = await fetch(`http://localhost:3000/appointments/${appointmentId}`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch appointment details");
      }

      const appointment = await response.json();
      this.clearOrder();

      document.getElementById("customerName").value = appointment.customer.name;
      document.getElementById("customerPhone").value = appointment.customer.phone;

      appointment.services.forEach(service => {
        this.addServiceToOrder({
          dataset: {
            name: service.name,
            price: service.price
          }
        });
      });

      this.hideAppointmentsModal();
    } catch (error) {
      console.error("Error selecting appointment:", error);
      alert("Error selecting appointment. Please try again.");
    }
  }

  calculateChange() {
    const total = this.getTotal();
    const amountReceived =
      parseFloat(document.getElementById("amountReceived").value) || 0;
    const change = amountReceived - total;

    document.getElementById("change").textContent =
      `${Math.max(0, change).toFixed(2)}`;
  }

  processPayment() {
    const total = this.getTotal();
    let canProcess = false;
    let change = 0;

    if (this.selectedPaymentMethod === "cash") {
      const amountReceived =
        parseFloat(document.getElementById("amountReceived").value) || 0;
      if (amountReceived >= total) {
        change = amountReceived - total;
        canProcess = true;
      } else {
        alert("Insufficient amount received.");
        return;
      }
    } else {
      canProcess = true;
    }

    if (canProcess) {
      this.hidePaymentModal();
      this.showReceipt(change);
    }
  }

  showReceipt(change = 0) {
    const customerName =
      document.getElementById("customerName").value || "Walk-in Customer";
    const customerPhone =
      document.getElementById("customerPhone").value || "N/A";
    const subtotal = this.getSubtotal();
    const tax = this.getTax();
    const total = this.getTotal();

    // Populate receipt
    document.getElementById("receiptDate").textContent =
      new Date().toLocaleDateString();
    document.getElementById("receiptCustomer").textContent = customerName;
    document.getElementById("receiptPhone").textContent = customerPhone;

    const receiptItems = document.getElementById("receiptItems");
    receiptItems.innerHTML = this.orderItems
      .map(
        (item) => `
      <div class="receipt-item">
        <span>${item.name} ${item.quantity > 1 ? `x${item.quantity}` : ""}</span>
        <span>${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `
      )
      .join("");

    document.getElementById("receiptSubtotal").textContent =
      `${subtotal.toFixed(2)}`;
    document.getElementById("receiptTax").textContent = `${tax.toFixed(2)}`;
    document.getElementById("receiptTotal").textContent =
      `${total.toFixed(2)}`;

    const paymentMethods = {
      cash: "Cash",
      card: "Card",
      digital: "Digital",
    };
    document.getElementById("receiptPayment").textContent =
      paymentMethods[this.selectedPaymentMethod];

    const changeLine = document.querySelector(".change-line");
    if (this.selectedPaymentMethod === "cash" && change > 0) {
      document.getElementById("receiptChange").textContent =
        `${change.toFixed(2)}`;
      changeLine.classList.add("show");
    } else {
      changeLine.classList.remove("show");
    }

    document.getElementById("receiptModal").classList.add("show");
  }

  async printReceipt() {
    // Prepare plain text for ESC/POS printer
    const header = "Hair Salon\n123 Beauty Street\nPhone: (555) 123-4567\n";
    const date = `Date: ${new Date().toLocaleDateString()}\n`;
    const customer = `Customer: ${document.getElementById("customerName").value || "Walk-in Customer"}\nPhone: ${document.getElementById("customerPhone").value || "N/A"}\n`;
    const items =
      this.orderItems
        .map(
          (item) =>
            `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}    ${(item.price * item.quantity).toFixed(2)}`
        )
        .join("\n") + "\n";
    const summary = `Subtotal: ${this.getSubtotal().toFixed(2)}\nTax: ${this.getTax().toFixed(2)}\nTotal: ${this.getTotal().toFixed(2)}\nPayment: ${this.selectedPaymentMethod.charAt(0).toUpperCase() + this.selectedPaymentMethod.slice(1)}\n`;
    const change = document.getElementById("receiptChange")?.textContent || "";
    const footer =
      (change ? `Change: ${change}\n` : "") +
      "\nThank you for your visit!\nPlease come again\n";

    // Try to use Electron IPC for Epson printer
    if (window.electronAPI && window.electronAPI.printInvoiceAndOpenDrawer) {
      try {
        const result = await window.electronAPI.printInvoiceAndOpenDrawer({
          header: header + date,
          customer,
          items,
          summary,
          footer,
        });
        if (result && result.success) {
          alert("Printed to Epson printer and opened cash drawer.");
          return;
        } else {
          alert("Printer error: " + (result?.error || "Unknown error"));
        }
      } catch (e) {
        alert("Printer error: " + e.message);
      }
    }

    // Fallback: browser print
    const receiptContent = document.getElementById("receipt").innerHTML;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body { font-family: 'Courier New', monospace; margin: 20px; }
            .receipt { max-width: 300px; }
            .receipt-item { display: flex; justify-content: space-between; }
            .receipt-header { text-align: center; border-bottom: 1px dashed #ccc; padding-bottom: 10px; margin-bottom: 10px; }
            .receipt-total { border-top: 1px dashed #ccc; padding-top: 10px; }
            .receipt-footer { text-align: center; font-style: italic; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="receipt">${receiptContent}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  }

  newTransaction() {
    document.getElementById("receiptModal").classList.remove("show");
    this.clearOrder();

    // Reset payment method to cash
    this.selectPaymentMethod("cash");

    // Reset to haircut category
    this.selectCategory("haircut");
  }

  getSubtotal() {
    return this.orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }

  getTax() {
    return this.getSubtotal() * this.taxRate;
  }

  getTotal() {
    return this.getSubtotal() + this.getTax();
  }
}

// Initialize POS system when page loads
let pos;
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const cashier = params.get("worker") || "Admin";
  const cashierEl = document.querySelector(".cashier");
  if (cashierEl) {
    cashierEl.textContent = `Cashier: ${cashier}`;
  }
  pos = new POSSystem();
});

// Make functions available globally for onclick handlers
window.pos = pos;
