(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;

  function rgbVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }
  function isDark() {
    return !window.matchMedia("(prefers-color-scheme: light)").matches;
  }

  // Header background once the page scrolls
  const top = document.querySelector(".top");
  function onScroll() {
    if (top) top.classList.toggle("scrolled", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Scroll reveals
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce.matches) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* ------------------------------------------------------------------
     Hero raster. 64 simulated units at three depths. Far rows are dimmer
     and drift slower, which gives a little parallax. Every so often a
     stimulus arrives and responsive units fire a burst after a latency,
     which blooms in the warm colour. Units near the pointer fire more,
     like a receptive field.
  ------------------------------------------------------------------ */
  const canvas = document.getElementById("raster");
  if (canvas && canvas.getContext) initRaster(canvas);

  function initRaster(canvas) {
    const ctx = canvas.getContext("2d");
    const UNITS = 64;
    const PX_PER_MS = 0.6; // 100 ms = 60 px, matches the caption's scale bar
    const SPEED = 0.45;    // fraction of real time, keeps it calm
    const LAYERS = [
      { speed: 0.55, alpha: 0.35, h: 0.45, glow: 0.05 },
      { speed: 0.78, alpha: 0.6, h: 0.6, glow: 0.08 },
      { speed: 1.0, alpha: 0.95, h: 0.75, glow: 0.12 },
    ];
    let W = 0, H = 0, dpr = 1;
    let units = [], spikes = [], stims = [];
    let pointer = { x: -1e4, y: -1e4, active: false, sx: 0, sy: 0 };
    let lastT = 0, untilStim = 500, raf = 0, visible = true;
    let cool = "176, 204, 255", warm = "255, 148, 102", additive = true;

    function readColors() {
      cool = rgbVar("--cool") || cool;
      warm = rgbVar("--warm") || warm;
      additive = isDark();
    }

    function makeUnits() {
      units = [];
      for (let i = 0; i < UNITS; i++) {
        const layer = Math.random() < 0.3 ? 0 : Math.random() < 0.55 ? 1 : 2;
        units.push({
          layer,
          rate: 2 + Math.random() * 12,
          responsive: Math.random() < 0.5,
          latency: 28 + Math.random() * 45,
        });
      }
    }

    function rowY(i) {
      const topPad = 64, bottom = H * 0.97;
      return topPad + (i + 0.5) * ((bottom - topPad) / UNITS);
    }
    function rowGap() { return (H * 0.97 - 64) / UNITS; }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function addBackground(dtMs, x) {
      for (let i = 0; i < UNITS; i++) {
        if (Math.random() < units[i].rate * dtMs / 1000) spikes.push({ x, u: i, kind: 0, age: 1e9 });
      }
    }

    function addStimulus(x) {
      stims.push({ x, age: 0 });
      for (let i = 0; i < UNITS; i++) {
        const u = units[i];
        if (!u.responsive) continue;
        const n = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) {
          const t = u.latency + k * (5 + Math.random() * 9) + (Math.random() - 0.5) * 8;
          spikes.push({ x: x + t * PX_PER_MS, u: i, kind: 2, age: 0 });
        }
      }
    }

    // Receptive field drive: units whose row sits near the pointer fire extra
    // spikes at the pointer's position.
    function addDriven(dtMs) {
      if (!pointer.active) return;
      const sigma = Math.max(40, H * 0.07);
      for (let i = 0; i < UNITS; i++) {
        const dy = rowY(i) - pointer.y;
        const gain = Math.exp(-(dy * dy) / (2 * sigma * sigma));
        if (gain < 0.02) continue;
        if (Math.random() < 55 * gain * dtMs / 1000) {
          spikes.push({ x: pointer.x + (Math.random() - 0.5) * 50, u: i, kind: 1, age: 0 });
        }
      }
    }

    function prefill() {
      spikes = []; stims = [];
      const step = 5;
      let since = 0;
      for (let x = 0; x < W + 40; x += step * PX_PER_MS) {
        addBackground(step, x);
        since += step;
        if (since > 650 + Math.random() * 500) { addStimulus(x); since = 0; }
      }
      for (const s of spikes) s.age = 1e9;
      for (const s of stims) s.age = 1e9;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
      const gap = rowGap();
      const px = pointer.active ? (pointer.x / W - 0.5) : 0;

      // Soft warm columns behind stimulus-locked bursts
      for (const s of stims) {
        const x = s.x + 40 * PX_PER_MS;
        if (x < -200 || x > W + 200) continue;
        const fresh = Math.max(0, 1 - s.age / 900);
        const a = (additive ? 0.07 : 0.05) + fresh * 0.08;
        const g = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
        g.addColorStop(0, `rgba(${warm},0)`);
        g.addColorStop(0.5, `rgba(${warm},${a})`);
        g.addColorStop(1, `rgba(${warm},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 70, 0, 140, H);
      }

      for (let L = 0; L < 3; L++) {
        const lay = LAYERS[L];
        const shift = px * (L - 1) * 14; // pointer parallax
        const h = Math.max(3, gap * lay.h * 1.6);
        for (let pass = 0; pass < 2; pass++) {
          // pass 0: wide soft glow, pass 1: crisp core
          for (let kind = 0; kind < 3; kind++) {
            ctx.beginPath();
            let any = false;
            for (const s of spikes) {
              if (s.kind !== kind || units[s.u].layer !== L) continue;
              const x = s.x + shift;
              if (x < -4 || x > W + 4) continue;
              const y = rowY(s.u);
              ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y + h / 2);
              any = true;
            }
            if (!any) continue;
            const col = kind === 0 ? cool : warm;
            const base = kind === 0 ? lay.alpha * (additive ? 0.55 : 0.5) : lay.alpha;
            if (pass === 0) {
              ctx.lineWidth = kind === 0 ? 4 : 7;
              ctx.strokeStyle = `rgba(${col},${(kind === 0 ? lay.glow : lay.glow * 2.2) * (additive ? 1 : 0.4)})`;
            } else {
              ctx.lineWidth = kind === 0 ? 1.1 : 1.6;
              ctx.strokeStyle = `rgba(${col},${base})`;
            }
            ctx.stroke();
          }
        }
      }

      // Pointer receptive field halo
      if (pointer.active) {
        const r = Math.max(70, H * 0.12);
        const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, r);
        g.addColorStop(0, `rgba(${warm},${additive ? 0.12 : 0.08})`);
        g.addColorStop(1, `rgba(${warm},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(pointer.x - r, pointer.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function frame(t) {
      const dt = Math.min(50, lastT ? t - lastT : 16);
      lastT = t;
      const simDt = dt * SPEED;
      const base = simDt * PX_PER_MS;
      for (const s of spikes) { s.x -= base * LAYERS[units[s.u].layer].speed; s.age += dt; }
      for (const s of stims) { s.x -= base * 0.9; s.age += dt; }
      spikes = spikes.filter((s) => s.x > -20);
      if (spikes.length > 8000) spikes = spikes.slice(-8000);
      stims = stims.filter((s) => s.x > -300);
      addBackground(simDt, W + 4);
      addDriven(simDt);
      untilStim -= simDt;
      if (untilStim <= 0) { addStimulus(W + 4); untilStim = 650 + Math.random() * 600; }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      lastT = 0;
      if (!reduce.matches && !document.hidden && visible) raf = requestAnimationFrame(frame);
    }

    function setPointer(e) {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
      pointer.active = pointer.y >= 0 && pointer.y <= r.height;
    }
    const hero = canvas.parentElement;
    hero.addEventListener("pointermove", setPointer, { passive: true });
    hero.addEventListener("pointerdown", setPointer, { passive: true });
    hero.addEventListener("pointerleave", () => { pointer.active = false; });
    hero.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") pointer.active = false; });

    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { resize(); prefill(); draw(); }, 150);
    });
    document.addEventListener("visibilitychange", start);
    reduce.addEventListener?.("change", () => { draw(); start(); });
    darkQuery.addEventListener?.("change", () => { readColors(); draw(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; start(); }).observe(canvas);
    }

    readColors(); resize(); makeUnits(); prefill(); draw(); start();
  }

  /* ------------------------------------------------------------------
     Plate thumbnails. Each is a small generative drawing hinting at the
     project's subject. They are drawn once and animate gently while the
     plate is hovered or focused.
  ------------------------------------------------------------------ */
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

  const thumbs = {
    raster(ctx, w, h, t, C) {
      const r = rng(7), rows = 22, top = h * 0.1, bot = h * 0.66;
      const stim = w * 0.42;
      const g = ctx.createLinearGradient(stim - 40, 0, stim + 60, 0);
      g.addColorStop(0, `rgba(${C.warm},0)`); g.addColorStop(0.5, `rgba(${C.warm},0.14)`); g.addColorStop(1, `rgba(${C.warm},0)`);
      ctx.fillStyle = g; ctx.fillRect(stim - 40, 0, 100, bot + 4);
      const drift = (t * 0.02) % 1;
      for (let i = 0; i < rows; i++) {
        const y = top + (i + 0.5) * (bot - top) / rows;
        const resp = r() < 0.6;
        let x = r() * 30;
        while (x < w) {
          const hot = resp && x > stim && x < stim + 50;
          ctx.strokeStyle = hot ? `rgba(${C.warm},0.95)` : `rgba(${C.cool},0.55)`;
          ctx.lineWidth = hot ? 1.6 : 1;
          const xx = (x - drift * 30 + w) % w;
          ctx.beginPath(); ctx.moveTo(xx, y - 3); ctx.lineTo(xx, y + 3); ctx.stroke();
          x += hot ? 4 + r() * 6 : 10 + r() * 60;
        }
      }
      // multiscale pyramid of bins
      const levels = [1, 2, 5, 10, 25, 50];
      levels.forEach((n, k) => {
        const y = h * 0.72 + k * (h * 0.045);
        const bw = (w * 0.9) / n;
        for (let j = 0; j < n; j++) {
          const v = 0.25 + 0.6 * Math.abs(Math.sin(j * 1.7 + k + t * 0.002));
          ctx.fillStyle = `rgba(${k === 2 ? C.warm : C.cool},${(k === 2 ? 0.75 : 0.28) * v})`;
          ctx.fillRect(w * 0.05 + j * bw + 0.5, y, Math.max(1, bw - 1.5), h * 0.03);
        }
      });
    },
    manifold(ctx, w, h, t, C) {
      const r = rng(11), ang = t * 0.00025;
      const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.34;
      for (let k = 0; k < 7; k++) {
        const ph = r() * 6.28, a0 = 0.6 + r() * 0.5;
        ctx.beginPath();
        for (let i = 0; i <= 260; i++) {
          const tt = i / 260 * 12;
          const amp = a0 * Math.exp(-tt * 0.08);
          const x3 = amp * Math.cos(tt + ph), y3 = amp * Math.sin(tt + ph), z3 = 0.5 * amp * Math.sin(tt * 0.33 + ph);
          const x = x3 * Math.cos(ang) - z3 * Math.sin(ang);
          const y = y3 * 0.75 + (x3 * Math.sin(ang) + z3 * Math.cos(ang)) * 0.35;
          i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s);
        }
        ctx.strokeStyle = k === 2 ? `rgba(${C.warm},0.9)` : `rgba(${C.cool},${0.25 + k * 0.05})`;
        ctx.lineWidth = k === 2 ? 1.5 : 1;
        ctx.stroke();
      }
      // sparse observed points
      const r2 = rng(5 + Math.floor(t / 400));
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${C.cool},0.7)`;
        ctx.fillRect(cx + gauss(r2) * s * 0.5, cy + gauss(r2) * s * 0.35, 1.6, 1.6);
      }
    },
    waveforms(ctx, w, h, t, C) {
      const r = rng(3 + Math.floor(t / 180));
      const units = [{ a: 1, c: C.cool, d: 0 }, { a: 0.6, c: C.cool, d: 0.08 }, { a: 0.85, c: C.warm, d: -0.05 }];
      const base = h * 0.45;
      units.forEach((u, ui) => {
        for (let k = 0; k < 18; k++) {
          ctx.beginPath();
          for (let i = 0; i <= 80; i++) {
            const x = i / 80, tt = x - 0.35 - u.d;
            const v = -u.a * Math.exp(-(tt * tt) / 0.0025) + 0.45 * u.a * Math.exp(-((tt - 0.12) ** 2) / 0.008) + gauss(r) * 0.03;
            const px = w * 0.08 + x * w * 0.84, py = base + v * h * 0.32;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.strokeStyle = `rgba(${u.c},${ui === 2 ? 0.28 : 0.16})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
      ctx.strokeStyle = `rgba(${C.cool},0.25)`;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.83); ctx.lineTo(w * 0.92, h * 0.83); ctx.stroke();
      ctx.setLineDash([]);
    },
    eeg(ctx, w, h, t, C) {
      const r = rng(19), ch = 9;
      for (let c = 0; c < ch; c++) {
        const y0 = h * (0.12 + c * 0.09), f = 0.03 + r() * 0.02, ph = r() * 6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const tt = x + t * 0.05;
          const mu = (c === 4 || c === 5) ? Math.sin(tt * 0.12) * (0.5 + 0.5 * Math.sin(tt * 0.01)) * 5 : 0;
          const v = Math.sin(tt * f + ph) * 3 + Math.sin(tt * f * 2.7 + ph * 2) * 2 + mu;
          x ? ctx.lineTo(x, y0 + v) : ctx.moveTo(x, y0 + v);
        }
        ctx.strokeStyle = (c === 4 || c === 5) ? `rgba(${C.warm},0.85)` : `rgba(${C.cool},0.45)`;
        ctx.lineWidth = 1; ctx.stroke();
      }
    },
    panels(ctx, w, h, t, C) {
      const cols = 4, rowsN = 2, pad = w * 0.05, gap = w * 0.025;
      const pw = (w - pad * 2 - gap * (cols - 1)) / cols, ph = (h - pad * 2 - gap * (rowsN - 1)) / rowsN;
      const seeds = [1, 2, 3, 4, 5, 6, 3, 8];
      const boxes = [];
      for (let i = 0; i < cols * rowsN; i++) {
        const x = pad + (i % cols) * (pw + gap), y = pad + Math.floor(i / cols) * (ph + gap);
        boxes.push([x, y]);
        ctx.fillStyle = `rgba(${C.cool},0.05)`; ctx.fillRect(x, y, pw, ph);
        const r = rng(seeds[i] * 97), mirror = i === 6;
        for (let k = 0; k < 22; k++) {
          let cx = r() * pw; const cy = r() * ph, rad = 1.5 + r() * 4;
          if (mirror) cx = pw - cx;
          ctx.fillStyle = `rgba(${C.cool},${0.25 + r() * 0.5})`;
          ctx.beginPath(); ctx.arc(x + cx, y + cy, rad, 0, 6.29); ctx.fill();
        }
        if (i === 2 || i === 6) {
          ctx.strokeStyle = `rgba(${C.warm},0.95)`; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
        }
      }
      const a = boxes[2], b = boxes[6], pulse = 0.5 + 0.5 * Math.sin(t * 0.004);
      ctx.strokeStyle = `rgba(${C.warm},${0.4 + 0.5 * pulse})`; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a[0] + pw / 2, a[1] + ph); ctx.lineTo(b[0] + pw / 2, b[1]); ctx.stroke(); ctx.setLineDash([]);
    },
    lake(ctx, w, h, t, C) {
      // 150 squares, roughly 51% clean, 7% with an error, the rest with warnings
      const r = rng(23), n = 150, cols = 25, rowsN = 6;
      const cell = Math.min((w * 0.86) / cols, (h * 0.7) / rowsN);
      const ox = (w - cell * cols) / 2, oy = (h - cell * rowsN) / 2;
      const kinds = [];
      for (let i = 0; i < n; i++) kinds.push(i < 76 ? 0 : i < 86 ? 2 : 1);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      const scan = (t * 0.03) % (cols + 6);
      for (let i = 0; i < n; i++) {
        const cx = ox + (i % cols) * cell, cy = oy + Math.floor(i / cols) * cell, k = kinds[i];
        const lit = Math.max(0, 1 - Math.abs((i % cols) - scan) / 3);
        const s = cell * 0.62;
        if (k === 0) { ctx.fillStyle = `rgba(${C.cool},${0.45 + lit * 0.4})`; ctx.fillRect(cx, cy, s, s); }
        else if (k === 2) { ctx.fillStyle = `rgba(${C.warm},0.95)`; ctx.fillRect(cx, cy, s, s); }
        else { ctx.strokeStyle = `rgba(${C.cool},${0.4 + lit * 0.4})`; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, s - 1, s - 1); }
      }
    },
    tracts(ctx, w, h, t, C) {
      const r = rng(31), sway = Math.sin(t * 0.0015) * 6;
      for (let b = 0; b < 3; b++) {
        const y0 = h * (0.3 + b * 0.2), y1 = h * (0.7 - b * 0.18);
        for (let k = 0; k < 26; k++) {
          const o = gauss(r) * h * 0.035;
          ctx.beginPath();
          ctx.moveTo(w * 0.06, y0 + o);
          ctx.bezierCurveTo(w * 0.35, y0 + o - h * 0.35 + sway, w * 0.65, y1 + o + h * 0.3 - sway, w * 0.94, y1 + o * 1.6);
          ctx.strokeStyle = b === 1 ? `rgba(${C.warm},0.32)` : `rgba(${C.cool},0.2)`;
          ctx.lineWidth = 1; ctx.stroke();
        }
      }
    },
    pages(ctx, w, h, t, C) {
      const r = rng(41), pw = w * 0.17, ph = h * 0.62, y = h * 0.19;
      const hi = Math.floor(t / 600) % 4;
      for (let p = 0; p < 4; p++) {
        const x = w * 0.05 + p * (pw + w * 0.025);
        ctx.strokeStyle = `rgba(${C.cool},0.35)`; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, pw, ph);
        for (let l = 0; l < 14; l++) {
          const ly = y + 10 + l * (ph - 16) / 14, lw = (pw - 16) * (0.5 + r() * 0.5);
          const hot = (l === 4 + p || l === 5 + p) && p === hi;
          ctx.fillStyle = hot ? `rgba(${C.warm},0.9)` : `rgba(${C.cool},0.28)`;
          ctx.fillRect(x + 8, ly, lw, 2);
        }
      }
      const ax = w * 0.83, ay = h * 0.35;
      ctx.strokeStyle = `rgba(${C.warm},0.9)`; ctx.strokeRect(ax, ay, w * 0.12, h * 0.3);
      for (let l = 0; l < 5; l++) { ctx.fillStyle = `rgba(${C.warm},0.6)`; ctx.fillRect(ax + 6, ay + 10 + l * 9, w * 0.12 - 12 - (l === 4 ? 14 : 0), 2); }
    },
    glyphs(ctx, w, h, t, C) {
      const off = document.createElement("canvas"); off.width = 28; off.height = 12;
      const o = off.getContext("2d"); o.fillStyle = "#fff"; o.font = "bold 11px sans-serif"; o.textBaseline = "middle"; o.fillText("STOP", 1, 6.5);
      const data = o.getImageData(0, 0, 28, 12).data;
      const cell = Math.min(w * 0.4 / 28, h * 0.5 / 12), ox = w * 0.06, oy = (h - cell * 12) / 2;
      const flick = 0.75 + 0.25 * Math.sin(t * 0.006);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 28; x++) {
        const v = data[(y * 28 + x) * 4] / 255;
        ctx.fillStyle = `rgba(${C.cool},${0.06 + v * 0.7 * flick})`;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
      }
      ctx.fillStyle = `rgba(${C.warm},0.95)`;
      ctx.font = `600 ${Math.round(h * 0.2)}px Fraunces, Georgia, serif`;
      ctx.textBaseline = "middle"; ctx.fillText("STOP", w * 0.62, h / 2 + 2);
      ctx.strokeStyle = `rgba(${C.cool},0.35)`; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.2); ctx.lineTo(w * 0.5, h * 0.8); ctx.stroke(); ctx.setLineDash([]);
    },
  };

  const thumbEls = Array.from(document.querySelectorAll("canvas.thumb"));
  function colors() { return { cool: rgbVar("--cool"), warm: rgbVar("--warm") }; }

  function paint(el, t) {
    const fn = thumbs[el.dataset.thumb];
    if (!fn) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    }
    const ctx = el.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = isDark() ? "lighter" : "source-over";
    fn(ctx, w, h, t, colors());
    ctx.globalCompositeOperation = "source-over";
  }

  function paintAll() { thumbEls.forEach((el) => paint(el, el._t || 0)); }

  thumbEls.forEach((el) => {
    el._t = 0;
    const plate = el.closest(".plate");
    let raf = 0, last = 0;
    function loop(ts) {
      el._t += Math.min(50, last ? ts - last : 16); last = ts;
      paint(el, el._t);
      raf = requestAnimationFrame(loop);
    }
    function on() { if (reduce.matches || raf) return; last = 0; raf = requestAnimationFrame(loop); }
    function off() { cancelAnimationFrame(raf); raf = 0; }
    plate.addEventListener("pointerenter", on);
    plate.addEventListener("pointerleave", off);
    plate.addEventListener("focusin", on);
    plate.addEventListener("focusout", off);
  });

  let pt;
  window.addEventListener("resize", () => { clearTimeout(pt); pt = setTimeout(paintAll, 150); });
  darkQuery.addEventListener?.("change", paintAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintAll);
  paintAll();
})();
