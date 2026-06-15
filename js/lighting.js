// ============ lighting.js — 天光/方块光 洪泛传播引擎 ============
'use strict';
var Light = (function () {
  var OPA = new Uint8Array(256);   // 不透明度
  var EMIT = new Uint8Array(256);  // 发光等级
  (function () {
    var BL = Blocks.BLOCKS;
    for (var id = 0; id < BL.length; id++) {
      if (!BL[id]) continue;
      OPA[id] = BL[id].opacity;
      EMIT[id] = BL[id].light;
    }
  })();

  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  // 队列: 扁平数组 [x,y,z, x,y,z, ...]
  function makeQ() { return { a: [], i: 0 }; }
  function qPush(q, x, y, z) { q.a.push(x, y, z); }
  function qPush4(q, x, y, z, v) { q.a.push(x, y, z, v); }
  function qReset(q) { q.a.length = 0; q.i = 0; }

  var skyAdd = makeQ(), blkAdd = makeQ(), remQ = makeQ();

  // ---------- 世界光照读写 (经由 world 的列) ----------
  function getL(world, sky, x, y, z) {
    if (y >= 128) return sky ? 15 : 0;
    if (y < 0) return 0;
    var col = world.getColumnAt(x, z);
    if (!col) return 0;
    var idx = (x & 15) | ((z & 15) << 4) | (y << 8);
    return (sky ? col.sky : col.blk)[idx];
  }
  function setL(world, sky, x, y, z, v) {
    if (y < 0 || y >= 128) return;
    var col = world.getColumnAt(x, z);
    if (!col) return;
    var lx = x & 15, lz = z & 15;
    var idx = lx | (lz << 4) | (y << 8);
    (sky ? col.sky : col.blk)[idx] = v;
    col.dirtyMesh = true;
    // 边界光照变化影响邻列平滑光照
    if (lx === 0) markN(world, x - 1, z); else if (lx === 15) markN(world, x + 1, z);
    if (lz === 0) markN(world, x, z - 1); else if (lz === 15) markN(world, x, z + 1);
  }
  function markN(world, x, z) {
    var c = world.getColumnAt(x, z);
    if (c) c.dirtyMesh = true;
  }
  function opaAt(world, x, y, z) {
    if (y < 0 || y >= 128) return 0;
    return OPA[world.getBlock(x, y, z)];
  }

  // ---------- 增加传播 ----------
  function drainAdd(world, q, sky) {
    var a = q.a;
    while (q.i < a.length) {
      var x = a[q.i++], y = a[q.i++], z = a[q.i++];
      var L = getL(world, sky, x, y, z);
      if (L <= 1) continue;
      for (var d = 0; d < 6; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= 128) continue;
        var col = world.getColumnAt(nx, nz);
        if (!col) continue;
        var opa = OPA[world.getBlock(nx, ny, nz)];
        if (opa >= 15) continue;
        var nl;
        if (sky && d === 3 && L === 15 && opa === 0) nl = 15;   // 天光垂直向下不衰减
        else nl = L - Math.max(1, opa);
        if (nl > getL(world, sky, nx, ny, nz)) {
          setL(world, sky, nx, ny, nz, nl);
          qPush(q, nx, ny, nz);
        }
      }
    }
    qReset(q);
  }

  // ---------- 移除传播 ----------
  function removeBFS(world, sky, x, y, z) {
    var old = getL(world, sky, x, y, z);
    if (old === 0) return;
    setL(world, sky, x, y, z, 0);
    qReset(remQ);
    qPush4(remQ, x, y, z, old);
    var a = remQ.a;
    var addQ = sky ? skyAdd : blkAdd;
    while (remQ.i < a.length) {
      var cx = a[remQ.i++], cy = a[remQ.i++], cz = a[remQ.i++], cl = a[remQ.i++];
      for (var d = 0; d < 6; d++) {
        var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1], nz = cz + DIRS[d][2];
        if (ny < 0 || ny >= 128) continue;
        var col = world.getColumnAt(nx, nz);
        if (!col) continue;
        var t = getL(world, sky, nx, ny, nz);
        if (t === 0) continue;
        if (t < cl || (sky && d === 3 && cl === 15 && t === 15)) {
          setL(world, sky, nx, ny, nz, 0);
          // 自发光方块被波及 → 重新点亮
          var em = sky ? 0 : EMIT[world.getBlock(nx, ny, nz)];
          if (em > 0) { setL(world, sky, nx, ny, nz, em); qPush(addQ, nx, ny, nz); }
          else qPush4(remQ, nx, ny, nz, t);
        } else {
          qPush(addQ, nx, ny, nz);
        }
      }
    }
    qReset(remQ);
  }

  // ---------- 高度图 ----------
  function recomputeHeight(world, col, lx, lz) {
    var h = 0;
    for (var y = 127; y >= 0; y--) {
      if (OPA[col.blocks[lx | (lz << 4) | (y << 8)]] > 0) { h = y + 1; break; }
    }
    col.height[lx | (lz << 4)] = h;
    return h;
  }

  // ---------- 单方块变更 ----------
  function updateOnSet(world, x, y, z, oldId, newId) {
    var col = world.getColumnAt(x, z);
    if (!col) return;
    var lx = x & 15, lz = z & 15;

    // ---- 方块光 ----
    removeBFS(world, false, x, y, z);
    if (EMIT[newId] > 0) {
      setL(world, false, x, y, z, EMIT[newId]);
      qPush(blkAdd, x, y, z);
    }
    for (var d = 0; d < 6; d++) qPush(blkAdd, x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]);
    drainAdd(world, blkAdd, false);

    // ---- 天光 ----
    removeBFS(world, true, x, y, z);
    // 高度图
    var hIdx = lx | (lz << 4);
    var oldH = col.height[hIdx];
    if (OPA[newId] > 0 && y >= oldH) col.height[hIdx] = y + 1;
    else if (OPA[newId] === 0 && y === oldH - 1) recomputeHeight(world, col, lx, lz);
    var newH = col.height[hIdx];
    // 露天 → 垂直注入 15
    if (OPA[newId] === 0 && y >= newH) {
      var yy = y;
      while (yy >= newH && yy >= 0 && OPA[col.blocks[lx | (lz << 4) | (yy << 8)]] === 0) {
        setL(world, true, x, yy, z, 15);
        qPush(skyAdd, x, yy, z);
        yy--;
      }
    }
    for (d = 0; d < 6; d++) qPush(skyAdd, x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]);
    drainAdd(world, skyAdd, true);
  }

  // ---------- 新列初始化 ----------
  function initColumn(world, col) {
    var blocks = col.blocks, sky = col.sky;
    // 高度图 + 垂直天光
    for (var lz = 0; lz < 16; lz++) {
      for (var lx = 0; lx < 16; lx++) {
        var h = 0;
        for (var y = 127; y >= 0; y--) {
          if (OPA[blocks[lx | (lz << 4) | (y << 8)]] > 0) { h = y + 1; break; }
        }
        col.height[lx | (lz << 4)] = h;
        for (y = 127; y >= h; y--) sky[lx | (lz << 4) | (y << 8)] = 15;
      }
    }
    var wx0 = col.cx * 16, wz0 = col.cz * 16;
    // 侧向天光扩散候选: 高度低于邻格的"崖壁"段
    for (lz = 0; lz < 16; lz++) {
      for (lx = 0; lx < 16; lx++) {
        var h2 = col.height[lx | (lz << 4)];
        var hm = h2;
        if (lx > 0) hm = Math.max(hm, col.height[(lx - 1) | (lz << 4)]);
        if (lx < 15) hm = Math.max(hm, col.height[(lx + 1) | (lz << 4)]);
        if (lz > 0) hm = Math.max(hm, col.height[lx | ((lz - 1) << 4)]);
        if (lz < 15) hm = Math.max(hm, col.height[lx | ((lz + 1) << 4)]);
        for (var y2 = h2; y2 < hm; y2++) qPush(skyAdd, wx0 + lx, y2, wz0 + lz);
      }
    }
    // 发光方块 (岩浆/火把等)
    for (var i = 0; i < 32768; i++) {
      var em = EMIT[blocks[i]];
      if (em > 0) {
        col.blk[i] = em;
        qPush(blkAdd, wx0 + (i & 15), i >> 8, wz0 + ((i >> 4) & 15));
      }
    }
    drainAdd(world, skyAdd, true);
    drainAdd(world, blkAdd, false);
  }

  // 与已生成邻列交换边界光
  function exchangeBorders(world, col) {
    var wx0 = col.cx * 16, wz0 = col.cz * 16;
    var sides = [
      { dx: -1, dz: 0, ax: wx0, bx: wx0 - 1 },
      { dx: 1, dz: 0, ax: wx0 + 15, bx: wx0 + 16 },
      { dx: 0, dz: -1, az: wz0, bz: wz0 - 1 },
      { dx: 0, dz: 1, az: wz0 + 15, bz: wz0 + 16 }
    ];
    for (var s = 0; s < sides.length; s++) {
      var sd = sides[s];
      var ncol = world.getColumn(col.cx + sd.dx, col.cz + sd.dz);
      if (!ncol || ncol.state < 1) continue;
      for (var i = 0; i < 16; i++) {
        for (var y = 0; y < 128; y++) {
          var ax, az, bx, bz;
          if (sd.dx !== 0) { ax = sd.ax; bx = sd.bx; az = bz = wz0 + i; }
          else { az = sd.az; bz = sd.bz; ax = bx = wx0 + i; }
          if (getL(world, true, ax, y, az) > 1) qPush(skyAdd, ax, y, az);
          if (getL(world, true, bx, y, bz) > 1) qPush(skyAdd, bx, y, bz);
          if (getL(world, false, ax, y, az) > 1) qPush(blkAdd, ax, y, az);
          if (getL(world, false, bx, y, bz) > 1) qPush(blkAdd, bx, y, bz);
        }
      }
    }
    drainAdd(world, skyAdd, true);
    drainAdd(world, blkAdd, false);
  }

  // ---------- 区域重算 (爆炸等批量修改) ----------
  function relightRegion(world, x0, y0, z0, x1, y1, z1) {
    y0 = Math.max(0, y0); y1 = Math.min(127, y1);
    var x, y, z;
    // 清零
    for (x = x0; x <= x1; x++) for (z = z0; z <= z1; z++) {
      var col = world.getColumnAt(x, z);
      if (!col) continue;
      for (y = y0; y <= y1; y++) {
        var idx = (x & 15) | ((z & 15) << 4) | (y << 8);
        col.sky[idx] = 0; col.blk[idx] = 0;
      }
      col.dirtyMesh = true;
    }
    // 高度图 + 垂直天光
    for (x = x0; x <= x1; x++) for (z = z0; z <= z1; z++) {
      var col2 = world.getColumnAt(x, z);
      if (!col2) continue;
      var h = recomputeHeight(world, col2, x & 15, z & 15);
      for (y = Math.min(y1, 127); y >= Math.max(h, y0); y--) {
        if (OPA[world.getBlock(x, y, z)] === 0) {
          setL(world, true, x, y, z, 15);
          qPush(skyAdd, x, y, z);
        } else break;
      }
      // 区域内发光体
      for (y = y0; y <= y1; y++) {
        var em = EMIT[world.getBlock(x, y, z)];
        if (em > 0) { setL(world, false, x, y, z, em); qPush(blkAdd, x, y, z); }
      }
    }
    // 边壳注入
    for (x = x0 - 1; x <= x1 + 1; x++) for (z = z0 - 1; z <= z1 + 1; z++) {
      for (y = y0 - 1; y <= y1 + 1; y++) {
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && y >= y0 && y <= y1) continue;
        if (getL(world, true, x, y, z) > 1) qPush(skyAdd, x, y, z);
        if (getL(world, false, x, y, z) > 1) qPush(blkAdd, x, y, z);
      }
    }
    drainAdd(world, skyAdd, true);
    drainAdd(world, blkAdd, false);
  }

  return {
    OPA: OPA, EMIT: EMIT,
    initColumn: initColumn, exchangeBorders: exchangeBorders,
    updateOnSet: updateOnSet, relightRegion: relightRegion
  };
})();
if (typeof module !== 'undefined') module.exports = Light;
