// ============ textures.js — 程序化贴图图集 (方块) ============
'use strict';
var Tex = (function () {
  var SIZE = 512, TILE = 16, COLS = SIZE / TILE;
  var atlas = null, actx = null;          // 图集 canvas
  var tileIdx = {};                        // name -> index
  var tileCanvas = {};                     // name -> 16x16 canvas (供图标用)
  var painters = [];                       // [ [name, fn] ]
  var nextIdx = 0;
  var regions = {};                        // 大块区域 (生物皮肤等) name -> {x,y,w,h}
  var regionCursor = { x: 0, y: 256, rowH: 0 };

  // ---------- 颜色工具 ----------
  function hex(c) {
    if (Array.isArray(c)) return c;
    var n = parseInt(c.slice(1), 16);
    if (c.length === 7) return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    return [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(c, f) { c = hex(c); return [Math.min(255, c[0] * f) | 0, Math.min(255, c[1] * f) | 0, Math.min(255, c[2] * f) | 0, c[3]]; }
  function mix(a, b, t) {
    a = hex(a); b = hex(b);
    return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0, a[3] + (b[3] - a[3]) * t | 0];
  }

  // ---------- 画笔 ----------
  function Painter(rand) {
    var img = new Uint8ClampedArray(TILE * TILE * 4);
    this.img = img; this.rand = rand;
    this.px = function (x, y, c) {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      c = hex(c);
      var i = (y * TILE + x) * 4;
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = c[3] === undefined ? 255 : c[3];
    };
    this.get = function (x, y) {
      var i = (y * TILE + x) * 4;
      return [img[i], img[i + 1], img[i + 2], img[i + 3]];
    };
    this.fill = function (c) { for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) this.px(x, y, c); };
    this.rect = function (x0, y0, w, h, c) { for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) this.px(x, y, c); };
    // 平滑噪声: cells x cells 随机格点双线性
    this.noiseFn = function (cells) {
      var g = []; var r = this.rand;
      for (var i = 0; i < cells * cells; i++) g.push(r());
      return function (x, y) {
        var fx = x / TILE * cells, fy = y / TILE * cells;
        var x0 = fx | 0, y0 = fy | 0;
        var tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        x0 %= cells; y0 %= cells;
        var a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
        return a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * ty;
      };
    };
    // 调色板噪声填充 (MC 风格斑驳)
    this.noiseTile = function (pal, cells, jitter) {
      var n = this.noiseFn(cells || 4); var r = this.rand;
      for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
        var v = n(x, y) + (r() - 0.5) * (jitter === undefined ? 0.35 : jitter);
        v = Math.max(0, Math.min(0.999, v));
        this.px(x, y, pal[(v * pal.length) | 0]);
      }
    };
    this.speckle = function (c, count) { var r = this.rand; for (var i = 0; i < count; i++) this.px((r() * TILE) | 0, (r() * TILE) | 0, c); };
  }

  function tile(name, fn) { painters.push([name, fn]); }

  // ---------- 方块贴图定义 ----------
  function defineBlockTiles() {
    var grays = function (base, steps, spread) {
      var p = []; for (var i = 0; i < steps; i++) p.push(shade(base, 1 - spread / 2 + spread * i / (steps - 1)));
      return p;
    };

    tile('white', function (p) { p.fill('#ffffff'); });

    tile('stone', function (p) { p.noiseTile(grays('#7e7e7e', 4, 0.28), 5, 0.5); });
    tile('dirt', function (p) {
      p.noiseTile(['#79553a', '#866043', '#8f6b4b', '#6f4f33'], 5, 0.7);
      p.speckle('#5d4027', 14);
    });
    tile('grass_top', function (p) { // 灰度, 运行时染色
      p.noiseTile(grays('#9b9b9b', 4, 0.3), 5, 0.6);
      p.speckle('#787878', 10);
    });
    tile('grass_side', function (p) {
      // 泥土底 + 顶部草沿
      p.noiseTile(['#79553a', '#866043', '#8f6b4b', '#6f4f33'], 5, 0.7);
      var r = p.rand;
      for (var x = 0; x < TILE; x++) {
        var d = 2 + ((r() * 3) | 0);
        for (var y = 0; y < d; y++) {
          p.px(x, y, ['#6daa2c', '#7dbf38', '#5d9525'][(r() * 3) | 0]);
        }
      }
    });
    tile('grass_side_snow', function (p) {
      p.noiseTile(['#79553a', '#866043', '#8f6b4b', '#6f4f33'], 5, 0.7);
      var r = p.rand;
      for (var x = 0; x < TILE; x++) {
        var d = 3 + ((r() * 2) | 0);
        for (var y = 0; y < d; y++) p.px(x, y, ['#f0fafa', '#e4f2f2', '#fafefe'][(r() * 3) | 0]);
      }
    });
    tile('cobble', function (p) {
      p.fill('#4f4f4f');
      var r = p.rand;
      // 4x4 抖动石块
      for (var gy = 0; gy < 4; gy++) for (var gx = 0; gx < 4; gx++) {
        var c = shade('#828282', 0.8 + r() * 0.45);
        var x0 = gx * 4 + ((r() * 2) | 0) - 1, y0 = gy * 4 + ((r() * 2) | 0) - 1;
        var w = 3 + ((r() * 2) | 0), h = 3 + ((r() * 2) | 0);
        for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) {
          if (x < 0 || y < 0 || x >= TILE || y >= TILE) continue;
          var edge = (x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1);
          p.px(x, y, edge ? shade(c, 0.82) : (r() < 0.12 ? shade(c, 1.12) : c));
        }
      }
    });
    tile('mossy_cobble', function (p) {
      painters_run('cobble', p);
      var r = p.rand;
      var n = p.noiseFn(4);
      for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++)
        if (n(x, y) > 0.62) p.px(x, y, ['#5b7a35', '#4e6b2c', '#698840'][(r() * 3) | 0]);
    });

    function planks(p, base) {
      var r = p.rand;
      for (var board = 0; board < 4; board++) {
        var bc = shade(base, 0.92 + r() * 0.16);
        for (var y = board * 4; y < board * 4 + 4; y++) {
          for (var x = 0; x < TILE; x++) {
            var c = bc;
            if (y % 4 === 3) c = shade(bc, 0.72);                      // 横缝
            else if (r() < 0.1) c = shade(bc, 0.88 + r() * 0.2);       // 木纹
            p.px(x, y, c);
          }
        }
        var seam = (r() * TILE) | 0;                                    // 竖缝
        for (var yy = board * 4; yy < board * 4 + 3; yy++) p.px(seam, yy, shade(bc, 0.7));
      }
    }
    tile('planks_oak', function (p) { planks(p, '#9c7f4e'); });
    tile('planks_birch', function (p) { planks(p, '#c6b77d'); });
    tile('planks_spruce', function (p) { planks(p, '#6b5030'); });

    function logSide(p, dark, light) {
      var r = p.rand;
      for (var x = 0; x < TILE; x++) {
        var c = mix(dark, light, 0.3 + 0.5 * Math.abs(Math.sin(x * 1.8 + r())));
        for (var y = 0; y < TILE; y++) {
          var cc = c;
          if (r() < 0.15) cc = shade(c, 0.85);
          if (r() < 0.06) cc = shade(c, 1.18);
          p.px(x, y, cc);
        }
      }
    }
    function logTop(p, bark, wood) {
      p.fill(bark);
      var rings = ['#b8945f', '#a07c48', '#c2a06b', '#8d6b3c'];
      for (var i = 0; i < 6; i++) {
        var v = 2 + i;
        for (var x = v; x < TILE - v; x++) { p.px(x, v, rings[i % 4]); p.px(x, TILE - 1 - v, rings[i % 4]); }
        for (var y = v; y < TILE - v; y++) { p.px(v, y, rings[i % 4]); p.px(TILE - 1 - v, y, rings[i % 4]); }
        if (v >= 7) break;
      }
      // 用 wood 色调
      void wood;
    }
    tile('log_oak', function (p) { logSide(p, '#4e3a23', '#6b5232'); });
    tile('log_oak_top', function (p) { logTop(p, '#5c452a', '#b8945f'); });
    tile('log_birch', function (p) {
      var r = p.rand;
      p.noiseTile(['#d5d8cf', '#e7eae1', '#dee1d6'], 4, 0.4);
      for (var i = 0; i < 9; i++) { // 黑斑
        var x = (r() * TILE) | 0, y = (r() * TILE) | 0, w = 1 + ((r() * 3) | 0);
        for (var dx = 0; dx < w; dx++) p.px(x + dx, y, '#2e2e28');
      }
    });
    tile('log_birch_top', function (p) { logTop(p, '#c7cabe', '#c8b77f'); });
    tile('log_spruce', function (p) { logSide(p, '#2e2113', '#4a3823'); });
    tile('log_spruce_top', function (p) { logTop(p, '#3a2c19', '#80603a'); });

    function leaves(p) { // 灰度镂空, 运行时染色
      var r = p.rand;
      var n = p.noiseFn(5);
      for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
        var v = n(x, y) + (r() - 0.5) * 0.55;
        if (v < 0.22) continue; // 镂空
        var g = 70 + v * 110 + (r() - 0.5) * 30;
        p.px(x, y, [g | 0, g | 0, g | 0, 255]);
      }
    }
    tile('leaves_oak', leaves);
    tile('leaves_birch', leaves);
    tile('leaves_spruce', leaves);

    tile('sand', function (p) { p.noiseTile(['#dbd3a0', '#d1c894', '#e3dcb0', '#cbc28b'], 5, 0.5); p.speckle('#b5ab76', 8); });
    tile('gravel', function (p) { p.noiseTile(['#7a7168', '#8d847b', '#675f57', '#998f85', '#56504a'], 7, 0.9); });
    tile('sandstone', function (p) {
      p.noiseTile(['#d9cf9e', '#d4c995', '#dfd6a8'], 4, 0.3);
      var r = p.rand;
      for (var y = 3; y < TILE; y += 4) for (var x = 0; x < TILE; x++) if (r() < 0.8) p.px(x, y, '#b3a878');
      p.rect(0, 0, 16, 1, '#e3dab1'); p.rect(0, 15, 16, 1, '#b3a878');
    });
    tile('sandstone_top', function (p) { p.noiseTile(['#dbd3a0', '#e3dcb0', '#d1c894'], 4, 0.3); });
    tile('sandstone_bottom', function (p) { p.noiseTile(['#cfc592', '#c6bc88', '#d8cf9f'], 4, 0.3); });

    tile('bedrock', function (p) { p.noiseTile(['#1c1c1c', '#3d3d3d', '#575757', '#262626', '#6b6b6b'], 5, 0.9); });

    function ore(p, c1, c2) {
      painters_run('stone', p);
      var r = p.rand;
      for (var i = 0; i < 5; i++) {
        var x = 1 + ((r() * 13) | 0), y = 1 + ((r() * 13) | 0);
        p.px(x, y, c1); p.px(x + 1, y, c1); p.px(x, y + 1, c1);
        p.px(x + 1, y + 1, c2);
        if (r() < 0.5) p.px(x - 1, y, c2);
        if (r() < 0.4) p.px(x, y - 1, shade(c1, 1.3));
      }
    }
    tile('ore_coal', function (p) { ore(p, '#2c2c2c', '#171717'); });
    tile('ore_iron', function (p) { ore(p, '#d8af93', '#af8e77'); });
    tile('ore_gold', function (p) { ore(p, '#fcee4b', '#d3b62b'); });
    tile('ore_diamond', function (p) { ore(p, '#5decf5', '#2fb8c4'); });

    tile('glass', function (p) {
      p.fill([0, 0, 0, 0]);
      for (var i = 0; i < TILE; i++) {
        p.px(i, 0, '#dbf0f4'); p.px(i, 15, '#dbf0f4'); p.px(0, i, '#dbf0f4'); p.px(15, i, '#dbf0f4');
      }
      // 高光斜线
      for (i = 0; i < 5; i++) { p.px(2 + i, 6 - i, '#ffffff'); p.px(3 + i, 6 - i, [255, 255, 255, 140]); }
    });
    tile('ice', function (p) {
      p.noiseTile(['#9ccdf5', '#a8d6f8', '#8fc3ee'], 4, 0.25);
      for (var i = 0; i < 6; i++) { p.px(3 + i, 11 - i, '#d8eeff'); }
      for (i = 0; i < 4; i++) p.px(9 + i, 13 - i, '#cfe9fd');
    });
    tile('snow', function (p) { p.noiseTile(['#f4fafa', '#fdffff', '#e8f2f2'], 4, 0.2); });
    tile('wool', function (p) {
      var r = p.rand;
      for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
        var w = Math.sin((x + y * 2.3) * 0.9) * 0.5 + 0.5;
        var c = mix('#e9e9e9', '#d2d2d2', w);
        if (r() < 0.08) c = '#f8f8f8';
        p.px(x, y, c);
      }
      for (var i = 0; i < TILE; i++) { p.px(i, 0, '#dcdcdc'); p.px(0, i, '#dcdcdc'); }
    });
    tile('obsidian', function (p) {
      p.noiseTile(['#11091b', '#1d1129', '#150d20', '#241536'], 5, 0.5);
      var r = p.rand;
      for (var i = 0; i < 4; i++) p.px((r() * 16) | 0, (r() * 16) | 0, '#7a5fa8');
      p.px((r() * 16) | 0, (r() * 16) | 0, '#cbb7ee');
    });

    // TNT
    tile('tnt_side', function (p) {
      p.noiseTile(['#d04a35', '#c4402c', '#db5440'], 4, 0.25);
      p.rect(0, 6, 16, 4, '#e8e0d4');
      // "TNT" 3x5 字
      var F = { T: ['111', '010', '010', '010', '010'], N: ['101', '111', '111', '111', '101'] };
      var word = ['T', 'N', 'T'], ox = 2;
      for (var li = 0; li < 3; li++) {
        var glyph = F[word[li]];
        for (var gy = 0; gy < 5; gy++) for (var gx = 0; gx < 3; gx++)
          if (glyph[gy][gx] === '1') p.px(ox + gx, 6 + gy - 0, '#3b3b3b');
        ox += 4;
      }
    });
    tile('tnt_top', function (p) {
      p.noiseTile(['#d04a35', '#c4402c'], 4, 0.2);
      for (var gy = 0; gy < 3; gy++) for (var gx = 0; gx < 3; gx++) {
        var cx = 3 + gx * 5, cy = 3 + gy * 5;
        p.rect(cx - 1, cy - 1, 3, 3, '#e8e0d4');
        p.px(cx, cy, '#9a8f80');
      }
    });
    tile('tnt_bottom', function (p) { p.noiseTile(['#d04a35', '#c4402c'], 4, 0.2); p.rect(3, 3, 10, 10, '#e8e0d4'); });

    tile('torch', function (p) {
      p.fill([0, 0, 0, 0]);
      p.rect(7, 6, 2, 10, '#6d4d2c');
      p.px(7, 8, '#7d5a36'); p.px(8, 11, '#5d3f22');
      p.rect(7, 4, 2, 2, '#ffd763');
      p.px(7, 3, '#fff1a8'); p.px(8, 3, '#ffea8c');
      p.px(7, 5, '#f8a13c'); p.px(8, 5, '#ff8c2e');
    });

    // 箱子 / 工作台 / 熔炉
    tile('chest_top', function (p) {
      planks(p, '#9c7f4e');
      for (var i = 0; i < TILE; i++) { p.px(i, 0, '#5d4527'); p.px(i, 15, '#5d4527'); p.px(0, i, '#5d4527'); p.px(15, i, '#5d4527'); }
    });
    tile('chest_side', function (p) {
      planks(p, '#9c7f4e');
      for (var i = 0; i < TILE; i++) { p.px(i, 0, '#5d4527'); p.px(i, 15, '#5d4527'); p.px(0, i, '#5d4527'); p.px(15, i, '#5d4527'); }
      for (i = 0; i < TILE; i++) p.px(i, 5, '#4a3620');
    });
    tile('chest_front', function (p) {
      painters_run('chest_side', p);
      p.rect(7, 4, 2, 4, '#8b8b8b');
      p.px(7, 5, '#bdbdbd'); p.px(8, 7, '#5f5f5f');
    });
    tile('table_top', function (p) {
      planks(p, '#a8854f');
      for (var i = 1; i < 15; i++) { p.px(i, 1, '#6e552e'); p.px(i, 14, '#6e552e'); p.px(1, i, '#6e552e'); p.px(14, i, '#6e552e'); }
      for (i = 2; i < 14; i++) { p.px(i, 7, '#7d6136'); p.px(7, i, '#7d6136'); }
    });
    tile('table_side', function (p) {
      planks(p, '#9c7f4e');
      // 锯
      p.rect(2, 3, 5, 3, '#9b9b9b');
      for (var i = 0; i < 5; i++) p.px(2 + i, 6, i % 2 ? '#8a8a8a' : '#6f6f6f');
      p.rect(1, 4, 1, 1, '#5d4527');
    });
    tile('table_front', function (p) {
      planks(p, '#9c7f4e');
      // 锤子+材料格
      p.rect(9, 3, 4, 2, '#8a8a8a'); p.rect(10, 5, 1, 4, '#6d4d2c');
      p.rect(3, 4, 3, 3, '#6e552e'); p.rect(4, 5, 1, 1, '#caa564');
    });
    tile('furnace_side', function (p) {
      p.noiseTile(['#7e7e7e', '#8b8b8b', '#6f6f6f'], 4, 0.35);
      for (var gy = 0; gy < 4; gy++) for (var gx = 0; gx < 4; gx++) {
        var x0 = gx * 4, y0 = gy * 4;
        for (var i = 0; i < 4; i++) { p.px(x0 + i, y0 + 3, '#5a5a5a'); p.px(x0 + 3, y0 + i, '#5a5a5a'); }
      }
    });
    tile('furnace_top', function (p) { painters_run('furnace_side', p); });
    tile('furnace_front', function (p) {
      painters_run('furnace_side', p);
      p.rect(4, 8, 8, 7, '#2b2b2b');
      p.rect(4, 8, 8, 1, '#1d1d1d');
      p.rect(3, 7, 10, 1, '#5a5a5a');
    });
    tile('furnace_lit', function (p) {
      painters_run('furnace_front', p);
      var r = p.rand;
      for (var y = 10; y < 15; y++) for (var x = 5; x < 11; x++) {
        if (r() < 0.65) p.px(x, y, y > 12 ? '#ffd24a' : '#ff8c1a');
      }
    });
    tile('farmland', function (p) {
      p.noiseTile(['#56351c', '#4a2d17', '#5f3c20'], 4, 0.5);
      for (var x = 1; x < TILE; x += 4) for (var y = 0; y < TILE; y++) p.px(x, y, '#3b2412');
    });
    tile('ladder', function (p) {
      p.fill([0, 0, 0, 0]);
      p.rect(2, 0, 2, 16, '#9c7f4e'); p.rect(12, 0, 2, 16, '#9c7f4e');
      for (var y = 1; y < 16; y += 4) p.rect(2, y, 12, 2, '#b29055');
      p.rect(3, 0, 1, 16, '#7d6136'); p.rect(13, 0, 1, 16, '#7d6136');
    });
    tile('stone_bricks', function (p) {
      p.fill('#5f5f5f');
      var r = p.rand;
      var bricks = [[0, 0, 8, 8], [8, 0, 8, 8], [0, 8, 8, 8], [8, 8, 8, 8]];
      // 错缝
      bricks = [[0, 0, 8, 4], [8, 0, 8, 4], [4, 4, 8, 4], [-4, 4, 8, 4], [12, 4, 8, 4],
                [0, 8, 8, 4], [8, 8, 8, 4], [4, 12, 8, 4], [-4, 12, 8, 4], [12, 12, 8, 4]];
      for (var i = 0; i < bricks.length; i++) {
        var bb = bricks[i];
        var c = shade('#8a8a8a', 0.88 + r() * 0.24);
        for (var y = bb[1]; y < bb[1] + bb[3] - 1; y++) for (var x = bb[0]; x < bb[0] + bb[2] - 1; x++) {
          if (x < 0 || x >= TILE || y < 0 || y >= TILE) continue;
          p.px(x, y, r() < 0.08 ? shade(c, 0.9) : c);
        }
      }
    });
    tile('cactus_side', function (p) {
      var r = p.rand;
      for (var x = 0; x < TILE; x++) for (var y = 0; y < TILE; y++) {
        var rib = (x % 4 === 2);
        var c = rib ? '#0a5c16' : (r() < 0.1 ? '#15832a' : '#0f7a1f');
        p.px(x, y, c);
      }
      for (var i = 0; i < 8; i++) p.px(((r() * 4) | 0) * 4 + 2, (r() * 16) | 0, '#d7e8c8');
    });
    tile('cactus_top', function (p) {
      p.fill('#0f7a1f');
      for (var v = 1; v < 7; v += 2) {
        for (var x = v; x < TILE - v; x++) { p.px(x, v, '#0a5c16'); p.px(x, TILE - 1 - v, '#0a5c16'); }
        for (var y = v; y < TILE - v; y++) { p.px(v, y, '#0a5c16'); p.px(TILE - 1 - v, y, '#0a5c16'); }
      }
    });
    tile('pumpkin_side', function (p) {
      var r = p.rand;
      for (var x = 0; x < TILE; x++) for (var y = 0; y < TILE; y++) {
        var rib = (x % 5 === 4);
        var c = rib ? '#b5660f' : (r() < 0.12 ? '#e3922a' : '#d87f1e');
        if (y === 0) c = shade(c, 0.85);
        p.px(x, y, c);
      }
    });
    tile('pumpkin_top', function (p) {
      painters_run('pumpkin_side', p);
      p.rect(6, 6, 4, 4, '#7a8a32');
      p.rect(7, 7, 2, 2, '#5d4527');
    });
    tile('pumpkin_face', function (p) {
      painters_run('pumpkin_side', p);
      // 三角眼 + 锯齿嘴
      p.rect(3, 5, 3, 2, '#3b2003'); p.px(4, 4, '#3b2003');
      p.rect(10, 5, 3, 2, '#3b2003'); p.px(11, 4, '#3b2003');
      p.rect(4, 10, 8, 2, '#3b2003');
      p.px(5, 9, '#3b2003'); p.px(8, 9, '#3b2003'); p.px(11, 9, '#3b2003');
      p.px(6, 12, '#3b2003'); p.px(9, 12, '#3b2003');
    });
    tile('pumpkin_lit', function (p) {
      painters_run('pumpkin_side', p);
      p.rect(3, 5, 3, 2, '#ffe45c'); p.px(4, 4, '#ffe45c');
      p.rect(10, 5, 3, 2, '#ffe45c'); p.px(11, 4, '#ffe45c');
      p.rect(4, 10, 8, 2, '#ffd83a');
      p.px(5, 9, '#ffe45c'); p.px(8, 9, '#ffe45c'); p.px(11, 9, '#ffe45c');
      p.px(6, 12, '#ffd83a'); p.px(9, 12, '#ffd83a');
    });

    // 植物
    tile('dandelion', function (p) {
      p.fill([0, 0, 0, 0]);
      p.rect(7, 8, 1, 7, '#3f7a23');
      p.px(8, 10, '#4d9029'); p.px(6, 12, '#4d9029');
      p.rect(6, 4, 3, 3, '#ffd800');
      p.px(7, 5, '#ffefa0'); p.px(6, 3, '#f0c800'); p.px(9, 5, '#f0c800');
    });
    tile('poppy', function (p) {
      p.fill([0, 0, 0, 0]);
      p.rect(7, 8, 1, 7, '#3f7a23');
      p.px(6, 11, '#4d9029'); p.px(8, 9, '#4d9029');
      p.rect(6, 3, 3, 4, '#d22a1f');
      p.px(5, 4, '#b51e14'); p.px(9, 4, '#b51e14'); p.px(7, 4, '#1d1d1d');
      p.px(6, 2, '#e8392d'); p.px(8, 2, '#e8392d');
    });
    tile('mushroom_brown', function (p) {
      p.fill([0, 0, 0, 0]);
      p.rect(7, 9, 2, 6, '#cfc5b0');
      p.rect(5, 6, 6, 3, '#8a6644');
      p.rect(6, 5, 4, 1, '#9c7650');
      p.px(6, 6, '#a88058'); p.px(9, 7, '#76553a');
    });
    tile('mushroom_red', function (p) {
      p.fill([0, 0, 0, 0]);
      p.rect(7, 9, 2, 6, '#cfc5b0');
      p.rect(5, 6, 6, 3, '#cf2e26');
      p.rect(6, 5, 4, 1, '#db423a');
      p.px(6, 6, '#f4f0e6'); p.px(9, 7, '#f4f0e6'); p.px(8, 5, '#f4f0e6');
    });
    function tallGrassP(p) { // 灰度染色
      p.fill([0, 0, 0, 0]);
      var r = p.rand;
      for (var i = 0; i < 8; i++) {
        var x = 2 + ((r() * 12) | 0);
        var h = 5 + ((r() * 9) | 0);
        var lean = r() < 0.5 ? -1 : 1;
        for (var y = 0; y < h; y++) {
          var xx = x + (y > h * 0.6 ? lean : 0);
          var g = 90 + r() * 80;
          p.px(xx, 15 - y, [g | 0, g | 0, g | 0, 255]);
        }
      }
    }
    tile('tall_grass', tallGrassP);
    tile('dead_bush', function (p) {
      p.fill([0, 0, 0, 0]);
      p.rect(7, 9, 1, 6, '#7a5230');
      var arms = [[7, 9, -1, -1], [8, 9, 1, -1], [7, 11, -2, -1], [8, 12, 2, -1]];
      for (var i = 0; i < arms.length; i++) {
        var a = arms[i], x = a[0], y = a[1];
        for (var s = 0; s < 4; s++) { x += a[2] * 0.7; y += a[3]; p.px(x | 0, y | 0, '#8a5e38'); }
      }
    });
    function saplingP(leafC1, leafC2) {
      return function (p) {
        p.fill([0, 0, 0, 0]);
        p.rect(7, 9, 2, 6, '#6b4a2a');
        var r = p.rand;
        for (var y = 2; y < 10; y++) for (var x = 4; x < 12; x++) {
          var dx = x - 7.5, dy = y - 5.5;
          if (dx * dx + dy * dy < 14 && r() < 0.8) p.px(x, y, r() < 0.5 ? leafC1 : leafC2);
        }
      };
    }
    tile('sapling_oak', saplingP('#4d8f2a', '#3e7a20'));
    tile('sapling_birch', saplingP('#74a83e', '#5f9230'));
    tile('sapling_spruce', saplingP('#2e5b32', '#234c27'));

    // 小麦 8 阶段
    for (var st = 0; st < 8; st++) {
      (function (stage) {
        tile('wheat_' + stage, function (p) {
          p.fill([0, 0, 0, 0]);
          var r = p.rand;
          var h = 3 + stage * 1.6;
          var ripe = stage / 7;
          var c1 = mix('#3fae27', '#cfb637', ripe), c2 = mix('#2f9420', '#b89b2a', ripe);
          for (var i = 0; i < 6; i++) {
            var x = 1 + i * 2.5 + ((r() * 2) | 0);
            var hh = h + ((r() * 3) | 0) - 1;
            for (var y = 0; y < hh && y < 15; y++) p.px(x | 0, 15 - y, y % 3 ? c1 : c2);
            if (stage >= 5) { p.px((x | 0), 15 - hh | 0, mix('#cfb637', '#e8d564', ripe)); p.px((x | 0) + (r() < 0.5 ? 1 : -1), 16 - hh | 0, '#caa92e'); }
          }
        });
      })(st);
    }

    // 储物块
    function metalBlock(p, base, hi, lo) {
      p.fill(base);
      var r = p.rand;
      for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) if (r() < 0.05) p.px(x, y, shade(base, 1.06));
      for (var i = 0; i < TILE; i++) {
        p.px(i, 0, hi); p.px(0, i, hi);
        p.px(i, 15, lo); p.px(15, i, lo);
      }
      p.px(1, 1, hi); p.rect(2, 2, 12, 1, shade(base, 1.04));
    }
    tile('block_iron', function (p) { metalBlock(p, '#d8d8d8', '#f4f4f4', '#9a9a9a'); });
    tile('block_gold', function (p) { metalBlock(p, '#f5ce42', '#fdf0a6', '#c79a1e'); });
    tile('block_diamond', function (p) { metalBlock(p, '#63dbd4', '#bdf7f2', '#3aa9a2'); });

    // 水/岩浆 (动画帧 0; 动画在 repaintLiquid 中重绘)
    tile('water', function (p) { paintWater(p, 0); });
    tile('lava', function (p) { paintLava(p, 0); });

    // 裂纹 10 阶段
    for (var ci = 0; ci < 10; ci++) {
      (function (stage) {
        tile('crack_' + stage, function (p) {
          p.fill([0, 0, 0, 0]);
          var r = p.rand;
          var cracks = 2 + stage;
          for (var i = 0; i < cracks; i++) {
            var x = 8 + (r() - 0.5) * 6, y = 8 + (r() - 0.5) * 6;
            var steps = 3 + stage * 1.5;
            var dx = r() - 0.5, dy = r() - 0.5;
            for (var s = 0; s < steps; s++) {
              p.px(x | 0, y | 0, [20, 20, 20, 200]);
              if (stage > 4 && r() < 0.4) p.px((x | 0) + 1, y | 0, [20, 20, 20, 160]);
              x += dx * 2 + (r() - 0.5) * 1.6; y += dy * 2 + (r() - 0.5) * 1.6;
            }
          }
        });
      })(ci);
    }
  }

  // 水/岩浆动画重绘
  function paintWater(p, t) {
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
      var v = Math.sin((y + t * 1.6) * 0.55 + Math.sin((x * 0.6 + t * 0.9)) * 1.1) * 0.35 +
              Math.sin((x - t * 1.1) * 0.4 + y * 0.3) * 0.15 + 0.5;
      var c = mix('#2c50c0', '#3a61d6', Util.clamp(v, 0, 1));
      if (v > 0.92) c = '#4a73e2';
      p.px(x, y, [c[0], c[1], c[2], 255]);
    }
  }
  function paintLava(p, t) {
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
      var v = Math.sin((x + t * 1.3) * 0.55 + Math.sin((y - t * 0.8) * 0.6) * 2.1) *
              Math.cos((y + t * 0.9) * 0.5 + Math.sin((x + t * 0.5) * 0.8) * 1.4);
      v = v * 0.5 + 0.5;
      var c;
      if (v > 0.78) c = '#ffe24a';
      else if (v > 0.55) c = mix('#f88a1d', '#ffe24a', (v - 0.55) / 0.23);
      else c = mix('#9a2c12', '#e85a13', v / 0.55);
      p.px(x, y, c);
    }
  }

  // 重复执行某个已注册画家 (叠加用)
  var painterMap = {};
  function painters_run(name, p) { painterMap[name](p); }

  // ---------- 构建 ----------
  function buildTileBitmap(name, fn) {
    var rand = Util.mulberry32(Util.strSeed('tile:' + name));
    var p = new Painter(rand);
    fn(p);
    return p.img;
  }

  function build() {
    defineBlockTiles();
    if (typeof Tex2 !== 'undefined') Tex2.define(tile); // 物品/工具等
    atlas = document.createElement('canvas');
    atlas.width = SIZE; atlas.height = SIZE;
    actx = atlas.getContext('2d', { willReadFrequently: true });
    for (var i = 0; i < painters.length; i++) {
      var name = painters[i][0], fn = painters[i][1];
      painterMap[name] = fn;
      var idx = nextIdx++;
      tileIdx[name] = idx;
      var img = buildTileBitmap(name, fn);
      var tx = (idx % COLS) * TILE, ty = ((idx / COLS) | 0) * TILE;
      actx.putImageData(new ImageData(img, TILE, TILE), tx, ty);
      // 独立 canvas 供图标
      var c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      c.getContext('2d').putImageData(new ImageData(img.slice(), TILE, TILE), 0, 0);
      tileCanvas[name] = c;
    }
    if (typeof Tex2 !== 'undefined') Tex2.paintRegions(allocRegion, actx);
    resolveBlockFaces();
  }

  function allocRegion(name, w, h) {
    var c = regionCursor;
    if (c.x + w > SIZE) { c.x = 0; c.y += c.rowH; c.rowH = 0; }
    var r = { x: c.x, y: c.y, w: w, h: h };
    c.x += w; c.rowH = Math.max(c.rowH, h);
    regions[name] = r;
    return r;
  }

  // 把 blocks.js 的 tex 名解析为 faces[6] tile 索引
  // 面顺序: 0:+x 1:-x 2:+y(top) 3:-y(bottom) 4:+z 5:-z
  function resolveBlockFaces() {
    var BL = Blocks.BLOCKS;
    for (var id = 0; id < BL.length; id++) {
      var b = BL[id];
      if (!b) continue;
      var t = b.tex || {};
      var all = t.all !== undefined ? tileIdx[t.all] : undefined;
      var side = t.side !== undefined ? tileIdx[t.side] : all;
      var top = t.top !== undefined ? tileIdx[t.top] : (all !== undefined ? all : side);
      var bottom = t.bottom !== undefined ? tileIdx[t.bottom] : (all !== undefined ? all : side);
      var front = t.front !== undefined ? tileIdx[t.front] : side;
      b.faces = [side, side, top, bottom, side, side];
      b.frontTile = front;
      if (all === undefined && side === undefined) b.faces = [0, 0, 0, 0, 0, 0];
    }
  }

  function uv(idx) { // tile 索引 → [u0,v0] (uv 尺寸 = TILE/SIZE)
    return [(idx % COLS) * TILE / SIZE, ((idx / COLS) | 0) * TILE / SIZE];
  }

  // 动画: 重画水/岩浆 tile, 返回需要上传的区域列表
  var animPainters = null;
  function tickLiquidAnim(timeSec) {
    if (!actx) return null;
    if (!animPainters) {
      animPainters = {
        water: new Painter(Util.mulberry32(1)),
        lava: new Painter(Util.mulberry32(2))
      };
    }
    paintWater(animPainters.water, timeSec);
    paintLava(animPainters.lava, timeSec);
    var out = [];
    var names = ['water', 'lava'];
    for (var i = 0; i < 2; i++) {
      var idx = tileIdx[names[i]];
      var tx = (idx % COLS) * TILE, ty = ((idx / COLS) | 0) * TILE;
      var img = animPainters[names[i]].img;
      actx.putImageData(new ImageData(img, TILE, TILE), tx, ty);
      out.push({ x: tx, y: ty, w: TILE, h: TILE, data: img });
    }
    return out;
  }

  return {
    SIZE: SIZE, TILE: TILE, COLS: COLS,
    build: build, uv: uv,
    idx: function (name) { return tileIdx[name]; },
    canvasOf: function (name) { return tileCanvas[name]; },
    atlasCanvas: function () { return atlas; },
    region: function (name) { return regions[name]; },
    tickLiquidAnim: tickLiquidAnim,
    hex: hex, shade: shade, mix: mix,
    Painter: Painter
  };
})();
