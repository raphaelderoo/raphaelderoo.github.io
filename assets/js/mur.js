/* Le mur : prises générées, grimpeur en cinématique inverse, corde et magnésie.
   Tout est en JavaScript natif, sans dépendance. */
(function () {
  'use strict';

  var $ = function (q) { return document.querySelector(q); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var WALL_METERS = 20;

  var holdsEl = $('#holds');
  var defs = $('#hold-defs');
  var light = $('#light');
  var canvas = $('#chalk');
  var ctx = canvas.getContext('2d');
  var rope = $('#rope');
  var climberG = $('#climber');

  // prises neutres (blanc, gris, anthracite) ; les autres prennent la couleur de la fiche voisine
  var NEUTRAL = ['#f3f1ec', '#dcd9d2', '#a9adb4', '#3b4049'];
  var cards = [];
  var gradCache = {};

  function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(h, to, k) { var a = hexRgb(h), b = hexRgb(to); return '#' + a.map(function (v, i) { return ('0' + Math.round(v + (b[i] - v) * k).toString(16)).slice(-2); }).join(''); }
  function grad(color) {
    if (gradCache[color]) return gradCache[color];
    var id = 'hg' + Object.keys(gradCache).length;
    var g = svg('radialGradient', { id: id, cx: '35%', cy: '30%', r: '75%' });
    g.appendChild(svg('stop', { offset: '0', 'stop-color': mix(color, '#ffffff', 0.55) }));
    g.appendChild(svg('stop', { offset: '.45', 'stop-color': color }));
    g.appendChild(svg('stop', { offset: '1', 'stop-color': mix(color, '#000000', 0.42) }));
    defs.appendChild(g);
    return (gradCache[color] = 'url(#' + id + ')');
  }
  function readCards() {
    cards = Array.prototype.map.call(document.querySelectorAll('.topo-card'), function (c) {
      var r = c.getBoundingClientRect();
      return { mid: r.top + window.scrollY + r.height / 2, tag: getComputedStyle(c).getPropertyValue('--tag').trim() || '#ff6b4a' };
    });
  }
  function tagAt(y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < cards.length; i++) { var d = Math.abs(cards[i].mid - y); if (d < bd) { bd = d; best = cards[i]; } }
    return best ? best.tag : '#ff6b4a';
  }

  var W, VH, H, mobile, s, groundY, topY, axis;
  var route = [], draws = [], floor = [];
  var lastW = 0, lastVH = 0;

  // ---------- outils ----------
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function f(n) { return n.toFixed(1); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // l'axe de la voie : même valeur que --rx dans le CSS
  function axisRatio() { return W <= 760 ? 0.13 : (W <= 1100 ? 0.17 : 0.44); }
  function routeX(y) {
    var amp = W * (mobile ? 0.025 : (W <= 1100 ? 0.03 : 0.028));
    return axis + Math.sin(y / 520) * amp + Math.sin(y / 190 + 1.3) * amp * 0.35;
  }

  // ---------- formes ----------
  function blobPath(r, n, irr, rand, squash) {
    var pts = [], i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rr = r * (1 - irr / 2 + rand() * irr);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * squash]);
    }
    var d = '';
    for (i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (i === 0) d += 'M' + f(p1[0]) + ' ' + f(p1[1]);
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + 'Z';
  }

  function buildDefs() {
    defs.innerHTML = '';
    gradCache = {};
    [['vol', '#e8d3b0', '#b39367'], ['vol2', '#c9ccd1', '#9a9fa7'], ['vol3', '#e8d3b0', '#b39367']].forEach(function (c) {
      var v = svg('linearGradient', { id: c[0], x1: '0', y1: '0', x2: '1', y2: '1' });
      v.appendChild(svg('stop', { offset: '0', 'stop-color': c[1] }));
      v.appendChild(svg('stop', { offset: '1', 'stop-color': c[2] }));
      defs.appendChild(v);
    });
  }

  function addHold(frag, x, y, r, color, rand, isRoute) {
    var pad = 8, size = r * 2 + pad * 2;
    var squash = 0.55 + rand() * 0.45;
    var node = svg('svg', { class: 'hold' + (isRoute ? ' on-route' : ''), width: f(size), height: f(size), viewBox: f(-r - pad) + ' ' + f(-r - pad) + ' ' + f(size) + ' ' + f(size) });
    node.style.transform = 'translate(' + f(x - r - pad) + 'px,' + f(y - r - pad) + 'px) rotate(' + ((rand() * 360) | 0) + 'deg)';
    node.appendChild(svg('path', { d: blobPath(r, 7, 0.45, rand, squash), fill: grad(color) }));
    node.appendChild(svg('circle', { cx: f(r * 0.08), cy: '0', r: f(Math.max(2.4, r * 0.13)), fill: '#1b1d22', opacity: '.8' }));
    if (isRoute) node.appendChild(svg('ellipse', { cx: f(-r * 0.15), cy: f(-r * squash * 0.35), rx: f(r * 0.5), ry: f(r * 0.22), fill: '#fff', opacity: '.35' }));
    frag.appendChild(node);
  }

  function addVolume(frag, x, y, w, h, rand) {
    var node = svg('svg', { class: 'volume', width: f(w), height: f(h), viewBox: '0 0 ' + f(w) + ' ' + f(h) });
    node.style.transform = 'translate(' + f(x) + 'px,' + f(y) + 'px)';
    var apex = [w * (0.3 + rand() * 0.4), h * (0.25 + rand() * 0.3)];
    var kind = rand();
    var fill = kind < 0.55 ? 'url(#vol)' : (kind < 0.85 ? 'url(#vol2)' : 'url(#vol3)');
    node.appendChild(svg('polygon', { points: '0,' + h + ' ' + w + ',' + h + ' ' + apex.join(','), fill: fill }));
    node.appendChild(svg('polygon', { points: '0,' + h + ' ' + apex.join(',') + ' ' + (w * 0.5) + ',' + h, fill: 'rgba(255,255,255,.12)' }));
    node.appendChild(svg('polyline', { points: '0,' + h + ' ' + apex.join(',') + ' ' + w + ',' + h, fill: 'none', stroke: 'rgba(0,0,0,.2)', 'stroke-width': 2 }));
    frag.appendChild(node);
  }

  function addQuickdraw(frag, x, y) {
    var k = s;
    var node = svg('svg', { class: 'quickdraw', width: f(30 * k), height: f(60 * k), viewBox: '-15 0 30 60' });
    node.style.transform = 'translate(' + f(x - 15 * k) + 'px,' + f(y) + 'px)';
    node.appendChild(svg('circle', { cx: 0, cy: 5, r: 5, fill: '#c8ccd2', stroke: '#6b7078', 'stroke-width': 1.5 }));
    node.appendChild(svg('path', { d: 'M-3 8 Q-7 14 -2 19 L2 19 Q7 14 3 8', fill: 'none', stroke: '#dfe2e6', 'stroke-width': 2.5 }));
    node.appendChild(svg('rect', { x: -3.5, y: 18, width: 7, height: 22, rx: 3, fill: '#1f2a44' }));
    node.appendChild(svg('path', { d: 'M-4 40 Q-9 48 -3 56 Q3 60 6 52 L4 42', fill: 'none', stroke: '#dfe2e6', 'stroke-width': 2.8, 'stroke-linecap': 'round' }));
    frag.appendChild(node);
    return { x: x, y: y + 52 * k };
  }

  // ---------- construction du mur ----------
  function build() {
    W = document.documentElement.clientWidth;
    VH = Math.max(1, window.innerHeight);
    mobile = W <= 760;
    s = mobile ? 0.82 : clamp(W / 950, 1.15, 1.7);
    axis = W * axisRatio();
    H = document.documentElement.scrollHeight;
    groundY = H - VH * 0.13 + 6;
    var anchor = $('.anchor');
    topY = anchor ? anchor.getBoundingClientRect().top + window.scrollY + 46 : 120;

    buildDefs();
    readCards();
    holdsEl.innerHTML = '';
    route = []; draws = [];
    var frag = document.createDocumentFragment();
    var rand = rng(20270308);
    var D = dims();

    // volumes
    var nVol = Math.round(H / 800);
    for (var v = 0; v < nVol; v++) {
      var vw = (mobile ? 100 : 200) + rand() * (mobile ? 90 : 260);
      var vx = rand() * (W - vw);
      var vy = topY + rand() * (groundY - topY - 400);
      if (Math.abs(vx + vw / 2 - routeX(vy)) < vw * 0.7 + 60 * s) vx = (vx + W * 0.5) % Math.max(1, W - vw);
      addVolume(frag, vx, vy, vw, vw * (0.45 + rand() * 0.4), rand);
    }

    // prises décoratives
    var nDeco = Math.min(mobile ? 150 : 320, Math.round((W * H) / (mobile ? 11000 : 24000)));
    for (var i = 0; i < nDeco; i++) {
      var y = topY - 60 + rand() * (groundY - topY);
      var x = rand() * W;
      if (Math.abs(x - routeX(y)) < 70 * s) continue;
      var r = (mobile ? 8 : 11) + Math.pow(rand(), 2) * (mobile ? 18 : 30);
      var tag = tagAt(y), pick = rand();
      var col = pick < 0.42 ? mix(tag, pick < 0.2 ? '#ffffff' : '#000000', rand() * 0.3) : NEUTRAL[(rand() * NEUTRAL.length) | 0];
      addHold(frag, x, y, r, col, rand, false);
    }

    // la voie : une prise à gauche, une à droite, espacées selon la taille du grimpeur
    var step = Math.max((D.upper + D.fore) * 0.55, mobile ? 34 : 0);
    var side = 1;
    for (var yy = groundY - 40 * s; yy > topY + 10; yy -= step * (0.8 + rand() * 0.4)) {
      side = -side;
      var hx = routeX(yy) + side * (D.shoulder + 10 * s + rand() * 12 * s);
      addHold(frag, hx, yy, (7 + rand() * 4.5) * s, tagAt(yy), rand, true);
      route.push({ x: hx, y: yy, side: side });
    }

    // dégaines
    var gap = 230 * s;
    for (var dy = groundY - 220 * s; dy > topY + 40; dy -= gap) {
      draws.push(addQuickdraw(frag, routeX(dy) + 6 * s, dy));
    }

    holdsEl.appendChild(frag);
    resizeCanvas();
    lastW = W; lastVH = VH;
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = VH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- le grimpeur ----------
  function dims() {
    return {
      torso: 40 * s, neck: 5 * s, head: 10.5 * s,
      upper: 27 * s, fore: 25 * s, thigh: 31 * s, shin: 30 * s,
      shoulder: 13 * s, waist: 9 * s, hip: 10 * s
    };
  }

  var C = {};
  function part(name, tag, attrs) {
    if (tag === 'path' && !attrs.fill) attrs.fill = 'none';
    C[name] = svg(tag, attrs); climberG.appendChild(C[name]);
  }
  (function buildClimber() {
    climberG.innerHTML = '';
    ['L', 'R'].forEach(function (k) {
      part('thigh' + k, 'path', { stroke: k === 'L' ? '#26355a' : '#2f4170' });
      part('shin' + k, 'path', { stroke: k === 'L' ? '#26355a' : '#2f4170' });
      part('shoe' + k, 'ellipse', { fill: '#23252b', stroke: '#ff6b4a', 'stroke-width': 1.5 });
    });
    part('torso', 'path', { fill: '#ff6b4a' });
    part('shade', 'path', { fill: 'rgba(0,0,0,.14)' });
    part('belt', 'path', { stroke: '#f2c94c' });
    part('bag', 'path', { fill: '#f6f2ea', stroke: '#23252b', 'stroke-width': 1.2 });
    ['L', 'R'].forEach(function (k) {
      part('upper' + k, 'path', { stroke: '#ff6b4a' });
      part('fore' + k, 'path', { stroke: '#e3ad86' });
      part('hand' + k, 'circle', { fill: '#e3ad86' });
    });
    part('neck', 'path', { stroke: '#d79f78' });
    part('head', 'circle', { fill: '#e3ad86' });
    part('hair', 'path', { fill: '#2b1d16' });
    part('band', 'path', { stroke: '#56ccf2' });
  })();

  var body = { x: 0, y: 0, vx: 0, vy: 0, ready: false };
  var limbs = {
    L: { hand: true, side: -1 }, R: { hand: true, side: 1 },
    FL: { hand: false, side: -1 }, FR: { hand: false, side: 1 }
  };
  Object.keys(limbs).forEach(function (k) { var L = limbs[k]; L.end = null; L.goal = null; L.from = null; L.t = 1; L.dur = 0.3; });

  function joint(ax, ay, tx, ty, l1, l2, outward) {
    var dx = tx - ax, dy = ty - ay;
    var d = Math.sqrt(dx * dx + dy * dy);
    var max = l1 + l2 - 0.5;
    if (d > max) { tx = ax + dx / d * max; ty = ay + dy / d * max; d = max; }
    d = Math.max(d, 1);
    var base = Math.atan2(ty - ay, tx - ax);
    var a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    var j1 = [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1];
    var j2 = [ax + Math.cos(base - a) * l1, ay + Math.sin(base - a) * l1];
    return { j: (j1[0] - j2[0]) * outward > 0 ? j1 : j2, t: [tx, ty] };
  }

  function candidates(L, rootY, D) {
    var list = L.hand ? route : route.concat(floor), best = null;
    var reach = L.hand ? D.upper + D.fore : D.thigh + D.shin;
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.side !== L.side) continue;
      if (L.hand) { if (h.y < rootY - reach * 1.02 || h.y > rootY - reach * 0.12) continue; }
      else if (h.y < rootY + reach * 0.5 || h.y > rootY + reach * 0.98) continue;
      if (!best || h.y < best.y) best = h;
    }
    if (!best && L.hand) {
      // rien à portée : la main se tend vers la prise suivante, au-dessus
      for (var j = 0; j < list.length; j++) {
        var q = list[j];
        if (q.side !== L.side || q.y > rootY - reach * 1.02) continue;
        if (!best || q.y > best.y) best = q;
      }
    }
    return best;
  }
  function nearest(L, x, y) {
    var list = L.hand ? route : route.concat(floor), best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.side !== L.side) continue;
      var d = Math.abs(h.y - y) + Math.abs(h.x - x) * 0.3;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  // ---------- magnésie ----------
  var parts = [];
  function puff(x, y, n, colors) {
    if (reduce) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * (colors ? 3.4 : 1.2);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (colors ? 1.8 : 0.4),
        life: 1, decay: 0.011 + Math.random() * 0.02, r: (colors ? 2.2 : 1.6) + Math.random() * (colors ? 3 : 4) * (mobile ? 0.8 : 1.2),
        c: colors ? colors[(Math.random() * colors.length) | 0] : null
      });
    }
  }
  function drawParts(sy) {
    ctx.clearRect(0, 0, W, VH);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy = p.vy * 0.97 + (p.c ? 0.06 : 0.012);
      p.life -= p.decay;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = p.life * (p.c ? 0.95 : 0.7);
      ctx.fillStyle = p.c || '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y - sy, p.r * (p.c ? 1 : (1.6 - p.life * 0.6)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- boucle ----------
  var last = performance.now();
  var summitDone = false;
  var altNum = $('#altNum'), railFill = $('#railFill');
  var rails = Array.prototype.slice.call(document.querySelectorAll('.rail a'));
  var hint = $('#hint');
  var lastAlt = '';
  var ORDER = ['L', 'FR', 'R', 'FL'];

  function seg(p, a, b, w) { p.setAttribute('d', 'M' + f(a[0]) + ' ' + f(a[1]) + 'L' + f(b[0]) + ' ' + f(b[1])); p.setAttribute('stroke-width', f(w)); }

  function frame(now) {
    var dt = Math.min(0.04, Math.max(0, (now - last) / 1000)); last = now;
    // fenêtre encore sans taille (onglet en arrière-plan) : on attend, sans rien calculer
    if (window.innerHeight < 2 || document.documentElement.clientWidth < 2) { requestAnimationFrame(frame); return; }
    if (VH < 2 || W < 2) { build(); resetClimber(); }
    if (!isFinite(body.x) || !isFinite(body.y)) resetClimber();
    var D = dims();
    var legLen = D.thigh + D.shin;
    var floorY = groundY - legLen * 0.86;
    var topLim = topY + D.torso + D.neck + 2 * D.head;
    floor = [{ x: routeX(groundY) - 14 * s, y: groundY, side: -1 }, { x: routeX(groundY) + 14 * s, y: groundY, side: 1 }];

    // la chute : le corps n'obéit plus au scroll, c'est la page qui le suit
    if (fall.active) fallStep(dt, D, legLen, floorY, now);
    var sy = window.scrollY;

    if (!fall.active) {
    // hauteur du bassin : posé au sol en bas, vers 62 % de l'écran ensuite, au relais en haut
    var maxS = H - VH;
    var t = clamp((sy - (maxS - VH * 0.7)) / (VH * 0.7), 0, 1); t = t * t * (3 - 2 * t);
    var u = clamp((VH * 0.7 - sy) / (VH * 0.7), 0, 1); u = u * u * (3 - 2 * u);
    var follow = (sy + VH * 0.62) * (1 - t) + floorY * t;
    var targetY = clamp(follow * (1 - u) + topLim * u, topLim, floorY);

    if (!body.ready) { body.y = targetY; body.x = routeX(targetY); }

    var hipY0 = body.y, shY0 = hipY0 - D.torso;

    // choix des prises : un seul membre bouge à la fois, sauf si on scrolle vite
    var moving = ORDER.some(function (k) { return limbs[k].t < 1; });
    var bestK = null, bestGain = 0;
    ORDER.forEach(function (k) {
      var L = limbs[k];
      var rootY = L.hand ? shY0 : hipY0;
      var rootX = body.x + L.side * (L.hand ? D.shoulder : D.hip);
      // les mains visent depuis là où le corps va arriver : elles partent devant, le corps suit
      var planY = L.hand ? Math.min(shY0, targetY - D.torso) : hipY0;
      var want = candidates(L, planY, D) || candidates(L, rootY, D) || L.goal || nearest(L, rootX, rootY);
      if (!L.goal || !body.ready) { L.goal = want; L.end = { x: want.x, y: want.y }; L.t = 1; return; }
      var reach = L.hand ? D.upper + D.fore : legLen;
      var gx = L.goal.x - rootX, gy = L.goal.y - rootY;
      var tooFar = Math.sqrt(gx * gx + gy * gy) > reach * 1.08;
      if (want === L.goal) return;
      if (tooFar) { start(L, want, 0.14); return; }
      // une main ne reste jamais sous l'épaule : sur un mur vertical, on grimpe bras en l'air
      var other = limbs[k === 'L' ? 'R' : (k === 'R' ? 'L' : k)];
      if (L.hand && L.goal.y > rootY - reach * 0.25 && L.t >= 1 && (other.t >= 1 || other.t > 0.5)) { start(L, want, 0.24); return; }
      L.next = want;
      var gain = Math.abs(want.y - L.goal.y);
      if (gain > bestGain) { bestGain = gain; bestK = k; }
    });
    if (bestK && !moving) start(limbs[bestK], null, limbs[bestK].hand ? 0.36 : 0.42);

    // déplacement des membres en arc
    var shift = 0, drop = 0, sumHX = 0, sumFX = 0;
    ORDER.forEach(function (k) {
      var L = limbs[k];
      if (L.t < 1) {
        L.t = reduce ? 1 : Math.min(1, L.t + dt / L.dur);
        var e = ease(L.t);
        var mx = (L.from.x + L.goal.x) / 2 + L.side * (L.hand ? 16 : 20) * s;
        var my = (L.from.y + L.goal.y) / 2 - (L.hand ? 10 : 16) * s;
        var a = 1 - e;
        L.end.x = a * a * L.from.x + 2 * a * e * mx + e * e * L.goal.x;
        L.end.y = a * a * L.from.y + 2 * a * e * my + e * e * L.goal.y;
        if (L.t >= 1) { L.end.x = L.goal.x; L.end.y = L.goal.y; if (L.hand) puff(L.goal.x, L.goal.y, 12); }
        // le corps compense : il part du côté opposé et se tasse quand un pied monte
        var w = Math.sin(L.t * Math.PI);
        shift -= L.side * 7 * s * w;
        if (!L.hand) drop += 5 * s * w;
      }
      if (L.hand) sumHX += L.goal.x; else sumFX += L.goal.x;
    });

    // ressort amorti : le corps suit avec un peu d'inertie
    var tx = sumFX / 2 * 0.55 + sumHX / 2 * 0.45 + shift + Math.sin(now / 1100) * 1.2 * s;
    var ty = targetY + drop + Math.sin(now / 1300) * 1.2 * s;
    if (reduce || !body.ready) { body.x = tx; body.y = ty; body.vx = body.vy = 0; }
    else {
      var K = 70, Cd = 13;
      body.vx += (K * (tx - body.x) - Cd * body.vx) * dt;
      body.vy += (K * (ty - body.y) - Cd * body.vy) * dt;
      body.x += body.vx * dt; body.y += body.vy * dt;
    }
    body.ready = true;
    }

    draw(D, sy, now);
    climberG.setAttribute('transform', fall.active && fall.ang ? 'rotate(' + f(fall.ang * 180 / Math.PI) + ' ' + f(body.x) + ' ' + f(body.y - sy - D.torso * 0.5) + ')' : '');

    // corde : du baudrier vers le bas, dans chaque dégaine déjà passée
    var hip = [body.x, body.y - sy];
    var pts = [hip];
    for (var i = draws.length - 1; i >= 0; i--) {
      var q = draws[i];
      if (q.y < body.y + 6) continue;
      pts.push([q.x, q.y - sy]);
      if (q.y - sy > VH + 80) break;
    }
    if (pts[pts.length - 1][1] < VH + 80) pts.push([routeX(groundY) - 70 * s, groundY + 80 - sy]);
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (var j = 1; j < pts.length; j++) {
      var p0 = pts[j - 1], p1 = pts[j];
      d += 'Q' + f((p0[0] + p1[0]) / 2 + 9 * s) + ' ' + f((p0[1] + p1[1]) / 2 + 5) + ' ' + f(p1[0]) + ' ' + f(p1[1]);
    }
    rope.setAttribute('d', d);
    rope.style.strokeWidth = f(3 * s + 0.5) + 'px';
    rope.style.opacity = fall.active ? '0' : '1';

    light.style.setProperty('--lx', f(body.x) + 'px');
    light.style.setProperty('--ly', f(body.y - D.torso - sy) + 'px');

    // altimètre
    var prog = clamp((floorY - body.y) / (floorY - topLim), 0, 1);
    var alt = (prog * WALL_METERS).toFixed(1).replace('.', ',');
    if (alt !== lastAlt) { altNum.textContent = alt; lastAlt = alt; }
    railFill.style.height = (prog * 100).toFixed(1) + '%';
    if (prog > 0.985 && !summitDone) {
      summitDone = true;
      puff(body.x, body.y - D.torso - 20 * s, 110, ['#ff6b4a', '#f2c94c', '#56ccf2', '#6fcf97', '#bb6bd9', '#ffffff']);
    }
    if (prog < 0.9) summitDone = false;

    drawParts(sy);
    requestAnimationFrame(frame);
  }

  // ---------- la chute ----------
  var fall = { active: false, phase: '', t: 0, vy: 0, ang: 0, spin: 1, fromAng: 0, fromY: 0 };
  var dropBtn = $('#drop');

  function startFall() {
    if (fall.active || !limbs.L.end) return;
    if (reduce) { window.scrollTo(0, H); return; }
    var D = dims();
    fall.active = true; fall.phase = 'air'; fall.t = 0; fall.vy = -220; fall.ang = 0;
    fall.spin = Math.random() < 0.5 ? -1 : 1;
    ORDER.forEach(function (k) { limbs[k].t = 1; });
    puff(limbs.L.end.x, limbs.L.end.y, 18); puff(limbs.R.end.x, limbs.R.end.y, 18);
    document.documentElement.classList.add('falling');
    if (dropBtn) dropBtn.disabled = true;
  }

  // pose des membres, dans le repère du corps (la rotation est appliquée au dessin)
  function pose(D, kind, tt) {
    var bx = body.x, by = body.y, sh = by - D.torso, legLen = D.thigh + D.shin;
    ORDER.forEach(function (k) {
      var L = limbs[k], sd = L.side, ph = sd > 0 ? 0 : 1.7, x, y;
      if (kind === 'air') {
        // bras qui moulinent au-dessus de la tête, jambes qui pédalent
        if (L.hand) { x = bx + sd * (D.shoulder + 16 * s + 12 * s * Math.sin(tt * 17 + ph)); y = sh - (D.upper + D.fore) * 0.7 + 14 * s * Math.cos(tt * 15 + ph); }
        else { x = bx + sd * (D.hip + 12 * s + 9 * s * Math.sin(tt * 13 + ph)); y = by + legLen * 0.78 + 10 * s * Math.sin(tt * 16 + ph * 2); }
      } else {
        // étalé sur le tapis, bras et jambes en croix
        if (L.hand) { x = bx + sd * (D.shoulder + 30 * s); y = sh + 4 * s; }
        else { x = bx + sd * (D.hip + 20 * s); y = by + legLen * 0.92; }
      }
      L.end = { x: x, y: y };
    });
  }

  function fallStep(dt, D, legLen, floorY, now) {
    fall.t += dt;
    var lieY = groundY - 6 * s;           // le bassin posé sur le tapis
    if (fall.phase === 'air') {
      fall.vy = Math.min(fall.vy + 2600 * dt, 4200);
      body.y += fall.vy * dt;
      body.x += (routeX(body.y) - body.x) * Math.min(1, dt * 2);
      fall.ang = fall.spin * (Math.sin(fall.t * 3.2) * 0.45 + fall.t * 0.35);
      pose(D, 'air', fall.t);
      window.scrollTo(0, clamp(body.y - VH * 0.45, 0, H - VH));
      if (body.y >= lieY - D.torso * 0.2) {
        // impact
        body.y = lieY; fall.phase = 'impact'; fall.t = 0;
        fall.fromAng = fall.ang;
        window.scrollTo(0, H - VH);
        puff(body.x, groundY, 90, ['#ffffff', '#e8e4dc', '#d9d6cf']);
        puff(body.x, groundY - 10 * s, 40);
        var html = document.documentElement;
        html.classList.remove('impact'); void html.offsetWidth; html.classList.add('impact');
      }
    } else if (fall.phase === 'impact') {
      var k = clamp(fall.t / 0.18, 0, 1);
      var lying = fall.spin * Math.PI / 2;
      fall.ang = fall.fromAng + (lying - fall.fromAng) * (1 - Math.pow(1 - k, 3)) + (k >= 1 ? Math.sin(fall.t * 30) * 0.04 * Math.exp(-fall.t * 6) : 0);
      body.y = lieY - Math.abs(Math.sin(Math.min(fall.t, 0.35) * 9)) * 14 * s * Math.exp(-fall.t * 8); // petit rebond
      pose(D, 'lie', fall.t);
      window.scrollTo(0, H - VH);
      if (fall.t > 1.6) { fall.phase = 'up'; fall.t = 0; fall.fromAng = fall.ang; fall.fromY = body.y; }
    } else {
      // il se relève
      var e = ease(clamp(fall.t / 0.7, 0, 1));
      fall.ang = fall.fromAng * (1 - e);
      body.y = fall.fromY + (floorY - fall.fromY) * e;
      pose(D, e < 0.5 ? 'lie' : 'air', 0);
      window.scrollTo(0, H - VH);
      if (fall.t > 0.75) {
        fall.active = false; fall.ang = 0;
        document.documentElement.classList.remove('falling', 'impact');
        if (dropBtn) dropBtn.disabled = false;
        if (hint) hint.classList.remove('gone');
        resetClimber();
      }
    }
  }

  // pendant la chute, la molette et le tactile ne font rien
  ['wheel', 'touchmove'].forEach(function (ev) {
    window.addEventListener(ev, function (e) { if (fall.active) e.preventDefault(); }, { passive: false });
  });
  window.addEventListener('keydown', function (e) {
    if (fall.active && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(e.key) >= 0) e.preventDefault();
  });
  if (dropBtn) dropBtn.addEventListener('click', startFall);

  function start(L, want, dur) {
    if (want) L.goal = want; else L.goal = L.next || L.goal;
    L.from = { x: L.end.x, y: L.end.y };
    L.t = 0; L.dur = dur;
  }

  // dessin du grimpeur, vu de dos
  function draw(D, sy, now) {
    var P = [body.x, body.y - sy];
    var handMid = (limbs.L.end.x + limbs.R.end.x) / 2;
    var lean = clamp((handMid - body.x) * 0.35, -12 * s, 12 * s);
    var N = [P[0] + lean, P[1] - D.torso];
    var ux = (N[0] - P[0]) / D.torso, uy = (N[1] - P[1]) / D.torso;
    var vx = -uy, vy = ux; // perpendiculaire (vers la droite)
    function at(base, along, across) { return [base[0] + ux * along + vx * across, base[1] + uy * along + vy * across]; }

    // jambes
    ['L', 'R'].forEach(function (k) {
      var L = limbs[k === 'L' ? 'FL' : 'FR'];
      var root = at(P, 2 * s, L.side * (D.hip - 3 * s));
      var r = joint(root[0], root[1], L.end.x, L.end.y - sy, D.thigh, D.shin, L.side);
      seg(C['thigh' + k], root, r.j, 12.5 * s);
      seg(C['shin' + k], r.j, r.t, 10 * s);
      var ang = Math.atan2(r.t[1] - r.j[1], r.t[0] - r.j[0]) * 180 / Math.PI - 90;
      C['shoe' + k].setAttribute('cx', f(r.t[0])); C['shoe' + k].setAttribute('cy', f(r.t[1] + 2 * s));
      C['shoe' + k].setAttribute('rx', f(6 * s)); C['shoe' + k].setAttribute('ry', f(8.5 * s));
      C['shoe' + k].setAttribute('transform', 'rotate(' + f(ang) + ' ' + f(r.t[0]) + ' ' + f(r.t[1] + 2 * s) + ')');
    });

    // buste : épaules plus larges que la taille
    var A = at(P, 0, D.hip), B = at(N, 0, D.shoulder + 2 * s), Cc = at(N, 0, -D.shoulder - 2 * s), Dd = at(P, 0, -D.hip);
    var wR = at(P, D.torso * 0.5, D.waist), wL = at(P, D.torso * 0.5, -D.waist);
    var topC = at(N, 6 * s, 0), botC = at(P, -4 * s, 0);
    var torso = 'M' + f(A[0]) + ' ' + f(A[1]) + 'Q' + f(wR[0]) + ' ' + f(wR[1]) + ' ' + f(B[0]) + ' ' + f(B[1]) +
      'Q' + f(topC[0]) + ' ' + f(topC[1]) + ' ' + f(Cc[0]) + ' ' + f(Cc[1]) +
      'Q' + f(wL[0]) + ' ' + f(wL[1]) + ' ' + f(Dd[0]) + ' ' + f(Dd[1]) +
      'Q' + f(botC[0]) + ' ' + f(botC[1]) + ' ' + f(A[0]) + ' ' + f(A[1]) + 'Z';
    C.torso.setAttribute('d', torso);
    // ombre de la colonne
    var s1 = at(P, 4 * s, 0), s2 = at(N, -4 * s, 0);
    C.shade.setAttribute('d', 'M' + f(s1[0] - 1.5 * s) + ' ' + f(s1[1]) + 'L' + f(s2[0] - 1.5 * s) + ' ' + f(s2[1]) + 'L' + f(s2[0] + 1.5 * s) + ' ' + f(s2[1]) + 'L' + f(s1[0] + 1.5 * s) + ' ' + f(s1[1]) + 'Z');
    var b1 = at(P, 3 * s, -D.hip - 1 * s), b2 = at(P, 3 * s, D.hip + 1 * s), bm = at(P, 0, 0);
    C.belt.setAttribute('d', 'M' + f(b1[0]) + ' ' + f(b1[1]) + 'Q' + f(bm[0]) + ' ' + f(bm[1] + 3 * s) + ' ' + f(b2[0]) + ' ' + f(b2[1]));
    C.belt.setAttribute('stroke-width', f(4.5 * s));
    var g = at(P, -2 * s, -2 * s);
    C.bag.setAttribute('d', 'M' + f(g[0] - 6 * s) + ' ' + f(g[1]) + 'h' + f(12 * s) + 'v' + f(9 * s) + 'q0 ' + f(4 * s) + ' ' + f(-4 * s) + ' ' + f(4 * s) + 'h' + f(-4 * s) + 'q' + f(-4 * s) + ' 0 ' + f(-4 * s) + ' ' + f(-4 * s) + 'z');

    // bras
    ['L', 'R'].forEach(function (k) {
      var L = limbs[k];
      var root = at(N, -3 * s, L.side * (D.shoulder - 1 * s));
      var r = joint(root[0], root[1], L.end.x, L.end.y - sy, D.upper, D.fore, L.side);
      seg(C['upper' + k], root, r.j, 10 * s);
      seg(C['fore' + k], r.j, r.t, 8 * s);
      C['hand' + k].setAttribute('cx', f(r.t[0])); C['hand' + k].setAttribute('cy', f(r.t[1]));
      C['hand' + k].setAttribute('r', f(5.2 * s));
    });

    // tête : elle regarde la prochaine prise
    var look = 0;
    ORDER.forEach(function (k) { if (!fall.active && limbs[k].t < 1 && limbs[k].hand) look = (limbs[k].goal.x - body.x) * 0.12; });
    var neckTop = at(N, D.neck, 0);
    var Hc = [neckTop[0] + ux * D.head + clamp(look, -5 * s, 5 * s), neckTop[1] + uy * D.head];
    seg(C.neck, N, neckTop, 8 * s);
    C.head.setAttribute('cx', f(Hc[0])); C.head.setAttribute('cy', f(Hc[1])); C.head.setAttribute('r', f(D.head));
    var R = D.head + 0.8;
    C.hair.setAttribute('d', 'M' + f(Hc[0] - R) + ' ' + f(Hc[1] + 2 * s) + 'A' + f(R) + ' ' + f(R) + ' 0 1 1 ' + f(Hc[0] + R) + ' ' + f(Hc[1] + 2 * s) + 'Q' + f(Hc[0]) + ' ' + f(Hc[1] + R * 0.75) + ' ' + f(Hc[0] - R) + ' ' + f(Hc[1] + 2 * s) + 'Z');
    C.band.setAttribute('d', 'M' + f(Hc[0] - R * 0.98) + ' ' + f(Hc[1] - R * 0.15) + 'Q' + f(Hc[0]) + ' ' + f(Hc[1] + R * 0.12) + ' ' + f(Hc[0] + R * 0.98) + ' ' + f(Hc[1] - R * 0.15));
    C.band.setAttribute('stroke-width', f(3.2 * s));
  }

  // ---------- section courante, apparition, interface ----------
  function activeSection() {
    var mid = window.innerHeight / 2, found = null;
    document.querySelectorAll('.pitch').forEach(function (p) {
      var r = p.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) found = p.id;
    });
    rails.forEach(function (a) { a.classList.toggle('on', a.dataset.target === found); });
  }
  function onScroll() {
    activeSection();
    if (hint && window.scrollY < H - VH - 140) hint.classList.add('gone');
  }
  function goTo(id, smooth) {
    var el = document.getElementById(id);
    if (!el) return;
    var top = el.offsetTop + Math.min(el.offsetHeight, VH * 1.6) / 2 - VH / 2;
    if (id === 'sommet') top = 0;
    if (id === 'depart') top = H;
    window.scrollTo({ top: top, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  rails.forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); goTo(a.dataset.target, true); history.replaceState(null, '', '#' + a.dataset.target); });
  });
  var skip = $('.skip');
  if (skip) skip.addEventListener('click', function (e) { e.preventDefault(); goTo('sommet', true); });
  $('#descend').addEventListener('click', function () { goTo('depart', true); history.replaceState(null, '', location.pathname); });

  document.querySelectorAll('.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var txt = btn.getAttribute('data-copy'), old = btn.textContent;
      var done = function () { btn.textContent = 'Copié'; btn.classList.add('ok'); setTimeout(function () { btn.textContent = old; btn.classList.remove('ok'); }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () {}); else done();
    });
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (n) { io.observe(n); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('in'); });
  }

  function resetClimber() {
    body.ready = false;
    Object.keys(limbs).forEach(function (n) { limbs[n].goal = null; limbs[n].end = null; limbs[n].t = 1; });
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var w = document.documentElement.clientWidth, vh = window.innerHeight;
      if (w === lastW && Math.abs(vh - lastVH) < 140 && vh > 1) { VH = vh; resizeCanvas(); return; }
      var ratio = window.scrollY / Math.max(1, document.documentElement.scrollHeight - vh);
      build();
      window.scrollTo(0, Math.min(1, ratio) * (H - VH));
      resetClimber();
    }, 180);
  });
  window.addEventListener('scroll', onScroll, { passive: true });

  function boot() {
    build();
    var id = location.hash.slice(1);
    var place = function () {
      if (id && document.getElementById(id)) goTo(id, false); else window.scrollTo(0, H);
    };
    place();
    requestAnimationFrame(place);
    window.addEventListener('load', function () { if (!id) place(); }, { once: true });
    onScroll();
    requestAnimationFrame(function (t) { last = t; frame(t); });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot);
  else window.addEventListener('load', boot);
})();
