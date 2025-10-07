// POS System JavaScript

class POSSystem {
  constructor() {
    this.orderItems = [];
    this.selectedPaymentMethod = "cash";
    this.taxRate = 0.0825; // 8.25%

    this.apiBaseUrl = "http://localhost:3000";
    this.appointmentNotificationsPath = "/appointments/notifications";

    const globalConfig =
      (typeof window !== "undefined" && window.__POS_CONFIG__) ||
      (typeof window !== "undefined" && window.posConfig) ||
      null;

    if (globalConfig && typeof globalConfig.apiBaseUrl === "string") {
      this.apiBaseUrl = globalConfig.apiBaseUrl;
    }
    if (
      globalConfig &&
      typeof globalConfig.appointmentNotificationsPath === "string"
    ) {
      this.appointmentNotificationsPath = globalConfig.appointmentNotificationsPath;
    }

    this.notifications = [];
    this.maxNotifications = 25;
    this.notificationToastsContainer = null;
    this.notificationToggle = null;
    this.notificationDropdown = null;
    this.notificationList = null;
    this.notificationCountBadge = null;

    this.appointmentSocket = null;
    this.notificationReconnectTimeout = null;
    this.appointmentsModalOpen = false;
    this.cachedAppointments = [];
    this.pendingAppointmentsRefresh = null;
    this.isFetchingAppointments = false;
    this.appointmentsFetchCount = 0;
    this.isShuttingDown = false;

    this.initializeNotificationSystem();
    this.initializeEventListeners();
    this.updateDateTime();
    this.showServices("haircut");

    // Update time every second
    setInterval(() => this.updateDateTime(), 1000);

    this.initializeAppointmentWebSocket();

    window.addEventListener("beforeunload", () => {
      this.isShuttingDown = true;
      this.teardownAppointmentSocket();
    });
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

  initializeNotificationSystem() {
    this.notificationToggle = document.getElementById("notificationsToggle");
    this.notificationDropdown = document.getElementById("notificationsDropdown");
    this.notificationList = document.getElementById("notificationsList");
    this.notificationCountBadge = document.getElementById("notificationCount");
    this.notificationToastsContainer = document.getElementById("notificationToasts");

    this.renderNotificationList();
    this.updateNotificationCount();

    if (this.notificationToggle) {
      this.notificationToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleNotificationsDropdown();
      });
    }

    if (this.notificationDropdown) {
      this.notificationDropdown.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    }

