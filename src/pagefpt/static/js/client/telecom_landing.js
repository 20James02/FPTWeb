(() => {
  const preview = document.body.dataset.landingPreview === "true";
  window.PageFPTLanding = { ...window.PageFPTLanding, preview };
  window.showToast = function (text, type = "success") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = text;
    document.getElementById("toast-container")?.append(el);
    setTimeout(() => el.remove(), 5000);
  };
  const consult = (button, form) => {
    if (preview) return showToast("Bản xem trước: form gửi yêu cầu đang tắt.");
    const id = button?.dataset.planId || form?.elements.plan?.value || null;
    const plan = getPublishedPlans().find((p) => p.id === id);
    openBottomSheet(plan?.name || "Tư vấn gói phù hợp", "", plan?.id || null);
    if (form) {
      document.getElementById("lead-name").value =
        form.elements.name?.value || "";
      document.getElementById("lead-phone").value =
        form.elements.phone?.value || "";
      document.getElementById("lead-address").value =
        form.elements.address?.value || "";
    }
  };
  document
    .querySelectorAll("[data-lp-consult]")
    .forEach((el) => el.addEventListener("click", () => consult(el)));
  document.querySelectorAll("[data-lp-form]").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!preview && !isValidVietnamPhone(form.elements.phone.value)) {
        form.elements.phone.setAttribute("aria-invalid", "true");
        form.elements.phone.focus();
        return showToast("Số điện thoại cần 10 chữ số hợp lệ.", "error");
      }
      form.elements.phone.removeAttribute("aria-invalid");
      consult(null, form);
    }),
  );
  const toggle = document.querySelector(".lp-menu-toggle"),
    nav = document.getElementById("lp-nav");
  const close = () => {
    nav?.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
  };
  toggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav?.addEventListener("click", (e) => {
    if (e.target.closest("a")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  document.addEventListener("pagefpt:plan-price", (e) => {
    const id = e.detail.plan,
      price =
        [...document.querySelectorAll("[data-quote-plan]")].find(
          (el) => el.dataset.quotePlan === id,
        )?.textContent || "Cần tư vấn";
    document.querySelectorAll("[data-lp-compare-price]").forEach((el) => {
      if (el.dataset.lpComparePrice === id) el.textContent = price;
    });
  });
  if (preview)
    document
      .querySelectorAll("#lead-intake-form button[type=submit]")
      .forEach((el) => (el.disabled = true));
})();

/* Swipe has visible button alternatives and preserves equal card sizes. */
(() => {
  const track = document.querySelector(".lp-plan-grid"),
    cards = [...(track?.querySelectorAll(".lp-plan-card") || [])];
  if (track && track.dataset.columns) {
    track.style.setProperty("--lp-columns", track.dataset.columns);
  }
  const position = document.getElementById("lp-card-position"),
    previous = document.querySelector('[data-lp-slide="-1"]'),
    next = document.querySelector('[data-lp-slide="1"]');
  let index = 0;
  function sync() {
    if (!track || !cards.length) return;
    const center = track.getBoundingClientRect().left + track.clientWidth / 2;
    index = cards.reduce(
      (best, card, i) =>
        Math.abs(
          card.getBoundingClientRect().left + card.offsetWidth / 2 - center,
        ) <
        Math.abs(
          cards[best].getBoundingClientRect().left +
            cards[best].offsetWidth / 2 -
            center,
        )
          ? i
          : best,
      0,
    );
    if (position) position.textContent = `${index + 1}/${cards.length}`;
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === cards.length - 1;
  }
  document.querySelectorAll("[data-lp-slide]").forEach((button) =>
    button.addEventListener("click", () => {
      const card =
        cards[
          Math.max(
            0,
            Math.min(cards.length - 1, index + Number(button.dataset.lpSlide)),
          )
        ];
      if (card)
        track.scrollTo({
          left:
            card.offsetLeft -
            track.offsetLeft -
            (track.clientWidth - card.offsetWidth) / 2,
          behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
            ? "instant"
            : "smooth",
        });
    }),
  );
  track?.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  sync();
  const dialog = document.getElementById("lp-contact-dialog");
  document
    .getElementById("lp-contact-open")
    ?.addEventListener("click", () => dialog.showModal());
  document
    .getElementById("lp-contact-close")
    ?.addEventListener("click", () => dialog.close());
  dialog
    ?.querySelector("[data-lp-consult]")
    ?.addEventListener("click", () => dialog.close());
})();

/* Preserve the customer's phone; validation must never silently change its digits. */
(() => {
  document
    .querySelectorAll('input[type="tel"], input[name="phone"]')
    .forEach((input) => {
      input.addEventListener("input", () => {
        input.removeAttribute("aria-invalid");
      });
    });
})();
