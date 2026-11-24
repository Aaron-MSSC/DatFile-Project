(function () {
  const authView = document.getElementById("auth-view");
  const authForm = document.getElementById("auth-form");
  const nameField = document.getElementById("account-name-field");
  const confirmPasswordField = document.getElementById("confirm-password-field");
  const recoveryTokenField = document.getElementById("recovery-token-field");
  const passwordHint = document.getElementById("password-hint");
  const nameInput = document.getElementById("account-name");
  const emailInput = document.getElementById("account-email");
  const passwordInput = document.getElementById("account-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const recoveryTokenInput = document.getElementById("recovery-token");
  const showPasswordInput = document.getElementById("show-password");
  const authError = document.getElementById("auth-error");
  const authInfo = document.getElementById("auth-info");
  const authButton = document.getElementById("auth-submit");
  const recoverRequestBtn = document.getElementById("recover-request-button");
  const authTabs = [...document.querySelectorAll("[data-auth-mode]")];

  const topbarNav = document.getElementById("topbar-nav");
  const navButtons = [...document.querySelectorAll("[data-nav-target]")];
  const userRoleBadge = document.getElementById("user-role-badge");
  const accountStatus = document.getElementById("account-status");
  const logoutButton = document.getElementById("logout-button");
  const breadcrumbCurrent = document.getElementById("breadcrumb-current");
  const menuToggle = document.getElementById("menu-toggle");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const troubleLink = document.getElementById("trouble-signing-in");
  const navGroups = [...document.querySelectorAll("[data-nav-group]")];

  // Dashboard views
  const allViews = [
    document.getElementById("converter-view"),
    document.getElementById("exports-view"),
    document.getElementById("admin-view"),
    document.getElementById("audit-view"),
    document.getElementById("status-view")
  ].filter(Boolean);

  let mode = "login";
  let currentUser = null;

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.authMode));
  });

  showPasswordInput.addEventListener("change", () => {
    const type = showPasswordInput.checked ? "text" : "password";
    passwordInput.type = type;
    confirmPasswordInput.type = type;
  });

  // Sidebar drawer (tablet and phone widths)
  function setDrawer(open) {
    document.body.classList.toggle("sidebar-open", open);
    if (menuToggle) menuToggle.setAttribute("aria-expanded", String(open));
  }
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      setDrawer(!document.body.classList.contains("sidebar-open"));
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", () => setDrawer(false));
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) {
      setDrawer(false);
      if (menuToggle) menuToggle.focus();
    }
  });
  if (troubleLink) {
    troubleLink.addEventListener("click", () => setMode("recover"));
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    const first = parts[0][0] || "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function updateNavGroups() {
    navGroups.forEach((group) => {
      const visible = [...group.querySelectorAll("[data-nav-target]")]
        .some((button) => !button.classList.contains("hidden"));
      group.classList.toggle("hidden", !visible);
    });
  }

  // Navigation tab clicks
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.navTarget);
    });
  });

  // Request recovery token handler
  recoverRequestBtn.addEventListener("click", async () => {
    clearError();
    clearInfo();
    const email = emailInput.value.trim();
    if (!email) {
      showError("Please enter your account email first.");
      return;
    }

    recoverRequestBtn.disabled = true;
    recoverRequestBtn.textContent = "Requesting...";
    try {
      const response = await fetch("/api/auth/recover-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to request recovery token.");
      }
      showInfo(`Token generated: ${result.token}\nEnter this token and your new password below.`);
      if (result.token) {
        recoveryTokenInput.value = result.token;
      }
    } catch (err) {
      showError(err.message);
    } finally {
      recoverRequestBtn.disabled = false;
      recoverRequestBtn.textContent = "Request recovery token";
    }
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    clearInfo();

    if ((mode === "register" || mode === "recover") && passwordInput.value !== confirmPasswordInput.value) {
      showError("Passwords do not match.");
      return;
    }

    if (mode === "register" || mode === "recover") {
      const complexityErr = validateComplexityClient(passwordInput.value);
      if (complexityErr) {
        showError(complexityErr);
        return;
      }
    }

    authButton.disabled = true;
    authButton.textContent = mode === "register"
      ? "Creating account..."
      : mode === "recover"
        ? "Updating password..."
        : "Signing in...";

    try {
      if (mode === "recover") {
        const response = await fetch("/api/auth/recover-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailInput.value.trim(),
            recoveryToken: recoveryTokenInput.value.trim(),
            newPassword: passwordInput.value
          })
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Recovery failed.");
        }
        showInfo("Password reset successfully! You can now sign in with your new password.");
        setMode("login");
        passwordInput.value = "";
        confirmPasswordInput.value = "";
        return;
      }

      const endpoint = mode === "register" ? "/api/register" : "/api/login";
      const payload = {
        email: emailInput.value.trim(),
        password: passwordInput.value
      };
      if (mode === "register") {
        payload.name = nameInput.value.trim();
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to authenticate. Please try again.");
      }
      setupUserSession(result.user);
    } catch (error) {
      showError(error.message);
    } finally {
      authButton.disabled = false;
      updateButton();
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to sign out. Please try again.");
      }
      window.location.reload();
    } catch (error) {
      logoutButton.disabled = false;
      accountStatus.textContent = error.message;
    }
  });

  function validateComplexityClient(pwd) {
    if (pwd.length < 12) return "Password must be at least 12 characters.";
    if (!/[A-Z]/.test(pwd)) return "Password must include at least one uppercase letter.";
    if (!/[a-z]/.test(pwd)) return "Password must include at least one lowercase letter.";
    if (!/[0-9]/.test(pwd)) return "Password must include at least one number.";
    if (!/[^A-Za-z0-9]/.test(pwd)) return "Password must include at least one symbol.";
    return null;
  }

  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === "register";
    const recovering = mode === "recover";

    nameField.classList.toggle("hidden", !registering);
    confirmPasswordField.classList.toggle("hidden", !registering && !recovering);
    recoveryTokenField.classList.toggle("hidden", !recovering);
    recoverRequestBtn.classList.toggle("hidden", !recovering);
    passwordHint.classList.toggle("hidden", !registering && !recovering);

    nameInput.required = registering;
    confirmPasswordInput.required = registering || recovering;
    recoveryTokenInput.required = recovering;
    passwordInput.autocomplete = registering || recovering ? "new-password" : "current-password";

    authTabs.forEach((tab) => {
      const selected = tab.dataset.authMode === mode;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });

    clearError();
    updateButton();
  }

  function updateButton() {
    authButton.textContent = mode === "register"
      ? "Create account"
      : mode === "recover"
        ? "Reset password"
        : "Sign in";
  }

  function clearError() {
    authError.textContent = "";
    authError.classList.add("hidden");
  }

  function showError(message) {
    authError.textContent = message;
    authError.classList.remove("hidden");
  }

  function clearInfo() {
    if (authInfo) {
      authInfo.textContent = "";
      authInfo.classList.add("hidden");
    }
  }

  function showInfo(message) {
    if (authInfo) {
      authInfo.textContent = message;
      authInfo.classList.remove("hidden");
    }
  }

  function switchView(targetId) {
    allViews.forEach((view) => {
      view.classList.toggle("hidden", view.id !== targetId);
    });
    navButtons.forEach((btn) => {
      const active = btn.dataset.navTarget === targetId;
      btn.classList.toggle("is-active", active);
      if (active) {
        btn.setAttribute("aria-current", "page");
        const label = btn.querySelector(".nav-label");
        const text = (label ? label.textContent : btn.textContent).trim();
        if (breadcrumbCurrent) breadcrumbCurrent.textContent = text;
        document.title = `${text} · DAT File Converter`;
      } else {
        btn.removeAttribute("aria-current");
      }
    });
    setDrawer(false);
    document.dispatchEvent(new CustomEvent("dat:view-change", { detail: { targetId } }));

    if (targetId === "exports-view") {
      loadRecentExports();
    } else if (targetId === "admin-view") {
      loadAdminUsers();
    } else if (targetId === "audit-view") {
      loadAuditLogs();
    } else if (targetId === "status-view") {
      loadSystemStatus();
    }
  }

  function setupUserSession(user) {
    currentUser = user;
    authView.classList.add("hidden");
    document.body.classList.add("is-authenticated");
    accountStatus.textContent = user.name;
    for (const id of ["sidebar-avatar", "user-avatar"]) {
      const avatar = document.getElementById(id);
      if (avatar) avatar.textContent = initials(user.name || user.email);
    }
    logoutButton.classList.remove("hidden");

    // Display role badge
    userRoleBadge.className = `role-badge ${user.role || "standard"}`;
    userRoleBadge.textContent = user.role === "admin"
      ? "Administrator"
      : user.role === "auditor"
        ? "Auditor"
        : "Standard User";
    userRoleBadge.classList.remove("hidden");

    // Configure Navigation based on RBAC Role
    topbarNav.classList.remove("hidden");
    const isAdmin = user.role === "admin";
    const isAuditor = user.role === "auditor";
    const isStandard = user.role === "standard" || (!isAdmin && !isAuditor);

    document.getElementById("nav-btn-converter").classList.toggle("hidden", isAuditor);
    document.getElementById("nav-btn-exports").classList.toggle("hidden", isAuditor);
    document.getElementById("nav-btn-admin").classList.toggle("hidden", !isAdmin);
    document.getElementById("nav-btn-audit").classList.toggle("hidden", !isAdmin && !isAuditor);
    document.getElementById("nav-btn-status").classList.toggle("hidden", !isAdmin && !isAuditor);
    updateNavGroups();

    // Initial default view
    if (isAuditor) {
      switchView("audit-view");
    } else {
      switchView("converter-view");
      loadRecentExports();
    }
  }

  // --- 1. Recent Exports ---
  async function loadRecentExports() {
    const tbody = document.getElementById("exports-table-body");
    if (!tbody) return;
    try {
      const res = await fetch("/api/user/recent-exports");
      if (!res.ok) throw new Error("Could not load recent exports.");
      const data = await res.json();
      const records = data.recentExports || [];
      if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No conversions recorded yet.</td></tr>';
        return;
      }
      tbody.innerHTML = records.map((r) => {
        const counts = r.recordCounts ? `${r.recordCounts.validRecords || 0} valid (${r.recordCounts.totalRows || 0} total)` : "-";
        const totals = r.controlTotals ? Object.entries(r.controlTotals).map(([k, v]) => `${k}: ${v}`).join(", ") : "-";
        const dateStr = new Date(r.timestamp).toLocaleString();
        return `
          <tr>
            <td>${escapeHtml(dateStr)}</td>
            <td><strong>${escapeHtml(r.reportType || "DAT")}</strong></td>
            <td>${escapeHtml(counts)}</td>
            <td>${escapeHtml(totals)}</td>
            <td><span class="badge-status ${r.status === 'SUCCESS' ? 'active' : 'disabled'}">${escapeHtml(r.status)}</span></td>
          </tr>
        `;
      }).join("");
    } catch {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load recent exports.</td></tr>';
    }
  }

  const refreshExportsBtn = document.getElementById("refresh-exports-btn");
  if (refreshExportsBtn) {
    refreshExportsBtn.addEventListener("click", loadRecentExports);
  }

  // --- 2. Admin Panel ---
  async function loadAdminUsers() {
    const tbody = document.getElementById("admin-users-table-body");
    if (!tbody) return;
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Could not load users.");
      const data = await res.json();
      const users = data.users || [];
      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users found.</td></tr>';
        return;
      }
      tbody.innerHTML = users.map((u) => {
        const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never";
        const isActive = u.status === "active";
        return `
          <tr data-user-id="${escapeHtml(u.id)}">
            <td><strong>${escapeHtml(u.name)}</strong></td>
            <td>${escapeHtml(u.email)}</td>
            <td>
              <select class="action-select user-role-select" data-user-id="${escapeHtml(u.id)}">
                <option value="standard" ${u.role === 'standard' ? 'selected' : ''}>Standard</option>
                <option value="auditor" ${u.role === 'auditor' ? 'selected' : ''}>Auditor</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
              </select>
            </td>
            <td>
              <span class="badge-status ${isActive ? 'active' : 'disabled'}">${isActive ? 'Active' : 'Disabled'}</span>
            </td>
            <td>${escapeHtml(lastLogin)}</td>
            <td>
              <button class="btn-action toggle-status-btn" data-user-id="${escapeHtml(u.id)}" data-next-status="${isActive ? 'disabled' : 'active'}">
                ${isActive ? 'Disable' : 'Enable'}
              </button>
              <button class="btn-action trigger-reset-btn" data-user-id="${escapeHtml(u.id)}" data-user-email="${escapeHtml(u.email)}">
                Reset Pass
              </button>
            </td>
          </tr>
        `;
      }).join("");

      // Bind dynamic row actions
      tbody.querySelectorAll(".user-role-select").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const userId = sel.dataset.userId;
          const newRole = sel.value;
          try {
            const resp = await fetch(`/api/admin/users/${userId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: newRole })
            });
            if (!resp.ok) {
              const err = await resp.json();
              throw new Error(err.error || "Failed to update role");
            }
            loadAdminUsers();
          } catch (e) {
            alert(e.message);
            loadAdminUsers();
          }
        });
      });

      tbody.querySelectorAll(".toggle-status-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const userId = btn.dataset.userId;
          const nextStatus = btn.dataset.nextStatus;
          try {
            const resp = await fetch(`/api/admin/users/${userId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: nextStatus })
            });
            if (!resp.ok) {
              const err = await resp.json();
              throw new Error(err.error || "Failed to update status");
            }
            loadAdminUsers();
          } catch (e) {
            alert(e.message);
          }
        });
      });

      tbody.querySelectorAll(".trigger-reset-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const resetCard = document.getElementById("admin-reset-card");
          document.getElementById("admin-reset-user-id").value = btn.dataset.userId;
          document.getElementById("admin-reset-target-user").textContent = `Setting new password for: ${btn.dataset.userEmail}`;
          document.getElementById("admin-reset-error").classList.add("hidden");
          document.getElementById("admin-reset-password-input").value = "";
          resetCard.classList.remove("hidden");
        });
      });
    } catch {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Unable to load users.</td></tr>';
    }
  }

  // Admin user creation handlers
  const toggleCreateUserBtn = document.getElementById("toggle-create-user-btn");
  const adminCreateUserCard = document.getElementById("admin-create-user-card");
  const cancelCreateUserBtn = document.getElementById("cancel-create-user-btn");
  const adminCreateUserForm = document.getElementById("admin-create-user-form");
  const adminCreateError = document.getElementById("admin-create-error");

  if (toggleCreateUserBtn && adminCreateUserCard) {
    toggleCreateUserBtn.addEventListener("click", () => {
      adminCreateUserCard.classList.toggle("hidden");
    });
  }

  if (cancelCreateUserBtn && adminCreateUserCard) {
    cancelCreateUserBtn.addEventListener("click", () => {
      adminCreateUserCard.classList.add("hidden");
    });
  }

  if (adminCreateUserForm) {
    adminCreateUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      adminCreateError.classList.add("hidden");
      const name = document.getElementById("new-user-name").value.trim();
      const email = document.getElementById("new-user-email").value.trim();
      const role = document.getElementById("new-user-role").value;
      const password = document.getElementById("new-user-password").value;

      const compErr = validateComplexityClient(password);
      if (compErr) {
        adminCreateError.textContent = compErr;
        adminCreateError.classList.remove("hidden");
        return;
      }

      try {
        const resp = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, role, password })
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || "Failed to create user.");

        adminCreateUserForm.reset();
        adminCreateUserCard.classList.add("hidden");
        loadAdminUsers();
      } catch (err) {
        adminCreateError.textContent = err.message;
        adminCreateError.classList.remove("hidden");
      }
    });
  }

  // Admin Password Reset Modal handlers
  const adminResetForm = document.getElementById("admin-reset-form");
  const cancelResetPasswordBtn = document.getElementById("cancel-reset-password-btn");
  const adminResetCard = document.getElementById("admin-reset-card");
  const adminResetError = document.getElementById("admin-reset-error");

  if (cancelResetPasswordBtn && adminResetCard) {
    cancelResetPasswordBtn.addEventListener("click", () => {
      adminResetCard.classList.add("hidden");
    });
  }

  if (adminResetForm) {
    adminResetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      adminResetError.classList.add("hidden");
      const userId = document.getElementById("admin-reset-user-id").value;
      const newPassword = document.getElementById("admin-reset-password-input").value;

      const compErr = validateComplexityClient(newPassword);
      if (compErr) {
        adminResetError.textContent = compErr;
        adminResetError.classList.remove("hidden");
        return;
      }

      try {
        const resp = await fetch(`/api/admin/users/${userId}/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword })
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || "Failed to reset password.");

        adminResetCard.classList.add("hidden");
        alert("Password updated successfully.");
      } catch (err) {
        adminResetError.textContent = err.message;
        adminResetError.classList.remove("hidden");
      }
    });
  }

  const refreshUsersBtn = document.getElementById("refresh-users-btn");
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", loadAdminUsers);
  }

  // --- 3. Audit Trail ---
  async function loadAuditLogs() {
    const tbody = document.getElementById("audit-table-body");
    if (!tbody) return;
    try {
      const res = await fetch("/api/audit-logs?limit=100");
      if (!res.ok) throw new Error("Could not load audit logs.");
      const data = await res.json();
      const logs = data.logs || [];
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No audit logs recorded yet.</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map((l) => {
        const counts = l.recordCounts ? `${l.recordCounts.validRecords || 0} valid / ${l.recordCounts.totalRows || 0} rows` : "-";
        const totals = l.controlTotals ? Object.entries(l.controlTotals).map(([k, v]) => `${k}: ${v}`).join(", ") : "-";
        const dateStr = new Date(l.timestamp).toLocaleString();
        return `
          <tr>
            <td>${escapeHtml(dateStr)}</td>
            <td>${escapeHtml(l.userEmail || "System")}</td>
            <td><strong>${escapeHtml(l.action)}</strong></td>
            <td>${escapeHtml(l.reportType || "-")}</td>
            <td>${escapeHtml(counts)}</td>
            <td>${escapeHtml(totals)}</td>
            <td><span class="badge-status ${l.status === 'SUCCESS' ? 'active' : 'disabled'}">${escapeHtml(l.status)}</span></td>
          </tr>
        `;
      }).join("");
    } catch {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Unable to load audit logs.</td></tr>';
    }
  }

  const refreshAuditBtn = document.getElementById("refresh-audit-btn");
  if (refreshAuditBtn) {
    refreshAuditBtn.addEventListener("click", loadAuditLogs);
  }

  // --- 4. System Status ---
  async function loadSystemStatus() {
    try {
      const res = await fetch("/api/admin/system-status");
      if (!res.ok) return;
      const data = await res.json();

      const uptimeHours = Math.floor(data.uptimeSeconds / 3600);
      const uptimeMins = Math.floor((data.uptimeSeconds % 3600) / 60);
      const uptimeSecs = data.uptimeSeconds % 60;
      document.getElementById("metric-uptime").textContent = `${uptimeHours}h ${uptimeMins}m ${uptimeSecs}s`;
      document.getElementById("metric-node").textContent = data.nodeVersion || "-";

      const memoryMb = Math.round(data.memoryUsage.rss / 1024 / 1024);
      document.getElementById("metric-memory").textContent = `${memoryMb} MB RSS`;

      document.getElementById("metric-users").textContent = data.totalUsers ?? "-";
      document.getElementById("metric-conversions").textContent = data.totalConversions ?? "-";
    } catch {
      // Ignored
    }
  }

  const refreshStatusBtn = document.getElementById("refresh-status-btn");
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener("click", loadSystemStatus);
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return str;
    return str.replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  // Export DatAuth to global window
  window.DatAuth = {
    getCurrentUser: () => currentUser,
    switchView,
    refreshRecentExports: loadRecentExports
  };

  // Initial session check
  fetch("/api/session")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Could not check your sign-in status.");
      }
      return response.json();
    })
    .then((result) => {
      if (result.user) {
        setupUserSession(result.user);
      }
    })
    .catch((error) => showError(error.message));
})();
