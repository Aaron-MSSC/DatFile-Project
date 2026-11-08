(function () {
  const authView = document.getElementById("auth-view");
  const converterView = document.getElementById("converter-view");
  const authForm = document.getElementById("auth-form");
  const nameField = document.getElementById("account-name-field");
  const confirmPasswordField = document.getElementById("confirm-password-field");
  const nameInput = document.getElementById("account-name");
  const emailInput = document.getElementById("account-email");
  const passwordInput = document.getElementById("account-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const showPasswordInput = document.getElementById("show-password");
  const authError = document.getElementById("auth-error");
  const authButton = document.getElementById("auth-submit");
  const authTabs = [...document.querySelectorAll("[data-auth-mode]")];
  const accountStatus = document.getElementById("account-status");
  const logoutButton = document.getElementById("logout-button");
  let mode = "login";

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.authMode));
  });

  showPasswordInput.addEventListener("change", () => {
    const type = showPasswordInput.checked ? "text" : "password";
    passwordInput.type = type;
    confirmPasswordInput.type = type;
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    if (mode === "register" && passwordInput.value !== confirmPasswordInput.value) {
      showError("Passwords do not match.");
      return;
    }

    authButton.disabled = true;
    authButton.textContent = mode === "register" ? "Creating account..." : "Signing in...";

    try {
      const endpoint = mode === "register" ? "/api/register" : "/api/login";
      const payload = {
        email: emailInput.value,
        password: passwordInput.value
      };
      if (mode === "register") {
        payload.name = nameInput.value;
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
      showConverter(result.user);
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

  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === "register";
    nameField.classList.toggle("hidden", !registering);
    confirmPasswordField.classList.toggle("hidden", !registering);
    nameInput.required = registering;
    confirmPasswordInput.required = registering;
    passwordInput.autocomplete = registering ? "new-password" : "current-password";
    authTabs.forEach((tab) => {
      const selected = tab.dataset.authMode === mode;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    clearError();
    updateButton();
  }

  function updateButton() {
    authButton.textContent = mode === "register" ? "Create account" : "Sign in";
  }

  function clearError() {
    authError.textContent = "";
    authError.classList.add("hidden");
  }

  function showError(message) {
    authError.textContent = message;
    authError.classList.remove("hidden");
  }

  function showConverter(user) {
    authView.classList.add("hidden");
    converterView.classList.remove("hidden");
    accountStatus.textContent = user.name;
    logoutButton.classList.remove("hidden");
  }

  fetch("/api/session")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Could not check your sign-in status.");
      }
      return response.json();
    })
    .then((result) => {
      if (result.user) {
        showConverter(result.user);
      }
    })
    .catch((error) => showError(error.message));
})();
