(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {
      return null;
    }
  }

  /* ---------- Theme (same behaviour as the live bio) ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    if (themeBtn) themeBtn.textContent = t === 'light' ? 'Dark mode' : 'Light mode';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#0d1117');
  }
  if (themeBtn) {
    applyTheme(store('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      store('theme', next);
      net.redraw();
    });
  }

  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  /* ---------- ASCII neural net background ---------- */
  var LAYER_DEFS = [
    { id: 'in', labels: [
      { name: 'logs', short: 'logs' },
      { name: 'prompts', short: 'prm' },
      { name: 'identity', short: 'id' },
      { name: 'network', short: 'net' }
    ] },
    { id: 'h1', count: 5 },
    { id: 'h2', count: 6 },
    { id: 'h3', count: 4 },
    { id: 'out', labels: [
      { name: 'THREAT', short: 'THRT', tone: 'threat' },
      { name: 'SAFE', short: 'SAFE', tone: 'safe' },
      { name: 'GUARDRAIL', short: 'GUARD', tone: 'guard' }
    ] }
  ];

  var BUILD_DONE = 7.4;
  var PULSE_START = 7.9;
  var PULSE_EVERY = 4.6;
  var PULSE_EDGE = 0.42;
  var FPS = 24;
  var FRAME_MS = 1000 / FPS;
  var FONT_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

  var PRESET_PATHS = [
    [0, 1, 1, 0, 0],
    [1, 2, 3, 2, 2],
    [2, 3, 4, 2, 1],
    [3, 4, 5, 3, 0],
    [0, 0, 2, 1, 2],
    [1, 3, 2, 0, 1]
  ];

  var canvas = document.getElementById('ascii-nn');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var motionBtn = document.getElementById('motion-toggle');
  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var wantMotion = store('motion') !== 'off';
  var inView = true;
  var rafId = null;
  var lastFrame = 0;
  var animTime = 0;
  var frozen = false;
  var layers = [];
  var edges = [];
  var paths = [];
  var metrics = { cols: 0, rows: 0, cellW: 8, cellH: 14, fontSize: 12, padX: 0, padY: 0, narrow: false };

  var params = new URLSearchParams(location.search);
  if (params.has('t')) {
    var seed = parseFloat(params.get('t'));
    if (!isNaN(seed) && seed >= 0) animTime = seed;
  }
  if (params.get('freeze') === '1' || params.get('freeze') === 'true') frozen = true;

  function canAnimate() {
    return ctx && wantMotion && !reduceMq.matches && !document.hidden && inView && !frozen;
  }

  function palette() {
    var light = root.getAttribute('data-theme') === 'light';
    if (light) {
      return {
        edge: 'rgba(9, 105, 218, 0.95)',
        node: 'rgba(9, 105, 218, 1)',
        live: 'rgba(26, 127, 55, 1)',
        pulse: 'rgba(9, 105, 218, 1)',
        pulseEdge: 'rgba(9, 105, 218, 1)',
        label: 'rgba(9, 105, 218, 1)',
        threat: 'rgba(154, 60, 0, 1)',
        safe: 'rgba(26, 127, 55, 1)',
        guard: 'rgba(9, 105, 218, 1)'
      };
    }
    return {
      edge: 'rgba(88, 166, 255, 1)',
      node: 'rgba(88, 196, 255, 1)',
      live: 'rgba(126, 231, 135, 1)',
      pulse: 'rgba(80, 255, 220, 1)',
      pulseEdge: 'rgba(88, 230, 220, 1)',
      label: 'rgba(125, 209, 255, 1)',
      threat: 'rgba(255, 166, 87, 1)',
      safe: 'rgba(126, 231, 135, 1)',
      guard: 'rgba(88, 166, 255, 1)'
    };
  }

  function toneColor(tone, pal, lit) {
    if (tone === 'threat') return pal.threat;
    if (tone === 'safe') return pal.safe;
    if (tone === 'guard') return pal.guard;
    return lit ? pal.live : pal.node;
  }

  function buildGraph() {
    var L = LAYER_DEFS.length;
    layers = LAYER_DEFS.map(function (def, li) {
      var n = def.labels ? def.labels.length : def.count;
      var x = (li / (L - 1)) * 2 - 1;
      var nodes = [];
      var i;
      for (i = 0; i < n; i++) {
        var y = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.62;
        var z = Math.sin(i * 1.7 + li * 0.9) * 0.26;
        var lab = def.labels ? def.labels[i] : null;
        nodes.push({
          x: x, y: y, z: z,
          label: lab ? lab.name : '',
          short: lab ? lab.short : '',
          tone: lab ? lab.tone : '',
          layer: li,
          index: i
        });
      }
      return { id: def.id, nodes: nodes };
    });

    edges = [];
    var li, i, j, a, b, dists, take, t;
    for (li = 0; li < layers.length - 1; li++) {
      a = layers[li].nodes;
      b = layers[li + 1].nodes;
      for (i = 0; i < a.length; i++) {
        var iy = a.length === 1 ? 0.5 : i / (a.length - 1);
        dists = [];
        for (j = 0; j < b.length; j++) {
          var jy = b.length === 1 ? 0.5 : j / (b.length - 1);
          dists.push({ j: j, d: Math.abs(iy - jy) });
        }
        dists.sort(function (p, q) { return p.d - q.d; });
        take = Math.min(3, dists.length);
        for (t = 0; t < take; t++) {
          edges.push({ a: a[i], b: b[dists[t].j], layer: li });
        }
      }
    }

    paths = PRESET_PATHS.map(function (idx) {
      var nodes = [];
      var eids = [];
      for (li = 0; li < layers.length; li++) {
        var ni = Math.min(idx[li], layers[li].nodes.length - 1);
        nodes.push(layers[li].nodes[ni]);
      }
      for (li = 0; li < nodes.length - 1; li++) {
        var found = -1;
        for (j = 0; j < edges.length; j++) {
          if (edges[j].a === nodes[li] && edges[j].b === nodes[li + 1]) {
            found = j;
            break;
          }
        }
        if (found < 0) {
          edges.push({ a: nodes[li], b: nodes[li + 1], layer: li });
          found = edges.length - 1;
        }
        eids.push(found);
      }
      return { nodes: nodes, edges: eids };
    });
  }

  function measure() {
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var fontSize = w < 480 ? 10 : w < 800 ? 11 : 13;
    ctx.font = fontSize + 'px ' + FONT_STACK;
    var cellW = Math.max(6, Math.ceil(ctx.measureText('M').width));
    var cellH = Math.round(fontSize * 1.35);
    var cols = Math.max(40, Math.floor(w / cellW));
    var rows = Math.max(20, Math.floor(h / cellH));
    metrics = {
      cols: cols,
      rows: rows,
      cellW: cellW,
      cellH: cellH,
      fontSize: fontSize,
      padX: (w - cols * cellW) / 2,
      padY: (h - rows * cellH) / 2,
      narrow: w < 700
    };
  }

  function project(p, time) {
    var yaw = Math.sin(time * 0.13) * 0.2;
    var pitch = Math.cos(time * 0.1) * 0.07;
    if (reduceMq.matches || !wantMotion) {
      yaw = 0;
      pitch = 0;
    }
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var x1 = p.x * cy - p.z * sy;
    var z1 = p.x * sy + p.z * cy;
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var y1 = p.y * cp - z1 * sp;
    var z2 = p.y * sp + z1 * cp;
    var dist = 3.4;
    var s = dist / (dist + z2);
    var xSpan = metrics.narrow ? 0.26 : 0.30;
    var topPad = Math.max(3, Math.round(88 / metrics.cellH));
    var usable = Math.max(10, metrics.rows - topPad - 2);
    var col = metrics.cols / 2 + x1 * s * metrics.cols * xSpan;
    var row = topPad + usable / 2 + y1 * s * usable * 0.42;
    return { col: col, row: row, scale: s, z: z2 };
  }

  function layerAppear(li) {
    return 0.35 + li * 1.45;
  }

  function nodeAlpha(node, time) {
    var t0 = layerAppear(node.layer);
    if (time < t0) return 0;
    return Math.min(1, (time - t0) / 0.55);
  }

  function edgeFrac(edge, time) {
    var t0 = layerAppear(edge.layer) + 0.5;
    if (time < t0) return 0;
    return Math.min(1, (time - t0) / 1.05);
  }

  function charFor(dc, dr) {
    var adx = Math.abs(dc);
    var ady = Math.abs(dr);
    if (adx < 0.001) return '|';
    var slope = ady / adx;
    if (slope < 0.35) return '-';
    if (slope > 2.4) return '|';
    return (dc > 0 && dr > 0) || (dc < 0 && dr < 0) ? '\\' : '/';
  }

  function plot(buf, c, r, ch, color, pri) {
    var col = Math.round(c);
    var row = Math.round(r);
    if (col < 0 || row < 0 || col >= metrics.cols || row >= metrics.rows) return;
    var k = row * metrics.cols + col;
    var prev = buf.get(k);
    if (!prev || pri >= prev.pri) buf.set(k, { ch: ch, color: color, pri: pri, c: col, r: row });
  }

  function plotText(buf, c, r, text, color, pri) {
    var i;
    for (i = 0; i < text.length; i++) plot(buf, c + i, r, text.charAt(i), color, pri);
  }

  function rasterEdge(buf, a, b, frac, color) {
    if (frac <= 0) return;
    var dc = b.col - a.col;
    var dr = b.row - a.row;
    var n = Math.max(Math.abs(dc), Math.abs(dr), 1);
    var steps = Math.floor(n * frac);
    var ch = charFor(dc, dr);
    var i, t, c, r;
    for (i = 1; i < steps; i++) {
      t = i / n;
      c = a.col + dc * t;
      r = a.row + dr * t;
      plot(buf, c, r, i % 3 === 0 ? '·' : ch, color, 1);
    }
  }

  function activePulses(time) {
    var list = [];
    if (time < PULSE_START) return list;
    var i, start, local, path, edgeCount, total, e, f, along;
    for (i = 0; i < 8; i++) {
      start = PULSE_START + i * PULSE_EVERY;
      if (time < start) break;
      path = paths[i % paths.length];
      edgeCount = path.edges.length;
      total = edgeCount * PULSE_EDGE;
      local = time - start;
      if (local > total + 0.15) continue;
      if (local < 0) continue;
      along = Math.min(local, total);
      e = Math.min(edgeCount - 1, Math.floor(along / PULSE_EDGE));
      f = Math.min(1, (along - e * PULSE_EDGE) / PULSE_EDGE);
      list.push({ path: path, e: e, f: f, node: Math.min(e + (f >= 0.97 ? 1 : 0), edgeCount) });
    }
    return list;
  }

  function litNodes(pulses) {
    var set = new Set();
    pulses.forEach(function (p) {
      var nodes = p.path.nodes;
      set.add(nodes[p.e]);
      if (p.f > 0.15) set.add(nodes[Math.min(p.e + 1, nodes.length - 1)]);
    });
    return set;
  }

  function render() {
    if (!ctx) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    if (!layers.length) return;

    var time = animTime;
    var pal = palette();
    var buf = new Map();
    var projected = new Map();
    var pulses = (reduceMq.matches || !wantMotion) ? [] : activePulses(time);
    var lit = litNodes(pulses);

    function projOf(node) {
      var cached = projected.get(node);
      if (cached) return cached;
      var p = project(node, time);
      projected.set(node, p);
      return p;
    }

    var i, e, frac, pa, pb, glyph, col, label, pulse, from, to, t;
    var hot = {};
    for (i = 0; i < pulses.length; i++) {
      hot[pulses[i].path.edges[pulses[i].e]] = pulses[i];
    }
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      frac = edgeFrac(e, time);
      if (frac <= 0) continue;
      pa = projOf(e.a);
      pb = projOf(e.b);
      rasterEdge(buf, pa, pb, frac, hot[i] ? pal.pulseEdge : pal.edge);
    }

    for (i = 0; i < layers.length; i++) {
      layers[i].nodes.forEach(function (node) {
        var alpha = nodeAlpha(node, time);
        if (alpha <= 0) return;
        var pr = projOf(node);
        var isLit = lit.has(node);
        col = toneColor(node.tone, pal, isLit);
        if (alpha < 1 && ctx) {
          /* fade approximated by a dimmer glyph rather than per-char alpha */
          if (alpha < 0.45) glyph = '·';
          else glyph = isLit ? '(*)' : (node.tone ? '[#]' : '(o)');
        } else {
          glyph = isLit ? '(*)' : (node.tone ? '[#]' : '(o)');
        }
        plotText(buf, pr.col - 1, pr.row, glyph, col, 3);
        label = metrics.narrow ? node.short : node.label;
        if (label && alpha > 0.55) {
          if (node.layer === 0) plotText(buf, pr.col - 2 - label.length, pr.row, label, pal.label, 2);
          else if (node.layer === layers.length - 1) plotText(buf, pr.col + 3, pr.row, label, col, 2);
        }
      });
    }

    for (i = 0; i < pulses.length; i++) {
      pulse = pulses[i];
      from = projOf(pulse.path.nodes[pulse.e]);
      to = projOf(pulse.path.nodes[Math.min(pulse.e + 1, pulse.path.nodes.length - 1)]);
      t = pulse.f;
      pa = { col: from.col + (to.col - from.col) * t, row: from.row + (to.row - from.row) * t };
      var trail, u, tc, tr;
      for (trail = 1; trail <= 4; trail++) {
        u = t - trail * 0.08;
        if (u < 0) continue;
        tc = from.col + (to.col - from.col) * u;
        tr = from.row + (to.row - from.row) * u;
        plot(buf, tc, tr, trail === 1 ? 'o' : '·', pal.pulse, 5);
      }
      plot(buf, pa.col, pa.row, '*', pal.pulse, 6);
      plot(buf, pa.col - 1, pa.row, '+', pal.pulse, 5);
      plot(buf, pa.col + 1, pa.row, '+', pal.pulse, 5);
      plot(buf, pa.col, pa.row - 1, '+', pal.pulse, 5);
      plot(buf, pa.col, pa.row + 1, '+', pal.pulse, 5);
    }

    ctx.font = metrics.fontSize + 'px ' + FONT_STACK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    buf.forEach(function (cell) {
      ctx.fillStyle = cell.color;
      ctx.fillText(cell.ch, metrics.padX + cell.c * metrics.cellW, metrics.padY + cell.r * metrics.cellH);
    });
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (now - lastFrame < FRAME_MS - 2) return;
    var dt = lastFrame ? Math.min(0.08, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (!canAnimate()) return;
    animTime += dt;
    render();
  }

  function start() {
    if (rafId === null && canAnimate()) {
      lastFrame = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function redraw() {
    render();
  }

  function seek(t, freeze) {
    animTime = Math.max(0, t);
    if (freeze) {
      frozen = true;
      stop();
    }
    render();
  }

  var net = { redraw: redraw, seek: seek, start: start, stop: stop };

  function syncMotionBtn() {
    if (!motionBtn) return;
    motionBtn.disabled = reduceMq.matches;
    motionBtn.title = reduceMq.matches ? 'Off because your device prefers reduced motion' : '';
    motionBtn.setAttribute('aria-pressed', String(wantMotion && !reduceMq.matches));
  }

  if (ctx) {
    buildGraph();
    measure();
    syncMotionBtn();
    if (reduceMq.matches || !wantMotion || frozen) {
      if (reduceMq.matches || !wantMotion) {
        if (animTime < BUILD_DONE) animTime = BUILD_DONE + 0.2;
      }
      render();
    }
    start();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        measure();
        render();
      }, 150);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    if (motionBtn) {
      motionBtn.addEventListener('click', function () {
        wantMotion = !wantMotion;
        store('motion', wantMotion ? 'on' : 'off');
        syncMotionBtn();
        if (wantMotion) start();
        else {
          stop();
          render();
        }
      });
    }

    var onMq = function () {
      syncMotionBtn();
      if (reduceMq.matches) {
        stop();
        if (animTime < BUILD_DONE) animTime = BUILD_DONE + 0.2;
        render();
      } else start();
    };
    if (reduceMq.addEventListener) reduceMq.addEventListener('change', onMq);
    else if (reduceMq.addListener) reduceMq.addListener(onMq);

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        inView = entries.some(function (e) { return e.isIntersecting; });
        if (inView) start();
        else stop();
      }, { threshold: 0.05 });
      io.observe(canvas);
    }
  } else if (motionBtn) {
    motionBtn.hidden = true;
  }

  window.__asciiNN = {
    seek: seek,
    play: function () { frozen = false; start(); },
    pause: function () { frozen = true; stop(); render(); },
    getTime: function () { return animTime; },
    redraw: redraw
  };
})();
