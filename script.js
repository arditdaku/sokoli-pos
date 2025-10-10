// POS System JavaScript

const DEFAULT_LANDING_PAGE_URL = "https://example.com/landing";
const DEFAULT_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c77e4d" />
      <stop offset="100%" stop-color="#8c3f2e" />
    </linearGradient>
  </defs>
  <rect width="200" height="80" rx="16" fill="url(#grad)" />
  <text x="50%" y="52" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="28" fill="#f5f5f5">Salon POS</text>
</svg>`;
const DEFAULT_LOGO_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  DEFAULT_LOGO_SVG
)}`;

class POSSystem {
  constructor() {
    this.orderItems = [];
    this.selectedPaymentMethod = "cash";
    this.taxRate = 0.0825; // 8.25%

    this.landingPageUrl = DEFAULT_LANDING_PAGE_URL;
    this.logoDataUrl = DEFAULT_LOGO_DATA_URL;
    this.qrCodeSize = 160;

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
    if (globalConfig && typeof globalConfig.landingPageUrl === "string") {
      this.landingPageUrl = globalConfig.landingPageUrl;
    }
    if (globalConfig && typeof globalConfig.logoDataUrl === "string") {
      this.logoDataUrl = globalConfig.logoDataUrl;
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

    this.ptoStorageKey = "salonPosPtoRequests";
    this.ptoRequests = this.loadPtoRequests();
    this.ptoModal = null;
    this.ptoForm = null;
    this.ptoSummaryContainer = null;
    this.ptoRequestsBody = null;
    this.ptoEmptyState = null;
    this.managePtoButton = null;
    this.closePtoModalButton = null;
    this.ptoStartInput = null;
    this.ptoEndInput = null;

    this.initializeNotificationSystem();
    this.initializeEventListeners();
    this.initializePtoManagement();
    this.updateDateTime();
    this.showServices("haircut");

    // Update time every second
    setInterval(() => this.updateDateTime(), 1000);

    this.initializeAppointmentWebSocket();

    this.updateReceiptBranding();

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
          if (modal.id === "ptoModal") {
            this.hidePtoModal();
          } else {
            modal.classList.remove("show");
          }
        }
      });
    });
  }

  initializePtoManagement() {
    this.ptoModal = document.getElementById("ptoModal");
    this.ptoForm = document.getElementById("ptoForm");
    this.ptoSummaryContainer = document.getElementById("ptoSummary");
    this.ptoRequestsBody = document.getElementById("ptoRequestsBody");
    this.ptoEmptyState = document.getElementById("ptoEmptyState");
    this.managePtoButton = document.getElementById("managePto");
    this.closePtoModalButton = document.getElementById("closePtoModal");
    this.ptoStartInput = document.getElementById("ptoStart");
    this.ptoEndInput = document.getElementById("ptoEnd");

    if (this.managePtoButton) {
      this.managePtoButton.addEventListener("click", () => {
        this.showPtoModal();
      });
    }

    if (this.closePtoModalButton) {
      this.closePtoModalButton.addEventListener("click", () => {
        this.hidePtoModal();
      });
    }

    if (this.ptoForm) {
      this.ptoForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.handlePtoFormSubmit();
      });

      this.ptoForm.addEventListener("reset", () => {
        window.setTimeout(() => {
          this.resetPtoDateConstraints();
        }, 0);
      });
    }

    if (this.ptoRequestsBody) {
      this.ptoRequestsBody.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-pto-action]");
        if (!actionButton) {
          return;
        }

        const requestId = actionButton.getAttribute("data-request-id");
        const action = actionButton.getAttribute("data-pto-action");

        if (requestId && action) {
          this.handlePtoAction(requestId, action);
        }
      });
    }

    this.resetPtoDateConstraints();

    if (this.ptoStartInput) {
      this.ptoStartInput.addEventListener("change", () => {
        this.syncPtoEndDateConstraint();
      });
    }

    if (this.ptoEndInput) {
      this.ptoEndInput.addEventListener("change", () => {
        if (
          this.ptoStartInput &&
          this.ptoEndInput.value &&
          this.ptoStartInput.value &&
          this.ptoEndInput.value < this.ptoStartInput.value
        ) {
          this.ptoEndInput.value = this.ptoStartInput.value;
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.ptoModal && this.ptoModal.classList.contains("show")) {
        this.hidePtoModal();
      }
    });

    this.renderPtoRequests();
  }

  updateReceiptBranding() {
    const logoElement = document.getElementById("receiptLogo");
    if (logoElement) {
      if (this.logoDataUrl) {
        logoElement.src = this.logoDataUrl;
        logoElement.classList.remove("hidden");
      } else {
        logoElement.classList.add("hidden");
      }
    }

    const qrContainer = document.getElementById("receiptQrContainer");
    const qrImage = document.getElementById("receiptQr");
    const qrLink = document.getElementById("receiptQrLink");

    if (!qrContainer || !qrImage || !qrLink) {
      return;
    }

    if (!this.landingPageUrl) {
      qrContainer.classList.add("hidden");
      return;
    }

    qrLink.textContent = this.landingPageUrl;
    qrLink.href = this.landingPageUrl;

    if (window.QRious) {
      try {
        const qr = new window.QRious({
          value: this.landingPageUrl,
          size: this.qrCodeSize,
          level: "H",
        });
        qrImage.src = qr.toDataURL();
        qrImage.alt = "QR code linking to landing page";
        qrImage.classList.remove("hidden");
      } catch (error) {
        console.error("Unable to generate QR code:", error);
        qrImage.classList.add("hidden");
      }
      qrContainer.classList.remove("hidden");
    } else {
      console.warn("QRious library not available. Displaying landing page URL only.");
      qrImage.classList.add("hidden");
      qrContainer.classList.remove("hidden");
    }
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

  loadPtoRequests() {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return this.getSeedPtoRequests();
    }

    try {
      const raw = window.localStorage.getItem(this.ptoStorageKey);
      if (!raw) {
        return this.getSeedPtoRequests();
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return this.getSeedPtoRequests();
      }

      return parsed
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          id: entry.id || this.generatePtoId(),
          worker: typeof entry.worker === "string" ? entry.worker : "Team member",
          startDate: entry.startDate || entry.start || "",
          endDate: entry.endDate || entry.end || entry.startDate || "",
          notes: typeof entry.notes === "string" ? entry.notes : "",
          status: this.normalizePtoStatus(entry.status),
          createdAt:
            typeof entry.createdAt === "string" && entry.createdAt
              ? entry.createdAt
              : new Date().toISOString(),
          updatedAt:
            typeof entry.updatedAt === "string" && entry.updatedAt
              ? entry.updatedAt
              : entry.createdAt || new Date().toISOString(),
        }));
    } catch (error) {
      console.error("Failed to load PTO requests from storage:", error);
      return this.getSeedPtoRequests();
    }
  }

  getSeedPtoRequests() {
    const today = new Date();

    const upcomingStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    const upcomingEnd = new Date(upcomingStart.getTime());
    upcomingEnd.setDate(upcomingEnd.getDate() + 2);

    const recentStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
    const recentEnd = new Date(recentStart.getTime());
    recentEnd.setDate(recentEnd.getDate() + 2);

    return [
      {
        id: this.generatePtoId(),
        worker: "Alex Johnson",
        startDate: this.formatDateInput(upcomingStart),
        endDate: this.formatDateInput(upcomingEnd),
        notes: "Family vacation",
        status: "Pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: this.generatePtoId(),
        worker: "Maria Lopez",
        startDate: this.formatDateInput(recentStart),
        endDate: this.formatDateInput(recentEnd),
        notes: "Hair styling conference",
        status: "Approved",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      },
    ];
  }

  savePtoRequests() {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(this.ptoStorageKey, JSON.stringify(this.ptoRequests));
    } catch (error) {
      console.error("Failed to persist PTO requests:", error);
    }
  }

  handlePtoFormSubmit() {
    if (!this.ptoForm) {
      return;
    }

    const formData = new FormData(this.ptoForm);
    const worker = (formData.get("worker") || "").toString().trim();
    const startDate = (formData.get("start") || "").toString();
    const endDateRaw = (formData.get("end") || "").toString();
    const notes = (formData.get("notes") || "").toString().trim();
    const endDate = endDateRaw || startDate;

    if (!worker) {
      this.showNotificationToast({
        message: "Please add the team member's name for the request.",
        duration: 4500,
      });
      return;
    }

    if (!startDate) {
      this.showNotificationToast({
        message: "A start date is required to log time off.",
        duration: 4500,
      });
      return;
    }

    if (endDate && startDate && endDate < startDate) {
      this.showNotificationToast({
        message: "The end date cannot be earlier than the start date.",
        duration: 5000,
      });
      return;
    }

    const newRequest = {
      id: this.generatePtoId(),
      worker,
      startDate,
      endDate,
      notes,
      status: "Pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.ptoRequests.unshift(newRequest);
    this.savePtoRequests();
    this.renderPtoRequests();
    this.ptoForm.reset();
    this.resetPtoDateConstraints();

    this.showNotificationToast({
      message: `Logged a time off request for ${worker}.`,
      duration: 4500,
    });
  }

  resetPtoDateConstraints() {
    const today = this.formatDateInput(new Date());
    if (!today) {
      return;
    }

    if (this.ptoStartInput) {
      this.ptoStartInput.setAttribute("min", today);
      if (!this.ptoStartInput.value) {
        this.ptoStartInput.value = today;
      }
    }

    if (this.ptoEndInput) {
      this.ptoEndInput.setAttribute("min", this.ptoStartInput ? this.ptoStartInput.value || today : today);
      if (!this.ptoEndInput.value && this.ptoStartInput && this.ptoStartInput.value) {
        this.ptoEndInput.value = this.ptoStartInput.value;
      }
    }
  }

  syncPtoEndDateConstraint() {
    if (!this.ptoStartInput || !this.ptoEndInput) {
      return;
    }

    const startValue = this.ptoStartInput.value;
    if (!startValue) {
      return;
    }

    this.ptoEndInput.setAttribute("min", startValue);
    if (this.ptoEndInput.value && this.ptoEndInput.value < startValue) {
      this.ptoEndInput.value = startValue;
    }
  }

  showPtoModal() {
    if (!this.ptoModal) {
      return;
    }

    this.renderPtoRequests();
    this.ptoModal.classList.add("show");
    this.ptoModal.setAttribute("aria-hidden", "false");
  }

  hidePtoModal() {
    if (!this.ptoModal) {
      return;
    }

    this.ptoModal.classList.remove("show");
    this.ptoModal.setAttribute("aria-hidden", "true");
  }

  renderPtoRequests() {
    if (!this.ptoRequestsBody) {
      return;
    }

    this.ptoRequestsBody.innerHTML = "";

    if (!Array.isArray(this.ptoRequests) || this.ptoRequests.length === 0) {
      if (this.ptoEmptyState) {
        this.ptoEmptyState.classList.remove("hidden");
      }
      this.updatePtoSummary();
      return;
    }

    if (this.ptoEmptyState) {
      this.ptoEmptyState.classList.add("hidden");
    }

    const fragment = document.createDocumentFragment();

    this.ptoRequests.forEach((request) => {
      const row = document.createElement("tr");
      row.setAttribute("data-request-id", request.id);

      const workerCell = document.createElement("td");
      workerCell.textContent = request.worker;
      row.appendChild(workerCell);

      const datesCell = document.createElement("td");
      datesCell.textContent = this.formatDateRange(request.startDate, request.endDate);
      row.appendChild(datesCell);

      const statusCell = document.createElement("td");
      const statusBadge = document.createElement("span");
      const statusClass = (request.status || "Pending").toLowerCase();
      statusBadge.classList.add("status-badge", statusClass);
      statusBadge.textContent = this.normalizePtoStatus(request.status);
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);

      const requestedCell = document.createElement("td");
      requestedCell.textContent = this.formatDateForDisplay(request.createdAt);
      row.appendChild(requestedCell);

      const notesCell = document.createElement("td");
      notesCell.textContent = request.notes ? request.notes : "—";
      row.appendChild(notesCell);

      const actionsCell = document.createElement("td");
      actionsCell.classList.add("actions-cell");
      const actionGroup = document.createElement("div");
      actionGroup.classList.add("pto-action-group");

      if (request.status !== "Approved") {
        actionGroup.appendChild(
          this.createPtoActionButton("Approve", "approve", "approve", request.id)
        );
      }

      if (request.status !== "Denied") {
        actionGroup.appendChild(
          this.createPtoActionButton("Deny", "deny", "deny", request.id)
        );
      }

      if (request.status !== "Pending") {
        actionGroup.appendChild(
          this.createPtoActionButton("Reopen", "revert", "revert", request.id)
        );
      }

      actionGroup.appendChild(
        this.createPtoActionButton("Remove", "delete", "delete", request.id)
      );

      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      fragment.appendChild(row);
    });

    this.ptoRequestsBody.appendChild(fragment);
    this.updatePtoSummary();
  }

  updatePtoSummary() {
    if (!this.ptoSummaryContainer) {
      return;
    }

    const requests = Array.isArray(this.ptoRequests) ? this.ptoRequests : [];
    const total = requests.length;
    const pending = requests.filter((request) => request.status === "Pending").length;
    const approved = requests.filter((request) => request.status === "Approved").length;
    const denied = requests.filter((request) => request.status === "Denied").length;

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = requests.filter((request) => {
      if (request.status !== "Approved") {
        return false;
      }
      const endDate = this.parseDate(request.endDate);
      return endDate && endDate >= todayStart;
    }).length;

    const summaryItems = [
      { label: "Pending approvals", value: pending },
      { label: "Upcoming vacations", value: upcoming },
      { label: "Approved", value: approved },
      { label: "Denied", value: denied },
      { label: "Total requests", value: total },
    ];

    this.ptoSummaryContainer.innerHTML = "";
    const fragment = document.createDocumentFragment();

    summaryItems.forEach((item) => {
      const card = document.createElement("article");
      card.classList.add("summary-card");

      const heading = document.createElement("h3");
      heading.textContent = item.label;
      card.appendChild(heading);

      const value = document.createElement("p");
      value.textContent = item.value;
      card.appendChild(value);

      fragment.appendChild(card);
    });

    this.ptoSummaryContainer.appendChild(fragment);
  }

  createPtoActionButton(label, action, modifier, requestId) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("btn-action");
    if (modifier) {
      button.classList.add(modifier);
    }
    button.setAttribute("data-pto-action", action);
    button.setAttribute("data-request-id", requestId);
    button.textContent = label;
    return button;
  }

  handlePtoAction(requestId, action) {
    if (!requestId || !action) {
      return;
    }

    const requestIndex = this.ptoRequests.findIndex((request) => request.id === requestId);
    if (requestIndex === -1) {
      return;
    }

    const request = this.ptoRequests[requestIndex];
    const normalizedAction = action.toLowerCase();

    if (normalizedAction === "delete") {
      const workerName = request.worker;
      this.ptoRequests.splice(requestIndex, 1);
      this.savePtoRequests();
      this.renderPtoRequests();
      this.showNotificationToast({
        message: `Removed the request for ${workerName}.`,
        duration: 4000,
      });
      return;
    }

    let nextStatus = null;
    if (normalizedAction === "approve") {
      nextStatus = "Approved";
    } else if (normalizedAction === "deny") {
      nextStatus = "Denied";
    } else if (normalizedAction === "revert") {
      nextStatus = "Pending";
    }

    if (!nextStatus || request.status === nextStatus) {
      return;
    }

    request.status = nextStatus;
    request.updatedAt = new Date().toISOString();
    this.ptoRequests[requestIndex] = request;
    this.savePtoRequests();
    this.renderPtoRequests();

    const feedbackMessages = {
      Approved: `Approved ${request.worker}'s time off request.`,
      Denied: `Denied ${request.worker}'s request.`,
      Pending: `Reopened ${request.worker}'s request for review.`,
    };

    this.showNotificationToast({
      message: feedbackMessages[nextStatus] || "Updated the request.",
      duration: 4200,
    });
  }

  normalizePtoStatus(status) {
    if (typeof status !== "string") {
      return "Pending";
    }

    const normalized = status.trim().toLowerCase();
    if (normalized === "approved") {
      return "Approved";
    }
    if (normalized === "denied") {
      return "Denied";
    }
    return "Pending";
  }

  formatDateRange(start, end) {
    const startDate = this.parseDate(start);
    const endDate = this.parseDate(end);

    if (startDate && endDate) {
      if (startDate.getTime() === endDate.getTime()) {
        return this.formatShortDate(startDate);
      }
      return `${this.formatShortDate(startDate)} – ${this.formatShortDate(endDate)}`;
    }

    if (startDate) {
      return this.formatShortDate(startDate);
    }

    if (endDate) {
      return this.formatShortDate(endDate);
    }

    return "—";
  }

  formatDateForDisplay(value) {
    if (!value) {
      return "—";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  }

  formatShortDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  parseDate(value) {
    if (!value) {
      return null;
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  formatDateInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toISOString().split("T")[0];
  }

  generatePtoId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `pto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

    this.updateReceiptBranding();

    document.getElementById("receiptModal").classList.add("show");
  }

  async printReceipt() {
    this.updateReceiptBranding();

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
    const change = document
      .getElementById("receiptChange")
      ?.textContent.trim();
    const footerLines = [];
    if (change) {
      footerLines.push(`Change: ${change}`);
    }
    if (this.landingPageUrl) {
      footerLines.push(`Scan to visit: ${this.landingPageUrl}`);
    }
    footerLines.push("", "Thank you for your visit!", "Please come again", "");
    const footer = footerLines.join("\n");

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
            .receipt-header {
              text-align: center;
              border-bottom: 1px dashed #ccc;
              padding-bottom: 10px;
              margin-bottom: 10px;
            }
            .receipt-logo { display: block; margin: 0 auto 12px; max-width: 140px; }
            .receipt-total { border-top: 1px dashed #ccc; padding-top: 10px; }
            .receipt-footer { text-align: center; font-style: italic; margin-top: 20px; }
            .receipt-qr { margin-top: 16px; }
            .receipt-qr img { display: block; margin: 8px auto; width: 140px; height: 140px; }
            .receipt-qr-caption { font-style: normal; font-size: 0.85rem; color: #333; }
            .receipt-qr-link {
              display: block;
              font-style: normal;
              font-size: 0.75rem;
              color: #333;
              word-break: break-all;
              text-decoration: none;
            }
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
