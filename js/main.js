// ============ main.js — main loop / chunk management / saving / input ============
'use strict';
var Game = (function () {
  var B = Blocks.B;
  var world = null;
  var worldId = null, worldName = '';
  var playing = false, paused = false;
  var canvas;
  var tickAcc = 0, tickNo = 0;
  var lastT = 0;
  var fps = 0, fpsAcc = 0, fpsN = 0;
  var timeSec = 0;
  var liquidAnimT = 0;
  var saveT = 0;
  var pcx = 99999, pcz = 99999;
  var desired = [];          // desired column coords to load (sorted by distance)
  var genPtr = 0;
  var activeKeys = new Set(); // columns within tick range
  var renderList = [];
  var unloadT = 0;
  var storageOK = true, storageWarned = false;
  var stats = { ach: [] };
  var urlParams = {};
  var fovCur = 75;

  (function parseURL() {
    if (typeof location === 'undefined') return;
    location.search.slice(1).split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) urlParams[p[0]] = decodeURIComponent(p[1] || '1');
    });
  })();

  // ---------- storage ----------
  function sget(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function sset(k, v) {
    try { localStorage.setItem(k, v); return true; }
    catch (e) {
      storageOK = false;
      if (!storageWarned) {
        storageWarned = true;
        UI.message('Out of storage space, save may be incomplete');
      }
      return false;
    }
  }
  function sdel(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } }

  function listWorlds() {
    var raw = sget('minejs:worlds');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
  }
  function saveWorldsList(list) { sset('minejs:worlds', JSON.stringify(list)); }

  function createWorld(name, seed, mode) {
    var id = 'w' + Date.now().toString(36);
    if (!urlParams.test || urlParams.savetest) { // test mode does not write saves (except savetest)
      var list = listWorlds();
      list.unshift({ id: id, name: name, seed: seed, mode: mode, day: 0 });
      saveWorldsList(list);
    }
    startWorld({ id: id, name: name, seed: seed, mode: mode }, null);
  }
  function loadWorld(id) {
    var entry = listWorlds().filter(function (w) { return w.id === id; })[0];
    if (!entry) return;
    var meta = null;
    var raw = sget('minejs:w:' + id + ':meta');
    if (raw) { try { meta = JSON.parse(raw); } catch (e) { meta = null; } }
    startWorld(entry, meta);
  }
  function deleteWorld(id) {
    saveWorldsList(listWorlds().filter(function (w) { return w.id !== id; }));
    // clear column data
    var pre = 'minejs:w:' + id + ':';
    var del = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(pre) === 0) del.push(k);
      }
    } catch (e) { /* */ }
    del.forEach(sdel);
  }
  function loadColData(cx, cz) {
    if (!worldId) return null;
    var raw = sget('minejs:w:' + worldId + ':col:' + cx + ',' + cz);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function saveColumn(col) {
    if (!col.modified || !worldId || (urlParams.test && !urlParams.savetest)) return;
    sset('minejs:w:' + worldId + ':col:' + col.cx + ',' + col.cz, JSON.stringify(world.serializeColumn(col)));
  }
  function saveAll() {
    if (!world || !worldId || (urlParams.test && !urlParams.savetest)) return;
    var P = Player.P;
    var meta = {
      name: worldName, seed: world.seedStr, mode: P.gamemode,
      time: world.time, day: world.day,
      player: {
        pos: P.pos, yaw: P.yaw, pitch: P.pitch, hp: P.hp, food: P.food,
        sat: P.sat, air: P.air, spawn: P.spawn, flying: P.flying
      },
      inv: Inv.serialize(),
      ents: Ent.serialize(),
      stats: stats
    };
    sset('minejs:w:' + worldId + ':meta', JSON.stringify(meta));
    world.columns.forEach(function (col) { saveColumn(col); });
    // update day count in the world list
    var list = listWorlds();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === worldId) { list[i].day = world.day; break; }
    }
    saveWorldsList(list);
  }

  // ---------- world startup ----------
  function startWorld(entry, meta) {
    worldId = entry.id;
    worldName = entry.name;
    world = new World(entry.seed);
    stats = (meta && meta.stats) || { ach: [] };
    if (meta) {
      world.time = meta.time || 1000;
      world.day = meta.day || 0;
    }
    Inv.clear();

    var spawn;
    if (meta && meta.player) {
      spawn = meta.player.spawn || [0.5, 80, 0.5];
    } else {
      spawn = findSpawn();
    }
    var startPos = (meta && meta.player) ? meta.player.pos : spawn.slice();

    // pregenerate
    var RD = Screens.opts.renderDist;
    var cx0 = Math.floor(startPos[0] / 16), cz0 = Math.floor(startPos[2] / 16);
    var queue = [];
    for (var dz = -RD - 1; dz <= RD + 1; dz++) {
      for (var dx = -RD - 1; dx <= RD + 1; dx++) {
        if (dx * dx + dz * dz <= (RD + 1) * (RD + 1) + 2) queue.push([cx0 + dx, cz0 + dz, dx * dx + dz * dz]);
      }
    }
    queue.sort(function (a, b) { return a[2] - b[2]; });
    var qi = 0;
    Screens.showLoading('Generating world...', 0);
    function pregen() {
      var t0 = performance.now();
      while (qi < queue.length && performance.now() - t0 < 30) {
        var q = queue[qi++];
        world.ensureColumn(q[0], q[1], loadColData(q[0], q[1]));
      }
      Screens.showLoading('Generating world... ' + qi + '/' + queue.length, qi / queue.length);
      if (qi < queue.length) {
        requestAnimationFrame(pregen);
        return;
      }
      finishStart(entry, meta, spawn, startPos);
    }
    requestAnimationFrame(pregen);
  }

  function finishStart(entry, meta, spawn, startPos) {
    // safe landing spot
    if (!meta || !meta.player) {
      var sx = Math.floor(startPos[0]), sz = Math.floor(startPos[2]);
      var col = world.getColumnAt(sx, sz);
      if (col) startPos[1] = col.height[(sx & 15) | ((sz & 15) << 4)] + 1.2;
    }
    Player.init(world, spawn, entry.mode);
    Player.P.pos = startPos.slice();
    if (meta && meta.player) {
      var mp = meta.player;
      Player.P.yaw = mp.yaw || 0;
      Player.P.pitch = mp.pitch || 0;
      Player.P.hp = mp.hp !== undefined ? mp.hp : 20;
      Player.P.food = mp.food !== undefined ? mp.food : 20;
      Player.P.sat = mp.sat || 0;
      Player.P.flying = !!mp.flying;
    }
    if (meta && meta.inv) Inv.deserialize(meta.inv);
    Ent.init(world, Player);
    if (meta && meta.ents) Ent.deserialize(meta.ents);
    if (!meta) Ent.populateSpawn(startPos[0], startPos[2]);

    pcx = 99999;
    playing = true;
    paused = false;
    tickAcc = 0;
    Screens.hideLoading();
    Screens.hideAll();
    if (!urlParams.test) requestLock();
    if (window.TEST) window.TEST.ready = true;
    UI.message(meta ? 'Welcome back, ' + worldName : 'Welcome to ' + worldName + '!');
    if (urlParams.test) applyTestParams();
  }

  function findSpawn() {
    for (var r = 0; r < 64; r++) {
      for (var a = 0; a < 8; a++) {
        var ang = a / 8 * Math.PI * 2;
        var x = Math.round(Math.cos(ang) * r * 12);
        var z = Math.round(Math.sin(ang) * r * 12);
        var bm = Gen.biomeAt(x, z);
        var h = Gen.heightAt(x, z);
        if (bm !== Gen.BIOME.OCEAN && h > Gen.SEA) {
          return [x + 0.5, h + 1.5, z + 0.5];
        }
        if (r === 0) break;
      }
    }
    return [0.5, 80, 0.5];
  }

  function quitToTitle() {
    saveAll();
    playing = false;
    paused = false;
    if (world) {
      world.columns.forEach(function (col) { Render.deleteColumnMesh(col); });
    }
    Ent.clearAll();
    UI.close();
    UI.hideDeath();
    Screens.hideAll();
    Screens.showTitle();
    document.exitPointerLock && document.exitPointerLock();
  }

  // ---------- chunk management ----------
  function rebuildDesired() {
    var RD = Screens.opts.renderDist;
    desired = [];
    activeKeys.clear();
    for (var dz = -RD - 1; dz <= RD + 1; dz++) {
      for (var dx = -RD - 1; dx <= RD + 1; dx++) {
        var d2 = dx * dx + dz * dz;
        if (d2 > (RD + 1) * (RD + 1) + 2) continue;
        desired.push([pcx + dx, pcz + dz, d2]);
        if (d2 <= RD * RD) activeKeys.add((pcx + dx) + ',' + (pcz + dz));
      }
    }
    desired.sort(function (a, b) { return a[2] - b[2]; });
    genPtr = 0;
    rebuildRenderList();
  }
  function colReady(col) {
    if (!col || col.state < 1) return false;
    for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      var n = world.getColumn(col.cx + dx, col.cz + dz);
      if (!n || n.state < 1) return false;
    }
    return true;
  }
  function rebuildRenderList() {
    renderList = [];
    world.columns.forEach(function (col) {
      if (col.mesh) renderList.push(col);
    });
    renderList.sort(function (a, b) {
      var da = (a.cx - pcx) * (a.cx - pcx) + (a.cz - pcz) * (a.cz - pcz);
      var db = (b.cx - pcx) * (b.cx - pcx) + (b.cz - pcz) * (b.cz - pcz);
      return da - db;
    });
  }

  var meshScratch = [];
  function chunkTick() {
    var ncx = Math.floor(Player.pos[0] / 16), ncz = Math.floor(Player.pos[2] / 16);
    if (ncx !== pcx || ncz !== pcz) {
      pcx = ncx; pcz = ncz;
      rebuildDesired();
    }
    // generate
    var t0 = performance.now();
    var genN = 0;
    while (genPtr < desired.length && performance.now() - t0 < 5 && genN < 2) {
      var d = desired[genPtr];
      var col = world.getColumn(d[0], d[1]);
      if (!col || col.state < 1) {
        world.ensureColumn(d[0], d[1], loadColData(d[0], d[1]));
        genN++;
      }
      genPtr++;
    }
    // mesh rebuild
    meshScratch.length = 0;
    world.columns.forEach(function (c) {
      if (c.dirtyMesh && colReady(c)) meshScratch.push(c);
    });
    if (meshScratch.length) {
      meshScratch.sort(function (a, b) {
        var da = (a.cx - pcx) * (a.cx - pcx) + (a.cz - pcz) * (a.cz - pcz);
        var db = (b.cx - pcx) * (b.cx - pcx) + (b.cz - pcz) * (b.cz - pcz);
        return da - db;
      });
      var t1 = performance.now();
      var built = 0;
      for (var i = 0; i < meshScratch.length; i++) {
        var c2 = meshScratch[i];
        c2.dirtyMesh = false;
        var data = Mesher.buildColumn(world, c2);
        var hadMesh = !!c2.mesh;
        Render.uploadColumn(c2, data);
        built++;
        if (!hadMesh) rebuildRenderList();
        if (performance.now() - t1 > 7 || built >= 4) break;
      }
    }
    // unload
    unloadT++;
    if (unloadT > 90) {
      unloadT = 0;
      var RD = Screens.opts.renderDist;
      var toUnload = [];
      world.columns.forEach(function (c) {
        var dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > (RD + 3) * (RD + 3)) toUnload.push(c);
      });
      if (toUnload.length) {
        toUnload.forEach(function (c) {
          saveColumn(c);
          Render.deleteColumnMesh(c);
          world.unloadColumn(c.cx, c.cz);
        });
        rebuildRenderList();
      }
    }
  }

  // ---------- day/night ----------
  function dayFactor() {
    if (!world) return 1;
    var t = world.time;
    if (t < 12000) return 1;
    if (t < 13800) return Util.lerp(1, 0.22, (t - 12000) / 1800);
    if (t < 22200) return 0.22;
    return Util.lerp(0.22, 1, (t - 22200) / 1800);
  }
  function dayState() {
    var f = dayFactor();
    var t = world.time;
    var a = t / 24000 * Math.PI * 2;
    var sunDir = [Math.cos(a), Math.sin(a), 0.12];
    var sl = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
    sunDir[0] /= sl; sunDir[1] /= sl; sunDir[2] /= sl;
    var k = Util.smooth(Util.clamp((f - 0.22) / 0.78, 0, 1));
    function mixc(n, d2) { return [Util.lerp(n[0], d2[0], k), Util.lerp(n[1], d2[1], k), Util.lerp(n[2], d2[2], k)]; }
    var zen = mixc([0.012, 0.02, 0.055], [0.45, 0.64, 1.0]);
    var hor = mixc([0.05, 0.06, 0.12], [0.74, 0.84, 1.0]);
    // sunset/sunrise orange tint
    var tf = Math.sin(Math.PI * k);
    var sunset = Math.pow(Util.clamp(1 - Math.abs(sunDir[1]) * 2.2, 0, 1), 1.5) * tf;
    hor = [Util.lerp(hor[0], 1.0, sunset * 0.55), Util.lerp(hor[1], 0.5, sunset * 0.45), Util.lerp(hor[2], 0.28, sunset * 0.5)];
    return {
      f: f, sunDir: sunDir, zenith: zen, horizon: hor,
      starA: Util.clamp((0.55 - f) * 2.6, 0, 1)
    };
  }

  // ---------- main loop ----------
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.08, (t - lastT) / 1000 || 0.016);
    lastT = t;
    timeSec += dt;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (!playing) return;
    if (urlParams.test) testFrameTick();

    var uiOpen = UI.isOpen() || paused || Player.dead;
    if (!paused) {
      Player.update(dt, uiOpen);
      tickAcc += dt;
      var guard = 0;
      while (tickAcc >= 0.05 && guard++ < 4) {
        tickAcc -= 0.05;
        doTick();
      }
      if (guard >= 4) tickAcc = 0;
      Ent.updateParticles(dt);
      chunkTick();
    }

    // test: force crack visualization
    if (urlParams.crack && testStage >= 1) {
      var hitC = Player.currentTarget();
      if (hitC) {
        Player.P.mineTarget = hitC;
        Player.P.mineProgress = +urlParams.crack;
      }
    }
    // render
    var camS = Player.cameraState();
    var ds = dayState();
    var P = Player.P;
    var RD = Screens.opts.renderDist;
    var fogR, fogC;
    if (P.headInWater) { fogC = [0.08, 0.15, 0.42]; fogR = [4, 22]; }
    else if (P.inLava) { fogC = [0.7, 0.25, 0.05]; fogR = [0.2, 2.5]; }
    else {
      fogC = ds.horizon;
      fogR = [RD * 16 * 0.55, RD * 16 * 0.95];
    }
    var targetFov = Screens.opts.fov * (P.sprinting ? 1.12 : 1) * (P.flying ? 1.08 : 1);
    fovCur += (targetFov - fovCur) * Math.min(1, dt * 8);

    Render.begin(camS.eye, camS.yaw, camS.pitch, fovCur, RD, ds.f, { color: fogC, range: fogR }, timeSec);
    Render.drawSky(ds);
    Render.drawWorld(renderList);
    Ent.drawAll(Render, camS.yaw, 0);
    if (P.thirdPerson) drawPlayerModel();
    Render.drawParticles(Ent.particles(), camS.yaw, camS.pitch);
    if (Screens.opts.clouds) Render.drawClouds(world.time);
    // selection box + crack
    if (!uiOpen) {
      var hit = Player.currentTarget();
      if (hit) {
        var hb = Blocks.BLOCKS[hit.id];
        Render.drawSelection(hit.x, hit.y, hit.z, hb && hb.box);
        if (P.mineTarget && P.mineProgress > 0 &&
            P.mineTarget.x === hit.x && P.mineTarget.y === hit.y && P.mineTarget.z === hit.z) {
          Render.drawCrack(hit.x, hit.y, hit.z, Math.floor(P.mineProgress * 10));
        }
      }
    }
    if (!P.thirdPerson && !P.dead) {
      var ex = Math.floor(camS.eye[0]), ey = Math.floor(camS.eye[1]), ez = Math.floor(camS.eye[2]);
      Render.drawHeldItem(Inv.held(), [world.getSky(ex, ey, ez), world.getBlk(ex, ey, ez)], {
        swing: P.swingT, equip: P.equipT, bobPhase: P.bobPhase, bobAmp: P.bobAmp, eating: P.eatT
      });
    }

    // liquid animation
    liquidAnimT += dt;
    if (liquidAnimT > 0.25) {
      liquidAnimT = 0;
      Render.updateLiquidTiles(timeSec);
    }

    UI.updateHUD();
    UI.updateOpenContainer();
    UI.updateF3(fps);
    Sfx.musicTick(dt, !paused);
    var underground = world.getSky(Math.floor(P.pos[0]), Math.floor(P.pos[1]), Math.floor(P.pos[2])) === 0 && P.pos[1] < 56;
    Sfx.ambientTick(dt, underground);

    // autosave
    saveT += dt;
    if (saveT > 25) {
      saveT = 0;
      saveAll();
    }
  }

  function doTick() {
    tickNo++;
    world.tick(activeKeys);
    if (urlParams.time) world.time = +urlParams.time; // test: pin the time
    if (urlParams.report && (tickNo % +urlParams.report) === 0) {
      var inv = Inv.slots().filter(Boolean).map(function (s) { return s.id + 'x' + s.n; }).join(' ');
      var ht = Player.currentTarget();
      console.log('[report] t=' + tickNo + ' pos=' + Player.P.pos.map(function (v) { return v.toFixed(1); }).join(',') +
        ' hp=' + Player.P.hp + ' food=' + Player.P.food + ' inv=[' + inv + '] target=' + (ht ? ht.id : 'none') +
        ' ents=' + Ent.list().length);
    }
    if (!urlParams.freeze) Ent.tick(activeKeys);
    Player.tick20();
    // zombie ambient sound
    if ((tickNo & 127) === 0) {
      var ents = Ent.list();
      for (var i = 0; i < ents.length; i++) {
        if (ents[i].type === 'mob' && ents[i].species === 'zombie' && !ents[i].dead && Math.random() < 0.3) {
          Sfx.play('zombie_say', { pos: ents[i].pos, pitch: 0.9 + Math.random() * 0.2 });
          break;
        }
      }
    }
  }

  // third-person player model
  var pm1 = Util.M.create();
  function drawPlayerModel() {
    var P = Player.P;
    var meshes = Render.meshesFor('humanoid', 'skin_player');
    var lx = Math.floor(P.pos[0]), ly = Math.floor(P.pos[1] + 1), lz = Math.floor(P.pos[2]);
    var light = [world.getSky(lx, ly, lz), world.getBlk(lx, ly, lz)];
    var M = Util.M;
    var hsp = Math.hypot(P.vel[0], P.vel[2]);
    var wc = P.bobPhase * 2.2, amp = Math.min(1, hsp / 4) * 0.8;
    for (var i = 0; i < meshes.length; i++) {
      var mesh = meshes[i], p = mesh.part;
      M.identity(pm1);
      M.translate(pm1, pm1, P.pos[0], P.pos[1], P.pos[2]);
      M.rotateY(pm1, pm1, P.yaw);
      M.translate(pm1, pm1, p.pivot[0] / 16, p.pivot[1] / 16, p.pivot[2] / 16);
      switch (p.anim) {
        case 'head': M.rotateX(pm1, pm1, -P.pitch); break;
        case 'legR': M.rotateX(pm1, pm1, Math.sin(wc) * amp); break;
        case 'legL': M.rotateX(pm1, pm1, -Math.sin(wc) * amp); break;
        case 'armR': M.rotateX(pm1, pm1, -Math.sin(wc) * amp * 0.7 - P.swingT * 1.2); break;
        case 'armL': M.rotateX(pm1, pm1, Math.sin(wc) * amp * 0.7); break;
      }
      M.translate(pm1, pm1, p.off[0] / 16, p.off[1] / 16, p.off[2] / 16);
      Render.drawEntMesh(mesh, pm1, light, null, 1);
    }
  }

  // ---------- achievements ----------
  var ACH = {
    wood: { title: 'Getting Wood!', sub: 'Attack a tree until a Log drops' },
    stone: { title: 'Stone Age', sub: 'Mine some stone' },
    table: { title: 'Crafting Table!', sub: 'Make a Crafting Table from Planks' },
    pick: { title: 'Time to Mine!', sub: 'Craft a Pickaxe' },
    furnace: { title: 'Hot Topic', sub: 'Make a Furnace from eight Cobblestone' },
    sword: { title: 'Blade Drawn', sub: 'Craft a Sword' },
    bread: { title: 'The Baker', sub: 'Make Bread from Wheat' },
    tnt: { title: 'Demolition Expert', sub: 'Craft TNT, use with care!' },
    diamond: { title: 'Diamond!', sub: 'Mine some Diamond!' }
  };
  function ach(key, iconId) {
    if (stats.ach.indexOf(key) >= 0) return;
    stats.ach.push(key);
    UI.toast(ACH[key].title, ACH[key].sub, iconId);
  }
  function stat(action, id) {
    var IT = Blocks.IT;
    if (action === 'mined') {
      if (id === B.LOG_OAK || id === B.LOG_BIRCH || id === B.LOG_SPRUCE) ach('wood', id);
      if (id === B.STONE) ach('stone', B.COBBLE);
      if (id === B.ORE_DIAMOND) ach('diamond', IT.DIAMOND);
    } else if (action === 'crafted') {
      if (id === B.CRAFTING_TABLE) ach('table', id);
      if (id === IT.PICK_WOOD || id === IT.PICK_STONE || id === IT.PICK_IRON || id === IT.PICK_DIAMOND || id === IT.PICK_GOLD) ach('pick', id);
      if (id === B.FURNACE) ach('furnace', id);
      if (id === IT.SWORD_WOOD || id === IT.SWORD_STONE || id === IT.SWORD_IRON || id === IT.SWORD_DIAMOND || id === IT.SWORD_GOLD) ach('sword', id);
      if (id === IT.BREAD) ach('bread', id);
      if (id === B.TNT) ach('tnt', id);
    }
  }

  // ---------- input ----------
  var lockHint;
  function requestLock() {
    if (document.pointerLockElement === canvas) return;
    if (!canvas.requestPointerLock) return;
    try {
      var p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () { showLockHint(); });
    } catch (e) { showLockHint(); }
  }
  function showLockHint() {
    if (lockHint) lockHint.style.display = 'flex';
  }
  function bindInput() {
    lockHint = document.getElementById('lock-hint');
    lockHint.addEventListener('click', function () {
      lockHint.style.display = 'none';
      requestLock();
    });
    canvas.addEventListener('mousedown', function (e) {
      if (!playing || paused || Player.dead) return;
      if (UI.isOpen()) return;
      if (document.pointerLockElement !== canvas) {
        requestLock();
        e.preventDefault();
        return;
      }
      if (e.button === 0) Player.P.mouseL = true;
      if (e.button === 2) Player.P.mouseR = true;
      e.preventDefault();
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 0) Player.P.mouseL = false;
      if (e.button === 2) Player.P.mouseR = false;
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('mousemove', function (e) {
      if (document.pointerLockElement === canvas && playing && !paused) {
        var mx = Util.clamp(e.movementX, -200, 200);
        var my = Util.clamp(e.movementY, -200, 200);
        Player.onMouseMove(mx, my, Screens.opts.sens);
      }
    });
    document.addEventListener('pointerlockchange', function () {
      if (document.pointerLockElement !== canvas && playing && !UI.isOpen() && !Player.dead && !paused && !urlParams.test) {
        pause();
      }
    });
    document.addEventListener('wheel', function (e) {
      if (playing && !UI.isOpen() && !paused && document.pointerLockElement === canvas) {
        Inv.scroll(e.deltaY > 0 ? 1 : -1);
        e.preventDefault();
      }
    }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (!playing) return;
      Sfx.ensure();
      if (e.code === 'Escape') {
        if (UI.isOpen()) { UI.close(); requestLock(); }
        else if (paused) resume();
        e.preventDefault();
        return;
      }
      if (paused || Player.dead) return;
      if (e.code === 'KeyE') {
        if (UI.isOpen()) { UI.close(); requestLock(); }
        else UI.openContainer('inv');
        e.preventDefault();
        return;
      }
      if (UI.isOpen()) return;
      if (e.code === 'KeyQ') { Inv.dropSelected(e.ctrlKey); return; }
      if (e.code.indexOf('Digit') === 0) {
        var n = +e.code.slice(5);
        if (n >= 1 && n <= 9) Inv.select(n - 1);
        return;
      }
      if (e.code === 'F3') { UI.toggleF3(); e.preventDefault(); return; }
      if (e.code === 'F5' || e.code === 'KeyV') {
        Player.P.thirdPerson = !Player.P.thirdPerson;
        e.preventDefault();
        return;
      }
      Player.setKey(e.code, true);
    });
    document.addEventListener('keyup', function (e) {
      Player.setKey(e.code, false);
    });
    window.addEventListener('beforeunload', function () { if (playing) saveAll(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && playing && !paused && !urlParams.test) pause();
    });
    window.addEventListener('resize', function () { Render.resize(); });
    // click anywhere on the page to enable audio
    document.addEventListener('mousedown', function () { Sfx.ensure(); }, { once: true });
  }

  function pause() {
    if (!playing || paused) return;
    paused = true;
    saveAll();
    Screens.showPause();
    document.exitPointerLock && document.exitPointerLock();
  }
  function resume() {
    paused = false;
    Screens.hidePause();
    requestLock();
  }

  // ---------- startup ----------
  function boot() {
    canvas = document.getElementById('game');
    Tex.build();
    if (urlParams.atlas) {
      // atlas inspection mode
      var a = Tex.atlasCanvas();
      a.style.cssText = 'position:absolute;top:0;left:0;width:768px;height:768px;image-rendering:pixelated;z-index:99;background:#345';
      document.body.appendChild(a);
      return;
    }
    try {
      Render.init(canvas);
    } catch (e) {
      document.getElementById('webgl-fail').style.display = 'flex';
      document.getElementById('webgl-fail-msg').textContent = String(e.message || e);
      return;
    }
    UI.init();
    Screens.init();
    bindInput();
    requestAnimationFrame(loop);

    if (urlParams.test) {
      setupTest();
      if (urlParams.dist) Screens.opts.renderDist = Util.clamp(+urlParams.dist, 2, 10);
      createWorld('Test World', urlParams.seed || '12345', urlParams.mode || 'survival');
    } else {
      Screens.showTitle();
    }
  }

  // URL test commands (headless screenshot driven) — frame-count driven to guarantee execution
  var testStage = 0, testFrames = -1, tfCalls = 0, aplCalls = 0;
  function testFrameTick() {
    tfCalls++;
    window.__ts = 'stage=' + testStage + ' tf=' + tfCalls + ' apl=' + aplCalls +
      ' 3rd=' + (Player.P.thirdPerson ? 1 : 0) + ' L=' + (Player.P.mouseL ? 1 : 0) +
      ' prog=' + Player.P.mineProgress.toFixed(2) + ' ' + (window.__tsmsg || '');
    var d = document.getElementById('test-diag');
    if (!d) {
      d = document.createElement('div');
      d.id = 'test-diag';
      d.style.cssText = 'position:absolute;bottom:120px;left:8px;z-index:50;font:bold 18px monospace;color:#0f0;background:rgba(0,0,0,0.6);padding:4px 8px;pointer-events:none';
      document.body.appendChild(d);
    }
    d.textContent = window.__ts;
    if (testFrames < 0) return;
    testFrames--;
    if (testFrames > 0) return;
    if (testStage === 0) {
      testStage = 1;
      testFrames = -1;
      try {
        applyStage1();
        if (urlParams.open) {
          if (urlParams.open === 'furnace' || urlParams.open === 'chest') {
            // find the nearest block entity
            var fb = urlParams.open === 'furnace' ? Blocks.B.FURNACE : Blocks.B.CHEST;
            var fpx = Math.floor(Player.P.pos[0]), fpy = Math.floor(Player.P.pos[1]), fpz = Math.floor(Player.P.pos[2]);
            var done = false;
            for (var oy = -3; oy <= 2 && !done; oy++) for (var ox = -3; ox <= 3 && !done; ox++) for (var oz = -3; oz <= 3 && !done; oz++) {
              if (world.getBlock(fpx + ox, fpy + oy, fpz + oz) === fb) {
                UI.openContainer(urlParams.open, world.getBE(fpx + ox, fpy + oy, fpz + oz), [fpx + ox, fpy + oy, fpz + oz]);
                done = true;
              }
            }
            console.log('[test] open ' + urlParams.open + ' found=' + done + ' isOpen=' + UI.isOpen());
          } else {
            UI.openContainer(urlParams.open);
          }
        }
        if (urlParams.boom) {
          world.explode(Player.P.pos[0] + 5, Player.P.pos[1] + 1, Player.P.pos[2], +urlParams.boom);
        }
        if (urlParams.mine) Player.P.mouseL = true;
        if (urlParams.use) Player.P.mouseR = true;
        if (urlParams.press) {
          urlParams.press.split(';').forEach(function (k) { Player.setKey(k, true); });
        }
        if (urlParams.third) Player.P.thirdPerson = true;
        if (urlParams.warp) {
          // synchronously fast-forward N ticks (including player logic)
          var wn = Math.min(2000, +urlParams.warp);
          for (var wi = 0; wi < wn; wi++) {
            Player.update(0.05, UI.isOpen());
            doTick();
          }
        }
        if (urlParams.savetest) {
          var fpx3 = Math.floor(Player.P.pos[0]), fpy3 = Math.floor(Player.P.pos[1]), fpz3 = Math.floor(Player.P.pos[2]);
          if (!window.__stDone) {
            window.__stDone = 1;
            world.setBlock(fpx3 + 2, fpy3, fpz3, Blocks.B.COBBLE);
            world.setBlock(fpx3 + 2, fpy3 + 1, fpz3, Blocks.B.TORCH);
            Inv.give(Blocks.B.COBBLE, 7);
            Inv.give(Blocks.IT.PICK_IRON, 1);
            var wid2 = worldId;
            saveAll();
            quitToTitle();
            loadWorld(wid2);
          } else if (window.__stDone === 1) {
            window.__stDone = 2;
            var okBlock = world.getBlock(fpx3 + 2, fpy3, fpz3) === Blocks.B.COBBLE;
            var okTorch = world.getBlock(fpx3 + 2, fpy3 + 1, fpz3) === Blocks.B.TORCH;
            var slots2 = Inv.slots().filter(Boolean).map(function (s2) { return s2.id + 'x' + s2.n; }).join(' ');
            console.log('[savetest] block=' + okBlock + ' torch=' + okTorch + ' inv=[' + slots2 + ']');
            deleteWorld(worldId);
          }
        }
        window.__tsmsg = 'S1OK pos=' + Player.P.pos.map(function (v) { return v.toFixed(0); }).join(',');
      } catch (e) {
        window.__tsmsg = 'S1ERR ' + String(e).slice(0, 120);
      }
      console.log('[test] ' + window.__tsmsg);
    }
  }
  function applyTestParams() {
    aplCalls++;
    UI.toggleF3();
    testStage = 0;
    testFrames = 1;
  }
  function applyStage1() {
    (function () {
      if (urlParams.time) world.time = +urlParams.time;
      if (urlParams.tp) {
        var p = urlParams.tp.split(',').map(Number);
        Player.P.pos = [p[0], p[1], p[2]];
        Player.P.vel = [0, 0, 0];
      }
      if (urlParams.look) {
        var l = urlParams.look.split(',').map(Number);
        Player.P.yaw = l[0] * Math.PI / 180;
        Player.P.pitch = (l[1] || 0) * Math.PI / 180;
      }
      if (urlParams.give) {
        urlParams.give.split(';').forEach(function (g) {
          var a = g.split(':');
          Inv.give(+a[0], +a[1] || 1);
        });
      }
      if (urlParams.biome) {
        var bid = Gen.BIOME[urlParams.biome.toUpperCase()];
        if (bid !== undefined) {
          var hitB = null;
          outer:
          for (var r2 = 0; r2 < 900; r2 += 12) {
            for (var a2 = 0; a2 < 14; a2++) {
              var ang = a2 / 14 * Math.PI * 2;
              var bx = Math.round(Math.cos(ang) * r2), bz = Math.round(Math.sin(ang) * r2);
              if (Gen.biomeAt(bx, bz) === bid) { hitB = [bx, bz]; break outer; }
              if (r2 === 0) break;
            }
          }
          console.log('[test] biome ' + urlParams.biome + ' -> ' + JSON.stringify(hitB));
          if (hitB) {
            Player.P.pos = [hitB[0] + 0.5, Math.max(Gen.heightAt(hitB[0], hitB[1]), Gen.SEA) + 8, hitB[1] + 0.5];
            Player.P.vel = [0, 0, 0];
            Player.P.flying = true;
          }
        }
      }
      if (urlParams.cave) {
        // find a deep cave cavity
        outer2:
        for (var cx2 = -4; cx2 <= 4; cx2++) for (var cz2 = -4; cz2 <= 4; cz2++) {
          var col2 = world.getColumn(cx2, cz2);
          if (!col2) continue;
          for (var y2 = 38; y2 > 12; y2--) {
            for (var li = 0; li < 256; li++) {
              var lx2 = li & 15, lz2 = li >> 4;
              var idx2 = lx2 | (lz2 << 4) | (y2 << 8);
              if (col2.blocks[idx2] === 0 && col2.blocks[idx2 | 256] === 0 &&
                  col2.blocks[lx2 | (lz2 << 4) | ((y2 - 1) << 8)] === 1) {
                var wx2 = cx2 * 16 + lx2, wz2 = cz2 * 16 + lz2;
                console.log('[test] cave at ' + wx2 + ',' + y2 + ',' + wz2);
                Player.P.pos = [wx2 + 0.5, y2, wz2 + 0.5];
                Player.P.vel = [0, 0, 0];
                world.setBlock(wx2, y2, wz2, Blocks.B.TORCH, 0);
                break outer2;
              }
            }
          }
        }
      }
      if (urlParams.sel) Inv.select(+urlParams.sel);
      if (urlParams.fly) { Player.P.flying = true; }
      if (urlParams.mob) {
        urlParams.mob.split(';').forEach(function (m) {
          var a = m.split(',');
          var mx = Player.P.pos[0] + (+a[1] || 3);
          var mz = Player.P.pos[2] + (+a[2] || 0);
          var mcol = world.getColumnAt(Math.floor(mx), Math.floor(mz));
          var my = mcol ? mcol.height[(Math.floor(mx) & 15) | ((Math.floor(mz) & 15) << 4)] : Player.P.pos[1];
          var e = Ent.spawnMob(a[0], mx, my, mz);
          if (e && urlParams.freeze) {
            // face the player
            e.yaw = Math.atan2(-(Player.P.pos[0] - mx), -(Player.P.pos[2] - mz));
          }
        });
      }
      if (urlParams.setblock) {
        urlParams.setblock.split(';').forEach(function (sb) {
          var a = sb.split(',').map(Number);
          var bx2 = Math.floor(Player.P.pos[0]) + a[0];
          var bz3 = Math.floor(Player.P.pos[2]) + a[2];
          var by;
          if (a[1] === 99) { // 99 = on the ground
            var c3 = world.getColumnAt(bx2, bz3);
            by = c3 ? c3.height[(bx2 & 15) | ((bz3 & 15) << 4)] : Math.floor(Player.P.pos[1]);
          } else {
            by = Math.floor(Player.P.pos[1]) + a[1];
          }
          world.setBlock(bx2, by, bz3, a[3], a[4] || 0);
        });
      }
    })();
  }

  function setupTest() {
    window.TEST = {
      ready: false,
      world: function () { return world; },
      player: function () { return Player.P; },
      tp: function (x, y, z) { Player.P.pos = [x, y, z]; Player.P.vel = [0, 0, 0]; },
      look: function (yaw, pitch) { Player.P.yaw = yaw; Player.P.pitch = pitch; },
      give: function (id, n) { Inv.give(id, n || 1); },
      select: function (i) { Inv.select(i); },
      setTime: function (t) { world.time = t; },
      spawnMob: function (s, dx, dz) {
        var p = Player.P.pos;
        return Ent.spawnMob(s, p[0] + (dx || 3), p[1] + 2, p[2] + (dz || 0));
      },
      mine: function (on) { Player.P.mouseL = on; },
      use: function (on) { Player.P.mouseR = on; },
      key: function (code, down) { Player.setKey(code, down); },
      openInv: function () { UI.openContainer('inv'); },
      close: function () { UI.close(); },
      fps: function () { return fps; },
      stats: function () {
        return { fps: fps, cols: world.columns.size, meshed: renderList.length, ents: Ent.list().length };
      },
      setBlock: function (x, y, z, id, meta) { return world.setBlock(x, y, z, id, meta); },
      getBlock: function (x, y, z) { return world.getBlock(x, y, z); },
      explode: function (p) { world.explode(Player.P.pos[0] + 6, Player.P.pos[1], Player.P.pos[2], p || 4); },
      B: Blocks.B, IT: Blocks.IT
    };
  }

  return {
    boot: boot,
    world: function () { return world; },
    tickNo: function () { return tickNo; },
    dayFactor: dayFactor,
    isPlaying: function () { return playing; },
    listWorlds: listWorlds, createWorld: createWorld, loadWorld: loadWorld, deleteWorld: deleteWorld,
    resume: resume, pause: pause, quitToTitle: quitToTitle,
    stat: stat,
    saveAll: saveAll
  };
})();

window.addEventListener('DOMContentLoaded', function () { Game.boot(); });
