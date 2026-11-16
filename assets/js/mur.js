/* Le mur : prises générées, grimpeur en cinématique inverse, corde et magnésie.
   Tout est en JavaScript natif, sans dépendance. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var WALL_METERS = 20;

  var holdsEl = $('#holds');
  var defs = $('#hold-defs');
  var light = $('#light');
  var canvas = $('#chalk');
  var ctx = canvas.getContext('2d');
  var el = {
    rope: $('#rope'), torso: $('#torso'), head: $('#head'), hair: $('#hair'),
    harness: $('#harness'), bag: $('#chalkbag'),
    armL: $('#armL'), armR: $('#armR'), legL: $('#legL'), legR: $('#legR')
  };

  // Couleurs des prises (comme les voies d'une salle)
  var PALETTE = [
    ['#56ccf2', '#bfefff', '#1b7ea6'], ['#6fcf97', '#c9f5da', '#2b8a55'],
    ['#f2c94c', '#fff1bd', '#b2861a'], ['#bb6bd9', '#ecc7fa', '#7a2f98'],
    ['#e0e0e0', '#ffffff', '#8d8d8d'], ['#2f3a4f', '#5b6a88', '#161c28'],
    ['#ff8fb1', '#ffd6e3', '#c0466c']
  ];
  var ROUTE = ['#ff6b4a', '#ffc2b0', '#c23a1b'];

  var W, VH, H, mobile, s, groundY, topY;
  var route = [], draws = [], floor = [];
  var lastW = 0, lastVH = 0;

  // ---------- Hasard reproductible ----------
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function routeX(y) {
    var base = W * (mobile ? 0.14 : 0.25);
    var amp = W * (mobile ? 0.03 : 0.045);
    return base + Math.sin(y / 430) * amp + Math.sin(y / 170 + 1.3) * amp * 0.35;
  }

  // ---------- Formes ----------
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
      if (i === 0) d += 'M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d + 'Z';
  }

  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildDefs() {
    defs.innerHTML = '';
    PALETTE.concat([ROUTE]).forEach(function (c, i) {
      var g = svg('radialGradient', { id: 'hg' + i, cx: '35%', cy: '30%', r: '75%' });
      g.appendChild(svg('stop', { offset: '0', 'stop-color': c[1] }));
      g.appendChild(svg('stop', { offset: '.45', 'stop-color': c[0] }));
      g.appendChild(svg('stop', { offset: '1', 'stop-color': c[2] }));
      defs.appendChild(g);
    });
    var v = svg('linearGradient', { id: 'vol', x1: '0', y1: '0', x2: '1', y2: '1' });
    v.appendChild(svg('stop', { offset: '0', 'stop-color': '#d8b98c' }));
    v.appendChild(svg('stop', { offset: '1', 'stop-color': '#9c7a4f' }));
    defs.appendChild(v);
    var v2 = svg('linearGradient', { id: 'vol2', x1: '1', y1: '0', x2: '0', y2: '1' });
    v2.appendChild(svg('stop', { offset: '0', 'stop-color': '#3b4252' }));
    v2.appendChild(svg('stop', { offset: '1', 'stop-color': '#232833' }));
    defs.appendChild(v2);
  }

  function addHold(frag, x, y, r, colorIdx, rand, isRoute) {
    var pad = 6, size = r * 2 + pad * 2;
    var squash = 0.55 + rand() * 0.45;
    var rot = (rand() * 360) | 0;
    var node = svg('svg', { class: 'hold' + (isRoute ? ' on-route' : ''), width: size, height: size, viewBox: (-r - pad) + ' ' + (-r - pad) + ' ' + size + ' ' + size });
    node.style.transform = 'translate(' + (x - r - pad).toFixed(1) + 'px,' + (y - r - pad).toFixed(1) + 'px) rotate(' + rot + 'deg)';
    node.appendChild(svg('path', { d: blobPath(r, 7, 0.45, rand, squash), fill: 'url(#hg' + colorIdx + ')' }));
    // l'insert et sa vis
    node.appendChild(svg('circle', { cx: (r * 0.08).toFixed(1), cy: '0', r: Math.max(2.2, r * 0.13).toFixed(1), fill: '#15171c', opacity: '.85' }));
    if (isRoute) {
      // traces de magnésie sur les prises de la voie
      node.appendChild(svg('ellipse', { cx: (-r * 0.15).toFixed(1), cy: (-r * squash * 0.35).toFixed(1), rx: (r * 0.5).toFixed(1), ry: (r * 0.22).toFixed(1), fill: '#fff', opacity: '.28' }));
    }
    frag.appendChild(node);
  }

  function addVolume(frag, x, y, w, h, rand) {
    var node = svg('svg', { class: 'volume', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h });
    node.style.transform = 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px)';
    var apex = [w * (0.3 + rand() * 0.4), h * (0.3 + rand() * 0.3)];
    var wood = rand() > 0.4;
    node.appendChild(svg('polygon', { points: '0,' + h + ' ' + w + ',' + h + ' ' + apex.join(','), fill: wood ? 'url(#vol)' : 'url(#vol2)' }));
    node.appendChild(svg('polygon', { points: '0,' + h + ' ' + apex.join(',') + ' ' + (w * 0.08) + ',' + (h * 0.15), fill: wood ? '#b8956a' : '#2c323e' }));
    node.appendChild(svg('polyline', { points: '0,' + h + ' ' + apex.join(',') + ' ' + w + ',' + h, fill: 'none', stroke: 'rgba(0,0,0,.25)', 'stroke-width': 2 }));
    frag.appendChild(node);
  }

  function addQuickdraw(frag, x, y) {
    var k = s;
    var node = svg('svg', { class: 'quickdraw', width: 30 * k, height: 60 * k, viewBox: '-15 0 30 60' });
    node.style.transform = 'translate(' + (x - 15 * k).toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    node.appendChild(svg('circle', { cx: 0, cy: 5, r: 5, fill: '#aeb3ba', stroke: '#5f646b', 'stroke-width': 1.5 }));
    node.appendChild(svg('path', { d: 'M-3 8 Q-7 14 -2 19 L2 19 Q7 14 3 8', fill: 'none', stroke: '#c9cdd3', 'stroke-width': 2.5 }));
    node.appendChild(svg('rect', { x: -3.5, y: 18, width: 7, height: 22, rx: 3, fill: '#f2c94c' }));
    node.appendChild(svg('path', { d: 'M-4 40 Q-9 48 -3 56 Q3 60 6 52 L4 42', fill: 'none', stroke: '#c9cdd3', 'stroke-width': 2.8, 'stroke-linecap': 'round' }));
    frag.appendChild(node);
    return { x: x, y: y + 52 * k };
  }

  // ---------- Construction du mur ----------
  function build() {
    W = document.documentElement.clientWidth;
    VH = window.innerHeight;
    mobile = W <= 760;
    s = mobile ? 0.62 : (W > 1200 ? 1.25 : 1);
    H = document.documentElement.scrollHeight;
    groundY = H - VH * 0.12 + 4;
    var anchor = $('.anchor');
    topY = anchor ? anchor.getBoundingClientRect().top + window.scrollY + 40 : 120;

    buildDefs();
    holdsEl.innerHTML = '';
    route = []; draws = [];
    var frag = document.createDocumentFragment();
    var rand = rng(20270308);

    // volumes en arrière-plan
    var nVol = Math.round(H / 900);
    for (var v = 0; v < nVol; v++) {
      var vw = (mobile ? 90 : 160) + rand() * (mobile ? 90 : 220);
      var vx = rand() * (W - vw);
      var vy = topY + rand() * (groundY - topY - 300);
      if (Math.abs(vx + vw / 2 - routeX(vy)) < vw * 0.6) vx = (vx + W * 0.5) % (W - vw);
      addVolume(frag, vx, vy, vw, vw * (0.5 + rand() * 0.4), rand);
    }

    // prises décoratives
    var nDeco = Math.min(mobile ? 160 : 300, Math.round((W * H) / (mobile ? 9000 : 26000)));
    for (var i = 0; i < nDeco; i++) {
      var y = topY - 60 + rand() * (groundY - topY);
      var x = rand() * W;
      if (Math.abs(x - routeX(y)) < (mobile ? 36 : 70)) continue;
      var r = (mobile ? 7 : 10) + Math.pow(rand(), 2) * (mobile ? 16 : 26);
      addHold(frag, x, y, r, (rand() * PALETTE.length) | 0, rand, false);
    }

    // la voie : une prise à gauche, une à droite, en montant
    var step = mobile ? 58 : 88;
    var side = 1;
    for (var yy = groundY - 34 * s; yy > topY + 20; yy -= step * (0.8 + rand() * 0.45)) {
      side = -side;
      var off = (mobile ? 14 : 26) + rand() * (mobile ? 9 : 16);
      var hx = routeX(yy) + side * off;
      var hr = (mobile ? 6.5 : 9) + rand() * (mobile ? 4 : 6);
      addHold(frag, hx, yy, hr, PALETTE.length, rand, true);
      route.push({ x: hx, y: yy, side: side });
    }

    // dégaines
    var gap = mobile ? 220 : 300;
    for (var dy = groundY - 260 * s; dy > topY + 40; dy -= gap) {
      draws.push(addQuickdraw(frag, routeX(dy) + (mobile ? 9 : 14), dy));
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

  // ---------- Grimpeur ----------
  function dims() {
    return {
      torso: 46 * s, upper: 31 * s, fore: 29 * s, thigh: 35 * s, shin: 33 * s,
      shoulder: 11 * s, hip: 8 * s, head: 11 * s
    };
  }

  var body = { x: 0, y: 0, ready: false };
  var limbs = {
    armL: { hand: true, side: -1, end: null, goal: null, moving: false },
    armR: { hand: true, side: 1, end: null, goal: null, moving: false },
    legL: { hand: false, side: -1, end: null, goal: null, moving: false },
    legR: { hand: false, side: 1, end: null, goal: null, moving: false }
  };

  function ik(ax, ay, tx, ty, l1, l2, outward) {
    var dx = tx - ax, dy = ty - ay;
    var d = Math.sqrt(dx * dx + dy * dy);
    var max = l1 + l2 - 0.5;
    if (d > max) { tx = ax + dx / d * max; ty = ay + dy / d * max; d = max; }
    d = Math.max(d, 1);
    var base = Math.atan2(ty - ay, tx - ax);
    var a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    var j1 = [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1];
    var j2 = [ax + Math.cos(base - a) * l1, ay + Math.sin(base - a) * l1];
    var j = (j1[0] - j2[0]) * outward > 0 ? j1 : j2;
    return 'M' + ax.toFixed(1) + ' ' + ay.toFixed(1) + 'L' + j[0].toFixed(1) + ' ' + j[1].toFixed(1) + 'L' + tx.toFixed(1) + ' ' + ty.toFixed(1);
  }

  function pickHold(limb, rootY, reach) {
    var best = null, i, h;
    if (limb.hand) {
      for (i = 0; i < route.length; i++) {
        h = route[i];
        if (h.side !== limb.side) continue;
        if (h.y < rootY - reach || h.y > rootY + 6) continue;
        if (!best || h.y < best.y) best = h;
      }
    } else {
      var list = route.concat(floor);
      for (i = 0; i < list.length; i++) {
        h = list[i];
        if (h.side !== limb.side) continue;
        if (h.y < rootY + reach * 0.42 || h.y > rootY + reach) continue;
        if (!best || h.y < best.y) best = h;
      }
    }
    return best;
  }

  function nearest(limb, x, y) {
    var best = null, bd = Infinity, list = limb.hand ? route : route.concat(floor);
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.side !== limb.side) continue;
      var d = Math.abs(h.y - y) + Math.abs(h.x - x) * 0.3;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  // ---------- Magnésie ----------
  var parts = [];
  function puff(x, y, n, colors) {
    if (reduce) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * (colors ? 3.2 : 1.1);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (colors ? 1.6 : 0.4),
        life: 1, decay: 0.012 + Math.random() * 0.02, r: (colors ? 2 : 1.5) + Math.random() * (colors ? 3 : 4),
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
      ctx.globalAlpha = p.life * (p.c ? 0.95 : 0.55);
      ctx.fillStyle = p.c || '#f6f3ee';
      ctx.beginPath(); ctx.arc(p.x, p.y - sy, p.r * (p.c ? 1 : (1.6 - p.life * 0.6)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Boucle ----------
  var last = performance.now();
  var summitDone = false;
  var altNum = $('#altNum'), railFill = $('#railFill');
  var rails = Array.prototype.slice.call(document.querySelectorAll('.rail a'));
  var hint = $('#hint');
  var lastAlt = '';

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var sy = window.scrollY;
    var D = dims();
    var legLen = D.thigh + D.shin;

    // le bassin suit le défilement, un peu en retard pour la souplesse
    // au pied du mur, le grimpeur se pose sur le tapis ; ensuite il reste vers 60 % de l'écran
    var floorY = groundY - legLen * 0.9;
    var maxS = H - VH;
    var t = Math.max(0, Math.min(1, (sy - (maxS - VH * 0.7)) / (VH * 0.7)));
    t = t * t * (3 - 2 * t);
    // et au sommet, il rejoint le relais
    var topLim = topY + D.torso + 30 * s;
    var u = Math.max(0, Math.min(1, (VH * 0.7 - sy) / (VH * 0.7)));
    u = u * u * (3 - 2 * u);
    var follow = (sy + VH * 0.6) * (1 - t) + floorY * t;
    var targetY = Math.max(topLim, Math.min(floorY, follow * (1 - u) + topLim * u));
    var k = reduce ? 1 : 1 - Math.exp(-dt * 7);
    if (!body.ready) { body.y = targetY; body.x = routeX(targetY); }
    body.y += (targetY - body.y) * k;

    floor = [{ x: routeX(groundY) - 16 * s, y: groundY, side: -1 }, { x: routeX(groundY) + 16 * s, y: groundY, side: 1 }];

    var hipY = body.y;
    var shY = hipY - D.torso;
    var anyHandMoving = limbs.armL.moving || limbs.armR.moving;
    var anyFootMoving = limbs.legL.moving || limbs.legR.moving;
    var sumX = 0;

    ['armL', 'armR', 'legL', 'legR'].forEach(function (name) {
      var L = limbs[name];
      var rootX = body.x + L.side * (L.hand ? D.shoulder : D.hip);
      var rootY = L.hand ? shY : hipY;
      var reach = L.hand ? D.upper + D.fore : legLen;
      var want = pickHold(L, rootY, reach * 0.97) || L.goal || nearest(L, rootX, rootY);
      if (!L.goal) L.goal = want;
      var gdx = L.goal.x - rootX, gdy = L.goal.y - rootY;
      var tooFar = Math.sqrt(gdx * gdx + gdy * gdy) > reach * 1.12;
      var busy = L.hand ? anyHandMoving : anyFootMoving;
      if (want !== L.goal && (!busy || L.moving || tooFar)) L.goal = want;
      if (!L.end || !body.ready) L.end = { x: L.goal.x, y: L.goal.y };

      var kk = reduce ? 1 : 1 - Math.exp(-dt * (tooFar ? 26 : 13));
      var ex = L.goal.x - L.end.x, ey = L.goal.y - L.end.y;
      var dist = Math.sqrt(ex * ex + ey * ey);
      L.end.x += ex * kk; L.end.y += ey * kk;
      var wasMoving = L.moving;
      L.moving = dist > 2.5;
      if (wasMoving && !L.moving && L.hand) puff(L.goal.x, L.goal.y, 9);
      sumX += L.goal.x;

      // petit arc quand le membre change de prise : il s'écarte du mur
      var lift = L.moving ? Math.min(dist, 40) * 0.25 * L.side : 0;
      el[name].setAttribute('d', ik(rootX, rootY - sy, L.end.x + lift, L.end.y - sy, L.hand ? D.upper : D.thigh, L.hand ? D.fore : D.shin, L.side));
    });

    // le corps se recentre entre ses appuis, avec un léger balancement
    var bx = sumX / 4 + Math.sin(now / 900) * 1.5 * s;
    body.x += (bx - body.x) * (reduce ? 1 : 1 - Math.exp(-dt * 5));
    body.ready = true;

    var hx = body.x, hy = hipY - sy, shy = shY - sy;
    var lean = (limbs.armL.end.x + limbs.armR.end.x) / 2 - body.x;
    el.torso.setAttribute('d', 'M' + hx.toFixed(1) + ' ' + hy.toFixed(1) + 'Q' + (hx - lean * 0.15).toFixed(1) + ' ' + ((hy + shy) / 2).toFixed(1) + ' ' + (hx + lean * 0.1).toFixed(1) + ' ' + shy.toFixed(1));
    var headX = hx + lean * 0.18, headY = shy - D.head - 5 * s;
    el.head.setAttribute('cx', headX.toFixed(1)); el.head.setAttribute('cy', headY.toFixed(1)); el.head.setAttribute('r', D.head.toFixed(1));
    var R = D.head + 0.6;
    el.hair.setAttribute('d', 'M' + (headX - R).toFixed(1) + ' ' + (headY + 1).toFixed(1) + 'A' + R + ' ' + R + ' 0 0 1 ' + (headX + R).toFixed(1) + ' ' + (headY + 1).toFixed(1) + 'Q' + headX.toFixed(1) + ' ' + (headY + R * 0.55).toFixed(1) + ' ' + (headX - R).toFixed(1) + ' ' + (headY + 1).toFixed(1) + 'Z');
    el.harness.setAttribute('cx', hx.toFixed(1)); el.harness.setAttribute('cy', (hy - 2 * s).toFixed(1)); el.harness.setAttribute('r', (5 * s).toFixed(1));
    var bgx = hx - 3 * s, bgy = hy + 4 * s;
    el.bag.setAttribute('d', 'M' + (bgx - 6 * s) + ' ' + bgy + 'h' + 12 * s + 'v' + 9 * s + 'q0 ' + 4 * s + ' ' + -4 * s + ' ' + 4 * s + 'h' + -4 * s + 'q' + -4 * s + ' 0 ' + -4 * s + ' ' + -4 * s + 'z');

    // la corde : du baudrier vers le bas, dans chaque dégaine déjà passée
    var pts = [[hx, hy]];
    for (var i = draws.length - 1; i >= 0; i--) {
      var q = draws[i];
      if (q.y < hipY + 6) continue;
      pts.push([q.x, q.y - sy]);
      if (q.y - sy > VH + 80) break;
    }
    if (pts[pts.length - 1][1] < VH + 80) pts.push([routeX(groundY) - 60 * s, groundY + 60 - sy]);
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var j = 1; j < pts.length; j++) {
      var a = pts[j - 1], b = pts[j];
      var mx = (a[0] + b[0]) / 2 + 10 * s, my = (a[1] + b[1]) / 2 + 6;
      d += 'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
    }
    el.rope.setAttribute('d', d);
    el.rope.style.strokeWidth = (3.2 * s + 0.6) + 'px';

    // lumière qui suit le grimpeur
    light.style.setProperty('--lx', hx.toFixed(0) + 'px');
    light.style.setProperty('--ly', shy.toFixed(0) + 'px');

    // altimètre
    var prog = Math.max(0, Math.min(1, (floorY - hipY) / (floorY - topLim)));
    var alt = (prog * WALL_METERS).toFixed(1).replace('.', ',');
    if (alt !== lastAlt) { altNum.textContent = alt; lastAlt = alt; }
    railFill.style.height = (prog * 100).toFixed(1) + '%';

    if (prog > 0.985 && !summitDone) {
      summitDone = true;
      puff(hx, shY - 10, 90, ['#ff6b4a', '#f2c94c', '#56ccf2', '#6fcf97', '#bb6bd9', '#ffffff']);
    }
    if (prog < 0.9) summitDone = false;

    drawParts(sy);
    requestAnimationFrame(frame);
  }

  // ---------- Section courante, apparition, interface ----------
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
    var t = document.getElementById(id);
    if (!t) return;
    var top = t.offsetTop + Math.min(t.offsetHeight, VH * 1.6) / 2 - VH / 2;
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
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach(function (n) { io.observe(n); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('in'); });
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var w = document.documentElement.clientWidth, vh = window.innerHeight;
      if (w === lastW && Math.abs(vh - lastVH) < 140) { VH = vh; resizeCanvas(); return; }
      var ratio = window.scrollY / Math.max(1, document.documentElement.scrollHeight - vh);
      build();
      window.scrollTo(0, Math.min(1, ratio) * (H - VH));
      body.ready = false;
      Object.keys(limbs).forEach(function (n) { limbs[n].goal = null; limbs[n].end = null; });
    }, 180);
  });
  window.addEventListener('scroll', onScroll, { passive: true });

  function start() {
    build();
    var id = location.hash.slice(1);
    var place = function () {
      if (id && document.getElementById(id)) goTo(id, false); else window.scrollTo(0, H);
    };
    place();
    requestAnimationFrame(place);
    window.addEventListener('load', function () { if (window.scrollY > H - VH - 40 || !id) place(); }, { once: true });
    onScroll();
    requestAnimationFrame(function (t) { last = t; frame(t); });
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  } else {
    window.addEventListener('load', start);
  }
})();
