// ============ player.js — player control / interaction / survival state ============
'use strict';
var Player = (function () {
  var B = Blocks.B, BL = Blocks.BLOCKS;

  var world = null;
  var P = {
    pos: [0, 80, 0], vel: [0, 0, 0],
    yaw: 0, pitch: 0,
    w: 0.3, h: 1.8, eyeH: 1.62, eyeHCur: 1.62,
    onGround: false, inWater: false, inLava: false, headInWater: false,
    sneaking: false, sprinting: false, flying: false,
    hp: 20, food: 20, sat: 5, air: 10,
    exhaustion: 0, regenT: 0, starveT: 0, airT: 0, hurtCD: 0, fireT: 0,
    dead: false, gamemode: 'survival',
    fallDist: 0,
    bobPhase: 0, bobAmp: 0,
    swingT: 0, equipT: 0, eatT: 0,
    mineTarget: null, mineProgress: 0, mineCD: 0,
    placeCD: 0, attackCD: 0,
    thirdPerson: false,
    keys: {}, mouseL: false, mouseR: false,
    lastWTap: 0, spaceTap: 0,
    spawn: [0, 80, 0],
    deathCause: ''
  };

  function init(w, spawnPos, gamemode) {
    world = w;
    P.gamemode = gamemode || 'survival';
    P.spawn = spawnPos.slice();
    reset(spawnPos);
  }
  function reset(pos) {
    P.pos = pos.slice();
    P.vel = [0, 0, 0];
    P.hp = 20; P.food = 20; P.sat = 5; P.air = 10;
    P.exhaustion = 0; P.dead = false;
    P.fallDist = 0; P.flying = false;
    P.mineTarget = null; P.mineProgress = 0;
    P.fireT = 0;
  }

  // ---------- input ----------
  function onMouseMove(dx, dy, sens) {
    if (P.dead) return;
    var s = (sens || 1) * 0.0024;
    P.yaw -= dx * s;
    P.pitch -= dy * s;
    P.pitch = Util.clamp(P.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
  }
  function setKey(code, down) {
    P.keys[code] = down;
    if (down && code === 'KeyW') {
      var now = performance.now();
      if (now - P.lastWTap < 280 && P.food > 6) P.sprinting = true;
      P.lastWTap = now;
    }
    if (!down && code === 'KeyW') P.sprinting = false;
    if (down && (code === 'ControlLeft' || code === 'ControlRight') && P.keys['KeyW'] && P.food > 6) {
      P.sprinting = true;
    }
    if (down && code === 'Space' && P.gamemode === 'creative') {
      var now2 = performance.now();
      if (now2 - P.spaceTap < 280) { P.flying = !P.flying; P.vel[1] = 0; }
      P.spaceTap = now2;
    }
  }

  function eyePos() {
    return [P.pos[0], P.pos[1] + P.eyeHCur, P.pos[2]];
  }
  function lookDir() {
    return Util.dirFromAngles(P.yaw, P.pitch);
  }

  // ---------- movement ----------
  function update(dt, uiOpen) {
    if (P.dead) return;
    var keys = uiOpen ? {} : P.keys;

    // liquid/climbing state
    var fx = Math.floor(P.pos[0]), fz = Math.floor(P.pos[2]);
    var feetId = world.getBlock(fx, Math.floor(P.pos[1] + 0.1), fz);
    var midId = world.getBlock(fx, Math.floor(P.pos[1] + 0.9), fz);
    var headId = world.getBlock(fx, Math.floor(P.pos[1] + P.eyeHCur), fz);
    P.inWater = feetId === B.WATER || midId === B.WATER;
    P.inLava = feetId === B.LAVA || midId === B.LAVA;
    P.headInWater = headId === B.WATER;
    var climbing = (BL[feetId] && BL[feetId].climb) || (BL[midId] && BL[midId].climb);

    P.sneaking = !!keys['ShiftLeft'] && !P.flying;
    if (P.sneaking || P.food <= 6) P.sprinting = false;
    if (!keys['KeyW']) P.sprinting = false;

    // eye height (lowered when sneaking)
    var targetEye = P.sneaking ? 1.5 : 1.62;
    P.eyeHCur += (targetEye - P.eyeHCur) * Math.min(1, dt * 14);

    // desired movement direction
    var ix = 0, iz = 0;
    if (keys['KeyW']) iz -= 1;
    if (keys['KeyS']) iz += 1;
    if (keys['KeyA']) ix -= 1;
    if (keys['KeyD']) ix += 1;
    var il = Math.hypot(ix, iz);
    if (il > 0) { ix /= il; iz /= il; }
    var sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    // relative to facing: forward = (-sin, -cos), right = (cos, -sin)
    var wx = (-sy) * (-iz) + cy * ix;
    var wz = (-cy) * (-iz) + (-sy) * ix;

    var speed = 4.32;
    if (P.sprinting) speed = 5.61;
    if (P.sneaking) speed = 1.31;
    if (P.flying) speed = P.sprinting ? 16 : 10;
    if (P.inWater && !P.flying) speed *= 0.55;

    var accel = P.onGround || P.flying ? 13 : 3.2;
    if (P.inWater || P.inLava) accel = 5;
    P.vel[0] += (wx * speed - P.vel[0]) * Math.min(1, accel * dt);
    P.vel[2] += (wz * speed - P.vel[2]) * Math.min(1, accel * dt);

    // vertical
    if (P.flying) {
      var vy = 0;
      if (keys['Space']) vy = speed * 0.8;
      else if (keys['ShiftLeft']) vy = -speed * 0.8;
      P.vel[1] += (vy - P.vel[1]) * Math.min(1, 10 * dt);
      P.fallDist = 0;
    } else if (climbing) {
      var cv = -1.6;
      if (keys['KeyW'] || keys['Space']) cv = 2.3;
      else if (keys['ShiftLeft']) cv = 0;
      P.vel[1] = cv;
      P.fallDist = 0;
    } else if (P.inWater || P.inLava) {
      P.vel[1] -= (P.inLava ? 5 : 7) * dt;
      if (keys['Space']) P.vel[1] = Math.min(P.vel[1] + 24 * dt, 3.6);
      P.vel[1] = Math.max(P.vel[1], P.inLava ? -1.6 : -2.6);
      P.fallDist = 0;
    } else {
      P.vel[1] -= 30 * dt;
      if (P.vel[1] < -60) P.vel[1] = -60;
      if (keys['Space'] && P.onGround) {
        P.vel[1] = 8.7;
        addExhaust(P.sprinting ? 0.2 : 0.05);
        if (P.sprinting) { P.vel[0] *= 1.25; P.vel[2] *= 1.25; }
      }
    }

    // movement + collision (sneak fall-off prevention)
    var dx = P.vel[0] * dt, dy = P.vel[1] * dt, dz = P.vel[2] * dt;
    if (P.sneaking && P.onGround && !P.flying) {
      if (!hasSupport(dx, 0)) { dx = 0; P.vel[0] = 0; }
      if (!hasSupport(0, dz)) { dz = 0; P.vel[2] = 0; }
      if (dx !== 0 && dz !== 0 && !hasSupport(dx, dz)) { dz = 0; P.vel[2] = 0; }
    }
    var wasOnGround = P.onGround;
    var prevVy = P.vel[1];
    P.onGround = false;
    var hit = moveCollide(dx, dy, dz);
    if (hit.x) P.vel[0] = 0;
    if (hit.z) P.vel[2] = 0;
    if (hit.y) {
      if (prevVy < 0 && P.onGround) {
        // fall damage
        if (P.fallDist > 3.4 && P.gamemode === 'survival') {
          var dmg = Math.floor(P.fallDist - 3);
          if (dmg > 0) {
            hurt(dmg, 0, 0, 'Falling');
            Sfx.play('fall_hurt', { pitch: 1 });
          }
        }
        P.fallDist = 0;
      }
      P.vel[1] = 0;
    }
    if (!P.onGround && P.vel[1] < 0 && !P.inWater && !climbing) {
      P.fallDist -= P.vel[1] * dt;
    } else if (P.onGround) {
      P.fallDist = 0;
    }
    if (P.flying && P.onGround) P.flying = false;

    // the void
    if (P.pos[1] < -12) {
      P.pos[1] = -12;
      if (P.gamemode === 'survival') hurt(4, 0, 0, 'the Void');
      else { P.pos[1] = 80; P.vel[1] = 0; }
    }

    // view bobbing
    var hsp = Math.hypot(P.vel[0], P.vel[2]);
    if (P.onGround && hsp > 0.5) {
      P.bobPhase += hsp * dt * 1.6;
      P.bobAmp = Util.lerp(P.bobAmp, Math.min(1, hsp / 5), Math.min(1, dt * 8));
      stepSounds(hsp, dt);
    } else {
      P.bobAmp = Util.lerp(P.bobAmp, 0, Math.min(1, dt * 8));
    }
    if (P.swingT > 0) P.swingT = Math.max(0, P.swingT - dt * 3.4);
    if (P.equipT > 0) P.equipT = Math.max(0, P.equipT - dt * 4);
    void wasOnGround;

    // Lava ignition
    if (P.inLava && P.gamemode === 'survival') {
      P.fireT = 80;
      if ((Game.tickNo() & 7) === 0) hurt(4, 0, 0, 'Lava');
    }

    // interaction
    if (!uiOpen) {
      handleMining(dt);
      handleUse(dt);
    } else {
      P.mineTarget = null; P.mineProgress = 0; P.eatT = 0;
    }
    if (P.mineCD > 0) P.mineCD -= dt;
    if (P.placeCD > 0) P.placeCD -= dt;
    if (P.attackCD > 0) P.attackCD -= dt;
  }

  var stepAcc = 0;
  function stepSounds(hsp, dt) {
    stepAcc += hsp * dt;
    if (stepAcc > 2.2) {
      stepAcc = 0;
      var below = world.getBlock(Math.floor(P.pos[0]), Math.floor(P.pos[1] - 0.4), Math.floor(P.pos[2]));
      if (below && BL[below]) {
        Sfx.play('step_' + (BL[below].sound || 'stone'), { vol: 0.35, pitch: 0.9 + Math.random() * 0.2 });
      }
    }
  }

  // sneak support detection
  function hasSupport(dx, dz) {
    var x0 = P.pos[0] + dx - P.w, x1 = P.pos[0] + dx + P.w;
    var z0 = P.pos[2] + dz - P.w, z1 = P.pos[2] + dz + P.w;
    var y = P.pos[1] - 0.45;
    var boxes = world.getCollisions(x0, y, z0, x1, P.pos[1] + 0.1, z1, []);
    return boxes.length > 0;
  }

  var scratch = [];
  function box() {
    return [P.pos[0] - P.w, P.pos[1], P.pos[2] - P.w, P.pos[0] + P.w, P.pos[1] + P.h, P.pos[2] + P.w];
  }
  function overlap(a, b) {
    return a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
  }
  function moveCollide(dx, dy, dz) {
    var hit = { x: false, y: false, z: false };
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
    var sx = dx / steps, sy = dy / steps, sz = dz / steps;
    for (var s = 0; s < steps; s++) {
      if (sy !== 0) {
        P.pos[1] += sy;
        var b1 = box();
        var bs = world.getCollisions(b1[0], b1[1], b1[2], b1[3], b1[4], b1[5], scratch);
        for (var i = 0; i < bs.length; i++) {
          if (!overlap(b1, bs[i])) continue;
          if (sy < 0) { P.pos[1] = bs[i][4]; P.onGround = true; }
          else P.pos[1] = bs[i][1] - P.h;
          hit.y = true;
          b1 = box();
        }
      }
      if (sx !== 0) {
        P.pos[0] += sx;
        var b2 = box();
        var bs2 = world.getCollisions(b2[0], b2[1], b2[2], b2[3], b2[4], b2[5], scratch);
        for (var i2 = 0; i2 < bs2.length; i2++) {
          if (!overlap(b2, bs2[i2])) continue;
          if (sx > 0) P.pos[0] = bs2[i2][0] - P.w; else P.pos[0] = bs2[i2][3] + P.w;
          hit.x = true;
          b2 = box();
        }
      }
      if (sz !== 0) {
        P.pos[2] += sz;
        var b3 = box();
        var bs3 = world.getCollisions(b3[0], b3[1], b3[2], b3[3], b3[4], b3[5], scratch);
        for (var i3 = 0; i3 < bs3.length; i3++) {
          if (!overlap(b3, bs3[i3])) continue;
          if (sz > 0) P.pos[2] = bs3[i3][2] - P.w; else P.pos[2] = bs3[i3][5] + P.w;
          hit.z = true;
          b3 = box();
        }
      }
    }
    return hit;
  }

  // ---------- mining and attack ----------
  function currentTarget() {
    var eye = eyePos(), dir = lookDir();
    return world.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], P.gamemode === 'creative' ? 5 : 4.5, false);
  }

  function handleMining(dt) {
    if (!P.mouseL) {
      P.mineTarget = null;
      P.mineProgress = 0;
      return;
    }
    var eye = eyePos(), dir = lookDir();
    // attacking entities takes priority
    var entHit = Ent.raycastEntity(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 3.3);
    var blockHit = currentTarget();
    if (entHit && (!blockHit || entHit.dist < blockHit.dist)) {
      P.mineTarget = null; P.mineProgress = 0;
      if (P.attackCD <= 0) {
        P.attackCD = 0.32;
        P.swingT = 1;
        var st = Inv.held();
        var tool = st ? Blocks.toolOf(st.id) : null;
        var dmg = tool ? tool.dmg : 1;
        var ka = Math.atan2(dir[0], dir[2]);
        Ent.hurtEntity(entHit.ent, dmg, Math.sin(ka) * 6, Math.cos(ka) * 6);
        addExhaust(0.1);
        useDurability(st, 1);
        Sfx.play('attack', { pitch: 0.9 + Math.random() * 0.2 });
      }
      return;
    }
    if (!blockHit) { P.mineTarget = null; P.mineProgress = 0; return; }
    var b = BL[blockHit.id];
    if (!b || b.hard < 0) { P.mineTarget = null; P.mineProgress = 0; return; }
    if (P.swingT <= 0.3) P.swingT = 1;

    // reset on target change
    if (!P.mineTarget || P.mineTarget.x !== blockHit.x || P.mineTarget.y !== blockHit.y || P.mineTarget.z !== blockHit.z) {
      P.mineTarget = blockHit;
      P.mineProgress = 0;
    }
    if (P.gamemode === 'creative') {
      if (P.mineCD <= 0) {
        breakBlock(blockHit, true);
        P.mineCD = 0.2;
      }
      return;
    }
    var st = Inv.held();
    var tool = st ? Blocks.toolOf(st.id) : null;
    var t = breakTime(b, tool);
    if (t <= 0) {
      breakBlock(blockHit, false);
      P.mineCD = 0.25;
      P.mineTarget = null;
      return;
    }
    if (P.mineCD > 0) return;
    P.mineProgress += dt / t;
    if ((Game.tickNo() & 3) === 0) {
      Sfx.play('dig_' + (b.sound || 'stone'), { pos: [blockHit.x, blockHit.y, blockHit.z], vol: 0.25, pitch: 0.8 });
    }
    if (P.mineProgress >= 1) {
      breakBlock(blockHit, false);
      P.mineProgress = 0;
      P.mineTarget = null;
      P.mineCD = 0.05;
    }
  }

  function breakTime(b, tool) {
    if (b.hard < 0) return Infinity;
    if (b.hard === 0) return 0;
    var canHarvest = !b.needTool || (tool && tool.type === b.tool && tool.tier >= b.tier);
    var t = b.hard * (canHarvest ? 1.5 : 5);
    if (tool && b.tool && tool.type === b.tool) t /= tool.speed;
    if (P.headInWater) t *= 5;
    if (!P.onGround) t *= 5;
    return t;
  }

  function breakBlock(hit, creative) {
    var id = hit.id;
    var meta = world.getMeta(hit.x, hit.y, hit.z);
    var b = BL[id];
    var st = Inv.held();
    var tool = st ? Blocks.toolOf(st.id) : null;
    Ent.blockBreakParticles(hit.x, hit.y, hit.z, id);
    Sfx.play('break_' + (b.sound || 'stone'), { pos: [hit.x, hit.y, hit.z] });
    // Ice → Water
    if (id === B.ICE && !creative) {
      var below = world.getBlock(hit.x, hit.y - 1, hit.z);
      if (below && BL[below].solid) {
        world.setBlock(hit.x, hit.y, hit.z, B.WATER, 0);
        return;
      }
    }
    world.setBlock(hit.x, hit.y, hit.z, B.AIR);
    if (!creative) {
      var drops = world.dropsFor(id, meta, tool);
      for (var i = 0; i < drops.length; i++) {
        Ent.spawnItem(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, drops[i]);
      }
      if (b.hard > 0) useDurability(st, 1);
      addExhaust(0.005);
      Game.stat('mined', id);
    }
  }

  function useDurability(st, n) {
    if (!st || P.gamemode === 'creative') return;
    var tool = Blocks.toolOf(st.id);
    if (!tool) return;
    if (st.dur === undefined) st.dur = tool.dur;
    st.dur -= n;
    if (st.dur <= 0) {
      Inv.consumeHeld(1);
      Sfx.play('tool_break', {});
    }
    Inv.markDirty();
  }

  // ---------- use / place ----------
  function handleUse(dt) {
    var st = Inv.held();
    // eating
    if (P.mouseR && st && Blocks.foodOf(st.id) && (P.food < 20 || P.gamemode === 'creative')) {
      P.eatT += dt;
      if ((Game.tickNo() % 5) === 0) {
        Sfx.play('eat', { pitch: 0.85 + Math.random() * 0.3 });
        Ent.spawnParticles('block', P.pos[0], P.pos[1] + 1.4, P.pos[2], 2,
          { tile: Tex.idx(Blocks.ITEMS[st.id].tile), spread: 0.15, vel: 0.8, life: 0.4, size: 0.06 });
      }
      if (P.eatT >= 1.6) {
        P.eatT = 0;
        var food = Blocks.foodOf(st.id);
        P.food = Math.min(20, P.food + food.pts);
        P.sat = Math.min(P.food, P.sat + food.sat);
        if (P.gamemode !== 'creative') Inv.consumeHeld(1);
        Sfx.play('burp', {});
      }
      return;
    }
    P.eatT = 0;
    if (!P.mouseR || P.placeCD > 0) return;

    var hit = currentTarget();
    var stId = st ? st.id : 0;

    // bucket up liquid (aimed at a liquid source)
    if (stId === Blocks.IT.BUCKET) {
      var eye = eyePos(), dir = lookDir();
      var lhit = world.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 4.5, true);
      if (lhit && (lhit.id === B.WATER || lhit.id === B.LAVA) && world.getMeta(lhit.x, lhit.y, lhit.z) === 0) {
        world.setBlock(lhit.x, lhit.y, lhit.z, B.AIR);
        if (P.gamemode !== 'creative') {
          Inv.replaceHeld({ id: lhit.id === B.WATER ? Blocks.IT.BUCKET_WATER : Blocks.IT.BUCKET_LAVA, n: 1 });
        }
        Sfx.play('splash', {});
        P.placeCD = 0.25;
        return;
      }
    }
    if (!hit) return;

    var hb = BL[hit.id];
    // interactive blocks
    if (!P.sneaking) {
      if (hit.id === B.CRAFTING_TABLE) { UI.openContainer('craft'); P.placeCD = 0.3; return; }
      if (hit.id === B.FURNACE || hit.id === B.FURNACE_LIT) {
        UI.openContainer('furnace', world.getBE(hit.x, hit.y, hit.z), [hit.x, hit.y, hit.z]);
        P.placeCD = 0.3;
        return;
      }
      if (hit.id === B.CHEST) {
        UI.openContainer('chest', world.getBE(hit.x, hit.y, hit.z), [hit.x, hit.y, hit.z]);
        Sfx.play('chest_open', { pos: [hit.x, hit.y, hit.z] });
        P.placeCD = 0.3;
        return;
      }
    }
    if (!st) return;

    // light TNT with flint and steel
    if (stId === Blocks.IT.FLINT_STEEL && hit.id === B.TNT) {
      world.setBlock(hit.x, hit.y, hit.z, B.AIR);
      Ent.igniteTNT(hit.x + 0.5, hit.y, hit.z + 0.5, 80);
      useDurability(st, 1);
      Sfx.play('ignite', { pos: [hit.x, hit.y, hit.z] });
      P.placeCD = 0.3;
      return;
    }
    // till soil
    if (Blocks.toolOf(stId) && Blocks.toolOf(stId).type === 'hoe') {
      if ((hit.id === B.GRASS || hit.id === B.DIRT) && hit.fy === 1 &&
          world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
        world.setBlock(hit.x, hit.y, hit.z, B.FARMLAND);
        useDurability(st, 1);
        Sfx.play('dig_gravel', { pos: [hit.x, hit.y, hit.z] });
        P.placeCD = 0.25;
        return;
      }
      return;
    }
    // sow seeds
    if (stId === Blocks.IT.SEEDS) {
      if (hit.id === B.FARMLAND && hit.fy === 1 && world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
        world.setBlock(hit.x, hit.y + 1, hit.z, B.WHEAT, 0);
        if (P.gamemode !== 'creative') Inv.consumeHeld(1);
        Sfx.play('place_grass', { pos: [hit.x, hit.y, hit.z] });
        P.placeCD = 0.25;
      }
      return;
    }
    // empty bucket
    if (stId === Blocks.IT.BUCKET_WATER || stId === Blocks.IT.BUCKET_LAVA) {
      var tx2 = hit.x + hit.fx, ty2 = hit.y + hit.fy, tz2 = hit.z + hit.fz;
      var tid = world.getBlock(tx2, ty2, tz2);
      if (tid === B.AIR || (BL[tid] && BL[tid].replaceable)) {
        world.setBlock(tx2, ty2, tz2, stId === Blocks.IT.BUCKET_WATER ? B.WATER : B.LAVA, 0);
        if (P.gamemode !== 'creative') Inv.replaceHeld({ id: Blocks.IT.BUCKET, n: 1 });
        Sfx.play('splash', {});
        P.placeCD = 0.3;
      }
      return;
    }
    // place block
    if (Blocks.isBlockItem(stId)) {
      placeBlock(st, hit);
      return;
    }
  }

  function placeBlock(st, hit) {
    var id = st.id;
    var b = BL[id];
    var px, py, pz;
    var replaceTarget = BL[hit.id] && BL[hit.id].replaceable;
    if (replaceTarget) {
      px = hit.x; py = hit.y; pz = hit.z;
    } else {
      px = hit.x + hit.fx; py = hit.y + hit.fy; pz = hit.z + hit.fz;
    }
    if (py < 0 || py >= 128) return;
    var cur = world.getBlock(px, py, pz);
    if (cur !== B.AIR && !(BL[cur] && BL[cur].replaceable)) return;

    var meta = 0;
    // Torch facing
    if (id === B.TORCH) {
      if (hit.fy === 1) meta = 0;
      else if (hit.fy === 0 && !replaceTarget) {
        // wall-mounted: support wall is in the -face direction
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        meta = 0;
        for (var di = 0; di < 4; di++) {
          if (dirs[di][0] === -hit.fx && dirs[di][1] === -hit.fz) { meta = di + 1; break; }
        }
        if (meta === 0) return;
      } else if (hit.fy === -1) return;
      if (!world.torchSupport(px, py, pz, meta)) return;
    }
    // Ladder
    if (id === B.LADDER) {
      if (hit.fy !== 0 || replaceTarget) return;
      var dirs2 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      meta = -1;
      for (var di2 = 0; di2 < 4; di2++) {
        if (dirs2[di2][0] === -hit.fx && dirs2[di2][1] === -hit.fz) { meta = di2; break; }
      }
      if (meta < 0) return;
    }
    // facing block (faces the player)
    if (b.facing) {
      var ang = Util.mod(P.yaw, Math.PI * 2);
      // opposite of the player's facing: front faces the player
      var dx2 = -Math.sin(P.yaw), dz2 = -Math.cos(P.yaw);
      if (Math.abs(dx2) > Math.abs(dz2)) meta = dx2 > 0 ? 3 : 2;
      else meta = dz2 > 0 ? 1 : 0;
      void ang;
    }
    // crops can only go on farmland
    if (id === B.WHEAT) return;
    // Cactus restriction
    if (id === B.CACTUS) {
      var below2 = world.getBlock(px, py - 1, pz);
      if (below2 !== B.SAND && below2 !== B.CACTUS) return;
    }
    // plant restriction
    if (b.render === 'cross' && id !== B.DEAD_BUSH) {
      var below3 = world.getBlock(px, py - 1, pz);
      if (id === B.MUSHROOM_BROWN || id === B.MUSHROOM_RED) {
        if (!BL[below3] || !BL[below3].opaque) return;
      } else if (below3 !== B.GRASS && below3 !== B.DIRT && below3 !== B.SNOWY_GRASS) return;
    }

    // collision check against entities
    if (b.solid) {
      var bb = b.box || [0, 0, 0, 1, 1, 1];
      var blockBox = [px + bb[0], py + bb[1], pz + bb[2], px + bb[3], py + bb[4], pz + bb[5]];
      var pBox = box();
      if (overlap(blockBox, pBox)) return;
      var ents = Ent.list();
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i];
        if (e.type !== 'mob' || e.dead) continue;
        var eb = [e.pos[0] - e.w, e.pos[1], e.pos[2] - e.w, e.pos[0] + e.w, e.pos[1] + e.h, e.pos[2] + e.w];
        if (overlap(blockBox, eb)) return;
      }
    }

    if (cur !== B.AIR) world.breakNaturally(px, py, pz);
    world.setBlock(px, py, pz, id, meta);
    Sfx.play('place_' + (b.sound || 'stone'), { pos: [px, py, pz] });
    P.swingT = 1;
    if (P.gamemode !== 'creative') Inv.consumeHeld(1);
    P.placeCD = 0.22;
    Game.stat('placed', id);
  }

  // ---------- survival state (20Hz) ----------
  function tick20() {
    if (P.dead || P.gamemode === 'creative') return;
    // digestion
    if (P.exhaustion >= 4) {
      P.exhaustion -= 4;
      if (P.sat > 0) P.sat = Math.max(0, P.sat - 1);
      else P.food = Math.max(0, P.food - 1);
    }
    // heal
    if (P.food >= 18 && P.hp < 20) {
      P.regenT++;
      if (P.regenT >= 80) {
        P.regenT = 0;
        P.hp = Math.min(20, P.hp + 1);
        addExhaust(1.5);
      }
    } else P.regenT = 0;
    // hunger damage
    if (P.food <= 0) {
      P.starveT++;
      if (P.starveT >= 80) {
        P.starveT = 0;
        if (P.hp > 1) hurt(1, 0, 0, 'Starving');
      }
    } else P.starveT = 0;
    // air
    if (P.headInWater) {
      P.airT++;
      if (P.airT >= 30) {
        P.airT = 0;
        if (P.air > 0) P.air--;
        else hurt(2, 0, 0, 'Drowning');
      }
    } else {
      P.air = Math.min(10, P.air + 1);
      P.airT = 0;
    }
    // on fire
    if (P.fireT > 0) {
      P.fireT--;
      if (P.inWater) P.fireT = 0;
      else if ((P.fireT % 20) === 0 && !P.inLava) hurt(1, 0, 0, 'On fire');
    }
    if (P.hurtCD > 0) P.hurtCD--;
    // sprint exhaustion
    if (P.sprinting) addExhaust(0.012);
  }

  function addExhaust(n) {
    if (P.gamemode === 'creative') return;
    P.exhaustion += n;
  }

  function hurt(dmg, kx, kz, cause) {
    if (P.dead || P.gamemode === 'creative') return;
    if (P.hurtCD > 0) return;
    P.hurtCD = 10;
    P.hp -= dmg;
    P.vel[0] += kx; P.vel[2] += kz;
    if (kx || kz) P.vel[1] = Math.max(P.vel[1], 4);
    UI.damageFlash();
    Sfx.play('hurt', {});
    if (P.hp <= 0) {
      P.hp = 0;
      die(cause || 'Unknown cause');
    }
  }

  function die(cause) {
    P.dead = true;
    P.deathCause = cause;
    // scatter items
    var inv = Inv.slots();
    for (var i = 0; i < inv.length; i++) {
      if (inv[i]) {
        Ent.spawnItem(P.pos[0], P.pos[1] + 1, P.pos[2], inv[i], true);
        inv[i] = null;
      }
    }
    Inv.markDirty();
    UI.showDeath(cause);
    Sfx.play('death', {});
  }
  function respawn() {
    reset(P.spawn);
    UI.hideDeath();
    Inv.markDirty();
  }

  function cameraState() {
    // view bobbing
    var bobX = Math.sin(P.bobPhase) * 0.045 * P.bobAmp;
    var bobY = Math.abs(Math.cos(P.bobPhase)) * 0.05 * P.bobAmp;
    var eye = [P.pos[0], P.pos[1] + P.eyeHCur + bobY, P.pos[2]];
    // lateral bob along the view's right vector
    eye[0] += Math.cos(P.yaw) * bobX;
    eye[2] += -Math.sin(P.yaw) * bobX;
    if (P.thirdPerson) {
      var d = lookDir();
      var back = 4;
      var hit2 = world.raycast(eye[0], eye[1], eye[2], -d[0], -d[1], -d[2], back, false);
      if (hit2) back = Math.max(0.5, hit2.dist - 0.3);
      eye[0] -= d[0] * back; eye[1] -= d[1] * back; eye[2] -= d[2] * back;
    }
    return { eye: eye, yaw: P.yaw, pitch: P.pitch };
  }

  return {
    P: P, init: init, reset: reset, update: update, tick20: tick20,
    onMouseMove: onMouseMove, setKey: setKey,
    eyePos: eyePos, lookDir: lookDir, currentTarget: currentTarget,
    hurt: hurt, respawn: respawn, cameraState: cameraState,
    get pos() { return P.pos; }, get vel() { return P.vel; },
    get dead() { return P.dead; }
  };
})();
