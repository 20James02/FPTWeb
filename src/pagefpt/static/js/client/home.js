/* Admin-defined merchandising; small, keyboard-friendly controls. */
(() => {
  const header = document.querySelector(".site-header");
  if (header && "ResizeObserver" in window)
    new ResizeObserver(() =>
      document.documentElement.style.setProperty(
        "--client-header-height",
        header.getBoundingClientRect().height + "px",
      ),
    ).observe(header);
  const categories = [...document.querySelectorAll("[data-plan-category]")];
  function selectCategory(button) {
    const ids = new Set(JSON.parse(button.dataset.categoryPlanIds));
    const services = new Set(JSON.parse(button.dataset.categoryServices));
    categories.forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    let count = 0;
    document
      .querySelectorAll("#plans-slider-track .plan-card-3d-wrapper")
      .forEach((card) => {
        const show =
          button.dataset.categoryAll === "true" ||
          ids.has(card.dataset.planId) ||
          services.has(card.dataset.service);
        card.dataset.categoryHidden = String(!show);
        card.style.display = show ? "flex" : "none";
        if (show) count++;
      });
    const stage = document.getElementById("plans-3d-stage");
    if (stage) {
      stage.classList.toggle("catalog-empty", !count);
      let empty = stage.querySelector("[data-category-empty]");
      if (!empty) {
        empty = document.createElement("p");
        empty.dataset.categoryEmpty = "";
        empty.textContent =
          "Chưa có gói trong danh mục này. Bạn có thể gửi yêu cầu tư vấn.";
        stage.append(empty);
      }
      empty.hidden = !!count;
    }
    if (typeof currentMultitaskIndex !== "undefined") currentMultitaskIndex = 0;
    if (typeof updatePlans3DMode === "function") updatePlans3DMode();
  }
  categories.forEach((b) =>
    b.addEventListener("click", () => selectCategory(b)),
  );
  if (categories.length) selectCategory(categories[0]);
  const slider = document.getElementById("home-promo-slider");
  if (slider) {
    const slides = [...slider.querySelectorAll(".home-promo-slide")];
    const dots = [...slider.querySelectorAll("[data-promo-index]")];
    let current = 0,
      timer = null,
      auto = false,
      touchX = null,
      videoPlaying = false,
      videoRun = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach((s, i) => {
        s.hidden = i !== current;
        s.querySelector("video")?.pause();
      });
      dots.forEach((b, i) =>
        b.setAttribute("aria-pressed", String(i === current)),
      );
    }
    function mediaState() {
      const run = ++videoRun;
      slides.forEach((slide, index) => {
        const media = slide.querySelector("[data-promo-video-media]");
        if (!media) return;
        const shouldPlay =
          videoPlaying && index === current && !document.hidden;
        if (!shouldPlay) {
          media.pause();
          return;
        }
        media.muted = true;
        if (!media.getAttribute("src")) media.src = media.dataset.videoUrl;
        media.play().catch(() => {
          if (run !== videoRun) return;
          videoPlaying = false;
          const button = slider.querySelector("[data-promo-video]");
          if (button) {
            button.textContent = "Phát video";
            button.setAttribute("aria-pressed", "false");
          }
          const status = slider.querySelector("[data-promo-video-status]");
          if (status)
            status.textContent =
              "Không tải được video. Bạn vẫn có thể mở liên kết ưu đãi.";
        });
      });
      const button = slider.querySelector("[data-promo-video]");
      if (button) {
        button.hidden = !slides[current].querySelector("video");
        button.textContent = videoPlaying ? "Dừng video" : "Phát video";
        button.setAttribute("aria-pressed", String(videoPlaying));
      }
    }
    slider
      .querySelector("[data-promo-video]")
      ?.addEventListener("click", () => {
        videoPlaying = !videoPlaying;
        mediaState();
      });
    function tick() {
      mediaState();
      clearTimeout(timer);
      if (
        auto &&
        !reduced.matches &&
        !document.hidden &&
        !slider.matches(":focus-within,:hover")
      )
        timer = setTimeout(() => {
          show(current + 1);
          tick();
        }, 6500);
    }
    slider.querySelector("[data-promo-prev]")?.addEventListener("click", () => {
      show(current - 1);
      tick();
    });
    slider.querySelector("[data-promo-next]")?.addEventListener("click", () => {
      show(current + 1);
      tick();
    });
    dots.forEach((b, i) =>
      b.addEventListener("click", () => {
        show(i);
        tick();
      }),
    );
    slider
      .querySelector("[data-promo-pause]")
      ?.addEventListener("click", (e) => {
        auto = !auto;
        e.currentTarget.textContent = "Tự chuyển: " + (auto ? "bật" : "tắt");
        e.currentTarget.setAttribute("aria-pressed", String(!auto));
        tick();
      });
    slider.addEventListener(
      "touchstart",
      (e) => {
        touchX = e.touches[0].clientX;
      },
      { passive: true },
    );
    slider.addEventListener(
      "touchend",
      (e) => {
        if (touchX !== null) {
          const d = e.changedTouches[0].clientX - touchX;
          if (Math.abs(d) > 45) show(current + (d < 0 ? 1 : -1));
          touchX = null;
          tick();
        }
      },
      { passive: true },
    );
    ["mouseenter", "mouseleave", "focusin", "focusout"].forEach((event) =>
      slider.addEventListener(event, tick),
    );
    document.addEventListener("visibilitychange", tick);
    reduced.addEventListener("change", () => {
      if (reduced.matches) videoPlaying = false;
      tick();
    });
    tick();
    slider.querySelectorAll("[data-promo-plan]").forEach((b) =>
      b.addEventListener("click", (event) => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          event.button
        )
          return;
        event.preventDefault();
        const id = b.dataset.promoPlan || null;
        const published = JSON.parse(
          document.getElementById("home-published-plans")?.textContent || "[]",
        );
        const plan = published.find((p) => p.id === id);
        openBottomSheet(
          b.dataset.promoTitle,
          "",
          plan?.id || null,
          plan?.service || "internet",
        );
      }),
    );
  }
  document.querySelectorAll("[data-solution-flip]").forEach((button) =>
    button.addEventListener("click", () => {
      const card = button.closest(".solution-card");
      const flipped = card.classList.toggle("is-flipped");
      const front = card.querySelector(".solution-front"),
        back = card.querySelector(".solution-back");
      front.inert = flipped;
      back.inert = !flipped;
      front.setAttribute("aria-hidden", String(flipped));
      back.setAttribute("aria-hidden", String(!flipped));
      (flipped ? back : front)
        .querySelector("[data-solution-flip]")
        .focus({ preventScroll: true });
    }),
  );
  const track = document.querySelector(".solution-track");
  document.querySelectorAll("[data-solution-dir]").forEach((b) =>
    b.addEventListener("click", () => {
      if (!track) return;
      const card = track.querySelector(".solution-card");
      track.scrollBy({
        left:
          Number(b.dataset.solutionDir) *
          (card.getBoundingClientRect().width + 16),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }),
  );
})();
