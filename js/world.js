// ============ world.js — 世界存储 / 方块逻辑 / 流体 / 随机tick / 爆炸 / 存档 ============
'use strict';
var World = (function () {
  var B = Blocks.B, IT = Blocks.IT, BL = Blocks.BLOCKS;

  var F_LIGHT = 1, F_MESH = 2, F_UPDATE = 4;
  var ALL = F_LIGHT | F_MESH | F_UPDATE;

  function key(cx, cz) { return cx + ',' + cz; }

  function World(seedStr) {
    this.seedStr = String(seedStr);
    this.seed = Util.strSeed(seedStr);
    Gen.init(this.seed);
    this.columns = new Map();
    this.time = 1000;          // 一天内 tick (0..24000)
    this.day = 0;
    this.tickCount = 0;
    this.fluidQ = [];          // {x,y,z,due}
    this.fluidSet = new Set();
    this.hooks = {             // 由 main/entities 注入
      drop: function () {}, igniteTNT: function () {}, explosion: function () {},
      sound: function () {}, particles: function () {}, fall: function () {}
    };
  }

  World.prototype.getColumn = function (cx, cz) { return this.columns.get(key(cx, cz)) || null; };
  World.prototype.getColumnAt = function (x, z) { return this.columns.get(key(x >> 4, z >> 4)) || null; };

  World.prototype.createColumn = function (cx, cz) {
    var col = {
      cx: cx, cz: cz,
      blocks: new Uint8Array(32768), meta: new Uint8Array(32768),
      sky: new Uint8Array(32768), blk: new Uint8Array(32768),
      height: new Uint8Array(256), biomes: new Uint8Array(256),
      tint: new Uint8Array(768),
      state: 0, dirtyMesh: false, modified: false,
      blockEntities: new Map(),
      mesh: null
    };
    this.columns.set(key(cx, cz), col);
    return col;
  };

  // 生成 (或从存档恢复) 一列
  World.prototype.ensureColumn = function (cx, cz, savedData) {
    var col = this.getColumn(cx, cz);
    if (col && col.state >= 1) return col;
    if (!col) col = this.createColumn(cx, cz);
    if (savedData) {
      this.deserializeColumn(col, savedData);
      col.state = 1;
    } else {
      Gen.generateColumn(this, col);
    }
    // 群系染色缓存
    for (var lz = 0; lz < 16; lz++) for (var lx = 0; lx < 16; lx++) {
      var t = Gen.tintAt(cx * 16 + lx, cz * 16 + lz);
      var i = (lx | (lz << 4)) * 3;
      col.tint[i] = t[0]; col.tint[i + 1] = t[1]; col.tint[i + 2] = t[2];
    }
    Light.initColumn(this, col);
    Light.exchangeBorders(this, col);
    col.dirtyMesh = true;
    // 邻列网格需重建 (边界面剔除会变)
    for (var d = 0; d < 4; d++) {
      var nc = this.getColumn(cx + [1, -1, 0, 0][d], cz + [0, 0, 1, -1][d]);
      if (nc) nc.dirtyMesh = true;
    }
    return col;
  };

  World.prototype.unloadColumn = function (cx, cz) {
    var col = this.getColumn(cx, cz);
    if (!col) return null;
    this.columns.delete(key(cx, cz));
    return col;
  };

  // ---------- 方块访问 ----------
  World.prototype.getBlock = function (x, y, z) {
    if (y < 0 || y >= 128) return 0;
    var col = this.columns.get(key(x >> 4, z >> 4));
    if (!col) return 0;
    return col.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)];
  };
  World.prototype.getMeta = function (x, y, z) {
    if (y < 0 || y >= 128) return 0;
    var col = this.columns.get(key(x >> 4, z >> 4));
    if (!col) return 0;
    return col.meta[(x & 15) | ((z & 15) << 4) | (y << 8)];
  };
  World.prototype.getSky = function (x, y, z) {
    if (y >= 128) return 15;
    if (y < 0) return 0;
    var col = this.columns.get(key(x >> 4, z >> 4));
    if (!col) return 15;
    return col.sky[(x & 15) | ((z & 15) << 4) | (y << 8)];
  };
  World.prototype.getBlk = function (x, y, z) {
    if (y < 0 || y >= 128) return 0;
    var col = this.columns.get(key(x >> 4, z >> 4));
    if (!col) return 0;
    return col.blk[(x & 15) | ((z & 15) << 4) | (y << 8)];
  };
  World.prototype.lightAt = function (x, y, z) {
    return Math.max(this.getBlk(x, y, z), this.getSky(x, y, z));
  };
  World.prototype.getBE = function (x, y, z) {
    var col = this.getColumnAt(x, z);
    if (!col) return null;
    return col.blockEntities.get((x & 15) | ((z & 15) << 4) | (y << 8)) || null;
  };

  function isFurnace(id) { return id === B.FURNACE || id === B.FURNACE_LIT; }

  World.prototype.setBlock = function (x, y, z, id, meta, flags) {
    if (y < 0 || y >= 128) return false;
    meta = meta || 0;
    if (flags === undefined) flags = ALL;
    var col = this.columns.get(key(x >> 4, z >> 4));
    if (!col) return false;
    var idx = (x & 15) | ((z & 15) << 4) | (y << 8);
    var old = col.blocks[idx], oldMeta = col.meta[idx];
    if (old === id && oldMeta === meta) return false;
    col.blocks[idx] = id;
    col.meta[idx] = meta;
    col.modified = true;

    // 方块实体管理
    if (col.blockEntities.has(idx)) {
      var keepBE = (isFurnace(old) && isFurnace(id));
      if (!keepBE && old !== id) {
        var be = col.blockEntities.get(idx);
        this.spillBE(x, y, z, be);
        col.blockEntities.delete(idx);
      }
    }
    if (id === B.CHEST && !col.blockEntities.has(idx)) {
      col.blockEntities.set(idx, { type: 'chest', items: new Array(27).fill(null) });
    } else if (id === B.FURNACE && !col.blockEntities.has(idx)) {
      col.blockEntities.set(idx, { type: 'furnace', items: [null, null, null], burn: 0, burnMax: 0, prog: 0 });
    }

    if (flags & F_LIGHT) Light.updateOnSet(this, x, y, z, old, id);
    if (flags & F_MESH) this.markMeshAround(x, y, z);
    if (flags & F_UPDATE) {
      this.updateNeighbors(x, y, z);
      this.blockUpdate(x, y, z);
    }
    // 流体调度
    if (id === B.WATER || id === B.LAVA) this.scheduleFluid(x, y, z, id === B.WATER ? 5 : 30);
    return true;
  };

  World.prototype.spillBE = function (x, y, z, be) {
    if (!be || !be.items) return;
    for (var i = 0; i < be.items.length; i++) {
      if (be.items[i]) this.hooks.drop(x + 0.5, y + 0.5, z + 0.5, be.items[i]);
      be.items[i] = null;
    }
  };

  World.prototype.markMeshAround = function (x, y, z) {
    var cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
    var self = this;
    function mark(cx2, cz2) {
      var c = self.columns.get(key(cx2, cz2));
      if (c) c.dirtyMesh = true;
    }
    mark(cx, cz);
    if (lx === 0) mark(cx - 1, cz);
    if (lx === 15) mark(cx + 1, cz);
    if (lz === 0) mark(cx, cz - 1);
    if (lz === 15) mark(cx, cz + 1);
    if (lx === 0 && lz === 0) mark(cx - 1, cz - 1);
    if (lx === 0 && lz === 15) mark(cx - 1, cz + 1);
    if (lx === 15 && lz === 0) mark(cx + 1, cz - 1);
    if (lx === 15 && lz === 15) mark(cx + 1, cz + 1);
  };

  World.prototype.updateNeighbors = function (x, y, z) {
    this.blockUpdate(x + 1, y, z); this.blockUpdate(x - 1, y, z);
    this.blockUpdate(x, y + 1, z); this.blockUpdate(x, y - 1, z);
    this.blockUpdate(x, y, z + 1); this.blockUpdate(x, y, z - 1);
  };

  // 方块对周围变化的反应
  World.prototype.blockUpdate = function (x, y, z) {
    var id = this.getBlock(x, y, z);
    if (id === 0) return;
    var b = BL[id];
    if (!b) return;
    var below = this.getBlock(x, y - 1, z);
    var belowB = BL[below];

    if (b.gravity) {
      if (below === B.AIR || (belowB && !belowB.solid)) {
        var meta = this.getMeta(x, y, z);
        this.setBlock(x, y, z, B.AIR, 0, ALL);
        this.hooks.fall(x, y, z, id, meta);
        return;
      }
    }
    if (id === B.WATER || id === B.LAVA) {
      this.scheduleFluid(x, y, z, id === B.WATER ? 5 : 30);
      return;
    }
    if (id === B.TORCH) {
      var m = this.getMeta(x, y, z);
      var sup = this.torchSupport(x, y, z, m);
      if (!sup) this.breakNaturally(x, y, z);
      return;
    }
    if (id === B.LADDER) {
      var m2 = this.getMeta(x, y, z);
      var d2 = [[1, 0], [-1, 0], [0, 1], [0, -1]][m2 & 3];
      var wall = this.getBlock(x + d2[0], y, z + d2[1]);
      if (!BL[wall] || !BL[wall].opaque) this.breakNaturally(x, y, z);
      return;
    }
    if (b.render === 'cross' || b.render === 'crop') {
      var ok;
      if (id === B.WHEAT) ok = below === B.FARMLAND;
      else if (id === B.DEAD_BUSH) ok = below === B.SAND || below === B.DIRT;
      else if (id === B.MUSHROOM_BROWN || id === B.MUSHROOM_RED)
        ok = belowB && belowB.solid && belowB.opaque;
      else ok = below === B.GRASS || below === B.DIRT || below === B.FARMLAND || below === B.SNOWY_GRASS;
      if (!ok) this.breakNaturally(x, y, z);
      return;
    }
    if (id === B.CACTUS) {
      var bad = !(below === B.SAND || below === B.CACTUS);
      if (!bad) {
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var i = 0; i < 4; i++) {
          var nb = BL[this.getBlock(x + dirs[i][0], y, z + dirs[i][1])];
          if (nb && nb.solid) { bad = true; break; }
        }
      }
      if (bad) this.breakNaturally(x, y, z);
      return;
    }
    if (id === B.SNOW_LAYER) {
      if (!belowB || !belowB.solid) this.setBlock(x, y, z, B.AIR);
      return;
    }
    if (id === B.FARMLAND) {
      var above = this.getBlock(x, y + 1, z);
      if (BL[above] && BL[above].solid && BL[above].opaque) this.setBlock(x, y, z, B.DIRT);
      return;
    }
  };

  World.prototype.torchSupport = function (x, y, z, meta) {
    // meta: 0=地面 1..4=贴墙 (+x,-x,+z,-z 方向的墙)
    if (meta === 0) {
      var b = BL[this.getBlock(x, y - 1, z)];
      return b && (b.solid && (b.opaque || this.getBlock(x, y - 1, z) === B.GLASS));
    }
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]][meta - 1];
    var wb = BL[this.getBlock(x + d[0], y, z + d[1])];
    return wb && wb.opaque;
  };

  // 自然破坏 (掉落物品)
  World.prototype.breakNaturally = function (x, y, z) {
    var id = this.getBlock(x, y, z);
    if (!id) return;
    var meta = this.getMeta(x, y, z);
    var drops = this.dropsFor(id, meta, null);
    this.setBlock(x, y, z, B.AIR);
    for (var i = 0; i < drops.length; i++) {
      this.hooks.drop(x + 0.5, y + 0.3, z + 0.5, { id: drops[i].id, n: drops[i].n });
    }
  };

  World.prototype.dropsFor = function (id, meta, toolInfo, rng) {
    rng = rng || Math.random;
    var b = BL[id];
    if (!b) return [];
    if (b.needTool) {
      if (!toolInfo || toolInfo.type !== b.tool || toolInfo.tier < b.tier) return [];
    }
    if (b.drops) return b.drops(meta, rng) || [];
    return [{ id: id, n: 1 }];
  };

  // ---------- 射线 (DDA) ----------
  // 返回 {x,y,z,id, fx,fy,fz(被击面法线), px,py,pz(命中点)} 或 null
  World.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist, hitLiquid) {
    var x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    var stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    var tDX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    var tDY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    var tDZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    var tMX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDX : Infinity;
    var tMY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDY : Infinity;
    var tMZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDZ : Infinity;
    var fx = 0, fy = 0, fz = 0, t = 0;
    for (var i = 0; i < 256; i++) {
      var id = this.getBlock(x, y, z);
      if (id !== 0) {
        var b = BL[id];
        var isLiq = (id === B.WATER || id === B.LAVA);
        if ((!isLiq && b.render !== 'none') || (isLiq && hitLiquid)) {
          return { x: x, y: y, z: z, id: id, fx: fx, fy: fy, fz: fz,
                   px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t, dist: t };
        }
      }
      if (tMX < tMY && tMX < tMZ) {
        if (tMX > maxDist) return null;
        x += stepX; t = tMX; tMX += tDX; fx = -stepX; fy = 0; fz = 0;
      } else if (tMY < tMZ) {
        if (tMY > maxDist) return null;
        y += stepY; t = tMY; tMY += tDY; fx = 0; fy = -stepY; fz = 0;
      } else {
        if (tMZ > maxDist) return null;
        z += stepZ; t = tMZ; tMZ += tDZ; fx = 0; fy = 0; fz = -stepZ;
      }
    }
    return null;
  };

  // ---------- 碰撞箱查询 ----------
  World.prototype.getCollisions = function (minX, minY, minZ, maxX, maxY, maxZ, out) {
    out = out || [];
    out.length = 0;
    var x0 = Math.floor(minX), x1 = Math.floor(maxX);
    var y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(127, Math.floor(maxY));
    var z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
    for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) {
      var id = this.getBlock(x, y, z);
      if (!id) continue;
      var b = BL[id];
      if (!b.solid && !b.box) continue;
      if (b.box) {
        out.push([x + b.box[0], y + b.box[1], z + b.box[2], x + b.box[3], y + b.box[4], z + b.box[5]]);
      } else if (b.solid) {
        out.push([x, y, z, x + 1, y + 1, z + 1]);
      }
    }
    return out;
  };

  // ---------- 流体 ----------
  World.prototype.scheduleFluid = function (x, y, z, delay) {
    var k = x + ',' + y + ',' + z;
    if (this.fluidSet.has(k)) return;
    this.fluidSet.add(k);
    this.fluidQ.push({ x: x, y: y, z: z, due: this.tickCount + delay, k: k });
  };

  function canFluidReplace(id) {
    if (id === B.AIR) return true;
    var b = BL[id];
    return b && b.replaceable && id !== B.WATER && id !== B.LAVA && id !== B.SNOW_LAYER;
  }

  World.prototype.fluidUpdate = function (x, y, z) {
    var id = this.getBlock(x, y, z);
    if (id !== B.WATER && id !== B.LAVA) return;
    var isWater = id === B.WATER;
    var other = isWater ? B.LAVA : B.WATER;
    var meta = this.getMeta(x, y, z);
    var step = isWater ? 1 : 2;
    var maxL = isWater ? 7 : 6;
    var delay = isWater ? 5 : 30;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var i, d;

    // 水火相容 → 石化
    for (i = 0; i < 6; i++) {
      var dd = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][i];
      if (this.getBlock(x + dd[0], y + dd[1], z + dd[2]) === other) {
        if (!isWater) { // 本格是岩浆
          this.setBlock(x, y, z, meta === 0 ? B.OBSIDIAN : B.COBBLE);
          this.hooks.sound('fizz', x, y, z);
          this.hooks.particles('smoke', x + 0.5, y + 1, z + 0.5, 8);
          return;
        } else if (dd[1] !== 1) { // 水邻岩浆(非上方) → 处理那个岩浆
          var lx2 = x + dd[0], ly2 = y + dd[1], lz2 = z + dd[2];
          var lm = this.getMeta(lx2, ly2, lz2);
          this.setBlock(lx2, ly2, lz2, lm === 0 ? B.OBSIDIAN : B.COBBLE);
          this.hooks.sound('fizz', lx2, ly2, lz2);
        }
      }
    }
    if (this.getBlock(x, y, z) !== id) return;

    // 重算流动等级
    if (meta !== 0) {
      var best = 99;
      if (this.getBlock(x, y + 1, z) === id) best = -1;          // 上方来水 → 瀑布
      for (i = 0; i < 4; i++) {
        d = dirs[i];
        if (this.getBlock(x + d[0], y, z + d[1]) === id) {
          var nm = this.getMeta(x + d[0], y, z + d[1]);
          var lvl = (nm & 8) ? 0 : (nm & 7);
          best = Math.min(best, lvl);
        }
      }
      var newMeta = best === -1 ? 8 : best + step;
      // 无限水源: 2 个水源水平相邻 + 下方实体
      if (isWater) {
        var srcN = 0;
        for (i = 0; i < 4; i++) {
          d = dirs[i];
          if (this.getBlock(x + d[0], y, z + d[1]) === B.WATER &&
              this.getMeta(x + d[0], y, z + d[1]) === 0) srcN++;
        }
        var belowB2 = BL[this.getBlock(x, y - 1, z)];
        if (srcN >= 2 && belowB2 && belowB2.solid) newMeta = 0;
      }
      if (newMeta !== meta) {
        if (newMeta !== 0 && newMeta !== 8 && (newMeta & 7) > maxL) {
          this.setBlock(x, y, z, B.AIR);
          return;
        }
        this.setBlock(x, y, z, id, newMeta);
        meta = newMeta;
        // 等级变化波及邻居
        for (i = 0; i < 4; i++) {
          d = dirs[i];
          if (this.getBlock(x + d[0], y, z + d[1]) === id) this.scheduleFluid(x + d[0], y, z + d[1], delay);
        }
        if (this.getBlock(x, y - 1, z) === id) this.scheduleFluid(x, y - 1, z, delay);
      }
    }

    // 向下流
    var below = this.getBlock(x, y - 1, z);
    if (y > 0) {
      if (canFluidReplace(below)) {
        if (below !== B.AIR) this.breakNaturally(x, y - 1, z);
        this.setBlock(x, y - 1, z, id, 8);
        this.scheduleFluid(x, y - 1, z, delay);
        return;
      }
      if (below === other) {
        // 流体落到另一种流体上
        var bm = this.getMeta(x, y - 1, z);
        this.setBlock(x, y - 1, z, isWater ? (bm === 0 ? B.OBSIDIAN : B.COBBLE) : B.STONE);
        this.hooks.sound('fizz', x, y - 1, z);
      }
      if (below === id) return; // 落入同流体, 不侧漫
    }

    // 侧向蔓延
    var eff = (meta & 8) ? 0 : (meta & 7);
    var next = eff + step;
    if (next > maxL) return;
    var belowSolid = BL[below] && BL[below].solid;
    if (!belowSolid && below !== id) return;
    for (i = 0; i < 4; i++) {
      d = dirs[i];
      var tx = x + d[0], tz = z + d[1];
      var tid = this.getBlock(tx, y, tz);
      if (canFluidReplace(tid)) {
        if (tid !== B.AIR) this.breakNaturally(tx, y, tz);
        this.setBlock(tx, y, tz, id, next);
        this.scheduleFluid(tx, y, tz, delay);
      } else if (tid === id) {
        var tm = this.getMeta(tx, y, tz);
        if (tm !== 0 && (tm & 8) === 0 && (tm & 7) > next) {
          this.setBlock(tx, y, tz, id, next);
          this.scheduleFluid(tx, y, tz, delay);
        }
      } else if (tid === other && !isWater) {
        var om = this.getMeta(tx, y, tz);
        this.setBlock(tx, y, tz, om === 0 ? B.OBSIDIAN : B.COBBLE);
        this.hooks.sound('fizz', tx, y, tz);
      }
    }
  };

  // ---------- 随机 tick ----------
  World.prototype.randomTickColumn = function (col, rng) {
    var wx0 = col.cx * 16, wz0 = col.cz * 16;
    for (var n = 0; n < 8; n++) {
      var idx = (rng() * 32768) | 0;
      var id = col.blocks[idx];
      if (id === 0) continue;
      var x = wx0 + (idx & 15), z = wz0 + ((idx >> 4) & 15), y = idx >> 8;

      if (id === B.GRASS) {
        var above = this.getBlock(x, y + 1, z);
        var ab = BL[above];
        if ((ab && ab.opaque) || above === B.WATER) {
          this.setBlock(x, y, z, B.DIRT);
        } else if (this.lightAt(x, y + 1, z) >= 9 && rng() < 0.5) {
          var dx = ((rng() * 3) | 0) - 1, dy = ((rng() * 5) | 0) - 3, dz = ((rng() * 3) | 0) - 1;
          if (this.getBlock(x + dx, y + dy, z + dz) === B.DIRT &&
              this.lightAt(x + dx, y + dy + 1, z + dz) >= 4) {
            var aab = BL[this.getBlock(x + dx, y + dy + 1, z + dz)];
            if (!aab || !aab.opaque) this.setBlock(x + dx, y + dy, z + dz, B.GRASS);
          }
        }
      } else if (id === B.WHEAT) {
        var m = col.meta[idx];
        if (m < 7 && this.lightAt(x, y + 1, z) >= 9 && rng() < 0.3) {
          this.setBlock(x, y, z, B.WHEAT, m + 1);
        }
      } else if (id === B.SAPLING_OAK || id === B.SAPLING_BIRCH || id === B.SAPLING_SPRUCE) {
        if (this.lightAt(x, y, z) >= 9 && rng() < 0.15) this.growTree(x, y, z, id, rng);
      } else if (id === B.LEAVES_OAK || id === B.LEAVES_BIRCH || id === B.LEAVES_SPRUCE) {
        if (col.meta[idx] === 0 && rng() < 0.25 && !this.logNear(x, y, z)) {
          this.breakNaturally(x, y, z);
        }
      } else if (id === B.CACTUS) {
        if (this.getBlock(x, y + 1, z) === B.AIR && rng() < 0.12) {
          var hgt = 1;
          while (this.getBlock(x, y - hgt, z) === B.CACTUS) hgt++;
          if (hgt < 3) this.setBlock(x, y + 1, z, B.CACTUS);
        }
      } else if (id === B.SNOW_LAYER) {
        if (this.getBlk(x, y, z) >= 12 && rng() < 0.3) this.setBlock(x, y, z, B.AIR);
      } else if (id === B.ICE) {
        if (this.getBlk(x, y, z) >= 12 && rng() < 0.3) this.setBlock(x, y, z, B.WATER, 0);
      }
    }
  };

  World.prototype.logNear = function (x, y, z) {
    for (var dy = -4; dy <= 4; dy++) for (var dz = -4; dz <= 4; dz++) for (var dx = -4; dx <= 4; dx++) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 4) continue;
      var id = this.getBlock(x + dx, y + dy, z + dz);
      if (id === B.LOG_OAK || id === B.LOG_BIRCH || id === B.LOG_SPRUCE) return true;
    }
    return false;
  };

  World.prototype.growTree = function (x, y, z, sapId, rng) {
    // 空间检查
    for (var dy = 1; dy < 5; dy++) {
      var id2 = this.getBlock(x, y + dy, z);
      if (id2 !== B.AIR && !(BL[id2] && BL[id2].cutout)) return;
    }
    var type = sapId === B.SAPLING_BIRCH ? 'birch' : (sapId === B.SAPLING_SPRUCE ? 'spruce' : 'oak');
    var h = type === 'spruce' ? 6 + ((rng() * 3) | 0) : 4 + ((rng() * 3) | 0);
    this.setBlock(x, y, z, B.AIR, 0, F_LIGHT | F_MESH);
    var self = this;
    Gen.stampTree({ x: x, y: y, z: z, type: type, h: h, r: rng() }, function (px, py, pz, bid) {
      var cur = self.getBlock(px, py, pz);
      var isLog = (bid === B.LOG_OAK || bid === B.LOG_BIRCH || bid === B.LOG_SPRUCE);
      if (cur === B.AIR || (BL[cur] && BL[cur].cutout && isLog)) {
        self.setBlock(px, py, pz, bid, 0, F_LIGHT | F_MESH);
      }
    });
  };

  // ---------- 熔炉 ----------
  World.prototype.furnaceTick = function (col, idx, be) {
    var x = col.cx * 16 + (idx & 15), z = col.cz * 16 + ((idx >> 4) & 15), y = idx >> 8;
    var inSt = be.items[0], fuelSt = be.items[1], outSt = be.items[2];
    var recipe = inSt ? Blocks.SMELT[inSt.id] : null;
    var canSmelt = false;
    if (recipe) {
      if (!outSt) canSmelt = true;
      else if (outSt.id === recipe.id && outSt.n + recipe.n <= Blocks.stackMax(outSt.id)) canSmelt = true;
    }
    if (be.burn > 0) {
      be.burn--;
      if (canSmelt) {
        be.prog++;
        if (be.prog >= 200) {
          be.prog = 0;
          inSt.n--;
          if (inSt.n <= 0) be.items[0] = null;
          if (!be.items[2]) be.items[2] = { id: recipe.id, n: recipe.n };
          else be.items[2].n += recipe.n;
        }
      } else {
        be.prog = Math.max(0, be.prog - 2);
      }
    } else {
      if (canSmelt && fuelSt) {
        var fv = Blocks.fuelOf(fuelSt.id);
        if (fv > 0) {
          be.burn = be.burnMax = fv;
          var leftOver = Blocks.ITEMS[fuelSt.id] && Blocks.ITEMS[fuelSt.id].fuelLeft;
          fuelSt.n--;
          if (fuelSt.n <= 0) be.items[1] = leftOver ? { id: leftOver, n: 1 } : null;
        }
      }
      if (!canSmelt) be.prog = 0;
    }
    // 点燃状态切换
    var id = col.blocks[idx];
    var lit = be.burn > 0;
    if (lit && id === B.FURNACE) this.setBlock(x, y, z, B.FURNACE_LIT, col.meta[idx]);
    else if (!lit && id === B.FURNACE_LIT) this.setBlock(x, y, z, B.FURNACE, col.meta[idx]);
  };

  // ---------- 爆炸 ----------
  World.prototype.explode = function (cx, cy, cz, power) {
    var R = Math.ceil(power * 1.4);
    var x0 = Math.floor(cx - R), x1 = Math.floor(cx + R);
    var y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(127, Math.floor(cy + R));
    var z0 = Math.floor(cz - R), z1 = Math.floor(cz + R);
    var destroyed = [];
    for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) {
      var id = this.getBlock(x, y, z);
      if (!id) continue;
      var b = BL[id];
      var dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
      var strength = power * (1 - dist / (power * 1.4)) * (0.85 + Math.random() * 0.3) - b.resist * 0.18;
      if (strength > 0) destroyed.push(x, y, z, id);
    }
    // 批量清除
    var i;
    for (i = 0; i < destroyed.length; i += 4) {
      var bx = destroyed[i], by = destroyed[i + 1], bz = destroyed[i + 2], bid = destroyed[i + 3];
      var col = this.getColumnAt(bx, bz);
      if (!col) continue;
      var idx = (bx & 15) | ((bz & 15) << 4) | (by << 8);
      // 方块实体溢出
      if (col.blockEntities.has(idx)) {
        this.spillBE(bx, by, bz, col.blockEntities.get(idx));
        col.blockEntities.delete(idx);
      }
      if (bid === B.TNT) {
        this.hooks.igniteTNT(bx, by, bz, 10 + ((Math.random() * 20) | 0));
      } else if (Math.random() < 0.3) {
        var drops = this.dropsFor(bid, col.meta[idx], null);
        for (var di = 0; di < drops.length; di++) {
          this.hooks.drop(bx + 0.5, by + 0.5, bz + 0.5, { id: drops[di].id, n: drops[di].n });
        }
      }
      col.blocks[idx] = B.AIR;
      col.meta[idx] = 0;
      col.modified = true;
    }
    // 光照与网格
    Light.relightRegion(this, x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1);
    for (var mx = (x0 - 1) >> 4; mx <= (x1 + 1) >> 4; mx++) {
      for (var mz = (z0 - 1) >> 4; mz <= (z1 + 1) >> 4; mz++) {
        var mc = this.getColumn(mx, mz);
        if (mc) mc.dirtyMesh = true;
      }
    }
    // 邻居更新 (支撑/流体)
    for (var ux = x0 - 1; ux <= x1 + 1; ux++) for (var uz = z0 - 1; uz <= z1 + 1; uz++)
      for (var uy = Math.max(0, y0 - 1); uy <= Math.min(127, y1 + 1); uy++) {
        this.blockUpdate(ux, uy, uz);
      }
    this.hooks.explosion(cx, cy, cz, power);
    this.hooks.sound('explode', cx, cy, cz);
    return destroyed.length / 4;
  };

  // ---------- 世界 tick (20Hz) ----------
  World.prototype.tick = function (activeColKeys, rng) {
    this.tickCount++;
    this.time++;
    if (this.time >= 24000) { this.time = 0; this.day++; }
    rng = rng || Math.random;

    // 流体
    if (this.fluidQ.length) {
      var rest = [];
      var processed = 0;
      for (var i = 0; i < this.fluidQ.length; i++) {
        var f = this.fluidQ[i];
        if (f.due <= this.tickCount && processed < 300) {
          this.fluidSet.delete(f.k);
          processed++;
          this.fluidUpdate(f.x, f.y, f.z);
        } else rest.push(f);
      }
      this.fluidQ = rest;
    }

    // 随机 tick + 方块实体
    var self = this;
    activeColKeys.forEach(function (k) {
      var col = self.columns.get(k);
      if (!col || col.state < 1) return;
      self.randomTickColumn(col, rng);
      if (col.blockEntities.size) {
        col.blockEntities.forEach(function (be, idx) {
          if (be.type === 'furnace') self.furnaceTick(col, idx, be);
        });
      }
    });
  };

  // ---------- 序列化 ----------
  function rleEncode(arr) {
    var out = [];
    var i = 0;
    while (i < arr.length) {
      var v = arr[i], run = 1;
      while (i + run < arr.length && arr[i + run] === v && run < 65535) run++;
      out.push(run & 255, (run >> 8) & 255, v);
      i += run;
    }
    return out;
  }
  function rleDecode(bytes, target) {
    var ti = 0;
    for (var i = 0; i < bytes.length; i += 3) {
      var run = bytes[i] | (bytes[i + 1] << 8), v = bytes[i + 2];
      target.fill(v, ti, ti + run);
      ti += run;
    }
    return target;
  }
  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return (typeof btoa !== 'undefined') ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }
  function unb64(str) {
    var s = (typeof atob !== 'undefined') ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  World.prototype.serializeColumn = function (col) {
    var bes = {};
    col.blockEntities.forEach(function (be, idx) {
      bes[idx] = be;
    });
    return {
      b: b64(new Uint8Array(rleEncode(col.blocks))),
      m: b64(new Uint8Array(rleEncode(col.meta))),
      be: bes
    };
  };
  World.prototype.deserializeColumn = function (col, data) {
    rleDecode(unb64(data.b), col.blocks);
    rleDecode(unb64(data.m), col.meta);
    col.blockEntities.clear();
    if (data.be) {
      for (var k in data.be) col.blockEntities.set(parseInt(k, 10), data.be[k]);
    }
    col.modified = true; // 来自存档的列保持已修改标记
  };

  World.F_LIGHT = F_LIGHT; World.F_MESH = F_MESH; World.F_UPDATE = F_UPDATE; World.ALL = ALL;
  World.key = key;
  return World;
})();
if (typeof module !== 'undefined') module.exports = World;
