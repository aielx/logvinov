(() => {
  "use strict";

  const body = document.body;
  const loginDialog = document.getElementById("login-modal");
  const loginForm = document.getElementById("family-login-form");
  const passwordInput = document.getElementById("family-password");
  const passwordError = document.getElementById("password-error");
  const toast = document.getElementById("toast");
  let toastTimer;

  function readPrivateMode() {
    try {
      return sessionStorage.getItem("familyArchivePrivate") === "true";
    } catch (error) {
      return false;
    }
  }

  function storePrivateMode(isPrivate) {
    try {
      if (isPrivate) sessionStorage.setItem("familyArchivePrivate", "true");
      else sessionStorage.removeItem("familyArchivePrivate");
    } catch (error) {
      return;
    }
  }

  let isPrivate = readPrivateMode();

  function showToast(message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function applyPrivateMode(nextValue) {
    isPrivate = nextValue;
    body.classList.toggle("is-private", isPrivate);
    document.querySelectorAll("[data-private-status]").forEach((element) => {
      element.textContent = isPrivate ? "Семейный режим" : "Публичная версия";
    });
    document.querySelectorAll("[data-leave-private]").forEach((button) => { button.hidden = !isPrivate; });
    document.querySelectorAll(".family-mode-button").forEach((button) => { button.hidden = isPrivate; });
    document.querySelectorAll(".header-access .access-label").forEach((label) => {
      label.textContent = isPrivate ? "Семейный режим" : "Для семьи";
    });
    window.dispatchEvent(new CustomEvent("family:privacychange", { detail: { isPrivate } }));
  }

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    body.classList.add("dialog-open");
  }

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) body.classList.remove("dialog-open");
    });
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });

  document.querySelectorAll("[data-open-login]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isPrivate) {
        showToast("Семейный режим уже включён. Полное древо доступно в разделе «Древо».");
        return;
      }
      passwordError.hidden = true;
      passwordInput.setAttribute("aria-invalid", "false");
      loginForm.reset();
      openDialog(loginDialog);
      requestAnimationFrame(() => passwordInput.focus());
    });
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (passwordInput.value === "семья2025") {
      passwordError.hidden = true;
      passwordInput.setAttribute("aria-invalid", "false");
      storePrivateMode(true);
      applyPrivateMode(true);
      loginDialog.close();
      showToast("Семейный режим включён: открыты подробные карточки живых родственников.");
    } else {
      passwordError.hidden = false;
      passwordInput.setAttribute("aria-invalid", "true");
      passwordInput.select();
    }
  });

  document.querySelectorAll("[data-leave-private]").forEach((button) => {
    button.addEventListener("click", () => {
      storePrivateMode(false);
      applyPrivateMode(false);
      showToast("Семейный режим завершён. Показана публичная версия архива.");
    });
  });

  const menuToggle = document.querySelector(".menu-toggle");
  const navigation = document.getElementById("site-nav");
  if (menuToggle && navigation) {
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

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });

  const timelineRoot = document.getElementById("timeline-list");
  if (timelineRoot) {
    const sortedEvents = [...mockTimeline].sort((a, b) => Number(a.sortDate) - Number(b.sortDate));
    timelineRoot.innerHTML = sortedEvents.map((item) => `
      <article class="timeline-item${item.type === "history" ? " is-history" : ""}">
        <span class="timeline-marker" aria-hidden="true">${item.icon}</span>
        <div class="timeline-card">
          <time class="timeline-date" datetime="${item.sortDate}">${item.date}</time>
          <h2>${item.title}</h2>
          <p>${item.description}</p>
        </div>
      </article>
    `).join("");
  }

  const galleryGrid = document.getElementById("gallery-grid");
  if (galleryGrid) {
    const galleryCount = document.getElementById("gallery-count");
    const lightbox = document.getElementById("lightbox");
    const lightboxImage = document.getElementById("lightbox-image");
    const lightboxCaption = document.getElementById("lightbox-caption");

    galleryGrid.innerHTML = mockGallery.map((item) => `
      <article class="archive-card" data-category="${item.category}">
        <button class="archive-card-button" type="button" data-gallery-id="${item.id}" aria-label="Увеличить: ${item.title}">
          <div class="archive-image-wrap"><img src="${item.src}" alt="${item.alt}" width="600" height="450" loading="lazy"><span class="archive-type">${item.categoryLabel}</span></div>
          <div class="archive-card-copy"><h2>${item.title}</h2><p>${item.date}</p></div>
        </button>
      </article>
    `).join("");

    document.querySelectorAll("[data-gallery-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.galleryFilter;
        document.querySelectorAll("[data-gallery-filter]").forEach((filterButton) => {
          const isActive = filterButton === button;
          filterButton.classList.toggle("is-active", isActive);
          filterButton.setAttribute("aria-pressed", String(isActive));
        });
        let visibleCount = 0;
        galleryGrid.querySelectorAll(".archive-card").forEach((card) => {
          const isVisible = filter === "all" || card.dataset.category === filter;
          card.hidden = !isVisible;
          if (isVisible) visibleCount += 1;
        });
        galleryCount.textContent = `${visibleCount} ${visibleCount === 1 ? "материал" : visibleCount < 5 ? "материала" : "материалов"}`;
      });
    });

    galleryGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-gallery-id]");
      if (!button) return;
      const item = mockGallery.find((entry) => entry.id === Number(button.dataset.galleryId));
      if (!item) return;
      lightboxImage.src = item.src;
      lightboxImage.alt = item.alt;
      lightboxCaption.textContent = `${item.title} · ${item.date}`;
      openDialog(lightbox);
    });
  }

  applyPrivateMode(isPrivate);
})();
