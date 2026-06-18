(function () {
  "use strict";

  function init(root) {
    const dataNode = root.querySelector("[data-ai-filters-data]");
    if (!dataNode) return;

    let data;
    try {
      data = JSON.parse(dataNode.textContent);
    } catch (e) {
      console.warn("[ai-filters] Could not parse data island", e);
      return;
    }

    const productValues = data.products || {};
    const cardSelector = root.dataset.cardSelector || "li.grid__item";
    const countEl = root.querySelector("[data-ai-filters-count]");
    const clearBtn = root.querySelector("[data-ai-filters-clear]");
    const checkboxes = Array.from(
      root.querySelectorAll('input[type="checkbox"][data-facet-key]'),
    );

    // Map every product handle on the page to its card element.
    function findCards() {
      const cards = new Map();
      const candidates = document.querySelectorAll(cardSelector);
      candidates.forEach((card) => {
        const link = card.querySelector('a[href*="/products/"]');
        if (!link) return;
        const match = link.getAttribute("href").match(/\/products\/([^/?#]+)/);
        if (!match) return;
        const handle = match[1];
        if (!cards.has(handle)) cards.set(handle, []);
        cards.get(handle).push(card);
      });
      return cards;
    }

    const cardsByHandle = findCards();

    function selectedFilters() {
      const filters = {};
      checkboxes.forEach((cb) => {
        if (!cb.checked) return;
        const key = cb.dataset.facetKey;
        const value = cb.dataset.facetValue;
        if (!filters[key]) filters[key] = [];
        filters[key].push(value);
      });
      return filters;
    }

    function productMatches(handle, filters) {
      const vals = productValues[handle];
      // No data for this product: hide when any filter is active.
      if (!vals) return Object.keys(filters).length === 0;

      for (const [key, selectedVals] of Object.entries(filters)) {
        const productVals = vals[key];
        if (!Array.isArray(productVals) || productVals.length === 0) return false;
        // OR within a facet: at least one selected value must match.
        const ok = selectedVals.some((v) => productVals.includes(v));
        if (!ok) return false;
      }
      return true;
    }

    function apply() {
      const filters = selectedFilters();
      const filterCount = Object.keys(filters).length;
      let visible = 0;
      let total = 0;

      cardsByHandle.forEach((cards, handle) => {
        const match = productMatches(handle, filters);
        cards.forEach((card) => {
          total += 1;
          if (match) {
            card.removeAttribute("data-ai-filter-hidden");
            visible += 1;
          } else {
            card.setAttribute("data-ai-filter-hidden", "true");
          }
        });
      });

      if (countEl) {
        if (filterCount === 0) {
          countEl.textContent = "";
        } else {
          countEl.textContent =
            visible + " of " + total + " products match your filters";
        }
      }
    }

    checkboxes.forEach((cb) => cb.addEventListener("change", apply));
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        checkboxes.forEach((cb) => (cb.checked = false));
        apply();
      });
    }
  }

  function boot() {
    document.querySelectorAll(".ai-filters[id^='ai-filters-']").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