    document.addEventListener("click", (event) => {
      if (!this.notificationDropdown || !this.notificationToggle) {
        return;
      }

      const toggleClicked = this.notificationToggle.contains(event.target);
      const dropdownClicked = this.notificationDropdown.contains(event.target);

      if (!toggleClicked && !dropdownClicked) {
        this.hideNotificationsDropdown();
      }
    });
  }

  toggleNotificationsDropdown() {
    if (!this.notificationDropdown) {
      return;
    }

    if (this.notificationDropdown.classList.contains("show")) {
      this.hideNotificationsDropdown();
    } else {
      this.showNotificationsDropdown();
    }
  }

  showNotificationsDropdown() {
    if (!this.notificationDropdown) {
      return;
    }

    this.notificationDropdown.classList.add("show");
    if (this.notificationToggle) {
      this.notificationToggle.setAttribute("aria-expanded", "true");
    }
    this.markAllNotificationsAsRead();
  }

  hideNotificationsDropdown() {
    if (!this.notificationDropdown) {
      return;
    }

    this.notificationDropdown.classList.remove("show");
    if (this.notificationToggle) {
      this.notificationToggle.setAttribute("aria-expanded", "false");
    }
  }

  markAllNotificationsAsRead() {
    let updated = false;
    this.notifications.forEach((notification) => {
      if (!notification.read) {
        notification.read = true;
        updated = true;
      }
    });

    if (updated) {
      this.updateNotificationCount();
      this.renderNotificationList();
    }
  }

  updateNotificationCount() {
    if (!this.notificationCountBadge) {
      return;
    }

    const unreadCount = this.notifications.filter((notification) => !notification.read)
      .length;

    if (unreadCount > 0) {
      this.notificationCountBadge.textContent =
        unreadCount > 99 ? "99+" : unreadCount.toString();
      this.notificationCountBadge.classList.remove("hidden");
    } else {
      this.notificationCountBadge.textContent = "0";
      this.notificationCountBadge.classList.add("hidden");
    }
  }

  renderNotificationList() {
    if (!this.notificationList) {
      return;
    }

    if (!this.notifications.length) {
      this.notificationList.innerHTML =
        '<p class="notifications-empty">No notifications yet.</p>';
      return;
    }

    this.notificationList.innerHTML = "";
    this.notifications.forEach((notification) => {
      const item = document.createElement("div");
      item.classList.add("notification-item");
      if (!notification.read) {
        item.classList.add("unread");
      }

      const messageEl = document.createElement("div");
      messageEl.classList.add("notification-message");
      messageEl.textContent = notification.message;

      const metaEl = document.createElement("div");
      metaEl.classList.add("notification-meta");
      metaEl.textContent = this.formatNotificationTimestamp(notification.receivedAt);

      item.appendChild(messageEl);
      item.appendChild(metaEl);

      this.notificationList.appendChild(item);
    });
  }

  formatNotificationTimestamp(timestamp) {
    if (!timestamp) {
      return "";
    }

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    const timeString = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (sameDay) {
      return `Today • ${timeString}`;
    }

    return `${date.toLocaleDateString()} • ${timeString}`;
  }

  addNotification(notification) {
    if (!notification || !notification.message) {
      return;
    }

    const record = {
      id: notification.id || Date.now(),
      message: notification.message,
      receivedAt: notification.receivedAt ? new Date(notification.receivedAt) : new Date(),
      read: Boolean(notification.read),
      data: notification.data || null,
      type: notification.type || null,
    };

    this.notifications.unshift(record);

    if (this.notifications.length > this.maxNotifications) {
      this.notifications.length = this.maxNotifications;
    }

    this.updateNotificationCount();
    this.renderNotificationList();
    this.showNotificationToast(record);
  }

  showNotificationToast(notification) {
    if (!this.notificationToastsContainer || !notification.message) {
      return;
    }

    while (this.notificationToastsContainer.childElementCount >= 3) {
      this.notificationToastsContainer.removeChild(
        this.notificationToastsContainer.firstElementChild
      );
    }

    const toast = document.createElement("div");
    toast.classList.add("notification-toast");
    toast.textContent = notification.message;
    this.notificationToastsContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    const hideToast = () => {
      toast.classList.remove("show");
      toast.classList.add("hide");
      setTimeout(() => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      }, 350);
    };

    const duration =
      typeof notification.duration === "number" ? notification.duration : 5000;
    const timeoutId = setTimeout(hideToast, duration);

    toast.addEventListener("click", () => {
      clearTimeout(timeoutId);
      hideToast();
    });
  }

  initializeAppointmentWebSocket() {
    if (typeof window.WebSocket === "undefined") {
      console.warn("WebSocket is not supported in this environment.");
      return;
    }

    if (this.notificationReconnectTimeout) {
      clearTimeout(this.notificationReconnectTimeout);
      this.notificationReconnectTimeout = null;
    }

    const wsUrl = this.buildAppointmentsWebSocketURL();
    if (!wsUrl) {
      return;
    }

    if (this.appointmentSocket) {
      try {
        this.appointmentSocket.close();
      } catch (error) {
        console.error("Error closing existing appointment socket:", error);
      }
      this.appointmentSocket = null;
    }

    let socket;
    try {
      socket = new WebSocket(wsUrl);
    } catch (error) {
      console.error("Failed to connect to appointment notifications:", error);
      this.scheduleWebSocketReconnect();
      return;
    }

    this.appointmentSocket = socket;

    socket.addEventListener("open", () => {
      console.info("Connected to appointment notifications.");
    });

    socket.addEventListener("message", (event) => {
      this.handleAppointmentNotification(event.data);
    });

    socket.addEventListener("error", (error) => {
      console.error("Appointment notification socket error:", error);
    });

    socket.addEventListener("close", () => {
      this.appointmentSocket = null;
      if (!this.isShuttingDown) {
        this.scheduleWebSocketReconnect();
      }
    });
  }

  scheduleWebSocketReconnect() {
    if (this.isShuttingDown) {
      return;
    }

    if (this.notificationReconnectTimeout) {
      clearTimeout(this.notificationReconnectTimeout);
    }

    this.notificationReconnectTimeout = setTimeout(() => {
      this.initializeAppointmentWebSocket();
    }, 5000);
  }

  teardownAppointmentSocket() {
    if (this.notificationReconnectTimeout) {
      clearTimeout(this.notificationReconnectTimeout);
      this.notificationReconnectTimeout = null;
    }

    if (this.appointmentSocket) {
      try {
        this.appointmentSocket.close();
      } catch (error) {
        console.error("Error closing appointment socket:", error);
      }
      this.appointmentSocket = null;
    }
  }

  buildAppointmentsWebSocketURL() {
    if (!this.apiBaseUrl) {
      return null;
    }

    let wsBase;
    try {
      const httpUrl = new URL(this.apiBaseUrl);
      const protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
      let path = httpUrl.pathname || "";
      if (path !== "/") {
        path = path.replace(/\/$/, "");
      } else {
        path = "";
      }

      const endpoint = this.appointmentNotificationsPath || "/appointments/notifications";
      wsBase = `${protocol}//${httpUrl.host}${path}${
        endpoint.startsWith("/") ? endpoint : `/${endpoint}`
      }`;
    } catch (error) {
      console.error("Invalid API base URL for WebSocket:", error);
      return null;
    }

    try {
      const url = new URL(wsBase);
      const accessToken = sessionStorage.getItem("accessToken");
      if (accessToken) {
        url.searchParams.set("token", accessToken);
      }
      return url.toString();
    } catch (error) {
      console.error("Failed to construct appointment WebSocket URL:", error);
      return null;
    }
  }

  normalizeAppointmentNotificationType(type) {
    if (type === null || typeof type === "undefined") {
      return "created";
    }

    const normalized = type.toString().toLowerCase();

    if (normalized.includes("cancel")) {
      return "cancelled";
    }
    if (normalized.includes("update") || normalized.includes("resched") || normalized.includes("change")) {
      return "updated";
    }
    if (normalized.includes("complete") || normalized.includes("done")) {
      return "completed";
    }
    if (normalized.includes("remind")) {
      return "reminder";
    }
    if (normalized.includes("check-in") || normalized.includes("checkin")) {
      return "checkin";
    }
    if (normalized.includes("no-show") || normalized.includes("noshow")) {
      return "no-show";
    }
    if (normalized.includes("create") || normalized.includes("new") || normalized.includes("add")) {
      return "created";
    }

    return normalized || "created";
  }

  buildAppointmentNotificationMessage(type, appointment) {
    const normalizedType = this.normalizeAppointmentNotificationType(type);
    const descriptors = {
      created: "New appointment scheduled",
      updated: "Appointment updated",
      cancelled: "Appointment cancelled",
      completed: "Appointment completed",
      reminder: "Appointment reminder",
      checkin: "Appointment check-in",
      "no-show": "Appointment marked as no-show",
    };

    const prefix = descriptors[normalizedType] || "Appointment update";

    if (!appointment || typeof appointment !== "object") {
      return `${prefix}.`;
    }

    const customerName =
      appointment.customer && appointment.customer.name
        ? appointment.customer.name
        : "a customer";

    const details = [];

    if (appointment.date) {
      const appointmentDate = new Date(appointment.date);
      if (!Number.isNaN(appointmentDate.getTime())) {
        details.push(appointmentDate.toLocaleDateString());
      }
    }

    if (appointment.startTime && appointment.endTime) {
      details.push(`${appointment.startTime} - ${appointment.endTime}`);
    } else if (appointment.startTime) {
      details.push(appointment.startTime);
    }

    let message = `${prefix} for ${customerName}`;
    if (details.length) {
      message += ` (${details.join(" • ")})`;
    }
    message += ".";

    if (Array.isArray(appointment.services) && appointment.services.length > 0) {
      const serviceNames = appointment.services
        .map((service) => service?.name || service?.title || service)
        .filter(Boolean);

      if (serviceNames.length) {
        message += ` Services: ${serviceNames.join(", ")}.`;
      }
    }

    return message;
  }

  updateCachedAppointments(appointment, eventType) {
    if (!appointment || typeof appointment !== "object") {
      return;
    }

    if (!Array.isArray(this.cachedAppointments)) {
      this.cachedAppointments = [];
    }

    const normalizedType = this.normalizeAppointmentNotificationType(eventType);
    const appointmentId =
      appointment.id ?? appointment._id ?? appointment.appointmentId ?? null;

    if (appointmentId !== null) {
      const existingIndex = this.cachedAppointments.findIndex((item) => {
        const existingId = item.id ?? item._id ?? item.appointmentId ?? null;
        return existingId === appointmentId;
      });

      if (normalizedType === "cancelled") {
        if (existingIndex !== -1) {
          this.cachedAppointments.splice(existingIndex, 1);
        }
        return;
      }

      if (existingIndex !== -1) {
        this.cachedAppointments[existingIndex] = appointment;
      } else {
        this.cachedAppointments.unshift(appointment);
      }
    } else if (normalizedType !== "cancelled") {
      this.cachedAppointments.unshift(appointment);
    }
  }

  handleAppointmentNotification(rawMessage) {
    if (!rawMessage) {
      return;
    }

    let payload = null;
    let messageText = "";

    if (typeof rawMessage === "string") {
      try {
        payload = JSON.parse(rawMessage);
      } catch (error) {
        messageText = rawMessage;
      }
    } else if (typeof rawMessage === "object") {
      payload = rawMessage;
    }

    let appointment = null;
    let type = null;

    if (payload && typeof payload === "object") {
      messageText = payload.message || messageText;
      type =
        payload.type ||
        payload.event ||
        payload.eventType ||
        payload.action ||
        payload.status ||
        null;

      appointment =
        payload.appointment ||
        payload.data ||
        payload.payload ||
        (payload.details && payload.details.appointment) ||
        null;

      if (!appointment && payload.id && payload.customer) {
        appointment = payload;
      }
    }

    if (messageText && typeof messageText !== "string") {
      try {
        messageText = JSON.stringify(messageText);
      } catch (error) {
        messageText = String(messageText);
      }
    }

    const normalizedType = this.normalizeAppointmentNotificationType(type);

    if (appointment) {
      this.updateCachedAppointments(appointment, normalizedType);
      if (this.appointmentsModalOpen) {
        this.displayAppointments(this.cachedAppointments.slice());
      }
    }

    const message =
      (typeof messageText === "string" && messageText.trim().length > 0
        ? messageText
        : "") ||
      this.buildAppointmentNotificationMessage(normalizedType, appointment) ||
      "Appointment update received.";

    this.addNotification({
      message,
      type: normalizedType,
      data: { appointment, raw: payload || rawMessage },
      read: false,
    });

    if (this.appointmentsModalOpen) {
      if (!this.pendingAppointmentsRefresh) {
        this.pendingAppointmentsRefresh = this.fetchAppointments({ showLoading: false })
          .catch((error) => {
            console.error(
              "Error refreshing appointments after notification:",
              error
            );
          })
          .finally(() => {
            this.pendingAppointmentsRefresh = null;
          });
      }
    }
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
    if (appointmentsModal) {
      appointmentsModal.classList.add("show");
    }
    this.appointmentsModalOpen = true;
    await this.fetchAppointments({ showLoading: true, force: true });
  }

  hideAppointmentsModal() {
    const appointmentsModal = document.getElementById("appointmentsModal");
    if (appointmentsModal) {
      appointmentsModal.classList.remove("show");
    }
    this.appointmentsModalOpen = false;
  }

  async fetchAppointments(options = {}) {
    const { showLoading = true, force = false } = options;

    if (this.appointmentsFetchCount > 0 && !force) {
      return;
    }

    const appointmentsList = document.getElementById("appointmentsList");
    if (appointmentsList && showLoading) {
      appointmentsList.innerHTML = "<p>Loading appointments...</p>";
    }

    this.appointmentsFetchCount += 1;
    this.isFetchingAppointments = true;

    try {
      const accessToken = sessionStorage.getItem("accessToken");
      const response = await fetch(`${this.apiBaseUrl}/appointments`, {
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
      if (appointmentsList && showLoading) {
        appointmentsList.innerHTML = `<p>Error: ${error.message}</p>`;
      }
      console.error("Error fetching appointments:", error);
    } finally {
      this.appointmentsFetchCount = Math.max(0, this.appointmentsFetchCount - 1);
      this.isFetchingAppointments = this.appointmentsFetchCount > 0;
    }
  }

  displayAppointments(appointments) {
    this.cachedAppointments = Array.isArray(appointments)
      ? appointments.slice()
      : [];

    const appointmentsList = document.getElementById("appointmentsList");
    if (!appointmentsList) {
      return;
    }

    appointmentsList.innerHTML = "";

    if (!this.cachedAppointments.length) {
      appointmentsList.innerHTML = "<p>No appointments found.</p>";
      return;
    }

    this.cachedAppointments.forEach(appointment => {
      const customerName = appointment?.customer?.name || "Unknown";
      const appointmentDate = appointment?.date
        ? new Date(appointment.date).toLocaleDateString()
        : "N/A";
      const startTime = appointment?.startTime || "";
      const endTime = appointment?.endTime || "";
      const timeDisplay = startTime && endTime
        ? `${startTime} - ${endTime}`
        : startTime || endTime || "N/A";
      const appointmentElement = document.createElement("div");
      const appointmentId =
        appointment?.id ?? appointment?._id ?? appointment?.appointmentId ?? "";
      appointmentElement.classList.add("appointment-item");
      appointmentElement.innerHTML = `
        <div class="appointment-info">
          <p><strong>Customer:</strong> ${customerName}</p>
          <p><strong>Date:</strong> ${appointmentDate}</p>
          <p><strong>Time:</strong> ${timeDisplay}</p>
        </div>
        <button class="btn btn-primary select-appointment-btn" data-appointment-id="${appointmentId}">Select</button>
      `;
      appointmentsList.appendChild(appointmentElement);
    });

    appointmentsList.querySelectorAll(".select-appointment-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const appointmentId = e.currentTarget.dataset.appointmentId;
        this.selectAppointment(appointmentId);
      });
    });
  }

  async selectAppointment(appointmentId) {
    if (!appointmentId) {
      console.warn("Attempted to select appointment without an identifier.");
      return;
    }
    try {
      const accessToken = sessionStorage.getItem("accessToken");
      const response = await fetch(`${this.apiBaseUrl}/appointments/${appointmentId}`, {
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
        // First, detect the printer
        if (window.electronAPI.detectPrinter) {
          const detectionResult = await window.electronAPI.detectPrinter();
          if (!detectionResult.success) {
            alert("Printer not detected: " + detectionResult.message + "\nFalling back to browser print.");
          }
        }
        
        // Attempt to print and open drawer
        const result = await window.electronAPI.printInvoiceAndOpenDrawer({
          header: header + date,
          customer,
          items,
          summary,
          footer,
        });
        if (result && result.success) {
          alert(result.message || "Printed to Epson printer and opened cash drawer.");
          return;
        } else {
          alert("Printer error: " + (result?.error || "Unknown error") + "\nFalling back to browser print.");
        }
      } catch (e) {
        alert("Printer error: " + e.message + "\nFalling back to browser print.");
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
  window.pos = pos;
});

// Make functions available globally for onclick handlers (fallback)
if (typeof window !== "undefined" && !window.pos) {
  window.pos = pos;
}
