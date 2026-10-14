// Orientation + fill-the-page layout.
//   sheet.html            -> A3 landscape
//   sheet.html?portrait   -> A3 portrait
// 1. try several column counts; for each, binary-search the largest font at which
//    every card fits (no clipped lines, cards split into columns in reading order)
// 2. keep the column count with the largest font, balance the columns
// 3. stretch line-height so every column reaches the bottom of the page
(function () {
  const portrait = /portrait/.test(location.search + location.hash);
  if (portrait) {
    document.documentElement.classList.add("portrait");
    const s = document.createElement("style");
    s.textContent = "@page { size: A3 portrait; margin: 0; }";
    document.head.appendChild(s);
  }

  function run() {
    const box = document.querySelector(".fit");
    const combined = !!box.querySelector(".row");
    const items = [...box.querySelectorAll(combined ? ".row" : ".card")];
    const langs = box.querySelector(".langs");
    const counts = combined ? [portrait ? 1 : 2] : portrait ? [2, 3, 4] : [3, 4, 5, 6];

    box.textContent = "";
    const grid = document.createElement("div");
    grid.className = "grid";
    box.appendChild(grid);
    const pres = items.flatMap((it) => [...it.querySelectorAll("pre")]);
    // one block per source line so an over-long line can wrap with a hanging indent
    for (const p of pres)
      p.innerHTML = p.innerHTML.split("\n").map((l) => `<span class="ln">${l || " "}</span>`).join("");
    const lns = pres.flatMap((p) => [...p.children]);
    const WRAP_BUDGET = 0.03; // at most 3% of lines may wrap

    let cols = [];
    function makeCols(k) {
      grid.textContent = "";
      cols = [];
      for (let i = 0; i < k; i++) {
        const c = document.createElement("div");
        c.className = "colm";
        if (langs) c.appendChild(langs.cloneNode(true));
        grid.appendChild(c);
        cols.push(c);
      }
    }
    const gapPx = () => parseFloat(getComputedStyle(cols[0]).rowGap) || 0;
    const avail = () => cols[0].clientHeight - (langs ? cols[0].firstChild.offsetHeight + gapPx() : 0);

    // stack everything in column 0 and measure
    function measure() {
      for (const it of items) cols[0].appendChild(it);
      for (const el of items.map((i) => i.querySelector("h2")))
        if (el.scrollWidth > el.clientWidth + 1) return null;
      let wrapped = 0;
      const lh = parseFloat(getComputedStyle(pres[0]).lineHeight);
      for (const l of lns) if (l.offsetHeight > lh * 1.5 || l.scrollWidth > l.clientWidth + 1) wrapped++;
      if (wrapped > lns.length * WRAP_BUDGET) return null;
      return items.map((it) => it.getBoundingClientRect().height);
    }
    // contiguous partition: fewest columns with each column <= limit
    function split(hs, limit, gap) {
      const groups = [[]];
      let used = 0;
      hs.forEach((h, i) => {
        const add = (groups.at(-1).length ? gap : 0) + h;
        if (groups.at(-1).length && used + add > limit) { groups.push([i]); used = h; }
        else { groups.at(-1).push(i); used += add; }
      });
      return groups;
    }
    function fits(f, k) {
      box.style.fontSize = f + "px";
      const hs = measure();
      if (!hs) return false;
      if (hs.some((h) => h > avail())) return false;
      return split(hs, avail(), gapPx()).length <= k;
    }

    let best = { f: 0, k: counts[0] };
    for (const k of counts) {
      makeCols(k);
      let lo = 2, hi = 24;
      for (let i = 0; i < 22; i++) {
        const m = (lo + hi) / 2;
        if (fits(m, k)) lo = m; else hi = m;
      }
      if (lo > best.f * 1.005) best = { f: lo, k };
    }

    // final layout: balanced partition at the chosen font
    makeCols(best.k);
    box.style.fontSize = best.f + "px";
    const hs = measure();
    const H = avail(), gap = gapPx();
    let lo = Math.max(...hs), hi = H;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (split(hs, m, gap).length <= best.k) hi = m; else lo = m;
    }
    split(hs, hi, gap).forEach((g, ci) => g.forEach((i) => cols[ci].appendChild(items[i])));

    // stretch: equalise the 3 language columns inside a row, then grow line-height
    // in each page column until it reaches the bottom
    const lhOf = (p) => parseFloat(getComputedStyle(p).lineHeight);
    const inner = (p) => [...p.children].reduce((a, l) => a + l.offsetHeight, 0); // text height, not the stretched box
    for (const row of combined ? items : []) {
      const ps = [...row.querySelectorAll(".tri pre")];
      const h = Math.max(...ps.map(inner));
      for (const p of ps) p.style.lineHeight = lhOf(p) * h / inner(p) + "px";
    }
    for (const col of cols) {
      const ps = [...col.querySelectorAll(combined ? ".tri pre:first-child" : "pre")];
      const text = ps.reduce((a, p) => a + inner(p), 0);
      const used = [...col.children].reduce((a, c) => a + c.getBoundingClientRect().height, 0) + gap * (col.children.length - 1);
      const sMax = Math.min(1.6, 1 + Math.max(0, col.clientHeight - used) / text);
      const scope = combined ? [...col.querySelectorAll(".tri pre")] : ps;
      const base = scope.map(lhOf);
      const apply = (s) => scope.forEach((p, i) => (p.style.lineHeight = base[i] * s + "px"));
      let lo = 0.85, hi = sMax; // may also tighten slightly if rounding left a few px over
      for (let i = 0; i < 16; i++) {
        const m = (lo + hi) / 2;
        apply(m);
        if (col.scrollHeight <= col.clientHeight) lo = m; else hi = m;
      }
      apply(lo);
    }
    document.documentElement.dataset.fit = `${best.f.toFixed(2)}px, ${best.k} cols`;
  }

  document.fonts.ready.then(run);
})();
