// ============ entities.js — entity system: physics/item drops/TNT/mob AI/particles ============
'use strict';
var Ent = (function () {
  var B = Blocks.B, IT = Blocks.IT, BL = Blocks.BLOCKS;
  var M = Util.M;

  var list = [];
  var particles = [];
  var world = null, player = null;
  var scratchBoxes = [];

  // ---------- species ----------
  var SPECIES = {
    pig: { model: 'pig', skin: 'skin_pig', w: 0.45, h: 0.9, hp: 10, speed: 1.6, passive: true,
      drops: function (r) { return [{ id: IT.PORK_RAW, n: 1 + (r() * 3 | 0) }]; } },
    cow: { model: 'cow', skin: 'skin_cow', w: 0.45, h: 1.4, hp: 10, speed: 1.5, passive: true,
      drops: function (r) {
        var d = [{ id: IT.BEEF_RAW, n: 1 + (r() * 3 | 0) }];
        var l = (r() * 3) | 0; if (l) d.push({ id: IT.LEATHER, n: l });
        return d;
      } },
    sheep: { model: 'sheep', skin: 'skin_sheep', w: 0.45, h: 1.3, hp: 8, speed: 1.5, passive: true,
      drops: function (r) { return [{ id: B.WOOL, n: 1 }, { id: IT.MUTTON_RAW, n: 1 + (r() * 2 | 0) }]; } },
    zombie: { model: 'humanoid', skin: 'skin_zombie', w: 0.3, h: 1.8, hp: 20, speed: 2.2, hostile: true,
      dmg: 3, burns: true,
      drops: function (r) { var n = (r() * 3) | 0; return n ? [{ id: IT.ROTTEN_FLESH, n: n }] : []; } },
    creeper: { model: 'creeper', skin: 'skin_creeper', w: 0.3, h: 1.6, hp: 20, speed: 2.4, hostile: true,
      drops: function (r) { var n = (r() * 3) | 0; return n ? [{ id: IT.GUNPOWDER, n: n }] : []; } }
  };
  var SPECIES_NAMES = { pig: 'Pig', cow: 'Cow', sheep: 'Sheep', zombie: 'Zombie', creeper: 'Creeper' };

  function init(w, p) {
    world = w; player = p;
    list = []; particles = [];
    // world hooks
    w.hooks.drop = function (x, y, z, stack) { spawnItem(x, y, z, stack, true); };
    w.hooks.fall = function (x, y, z, id, meta) {
      list.push({
        type: 'falling', bid: id, fmeta: meta, pos: [x + 0.5, y, z + 0.5], vel: [0, 0, 0],
        w: 0.49, h: 0.98, yaw: 0, age: 0, onGround: false, dead: false
      });
    };
    w.hooks.igniteTNT = function (x, y, z, fuse) {
      igniteTNT(x + 0.5, y, z + 0.5, fuse);
    };
    w.hooks.explosion = function (x, y, z, power) {
      applyExplosion(x, y, z, power);
      spawnParticles('explo', x, y, z, 30, { spread: power * 0.7, vel: 3, life: 1.0, size: 0.4, gravity: -1 });
      spawnParticles('smoke', x, y, z, 20, { spread: power * 0.5, vel: 2, life: 1.4, size: 0.3 });
    };
    w.hooks.particles = function (type, x, y, z, n) { spawnParticles(type, x, y, z, n, {}); };
  }

  // ---------- general physics ----------
  function overlap(a, b) {
    return a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
  }
  function entBox(e) {
    return [e.pos[0] - e.w, e.pos[1], e.pos[2] - e.w, e.pos[0] + e.w, e.pos[1] + e.h, e.pos[2] + e.w];
  }
  // per-axis movement + push-out collision; returns collision flags {x,y,z}
  function moveCollide(e, dx, dy, dz) {
    var hit = { x: false, y: false, z: false };
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
    var sx = dx / steps, sy = dy / steps, sz = dz / steps;
    for (var s = 0; s < steps; s++) {
      // Y
      if (sy !== 0) {
        e.pos[1] += sy;
        var box = entBox(e);
        var bs = world.getCollisions(box[0], box[1], box[2], box[3], box[4], box[5], scratchBoxes);
        for (var i = 0; i < bs.length; i++) {
          var b = bs[i];
          if (!overlap(box, b)) continue;
          if (sy < 0) { e.pos[1] = b[4]; e.onGround = true; }
          else e.pos[1] = b[1] - e.h;
          hit.y = true;
          box = entBox(e);
        }
      }
      // X
      if (sx !== 0) {
        e.pos[0] += sx;
        var box2 = entBox(e);
        var bs2 = world.getCollisions(box2[0], box2[1], box2[2], box2[3], box2[4], box2[5], scratchBoxes);
        for (var i2 = 0; i2 < bs2.length; i2++) {
          var b2 = bs2[i2];
          if (!overlap(box2, b2)) continue;
          if (sx > 0) e.pos[0] = b2[0] - e.w; else e.pos[0] = b2[3] + e.w;
          hit.x = true;
          box2 = entBox(e);
        }
      }
      // Z
      if (sz !== 0) {
        e.pos[2] += sz;
        var box3 = entBox(e);
        var bs3 = world.getCollisions(box3[0], box3[1], box3[2], box3[3], box3[4], box3[5], scratchBoxes);
        for (var i3 = 0; i3 < bs3.length; i3++) {
          var b3 = bs3[i3];
          if (!overlap(box3, b3)) continue;
          if (sz > 0) e.pos[2] = b3[2] - e.w; else e.pos[2] = b3[5] + e.w;
          hit.z = true;
          box3 = entBox(e);
        }
      }
    }
    return hit;
  }

  function liquidState(e) {
    var fx = Math.floor(e.pos[0]), fz = Math.floor(e.pos[2]);
    var feet = world.getBlock(fx, Math.floor(e.pos[1] + 0.2), fz);
    var mid = world.getBlock(fx, Math.floor(e.pos[1] + e.h * 0.6), fz);
    e.inWater = feet === B.WATER || mid === B.WATER;
    e.inLava = feet === B.LAVA || mid === B.LAVA;
  }

  function basePhysics(e, dt) {
    liquidState(e);
    var g = e.inWater ? 9 : (e.inLava ? 6 : 26);
    e.vel[1] -= g * dt;
    if (e.inWater) {
      e.vel[0] *= (1 - 2.8 * dt); e.vel[2] *= (1 - 2.8 * dt);
      if (e.vel[1] < -2.2) e.vel[1] = -2.2;
    } else if (e.inLava) {
      e.vel[0] *= (1 - 4 * dt); e.vel[2] *= (1 - 4 * dt);
      if (e.vel[1] < -1.4) e.vel[1] = -1.4;
    }
    if (e.vel[1] < -56) e.vel[1] = -56;
    e.onGround = false;
    var hit = moveCollide(e, e.vel[0] * dt, e.vel[1] * dt, e.vel[2] * dt);
    if (hit.y) e.vel[1] = 0;
    if (hit.x) e.vel[0] = 0;
    if (hit.z) e.vel[2] = 0;
    if (e.onGround) { e.vel[0] *= (1 - 9 * dt); e.vel[2] *= (1 - 9 * dt); }
    return hit;
  }

  // contact with dangerous blocks (Lava/Cactus)
  function hazards(e) {
    if (e.inLava) {
      e.fireT = 60;
      if ((e.age & 7) === 0) hurtEntity(e, 4, 0, 0);
    }
    if (e.fireT > 0) {
      e.fireT--;
      if (!e.inLava && (e.age % 20) === 0) hurtEntity(e, 1, 0, 0);
      if (e.inWater) e.fireT = 0;
      if ((e.age & 3) === 0) {
        spawnParticles('flame', e.pos[0], e.pos[1] + e.h * 0.6, e.pos[2], 1, { spread: e.w, vel: 0.4, life: 0.5, size: 0.12, gravity: -2 });
      }
    }
    // Cactus
    var box = entBox(e);
    for (var x = Math.floor(box[0] - 0.05); x <= Math.floor(box[3] + 0.05); x++) {
      for (var z = Math.floor(box[2] - 0.05); z <= Math.floor(box[5] + 0.05); z++) {
        for (var y = Math.floor(box[1] - 0.05); y <= Math.floor(box[4] + 0.05); y++) {
          if (world.getBlock(x, y, z) === B.CACTUS) {
            if (!e.cactusCD || e.cactusCD <= 0) { hurtEntity(e, 1, 0, 0); e.cactusCD = 10; }
          }
        }
      }
    }
    if (e.cactusCD > 0) e.cactusCD--;
  }

  // ---------- dropped items ----------
  function spawnItem(x, y, z, stack, scatter) {
    if (!stack || stack.n <= 0) return;
    var a = Math.random() * Math.PI * 2;
    var sp = scatter ? 1.6 : 0.3;
    list.push({
      type: 'item', stack: { id: stack.id, n: stack.n, dur: stack.dur },
      pos: [x, y, z], vel: [Math.cos(a) * sp * Math.random(), 2.2 + Math.random(), Math.sin(a) * sp * Math.random()],
      w: 0.12, h: 0.24, yaw: 0, age: 0, pickupDelay: 12, onGround: false, dead: false,
      bob: Math.random() * Math.PI * 2
    });
  }
  function throwItem(x, y, z, stack, dx, dy, dz) {
    list.push({
      type: 'item', stack: stack,
      pos: [x, y, z], vel: [dx, dy, dz],
      w: 0.12, h: 0.24, yaw: 0, age: 0, pickupDelay: 30, onGround: false, dead: false,
      bob: Math.random() * Math.PI * 2
    });
  }

  function itemTick(e) {
    basePhysics(e, 0.05);
    if (e.inLava) { e.dead = true; spawnParticles('smoke', e.pos[0], e.pos[1], e.pos[2], 3, {}); return; }
    if (e.pickupDelay > 0) e.pickupDelay--;
    e.age++;
    if (e.age > 6000 || e.pos[1] < -8) { e.dead = true; return; }
    // merge
    if ((e.age & 15) === 0) {
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o === e || o.type !== 'item' || o.dead) continue;
        if (o.stack.id !== e.stack.id || o.stack.dur !== undefined) continue;
        var max = Blocks.stackMax(e.stack.id);
        if (e.stack.n + o.stack.n > max) continue;
        var d2 = dist2(e.pos, o.pos);
        if (d2 < 0.8 * 0.8) { e.stack.n += o.stack.n; o.dead = true; }
      }
    }
    // magnet attraction and pickup
    if (e.pickupDelay <= 0 && player && !player.dead) {
      var px = player.pos[0] - e.pos[0], py = (player.pos[1] + 0.8) - e.pos[1], pz = player.pos[2] - e.pos[2];
      var d = Math.hypot(px, py, pz);
      if (d < 2.2) {
        var k = 7 / Math.max(d, 0.3);
        e.vel[0] = px * k * 0.18; e.vel[1] = py * k * 0.18 + 0.5; e.vel[2] = pz * k * 0.18;
        if (d < 0.6) {
          var left = Inv.add(e.stack);
          if (left === 0) {
            e.dead = true;
            Sfx.play('pop', { pos: e.pos, pitch: 0.9 + Math.random() * 0.3 });
          } else {
            e.stack.n = left;
          }
        }
      }
    }
  }

  // ---------- falling block ----------
  function fallingTick(e) {
    basePhysics(e, 0.05);
    e.age++;
    if (e.onGround) {
      var x = Math.floor(e.pos[0]), y = Math.round(e.pos[1]), z = Math.floor(e.pos[2]);
      var cur = world.getBlock(x, y, z);
      var cb = BL[cur];
      if (cur === B.AIR || (cb && cb.replaceable) || cur === B.WATER || cur === B.LAVA) {
        world.setBlock(x, y, z, e.bid, e.fmeta);
        Sfx.play('place_' + (BL[e.bid].sound || 'sand'), { pos: e.pos });
      } else {
        spawnItem(e.pos[0], e.pos[1] + 0.3, e.pos[2], { id: e.bid, n: 1 });
      }
      e.dead = true;
    }
    if (e.age > 600 || e.pos[1] < -8) e.dead = true;
  }

  // ---------- TNT ----------
  function igniteTNT(x, y, z, fuse) {
    Sfx.play('fuse', { pos: [x, y, z] });
    list.push({
      type: 'tnt', fuse: fuse === undefined ? 80 : fuse,
      pos: [x, y, z], vel: [(Math.random() - 0.5) * 0.6, 4, (Math.random() - 0.5) * 0.6],
      w: 0.49, h: 0.98, yaw: 0, age: 0, onGround: false, dead: false
    });
  }
  function tntTick(e) {
    basePhysics(e, 0.05);
    e.age++; e.fuse--;
    if ((e.age & 7) === 0) {
      spawnParticles('smoke', e.pos[0], e.pos[1] + 1.1, e.pos[2], 1, { vel: 0.3, life: 0.8, size: 0.12 });
    }
    if (e.fuse <= 0) {
      e.dead = true;
      world.explode(e.pos[0], e.pos[1] + 0.5, e.pos[2], 4);
    }
  }

  // ---------- mobs ----------
  function spawnMob(species, x, y, z) {
    var sp = SPECIES[species];
    if (!sp) return null;
    var e = {
      type: 'mob', species: species, sp: sp,
      pos: [x, y, z], vel: [0, 0, 0],
      w: sp.w, h: sp.h, yaw: Math.random() * Math.PI * 2,
      hp: sp.hp, maxHp: sp.hp,
      onGround: false, dead: false, deathT: 0, hurtT: 0, age: 0, fireT: 0,
      headYaw: 0, headPitch: 0, walkCycle: 0, walkAmp: 0,
      wanderT: 20 + Math.random() * 60, wanderTarget: null,
      fleeT: 0, fleeDir: [0, 0], aggro: false, attackCD: 0, fuse: 0, swell: 0
    };
    list.push(e);
    return e;
  }

  function hurtEntity(e, dmg, kx, kz) {
    if (e.type !== 'mob' || e.dead) return;
    if (e.hurtT > 4) return;
    e.hp -= dmg;
    e.hurtT = 10;
    e.vel[0] += kx; e.vel[2] += kz;
    if (kx || kz) e.vel[1] = Math.max(e.vel[1], 4.5);
    Sfx.play(e.species === 'zombie' ? 'zombie_hurt' : 'mob_hurt', { pos: e.pos, pitch: 0.9 + Math.random() * 0.25 });
    if (e.sp.passive) {
      e.fleeT = 90;
      var l = Math.hypot(kx, kz) || 1;
      e.fleeDir = [kx / l, kz / l];
    } else {
      e.aggro = true;
    }
    if (e.hp <= 0) {
      e.dead = true; e.deathT = 0;
      Sfx.play('mob_death', { pos: e.pos, pitch: e.sp.passive ? 1.1 : 0.8 });
    }
  }

  function mobTick(e) {
    e.age++;
    if (e.hurtT > 0) e.hurtT--;
    if (e.attackCD > 0) e.attackCD--;
    if (e.dead) {
      e.deathT++;
      if (e.deathT === 18) {
        var drops = e.sp.drops(Math.random);
        for (var i = 0; i < drops.length; i++) spawnItem(e.pos[0], e.pos[1] + 0.4, e.pos[2], drops[i], true);
        spawnParticles('smoke', e.pos[0], e.pos[1] + e.h / 2, e.pos[2], 8, { spread: 0.3, vel: 0.5, life: 0.8, size: 0.15 });
      }
      if (e.deathT > 20) e.kill = true;
      basePhysics(e, 0.05);
      return;
    }
    basePhysics(e, 0.05);
    hazards(e);
    if (e.pos[1] < -10) { e.kill = true; return; }
    if (e.inWater) e.vel[1] += 18 * 0.05; // float in water

    var pd = player && !player.dead ? Math.hypot(player.pos[0] - e.pos[0], player.pos[1] - e.pos[1], player.pos[2] - e.pos[2]) : 999;
    var dirToP = player ? Math.atan2(-(player.pos[0] - e.pos[0]), -(player.pos[2] - e.pos[2])) : 0;

    // look at player
    if (pd < 8) {
      var dy2 = (player.pos[1] + 1.6) - (e.pos[1] + e.h * 0.85);
      var hd = Math.hypot(player.pos[0] - e.pos[0], player.pos[2] - e.pos[2]);
      e.headYaw = angClamp(dirToP - e.yaw, -1.1, 1.1);
      e.headPitch = Util.clamp(Math.atan2(dy2, hd), -0.7, 0.7);
    } else {
      e.headYaw *= 0.9; e.headPitch *= 0.9;
    }

    var moveSpeed = 0, moveYaw = e.yaw;

    if (e.sp.hostile) {
      // burn in daylight
      if (e.sp.burns && !e.inWater) {
        var hy = Math.floor(e.pos[1] + e.h);
        if (Game.dayFactor() > 0.75 && world.getSky(Math.floor(e.pos[0]), hy, Math.floor(e.pos[2])) >= 15) {
          e.fireT = Math.max(e.fireT, 30);
        }
      }
      if (pd < 16) e.aggro = true;
      if (pd > 28) e.aggro = false;
      if (e.aggro && player && !player.dead) {
        moveYaw = dirToP;
        moveSpeed = e.sp.speed;
        if (e.species === 'zombie') {
          if (pd < 1.4 + e.w + 0.3 && e.attackCD <= 0) {
            e.attackCD = 22;
            var ka = Math.atan2(player.pos[0] - e.pos[0], player.pos[2] - e.pos[2]);
            player.hurt(e.sp.dmg, Math.sin(ka) * 5, Math.cos(ka) * 5, 'Zombie');
          }
        } else if (e.species === 'creeper') {
          if (pd < 2.6) {
            if (e.fuse === 0) Sfx.play('hiss', { pos: e.pos });
            e.fuse++;
            moveSpeed = 0;
            if (e.fuse >= 30) {
              e.kill = true;
              world.explode(e.pos[0], e.pos[1] + 0.6, e.pos[2], 3);
              return;
            }
          } else if (e.fuse > 0) {
            e.fuse = Math.max(0, e.fuse - 2);
          }
        }
      }
      e.swell = e.fuse / 30;
    } else {
      // passive mob
      if (e.fleeT > 0) {
        e.fleeT--;
        moveYaw = Math.atan2(-e.fleeDir[0], -e.fleeDir[1]);
        moveSpeed = e.sp.speed * 1.5;
      } else {
        e.wanderT--;
        if (e.wanderT <= 0) {
          if (Math.random() < 0.45 || !e.onGround) {
            e.wanderTarget = null;
            e.wanderT = 30 + Math.random() * 80;
          } else {
            var a2 = Math.random() * Math.PI * 2, r2 = 3 + Math.random() * 7;
            e.wanderTarget = [e.pos[0] + Math.cos(a2) * r2, e.pos[2] + Math.sin(a2) * r2];
            e.wanderT = 80 + Math.random() * 100;
          }
        }
        if (e.wanderTarget) {
          var tdx = e.wanderTarget[0] - e.pos[0], tdz = e.wanderTarget[1] - e.pos[2];
          if (Math.hypot(tdx, tdz) < 0.8) { e.wanderTarget = null; }
          else {
            moveYaw = Math.atan2(-tdx, -tdz);
            moveSpeed = e.sp.speed * 0.5;
          }
        }
      }
    }

    // turn + move
    if (moveSpeed > 0) {
      e.yaw = turnToward(e.yaw, moveYaw, 0.25);
      var fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
      // cliff check (passive mobs and Creeper)
      var careful = e.sp.passive;
      var blocked = false;
      if (careful && e.onGround) {
        var ax = e.pos[0] + fx * 0.9, az = e.pos[2] + fz * 0.9;
        var ground = false;
        for (var gy = 0; gy >= -3; gy--) {
          var gid = world.getBlock(Math.floor(ax), Math.floor(e.pos[1]) + gy - 1, Math.floor(az));
          if (gid && BL[gid].solid) { ground = true; break; }
        }
        if (!ground) blocked = true;
      }
      if (!blocked) {
        var acc = e.onGround ? 8 : 2;
        e.vel[0] += (fx * moveSpeed - e.vel[0]) * Math.min(1, acc * 0.05);
        e.vel[2] += (fz * moveSpeed - e.vel[2]) * Math.min(1, acc * 0.05);
        // jump
        if (e.onGround && (e.hitWall || e.inWater)) e.vel[1] = e.inWater ? 4 : 7.6;
      }
    }
    var hsp = Math.hypot(e.vel[0], e.vel[2]);
    e.hitWall = false;
    var preHit = moveCollideFlagged(e);
    if (preHit) e.hitWall = true;
    e.walkAmp = Util.lerp(e.walkAmp, Math.min(1, hsp / 2), 0.2);
    e.walkCycle += hsp * 0.05 * 3.2;
  }
  // horizontal collision flag (the hit inside basePhysics is already consumed, here we check wall contact)
  function moveCollideFlagged(e) {
    var fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    var px = e.pos[0] + fx * (e.w + 0.15), pz = e.pos[2] + fz * (e.w + 0.15);
    var id1 = world.getBlock(Math.floor(px), Math.floor(e.pos[1] + 0.1), Math.floor(pz));
    var id2 = world.getBlock(Math.floor(px), Math.floor(e.pos[1] + 1.1), Math.floor(pz));
    return (id1 && BL[id1].solid) || (id2 && BL[id2].solid && e.h > 1);
  }

  function angClamp(a, lo, hi) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Util.clamp(a, lo, hi);
  }
  function turnToward(cur, target, rate) {
    var d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur + Util.clamp(d, -rate, rate);
  }
  function dist2(a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  }

  // ---------- explosion damage ----------
  function applyExplosion(cx, cy, cz, power) {
    var r = power * 2;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead || (e.type !== 'mob' && e.type !== 'item')) continue;
      var d = Math.hypot(e.pos[0] - cx, e.pos[1] + e.h / 2 - cy, e.pos[2] - cz);
      if (d > r) continue;
      var f = 1 - d / r;
      if (e.type === 'item') { e.dead = true; continue; }
      var kx = (e.pos[0] - cx) / Math.max(d, 0.3) * f * 12;
      var kz = (e.pos[2] - cz) / Math.max(d, 0.3) * f * 12;
      hurtEntity(e, Math.round(f * power * 5 + 1), kx, kz);
      e.vel[1] += f * 8;
    }
    if (player && !player.dead) {
      var pd = Math.hypot(player.pos[0] - cx, player.pos[1] + 0.9 - cy, player.pos[2] - cz);
      if (pd < r) {
        var pf = 1 - pd / r;
        var pkx = (player.pos[0] - cx) / Math.max(pd, 0.3) * pf * 11;
        var pkz = (player.pos[2] - cz) / Math.max(pd, 0.3) * pf * 11;
        player.hurt(Math.round(pf * power * 5 + 1), pkx, pkz, 'explosion');
        player.vel[1] += pf * 9;
      }
    }
  }

  // ---------- spawner ----------
  var spawnTimer = 0;
  function spawnerTick(activeKeys) {
    spawnTimer++;
    if (spawnTimer < 20) return;
    spawnTimer = 0;
    if (!player) return;
    var hostiles = 0, passives = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.type !== 'mob' || e.dead) continue;
      if (e.sp.hostile) hostiles++; else passives++;
      // despawn hostiles at long range
      if (e.sp.hostile && dist2(e.pos, player.pos) > 60 * 60) e.kill = true;
    }
    var keys = Array.from(activeKeys);
    if (!keys.length) return;
    var tries, k, col, lx, lz, x, z, y;

    if (hostiles < 12) {
      for (tries = 0; tries < 8; tries++) {
        k = keys[(Math.random() * keys.length) | 0].split(',');
        col = world.getColumn(+k[0], +k[1]);
        if (!col || col.state < 1) continue;
        lx = (Math.random() * 16) | 0; lz = (Math.random() * 16) | 0;
        x = col.cx * 16 + lx; z = col.cz * 16 + lz;
        y = Math.random() < 0.55 ? col.height[lx | (lz << 4)] : 5 + ((Math.random() * 60) | 0);
        if (!standable(x, y, z)) continue;
        var d2p = (x - player.pos[0]) * (x - player.pos[0]) + (z - player.pos[2]) * (z - player.pos[2]);
        if (d2p < 20 * 20 || d2p > 56 * 56) continue;
        var eff = Math.max(world.getBlk(x, y, z), Game.dayFactor() > 0.6 ? world.getSky(x, y, z) : 0);
        if (eff > 7) continue;
        spawnMob(Math.random() < 0.7 ? 'zombie' : 'creeper', x + 0.5, y, z + 0.5);
        break;
      }
    }
    if (passives < 10 && Game.dayFactor() > 0.6) {
      for (tries = 0; tries < 4; tries++) {
        k = keys[(Math.random() * keys.length) | 0].split(',');
        col = world.getColumn(+k[0], +k[1]);
        if (!col || col.state < 1) continue;
        lx = (Math.random() * 16) | 0; lz = (Math.random() * 16) | 0;
        x = col.cx * 16 + lx; z = col.cz * 16 + lz;
        y = col.height[lx | (lz << 4)];
        if (world.getBlock(x, y - 1, z) !== B.GRASS) continue;
        if (!standable(x, y, z)) continue;
        var dp2 = (x - player.pos[0]) * (x - player.pos[0]) + (z - player.pos[2]) * (z - player.pos[2]);
        if (dp2 < 14 * 14 || dp2 > 48 * 48) continue;
        if (world.getSky(x, y, z) < 9) continue;
        var sp2 = ['pig', 'cow', 'sheep'][(Math.random() * 3) | 0];
        spawnMob(sp2, x + 0.5, y, z + 0.5);
        break;
      }
    }
  }
  function standable(x, y, z) {
    if (y < 1 || y > 125) return false;
    var below = world.getBlock(x, y - 1, z);
    if (!below || !BL[below].solid) return false;
    var a1 = world.getBlock(x, y, z), a2 = world.getBlock(x, y + 1, z);
    function pass(id) { return id === B.AIR || (BL[id] && !BL[id].solid && id !== B.WATER && id !== B.LAVA); }
    return pass(a1) && pass(a2);
  }

  // initial passive mobs (around the spawn point)
  function populateSpawn(cx, cz) {
    for (var i = 0; i < 8; i++) {
      var x = cx + (Math.random() - 0.5) * 60;
      var z = cz + (Math.random() - 0.5) * 60;
      var col = world.getColumnAt(Math.floor(x), Math.floor(z));
      if (!col || col.state < 1) continue;
      var y = col.height[(Math.floor(x) & 15) | ((Math.floor(z) & 15) << 4)];
      if (world.getBlock(Math.floor(x), y - 1, Math.floor(z)) !== B.GRASS) continue;
      if (!standable(Math.floor(x), y, Math.floor(z))) continue;
      spawnMob(['pig', 'cow', 'sheep'][(Math.random() * 3) | 0], x, y, z);
    }
  }

  // ---------- attack raycast ----------
  function raycastEntity(ox, oy, oz, dx, dy, dz, maxDist) {
    var best = null, bestT = maxDist;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead || e.type !== 'mob') continue;
      var box = entBox(e);
      var t = rayBox(ox, oy, oz, dx, dy, dz, box);
      if (t !== null && t < bestT) { bestT = t; best = e; }
    }
    return best ? { ent: best, dist: bestT } : null;
  }
  function rayBox(ox, oy, oz, dx, dy, dz, b) {
    var tmin = 0, tmax = Infinity;
    var o = [ox, oy, oz], d = [dx, dy, dz];
    for (var i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < b[i] || o[i] > b[i + 3]) return null;
      } else {
        var t1 = (b[i] - o[i]) / d[i], t2 = (b[i + 3] - o[i]) / d[i];
        if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  // ---------- particles ----------
  function spawnParticles(type, x, y, z, n, opts) {
    opts = opts || {};
    var tile, u, T2 = 16 / 512;
    if (type === 'block') {
      tile = opts.tile;
    } else {
      tile = Tex.idx('part_' + (type === 'explo' ? 'explo' : type));
      if (tile === undefined) tile = Tex.idx('part_smoke');
    }
    var sky = world ? world.getSky(Math.floor(x), Math.floor(y), Math.floor(z)) : 15;
    var blk = world ? world.getBlk(Math.floor(x), Math.floor(y), Math.floor(z)) : 0;
    for (var i = 0; i < (n || 4); i++) {
      u = Tex.uv(tile);
      var u0, v0, us;
      if (type === 'block') {
        us = T2 / 4;
        u0 = u[0] + ((Math.random() * 12) | 0) / 16 * T2;
        v0 = u[1] + ((Math.random() * 12) | 0) / 16 * T2;
      } else {
        us = T2;
        u0 = u[0]; v0 = u[1];
      }
      var spread = opts.spread !== undefined ? opts.spread : 0.3;
      var vel = opts.vel !== undefined ? opts.vel : 1.6;
      particles.push({
        x: x + (Math.random() - 0.5) * spread * 2,
        y: y + (Math.random() - 0.5) * spread * 2,
        z: z + (Math.random() - 0.5) * spread * 2,
        vx: (Math.random() - 0.5) * vel * 2,
        vy: Math.random() * vel * 1.4 + (opts.up || 0),
        vz: (Math.random() - 0.5) * vel * 2,
        gravity: opts.gravity !== undefined ? opts.gravity : 14,
        life: (opts.life || 0.7) * (0.6 + Math.random() * 0.7),
        age: 0,
        size: (opts.size || 0.08) * (0.7 + Math.random() * 0.6),
        u0: u0, v0: v0, u1: u0 + us, v1: v0 + us,
        sky: sky, blk: Math.max(blk, type === 'flame' ? 14 : 0)
      });
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }
  function blockBreakParticles(x, y, z, id) {
    var b = BL[id];
    if (!b || !b.faces) return;
    spawnParticles('block', x + 0.5, y + 0.5, z + 0.5, 14, { tile: b.faces[0], spread: 0.35, vel: 1.8, life: 0.7, size: 0.09 });
  }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      if (p.age > p.life) { particles.splice(i, 1); continue; }
      p.vy -= p.gravity * dt;
      var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      // simple collision: stop on hitting a solid
      var bid = world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (bid && BL[bid].solid) {
        p.vx *= 0.4; p.vz *= 0.4;
        if (p.vy < 0) { p.vy = 0; p.gravity = 0; }
      } else {
        p.x = nx; p.y = ny; p.z = nz;
      }
    }
  }

  // ---------- tick & draw ----------
  function tick(activeKeys) {
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (e.kill || (e.dead && e.type !== 'mob')) { list.splice(i, 1); continue; }
      // freeze entities not in a loaded column
      if (!world.getColumnAt(Math.floor(e.pos[0]), Math.floor(e.pos[2]))) continue;
      switch (e.type) {
        case 'item': if (!e.dead) itemTick(e); else list.splice(i, 1); break;
        case 'falling': fallingTick(e); break;
        case 'tnt': tntTick(e); break;
        case 'mob': mobTick(e); break;
      }
      if (e.dead && e.type !== 'mob') list.splice(i, 1);
    }
    spawnerTick(activeKeys);
  }

  // draw all entities
  var m1 = M.create(), m2 = M.create();
  function drawAll(R, camYaw, interp) {
    R.beginEntities();
    var gl = R.gl();
    void gl;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var lx = Math.floor(e.pos[0]), ly = Math.floor(e.pos[1] + e.h * 0.5), lz = Math.floor(e.pos[2]);
      var light = [world.getSky(lx, ly, lz), world.getBlk(lx, ly, lz)];
      if (e.type === 'item') {
        var bobY = Math.sin(e.bob + e.age * 0.1) * 0.06 + 0.12;
        M.identity(m1);
        M.translate(m1, m1, e.pos[0], e.pos[1] + bobY, e.pos[2]);
        if (Blocks.isBlockItem(e.stack.id)) {
          M.rotateY(m1, m1, e.age * 0.04 + e.bob);
          M.scale(m1, m1, 0.25, 0.25, 0.25);
          M.translate(m1, m1, 0, 0.5, 0);
          R.drawEntMesh(R.blockCube(e.stack.id), m1, light, null, 1);
        } else {
          M.rotateY(m1, m1, camYaw);
          M.scale(m1, m1, 0.32, 0.32, 0.32);
          M.translate(m1, m1, 0, 0.5, 0);
          var it = Blocks.ITEMS[e.stack.id];
          if (it) R.drawEntMesh(R.itemQuad(Tex.idx(it.tile)), m1, light, null, 1);
        }
      } else if (e.type === 'falling') {
        M.identity(m1);
        M.translate(m1, m1, e.pos[0], e.pos[1] + 0.5, e.pos[2]);
        R.drawEntMesh(R.blockCube(e.bid), m1, light, null, 1);
      } else if (e.type === 'tnt') {
        M.identity(m1);
        M.translate(m1, m1, e.pos[0], e.pos[1] + 0.5, e.pos[2]);
        var flash = (Math.sin(e.age * 0.55) > 0) ? 0.55 : 0;
        if (e.fuse < 20) flash = (e.fuse & 2) ? 0.7 : 0;
        R.drawEntMesh(R.blockCube(B.TNT), m1, light, [1, 1, 1, flash], 1);
      } else if (e.type === 'mob') {
        drawMob(R, e, light, interp);
      }
    }
  }

  function drawMob(R, e, light, interp) {
    void interp;
    var meshes = R.meshesFor(e.sp.model, e.sp.skin);
    var hurtMix = e.hurtT > 0 ? [1, 0.2, 0.2, 0.45] : (e.fuse > 0 && (e.fuse & 4) ? [1, 1, 1, 0.5] : null);
    var alpha = 1;
    var deathRot = 0;
    if (e.dead) {
      deathRot = Math.min(1, e.deathT / 14) * Math.PI / 2;
      if (e.deathT > 14) alpha = Math.max(0, 1 - (e.deathT - 14) / 6);
      hurtMix = [1, 0.2, 0.2, 0.3];
    }
    var swellS = 1 + (e.swell || 0) * 0.12 + (e.swell ? Math.sin(e.age) * e.swell * 0.05 : 0);
    for (var i = 0; i < meshes.length; i++) {
      var mesh = meshes[i];
      var p = mesh.part;
      M.identity(m1);
      M.translate(m1, m1, e.pos[0], e.pos[1], e.pos[2]);
      M.rotateY(m1, m1, e.yaw);
      if (deathRot) M.rotateZ(m1, m1, deathRot);
      if (swellS !== 1) M.scale(m1, m1, swellS, swellS, swellS);
      M.translate(m1, m1, p.pivot[0] / 16, p.pivot[1] / 16, p.pivot[2] / 16);
      // animation
      var wc = e.walkCycle, amp = e.walkAmp * 0.8;
      switch (p.anim) {
        case 'head':
          M.rotateY(m1, m1, e.headYaw);
          M.rotateX(m1, m1, -e.headPitch);
          break;
        case 'legR': M.rotateX(m1, m1, Math.sin(wc) * amp); break;
        case 'legL': M.rotateX(m1, m1, -Math.sin(wc) * amp); break;
        case 'armR': M.rotateX(m1, m1, -Math.sin(wc) * amp * 0.7); break;
        case 'armL': M.rotateX(m1, m1, Math.sin(wc) * amp * 0.7); break;
      }
      M.translate(m1, m1, p.off[0] / 16, p.off[1] / 16, p.off[2] / 16);
      R.drawEntMesh(mesh, m1, light, hurtMix, alpha);
    }
  }

  function clearAll() { list = []; particles = []; }

  // save
  function serialize() {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;
      if (e.type === 'mob') out.push({ t: 'mob', s: e.species, p: [e.pos[0], e.pos[1], e.pos[2]], hp: e.hp });
      else if (e.type === 'item') out.push({ t: 'item', st: e.stack, p: [e.pos[0], e.pos[1], e.pos[2]] });
    }
    return out;
  }
  function deserialize(arr) {
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i];
      if (d.t === 'mob') {
        var e = spawnMob(d.s, d.p[0], d.p[1], d.p[2]);
        if (e) e.hp = d.hp;
      } else if (d.t === 'item') {
        spawnItem(d.p[0], d.p[1], d.p[2], d.st, false);
      }
    }
  }

  return {
    init: init, list: function () { return list; }, particles: function () { return particles; },
    tick: tick, drawAll: drawAll, updateParticles: updateParticles,
    spawnItem: spawnItem, throwItem: throwItem, spawnMob: spawnMob,
    hurtEntity: hurtEntity, raycastEntity: raycastEntity,
    igniteTNT: igniteTNT, spawnParticles: spawnParticles, blockBreakParticles: blockBreakParticles,
    populateSpawn: populateSpawn, applyExplosion: applyExplosion,
    clearAll: clearAll, serialize: serialize, deserialize: deserialize,
    SPECIES: SPECIES, SPECIES_NAMES: SPECIES_NAMES
  };
})();
