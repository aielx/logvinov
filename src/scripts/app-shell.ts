/**
 * Общий клиентский шелл всех страниц: меню, диалоги, форма входа, выход,
 * текущий год, тихая проверка сессии. Ошибка API не ломает меню и ссылки.
 */
import { ApiError } from "../lib/api/client";
import { isFamilyMode, initFamilyStoreSync, logout, restoreSessionOnLoad, tryLogin } from "./auth-flow";
import { showToast } from "./notify";

function openDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  document.body.classList.add("dialog-open");
}

function initDialogs(): void {
  document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const outside =
        event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) document.body.classList.remove("dialog-open");
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
}

function initLogin(): void {
  const loginDialog = document.getElementById("login-modal") as HTMLDialogElement | null;
  const loginForm = document.querySelector<HTMLFormElement>("#family-login-form");
  const passwordInput = document.getElementById("family-password") as HTMLInputElement | null;
  const passwordError = document.getElementById("password-error") as HTMLParagraphElement | null;

  document.querySelectorAll<HTMLButtonElement>("[data-open-login]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isFamilyMode()) {
        showToast("Семейный режим уже включён. Полное древо доступно в разделе «Древо».");
        return;
      }
      if (!loginDialog || !passwordInput) return;
      passwordError?.setAttribute("hidden", "");
      passwordInput.setAttribute("aria-invalid", "false");
      loginForm?.reset();
      openDialog(loginDialog);
      requestAnimationFrame(() => passwordInput.focus());
    });
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!passwordInput) return;
    const submitButton = loginForm.querySelector<HTMLButtonElement>("button[type=submit]");
    submitButton?.setAttribute("disabled", "");
    try {
      await tryLogin(passwordInput.value);
      passwordError?.setAttribute("hidden", "");
      passwordInput.setAttribute("aria-invalid", "false");
      loginDialog?.close();
    } catch (error) {
      passwordError?.removeAttribute("hidden");
      passwordInput.setAttribute("aria-invalid", "true");
      passwordInput.select();
      if (error instanceof ApiError && error.code === "RATE_LIMITED") {
        if (passwordError) passwordError.textContent = error.userMessage;
      } else if (passwordError) {
        passwordError.textContent = "Пароль не подошёл. Проверьте раскладку и попробуйте ещё раз.";
      }
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-leave-private]").forEach((button) => {
    button.addEventListener("click", () => {
      void logout();
    });
  });
}

function initMenu(): void {
  const menuToggle = document.querySelector<HTMLButtonElement>(".menu-toggle");
  const navigation = document.getElementById("site-nav") as HTMLDivElement | null;
  if (!menuToggle || !navigation) return;
  const closeMenu = () => {
    navigation.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Открыть меню");
  };
  menuToggle.addEventListener("click", () => {
    const willOpen = !navigation.classList.contains("is-open");
    navigation.classList.toggle("is-open", willOpen);
    menuToggle.setAttribute("aria-expanded", String(willOpen));
    menuToggle.setAttribute("aria-label", willOpen ? "Закрыть меню" : "Открыть меню");
  });
  navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navigation.classList.contains("is-open")) {
      closeMenu();
      menuToggle.focus();
    }
  });
}

function initYear(): void {
  document.querySelectorAll<HTMLElement>("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}

function boot(): void {
  initFamilyStoreSync();
  initDialogs();
  initLogin();
  initMenu();
  initYear();
  // Тихая проверка сессии не блокирует рендер публичного контента.
  void restoreSessionOnLoad();
}

boot();
