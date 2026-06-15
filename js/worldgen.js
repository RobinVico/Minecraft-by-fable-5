// ============ worldgen.js — terrain generation (biome/cave/ore vein/vegetation) ============
'use strict';
var Gen = (function () {
  var B = Blocks.B;
  var SEA = 62;

  var seed = 0;
  var nCont, nPeak, nTemp, nHum, nRough, nCaveA, nCaveB, nCheese;

  var BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH: 4, TAIGA: 5, SNOWY: 6, DESERT: 7, MOUNTAIN: 8 };
  var BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Birch Forest', 'Taiga', 'Snowy Tundra', 'Desert', 'Mountains'];

  function init(s) {
    seed = s | 0;
    nCont = new Util.Perlin(seed ^ 0x1a2b3c);
    nPeak = new Util.Perlin(seed ^ 0x2b3c4d);
    nTemp = new Util.Perlin(seed ^ 0x3c4d5e);
    nHum = new Util.Perlin(seed ^ 0x4d5e6f);
    nRough = new Util.Perlin(seed ^ 0x5e6f70);
    nCaveA = new Util.Perlin(seed ^ 0x6f7081);
    nCaveB = new Util.Perlin(seed ^ 0x708192);
    nCheese = new Util.Perlin(seed ^ 0x8192a3);
  }

  // ---------- climate / height / biome (pure functions) ----------
  function contAt(x, z) { return nCont.fbm2(x / 620, z / 620, 4, 2, 0.5); }
  function peakAt(x, z) {
    var p = nPeak.fbm2(x / 300, z / 300, 3, 2, 0.5);
    return Util.smooth(Util.clamp((p - 0.18) / 0.45, 0, 1)); // 0..1 mountain intensity
  }
  function climateAt(x, z) {
    return {
      t: nTemp.fbm2(x / 950 + 13.7, z / 950 - 7.3, 3, 2, 0.5),
      h: nHum.fbm2(x / 780 - 31.4, z / 780 + 17.9, 3, 2, 0.5)
    };
  }
  function heightAt(x, z) {
    var cont = contAt(x, z);
    var base;
    if (cont < -0.18) base = Util.lerp(40, 58, Util.clamp((cont + 0.55) / 0.37, 0, 1));        // sea floor
    else if (cont < -0.04) base = Util.lerp(58, 64, (cont + 0.18) / 0.14);                      // coast
    else base = Util.lerp(64, 74, Util.clamp(cont / 0.5, 0, 1));                                // inland
    var inland = Util.clamp((cont + 0.04) / 0.2, 0, 1);
    var mt = peakAt(x, z) * inland;
    base += mt * 42;
    base += nRough.fbm2(x / 46, z / 46, 3, 2, 0.5) * (3 + mt * 9);
    return Util.clamp(base | 0, 8, 124);
  }
  function biomeAt(x, z) {
    var h = heightAt(x, z);
    var cont = contAt(x, z);
    if (h < SEA - 1 && cont < -0.1) return BIOME.OCEAN;
    var c = climateAt(x, z);
    if (h <= SEA + 1.5) {
      if (c.t < -0.35) return BIOME.SNOWY;            // frozen shore
      return (c.t > 0.4 && c.h < 0.15) ? BIOME.DESERT : BIOME.BEACH;
    }
    var inland = Util.clamp((cont + 0.04) / 0.2, 0, 1);
    if (peakAt(x, z) * inland > 0.55) return BIOME.MOUNTAIN;
    if (c.t < -0.35) return c.h > 0.05 ? BIOME.TAIGA : BIOME.SNOWY;
    if (c.t > 0.4 && c.h < 0.15) return BIOME.DESERT;
    if (c.h > 0.38) return BIOME.FOREST;
    if (c.h > 0.16 && c.t < 0.22) return BIOME.BIRCH;
    return BIOME.PLAINS;
  }
  function biomeIsCold(b) { return b === BIOME.SNOWY || b === BIOME.TAIGA; }

  // grass/leaf tint: bilinear from temperature and humidity
  function tintAt(x, z) {
    var c = climateAt(x, z);
    var t = Util.clamp((c.t + 1) / 2, 0, 1), h = Util.clamp((c.h + 1) / 2, 0, 1);
    // corner colors: dry-hot / wet-hot / dry-cold / wet-cold
    var dh = [191, 183, 85], wh = [85, 201, 60], dc = [128, 180, 151], wc = [96, 161, 123];
    var r = Util.lerp(Util.lerp(dc[0], dh[0], t), Util.lerp(wc[0], wh[0], t), h);
    var g = Util.lerp(Util.lerp(dc[1], dh[1], t), Util.lerp(wc[1], wh[1], t), h);
    var b = Util.lerp(Util.lerp(dc[2], dh[2], t), Util.lerp(wc[2], wh[2], t), h);
    return [r | 0, g | 0, b | 0];
  }

  // ---------- caves ----------
  function carved(x, y, z, h) {
    if (y < 5) return false;
    if (h <= SEA + 2) { if (y > h - 7) return false; }      // no skylight openings on sea floor/tidal flats
    else if (y > h + 1) return false;
    var t = 0.072 + (1 - y / 128) * 0.03;
    var a = nCaveA.noise3(x * 0.017, y * 0.026, z * 0.017);
    if (a > t || a < -t) return false;
    var b = nCaveB.noise3(x * 0.017 + 100, y * 0.026, z * 0.017 - 100);
    if (b > t || b < -t) return false;
    return true;
  }
  function cheese(x, y, z) {
    if (y >= 46 || y < 5) return false;
    return nCheese.noise3(x * 0.011, y * 0.017, z * 0.011) > 0.58;
  }

  // ---------- trees (deterministic, can cross chunks) ----------
  // returns list of trees generated within chunk (cx,cz) [{x,y,z,type,h}] (world coordinates)
  function treesFor(cx, cz) {
    var rng = Util.mulberry32(Util.hash2(seed ^ 0x77aa, cx, cz) * 4294967296 | 0);
    var trees = [];
    var biomeC = biomeAt(cx * 16 + 8, cz * 16 + 8);
    var count;
    switch (biomeC) {
      case BIOME.FOREST: count = 5 + (rng() * 3 | 0); break;
      case BIOME.BIRCH: count = 4 + (rng() * 3 | 0); break;
      case BIOME.TAIGA: count = 4 + (rng() * 3 | 0); break;
      case BIOME.SNOWY: count = rng() < 0.3 ? 1 : 0; break;
      case BIOME.PLAINS: count = rng() < 0.18 ? 1 : 0; break;
      case BIOME.MOUNTAIN: count = rng() < 0.4 ? 1 : 0; break;
      default: count = 0;
    }
    for (var i = 0; i < count; i++) {
      var x = cx * 16 + (rng() * 16 | 0);
      var z = cz * 16 + (rng() * 16 | 0);
      var bm = biomeAt(x, z);
      if (bm === BIOME.OCEAN || bm === BIOME.BEACH || bm === BIOME.DESERT) continue;
      var y = heightAt(x, z);
      if (y <= SEA) continue;
      var type, th;
      if (bm === BIOME.TAIGA || bm === BIOME.SNOWY || (bm === BIOME.MOUNTAIN && rng() < 0.7)) {
        type = 'spruce'; th = 6 + (rng() * 3 | 0);
      } else if (bm === BIOME.BIRCH && rng() < 0.75) {
        type = 'birch'; th = 5 + (rng() * 2 | 0);
      } else {
        type = 'oak'; th = 4 + (rng() * 2 | 0);
      }
      trees.push({ x: x, y: y + 1, z: z, type: type, h: th, r: rng() });
    }
    return trees;
  }

  // tree block list (world coordinates → id), emitted via callback
  function stampTree(tree, put) {
    var x = tree.x, y0 = tree.y, z = tree.z, h = tree.h;
    var log, leaf, i, dx, dz, dy;
    if (tree.type === 'oak') { log = B.LOG_OAK; leaf = B.LEAVES_OAK; }
    else if (tree.type === 'birch') { log = B.LOG_BIRCH; leaf = B.LEAVES_BIRCH; }
    else { log = B.LOG_SPRUCE; leaf = B.LEAVES_SPRUCE; }

    if (tree.type === 'spruce') {
      for (i = 0; i < h; i++) put(x, y0 + i, z, log);
      put(x, y0 + h, z, leaf);
      var r = 0;
      for (dy = h - 1; dy >= 2; dy--) {
        r = ((h - dy) % 2 === 1) ? Math.min(3, ((h - dy) >> 1) + 1) : 1;
        if (dy === h - 1) r = 1;
        for (dx = -r; dx <= r; dx++) for (dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && r > 1) continue;
          put(x + dx, y0 + dy, z + dz, leaf);
        }
      }
    } else {
      for (i = 0; i < h; i++) put(x, y0 + i, z, log);
      // canopy: two layers of r2 + two layers of r1
      for (dy = h - 3; dy <= h - 2; dy++) {
        for (dx = -2; dx <= 2; dx++) for (dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dz === 0 && dy < h) continue;
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && (tree.r > 0.5 ? (dx ^ dz) & 1 : (dx & 1))) continue;
          put(x + dx, y0 + dy, z + dz, leaf);
        }
      }
      for (dy = h - 1; dy <= h; dy++) {
        var rr = dy === h ? 0 : 1;
        for (dx = -1; dx <= 1; dx++) for (dz = -1; dz <= 1; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > 1 + rr) continue;
          if (dx === 0 && dz === 0 && dy === h - 1) continue;
          put(x + dx, y0 + dy, z + dz, leaf);
        }
      }
      put(x, y0 + h, z, leaf);
    }
  }

  // ---------- main generation ----------
  function generateColumn(world, col) {
    var cx = col.cx, cz = col.cz;
    var wx0 = cx * 16, wz0 = cz * 16;
    var blocks = col.blocks;
    var rng = Util.mulberry32(Util.hash2(seed ^ 0x33cc, cx, cz) * 4294967296 | 0);
    var heights = new Int16Array(256);
    var biomes = col.biomes;

    // --- surface and base ---
    for (var lz = 0; lz < 16; lz++) {
      for (var lx = 0; lx < 16; lx++) {
        var wx = wx0 + lx, wz = wz0 + lz;
        var h = heightAt(wx, wz);
        var bm = biomeAt(wx, wz);
        heights[lx | (lz << 4)] = h;
        biomes[lx | (lz << 4)] = bm;
        var base = lx | (lz << 4);
        // bedrock
        blocks[base] = B.BEDROCK;
        for (var y = 1; y <= 3; y++) {
          if (Util.hash3(seed, wx, y, wz) < [0.8, 0.5, 0.25][y - 1]) blocks[base | (y << 8)] = B.BEDROCK;
          else blocks[base | (y << 8)] = B.STONE;
        }
        // stone
        for (y = 4; y <= h; y++) blocks[base | (y << 8)] = B.STONE;
        // surface layer
        var sandy = (bm === BIOME.DESERT || bm === BIOME.BEACH);
        var oceanic = bm === BIOME.OCEAN;
        if (sandy) {
          for (y = h; y > h - 4 && y > 0; y--) blocks[base | (y << 8)] = B.SAND;
          for (y = h - 4; y > h - 7 && y > 0; y--) blocks[base | (y << 8)] = B.SANDSTONE;
        } else if (oceanic) {
          var fl = Util.hash2(seed ^ 0xf001, wx, wz);
          var top = fl < 0.4 ? B.SAND : (fl < 0.7 ? B.GRAVEL : B.DIRT);
          for (y = h; y > h - 3 && y > 0; y--) blocks[base | (y << 8)] = top;
        } else if (bm === BIOME.MOUNTAIN && h > 92) {
          // stony mountain peak
        } else {
          var grassTop = biomeIsCold(bm) ? B.SNOWY_GRASS : B.GRASS;
          if (h <= SEA) grassTop = B.DIRT;
          blocks[base | (h << 8)] = grassTop;
          for (y = h - 1; y > h - 4 && y > 0; y--) blocks[base | (y << 8)] = B.DIRT;
        }
        // water
        for (y = h + 1; y <= SEA; y++) blocks[base | (y << 8)] = B.WATER;
        // ice surface
        if (h < SEA && (biomeIsCold(bm) || (bm === BIOME.OCEAN && climateAt(wx, wz).t < -0.4))) {
          blocks[base | (SEA << 8)] = B.ICE;
        }

        // --- caves ---
        var capY = Math.min(h + 1, 127);
        for (y = 5; y <= capY; y++) {
          var bid = blocks[base | (y << 8)];
          if (bid !== B.STONE && bid !== B.DIRT && bid !== B.GRASS && bid !== B.SNOWY_GRASS &&
              bid !== B.SAND && bid !== B.GRAVEL && bid !== B.SANDSTONE) continue;
          if (carved(wx, y, wz, h) || cheese(wx, y, wz)) {
            blocks[base | (y << 8)] = (y <= 10) ? B.LAVA : B.AIR;
          }
        }
      }
    }

    // --- ore veins ---
    function vein(ore, tries, yMin, yMax, size) {
      for (var i = 0; i < tries; i++) {
        var x = rng() * 16, z = rng() * 16;
        var y = yMin + rng() * (yMax - yMin);
        var dx = rng() - 0.5, dy = (rng() - 0.5) * 0.6, dz = rng() - 0.5;
        var len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;
        var n = size * (0.6 + rng() * 0.8);
        for (var s = 0; s < n; s++) {
          var bx = Math.round(x), by = Math.round(y), bz = Math.round(z);
          for (var ox = 0; ox <= 1; ox++) for (var oy = 0; oy <= 1; oy++) for (var oz = 0; oz <= 1; oz++) {
            var px = bx + ox, py = by + oy, pz = bz + oz;
            if (px < 0 || px > 15 || pz < 0 || pz > 15 || py < 1 || py > 126) continue;
            var ii = px | (pz << 4) | (py << 8);
            if (blocks[ii] === B.STONE) blocks[ii] = ore;
          }
          x += dx + (rng() - 0.5) * 0.8;
          y += dy + (rng() - 0.5) * 0.5;
          z += dz + (rng() - 0.5) * 0.8;
        }
      }
    }
    vein(B.DIRT, 6, 16, 90, 10);
    vein(B.GRAVEL, 4, 8, 90, 10);
    vein(B.ORE_COAL, 14, 8, 80, 9);
    vein(B.ORE_IRON, 10, 6, 56, 5);
    vein(B.ORE_GOLD, 2, 6, 30, 4);
    vein(B.ORE_DIAMOND, 1, 6, 15, 4);

    // --- trees (deterministic over 3x3 neighborhood) ---
    function put(x, y, z, id) {
      var lx2 = x - wx0, lz2 = z - wz0;
      if (lx2 < 0 || lx2 > 15 || lz2 < 0 || lz2 > 15 || y < 1 || y > 126) return;
      var ii = lx2 | (lz2 << 4) | (y << 8);
      var cur = blocks[ii];
      var isLog = (id === B.LOG_OAK || id === B.LOG_BIRCH || id === B.LOG_SPRUCE);
      if (cur === B.AIR || (Blocks.BLOCKS[cur] && Blocks.BLOCKS[cur].cutout && !isLog) ||
          (isLog && (cur === B.AIR || Blocks.BLOCKS[cur].cutout))) {
        if (isLog || cur === B.AIR) blocks[ii] = id;
      }
    }
    for (var ncz = cz - 1; ncz <= cz + 1; ncz++) {
      for (var ncx = cx - 1; ncx <= cx + 1; ncx++) {
        var trees = treesFor(ncx, ncz);
        for (var ti = 0; ti < trees.length; ti++) stampTree(trees[ti], put);
      }
    }

    // --- small vegetation/decoration (this column only) ---
    function surfaceOf(lx3, lz3) {
      for (var y3 = 127; y3 > 0; y3--) {
        var id3 = blocks[lx3 | (lz3 << 4) | (y3 << 8)];
        if (id3 !== B.AIR) return { y: y3, id: id3 };
      }
      return { y: 0, id: B.BEDROCK };
    }
    function deco(tries, fn) { for (var i2 = 0; i2 < tries; i2++) fn((rng() * 16) | 0, (rng() * 16) | 0); }
    var biomeC = biomes[8 | (8 << 4)];

    // grass and flowers
    var grassN = biomeC === BIOME.PLAINS ? 14 : (biomeC === BIOME.FOREST || biomeC === BIOME.BIRCH ? 7 : 2);
    deco(grassN, function (lx4, lz4) {
      var s = surfaceOf(lx4, lz4);
      if ((s.id === B.GRASS) && s.y < 126) blocks[lx4 | (lz4 << 4) | ((s.y + 1) << 8)] = B.TALL_GRASS;
    });
    if (rng() < 0.45) {
      var flower = rng() < 0.5 ? B.DANDELION : B.POPPY;
      deco(5, function (lx4, lz4) {
        var s = surfaceOf(lx4, lz4);
        if (s.id === B.GRASS && s.y < 126) blocks[lx4 | (lz4 << 4) | ((s.y + 1) << 8)] = flower;
      });
    }
    if (rng() < 0.025) {
      deco(2, function (lx4, lz4) {
        var s = surfaceOf(lx4, lz4);
        if (s.id === B.GRASS && s.y < 126) {
          blocks[lx4 | (lz4 << 4) | ((s.y + 1) << 8)] = B.PUMPKIN;
          col.meta[lx4 | (lz4 << 4) | ((s.y + 1) << 8)] = (rng() * 4) | 0;
        }
      });
    }
    // desert: cactus/dead bush
    if (biomeC === BIOME.DESERT) {
      deco(3, function (lx4, lz4) {
        var s = surfaceOf(lx4, lz4);
        if (s.id !== B.SAND || s.y > 122) return;
        var hh = 1 + (rng() * 3 | 0);
        for (var k = 1; k <= hh; k++) blocks[lx4 | (lz4 << 4) | ((s.y + k) << 8)] = B.CACTUS;
      });
      deco(4, function (lx4, lz4) {
        var s = surfaceOf(lx4, lz4);
        if (s.id === B.SAND && s.y < 126) blocks[lx4 | (lz4 << 4) | ((s.y + 1) << 8)] = B.DEAD_BUSH;
      });
    }
    // mushrooms inside caves
    if (rng() < 0.4) {
      deco(6, function (lx4, lz4) {
        var y4 = 8 + (rng() * 40 | 0);
        var ii4 = lx4 | (lz4 << 4) | (y4 << 8);
        if (blocks[ii4] === B.AIR && blocks[lx4 | (lz4 << 4) | ((y4 - 1) << 8)] === B.STONE) {
          blocks[ii4] = rng() < 0.5 ? B.MUSHROOM_BROWN : B.MUSHROOM_RED;
        }
      });
    }
    // snow cover (cold biomes & high mountains)
    for (lz = 0; lz < 16; lz++) {
      for (lx = 0; lx < 16; lx++) {
        var bm5 = biomes[lx | (lz << 4)];
        var s5 = surfaceOf(lx, lz);
        var high = s5.y > 100 + (Util.hash2(seed ^ 0xabc, wx0 + lx, wz0 + lz) * 8 | 0);
        if ((biomeIsCold(bm5) || (bm5 === BIOME.MOUNTAIN && high)) && s5.y < 127) {
          var sb = Blocks.BLOCKS[s5.id];
          if (sb && sb.solid && sb.opaque && s5.id !== B.ICE) {
            blocks[lx | (lz << 4) | ((s5.y + 1) << 8)] = B.SNOW_LAYER;
          }
        }
      }
    }
    col.state = 1;
  }

  return {
    SEA: SEA, BIOME: BIOME, BIOME_NAMES: BIOME_NAMES,
    init: init, heightAt: heightAt, biomeAt: biomeAt, climateAt: climateAt, tintAt: tintAt,
    generateColumn: generateColumn, treesFor: treesFor, stampTree: stampTree,
    seed: function () { return seed; }
  };
})();
if (typeof module !== 'undefined') module.exports = Gen;
