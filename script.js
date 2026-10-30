(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- Theme ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'light' ? 'Dark mode' : 'Light mode';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#0d1117');
  }
  applyTheme(store('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    store('theme', next);
  });

  /* ---------- Background animation (capped, optional) ---------- */
  var canvas = document.getElementById('bg');
  var motionBtn = document.getElementById('motion-toggle');
  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var MAX_POINTS = 50, LINK = 120, points = [], rafId = null;
  var wantMotion = store('motion') !== 'off';

  function setup() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.min(MAX_POINTS, Math.round(innerWidth * innerHeight / 30000));
    points = [];
    for (var i = 0; i < n; i++) {
      points.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 });
    }
  }
  function frame() {
    var w = innerWidth, h = innerHeight;
    var c = getComputedStyle(root).getPropertyValue('--accent').trim() || '#58a6ff';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 0.6;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, 6.2832); ctx.fill();
      for (var j = i + 1; j < points.length; j++) {
        var q = points[j], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 < LINK * LINK) {
          ctx.globalAlpha = (1 - Math.sqrt(d2) / LINK) * 0.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(frame);
  }
  function canAnimate() { return ctx && wantMotion && !reduceMq.matches && !document.hidden; }
  function start() { if (rafId === null && canAnimate()) rafId = requestAnimationFrame(frame); }
  function stop() { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } if (ctx) ctx.clearRect(0, 0, innerWidth, innerHeight); }
  function syncMotionBtn() {
    motionBtn.disabled = reduceMq.matches;
    motionBtn.title = reduceMq.matches ? 'Off because your device prefers reduced motion' : '';
    motionBtn.setAttribute('aria-pressed', String(wantMotion && !reduceMq.matches));
  }
  if (ctx) {
    setup(); syncMotionBtn(); start();
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(setup, 200); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    motionBtn.addEventListener('click', function () {
      wantMotion = !wantMotion; store('motion', wantMotion ? 'on' : 'off');
      syncMotionBtn(); if (wantMotion) start(); else stop();
    });
    var onMq = function () { syncMotionBtn(); if (reduceMq.matches) stop(); else start(); };
    if (reduceMq.addEventListener) reduceMq.addEventListener('change', onMq); else if (reduceMq.addListener) reduceMq.addListener(onMq);
  } else if (motionBtn) { motionBtn.hidden = true; }

  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
})();
