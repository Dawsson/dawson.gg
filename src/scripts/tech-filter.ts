(function () {
  "use strict";

  var activeCat = "featured";

  // ─── Fuzzy search ───

  function normalize(str: string) {
    return str.replace(/[-_]/g, " ").replace(/\s+/g, " ");
  }

  function fuzzyWordScore(word: string, target: string) {
    if (!word) return 0;
    var w = normalize(word);
    var t = normalize(target);

    // Exact substring match
    var idx = t.indexOf(w);
    if (idx !== -1) return 1.0 + (idx === 0 ? 0.2 : 0);

    // Word-start match
    var targetWords = t.split(" ");
    for (var i = 0; i < targetWords.length; i++) {
      if (targetWords[i]!.indexOf(w) === 0) return 0.95;
    }

    // Skip short queries for fuzzy
    if (w.length <= 3) return 0;

    // Stem matching (ing, ed, s)
    var stems = [w];
    if (w.endsWith("ing")) stems.push(w.slice(0, -3), w.slice(0, -3) + "e", w.slice(0, -3) + "ed");
    if (w.endsWith("ed")) stems.push(w.slice(0, -2), w.slice(0, -2) + "ing");
    if (w.endsWith("s") && w.length > 4) stems.push(w.slice(0, -1));

    for (var si = 1; si < stems.length; si++) {
      if (stems[si]!.length >= 3 && t.indexOf(stems[si]!) !== -1) return 0.85;
    }

    // Subsequence matching with consecutive bonus
    var qi = 0,
      score = 0,
      consecutive = 0,
      lastIdx = -2;
    for (var ti = 0; ti < t.length && qi < w.length; ti++) {
      if (t[ti] === w[qi]) {
        qi++;
        consecutive = ti === lastIdx + 1 ? consecutive + 1 : 1;
        score += consecutive + (ti === 0 ? 2 : 0);
        lastIdx = ti;
      }
    }
    if (qi < w.length) return 0;

    var lengthPenalty = w.length / Math.max(t.length, 1);
    return (score / (w.length * 4)) * (0.5 + 0.5 * lengthPenalty);
  }

  function computeSearchScore(query: string, fields: { text: string; weight: number }[]) {
    var words = query
      .trim()
      .split(/\s+/)
      .filter(function (w) {
        return w.length > 0;
      });
    if (words.length === 0) return 0;

    var totalScore = 0;
    for (var wi = 0; wi < words.length; wi++) {
      var bestWordScore = 0;
      for (var fi = 0; fi < fields.length; fi++) {
        var s = fuzzyWordScore(words[wi]!, fields[fi]!.text) * fields[fi]!.weight;
        if (s > bestWordScore) bestWordScore = s;
      }
      if (bestWordScore === 0) return 0;
      totalScore += bestWordScore;
    }
    return totalScore / words.length;
  }

  // ─── URL sync ───

  function syncToUrl() {
    var params = new URLSearchParams();
    var q = (document.getElementById("tech-filter") as HTMLInputElement).value || "";
    if (q) params.set("q", q);
    if (activeCat !== "featured") params.set("category", activeCat);
    var str = params.toString();
    history.replaceState(null, "", location.pathname + (str ? "?" + str : ""));
  }

  // ─── Filtering ───

  function filterByCategory(cat: string) {
    activeCat = cat;
    document.querySelectorAll(".cat-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-cat") === cat);
    });
    applyFilter();
    syncToUrl();
  }

  function applyFilter() {
    var t0 = performance.now();
    var query = (
      (document.getElementById("tech-filter") as HTMLInputElement).value || ""
    ).toLowerCase();
    var hasQuery = query.length > 0;
    var visibleCount = 0;
    var items = document.querySelectorAll(".tech-item");
    var scored: { el: HTMLElement; show: boolean; score: number }[] = [];

    items.forEach(function (el) {
      var htmlEl = el as HTMLElement;
      var name = htmlEl.getAttribute("data-name") || "";
      var cat = htmlEl.getAttribute("data-cat") || "";
      var desc = htmlEl.getAttribute("data-desc") || "";
      var slug = htmlEl.getAttribute("data-slug") || "";
      var keywords = htmlEl.getAttribute("data-kw") || "";
      var isFeatured = htmlEl.getAttribute("data-featured") === "true";

      if (hasQuery) {
        var score = computeSearchScore(query, [
          { text: name, weight: 1.0 },
          { text: slug, weight: 0.8 },
          { text: keywords, weight: 0.7 },
          { text: desc, weight: 0.6 },
          { text: cat, weight: 0.5 },
        ]);
        scored.push({ el: htmlEl, show: score > 0, score: score });
        return;
      }

      // No search — filter by active tab
      var show = false;
      if (activeCat === "featured") show = isFeatured;
      else if (activeCat === "all") show = true;
      else show = cat === activeCat;
      scored.push({ el: htmlEl, show: show, score: 0 });
    });

    // Sort by relevance when searching
    if (hasQuery) {
      scored.sort(function (a, b) {
        return b.score - a.score;
      });
      var grid = document.getElementById("tech-grid")!;
      scored.forEach(function (s) {
        grid.appendChild(s.el);
      });
    }

    // Apply visibility
    scored.forEach(function (s) {
      s.el.style.display = s.show ? "" : "none";
      if (s.show) visibleCount++;
    });

    // Update stats
    var elapsed = performance.now() - t0;
    document.getElementById("tech-count")!.textContent = visibleCount + " shown";
    document.getElementById("tech-time")!.textContent = hasQuery
      ? elapsed < 1
        ? "< 1ms"
        : elapsed.toFixed(1) + "ms"
      : "";
  }

  // ─── Init ───

  (window as any).filterCat = filterByCategory;

  document.getElementById("tech-filter")!.addEventListener("input", function () {
    applyFilter();
    syncToUrl();
  });

  // Restore state from URL
  var params = new URLSearchParams(location.search);
  var savedQuery = params.get("q");
  var savedCat = params.get("category");

  if (savedQuery) (document.getElementById("tech-filter") as HTMLInputElement).value = savedQuery;
  if (savedCat) {
    activeCat = savedCat;
    document.querySelectorAll(".cat-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-cat") === savedCat);
    });
  }
  if (savedQuery || savedCat) applyFilter();
})();
