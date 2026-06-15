// ============ textures2.js — item/tool pixel art, mob skins, GUI ============
'use strict';
var Tex2 = (function () {
  var TILE = 16;

  // ---------- tool pixel art (ASCII art) ----------
  // '.'=transparent  S/s=wood handle light/dark  H/h/L=material base/dark/light
  var TOOL_MAPS = {
    pick: [
      '....HHHHH.......',
      '..HHhhhhHHH.....',
      '.Hh......LHH....',
      '.H.........HH...',
      '............HH..',
      '.........Ss.HH..',
      '........Ss......',
      '.......Ss.......',
      '......Ss........',
      '.....Ss.........',
      '....Ss..........',
      '...Ss...........',
      '..Ss............',
      '.Ss.............',
      'Ss..............',
      '................'
    ],
    axe: [
      '.....HHH........',
      '...HHhhHH.......',
      '...Hh.LhH.......',
      '...Hh..Ss.......',
      '....h.Ss........',
      '......Ss........',
      '.....Ss.........',
      '....Ss..........',
      '...Ss...........',
      '..Ss............',
      '.Ss.............',
      'Ss..............',
      '................',
      '................',
      '................',
      '................'
    ],
    shovel: [
      '.......LHH......',
      '......LHhH......',
      '......HHhh......',
      '......Hhh.......',
      '......Ss........',
      '.....Ss.........',
      '.....Ss.........',
      '....Ss..........',
      '....Ss..........',
      '...Ss...........',
      '...Ss...........',
      '..Ss............',
      '..Ss............',
      '.Ss.............',
      'Ss..............',
      '................'
    ],
    hoe: [
      '....HHHH........',
      '...Hh..hH.......',
      '.......Ss.......',
      '......Ss........',
      '......Ss........',
      '.....Ss.........',
      '.....Ss.........',
      '....Ss..........',
      '....Ss..........',
      '...Ss...........',
      '..Ss............',
      '.Ss.............',
      'Ss..............',
      '................',
      '................',
      '................'
    ],
    sword: [
      '.............LL.',
      '............LhL.',
      '...........LhL..',
      '..........LhL...',
      '.........LhL....',
      '........LhL.....',
      '.s.....LhL......',
      '..s...LhL.......',
      '...s.LhL........',
      '....shL.........',
      '...s.s..........',
      '..s...s.........',
      '.s..............',
      '................',
      '................',
      '................'
    ]
  };
  var TOOL_PAL = {
    wood:    { H: '#7a5c33', h: '#5f4626', L: '#9a7a48' },
    stone:   { H: '#8f8f8f', h: '#6e6e6e', L: '#b4b4b4' },
    iron:    { H: '#d8d8d8', h: '#9a9a9a', L: '#ffffff' },
    gold:    { H: '#f1c545', h: '#c2941c', L: '#fdeea2' },
    diamond: { H: '#45dbd1', h: '#2aa098', L: '#9ef3ec' }
  };
  var STICK_PAL = { S: '#9a7a48', s: '#7a5c33' };

  function charMapPainter(map, pal) {
    return function (p) {
      p.fill([0, 0, 0, 0]);
      for (var y = 0; y < 16; y++) {
        var row = map[y] || '';
        for (var x = 0; x < 16; x++) {
          var ch = row[x];
          if (!ch || ch === '.') continue;
          var c = pal[ch] || STICK_PAL[ch];
          if (c) p.px(x, y, c);
        }
      }
    };
  }

  // ---------- item textures ----------
  function define(tile) {
    tile('item_stick', function (p) {
      p.fill([0, 0, 0, 0]);
      for (var i = 0; i < 11; i++) { p.px(3 + i, 13 - i, '#9a7a48'); p.px(4 + i, 13 - i, '#7a5c33'); }
    });
    tile('item_coal', function (p) {
      p.fill([0, 0, 0, 0]);
      blob(p, 8, 8, 4.5, '#222222', '#3c3c3c', '#0f0f0f');
      p.px(6, 6, '#4f4f4f'); p.px(9, 7, '#454545');
    });
    tile('item_charcoal', function (p) {
      p.fill([0, 0, 0, 0]);
      blob(p, 8, 8, 4.5, '#2e2218', '#46342a', '#1a120c');
      p.px(6, 6, '#5a463a');
    });
    function ingot(p, base, hi, lo) {
      p.fill([0, 0, 0, 0]);
      // two stacked ingots
      slab(p, 3, 8, 10, base, hi, lo);
      slab(p, 5, 4, 10, base, hi, lo);
    }
    function slab(p, x, y, w, base, hi, lo) {
      for (var i = 0; i < w; i++) {
        p.px(x + i, y, hi); p.px(x + i - 1, y + 1, base); p.px(x + i - 2, y + 2, base); p.px(x + i - 2, y + 3, lo);
      }
      p.px(x - 1, y + 1, hi); p.px(x - 2, y + 2, hi);
      p.px(x + w - 1, y + 1, lo); p.px(x + w - 2, y + 2, lo);
    }
    tile('item_iron_ingot', function (p) { ingot(p, '#d8d8d8', '#f6f6f6', '#9a9a9a'); });
    tile('item_gold_ingot', function (p) { ingot(p, '#f1c545', '#fdeea2', '#c2941c'); });
    tile('item_diamond', function (p) {
      p.fill([0, 0, 0, 0]);
      var rows = ['...LLLL...', '..LHHHHL..', '.LHHHHHHh.', '.hHHHHHHh.', '..hHHHHh..', '...hHHh...', '....hh....'];
      for (var y = 0; y < rows.length; y++) for (var x = 0; x < 10; x++) {
        var ch = rows[y][x]; if (ch === '.') continue;
        p.px(3 + x, 4 + y, { L: '#bdf7f2', H: '#45dbd1', h: '#2a9c94' }[ch]);
      }
      p.px(5, 5, '#ffffff');
    });
    tile('item_flint', function (p) {
      p.fill([0, 0, 0, 0]);
      blob(p, 8, 9, 4, '#33373b', '#4a4f54', '#202326');
      p.px(6, 5, '#5d646b'); p.px(10, 7, '#16181a');
    });
    tile('item_seeds', function (p) {
      p.fill([0, 0, 0, 0]);
      var pts = [[4, 6], [8, 4], [11, 7], [6, 10], [10, 11], [3, 12]];
      for (var i = 0; i < pts.length; i++) {
        p.px(pts[i][0], pts[i][1], '#3fae27');
        p.px(pts[i][0] + 1, pts[i][1], '#2f8a1d');
      }
    });
    tile('item_wheat', function (p) {
      p.fill([0, 0, 0, 0]);
      for (var i = 0; i < 3; i++) {
        var x = 4 + i * 4;
        for (var y = 4; y < 15; y++) p.px(x, y, '#b89b2a');
        for (var y2 = 2; y2 < 7; y2++) { p.px(x - 1, y2, '#dcc04b'); p.px(x + 1, y2, '#dcc04b'); p.px(x, y2, '#e8d564'); }
      }
    });
    tile('item_bread', function (p) {
      p.fill([0, 0, 0, 0]);
      for (var i = 0; i < 9; i++) {
        p.px(3 + i, 6, '#c98e4b'); p.px(3 + i, 7, '#b5793a'); p.px(3 + i, 8, '#a96f33'); p.px(3 + i, 9, '#94601f');
      }
      p.px(2, 7, '#c98e4b'); p.px(12, 8, '#94601f');
      p.px(5, 6, '#e8c07a'); p.px(8, 6, '#e8c07a'); p.px(11, 6, '#e8c07a');
    });
    tile('item_apple', function (p) {
      p.fill([0, 0, 0, 0]);
      blob(p, 8, 9, 4, '#d32f23', '#ef5346', '#9c1d13');
      p.px(8, 4, '#6b4a2a'); p.px(8, 3, '#6b4a2a');
      p.px(10, 3, '#4d8f2a'); p.px(11, 4, '#4d8f2a');
      p.px(6, 7, '#ff8d84');
    });
    function meat(p, base, hi, lo, bone) {
      p.fill([0, 0, 0, 0]);
      blob(p, 7, 9, 4.2, base, hi, lo);
      if (bone) { p.px(12, 4, '#efe8d8'); p.px(13, 3, '#efe8d8'); p.px(11, 5, '#e0d8c4'); }
    }
    tile('item_pork_raw', function (p) { meat(p, '#ef9d9d', '#ffc1c1', '#d77676', true); });
    tile('item_pork_cooked', function (p) { meat(p, '#b5703a', '#d8945c', '#8d5226', true); });
    tile('item_beef_raw', function (p) { meat(p, '#c2453c', '#e87a6e', '#8d2b24', false); p.px(7, 8, '#f4b8b0'); });
    tile('item_beef_cooked', function (p) { meat(p, '#6e4126', '#92583a', '#4a2a17', false); });
    tile('item_mutton_raw', function (p) { meat(p, '#d8645c', '#f29086', '#a83e36', true); });
    tile('item_mutton_cooked', function (p) { meat(p, '#9c5b32', '#bf7c4e', '#6e3c1d', true); });
    tile('item_rotten_flesh', function (p) {
      p.fill([0, 0, 0, 0]);
      blob(p, 8, 9, 4.4, '#7a6a32', '#9c8a48', '#56491f');
      p.px(6, 7, '#4f7a2a'); p.px(9, 10, '#4f7a2a'); p.px(8, 8, '#3c5e1d');
    });
    tile('item_gunpowder', function (p) {
      p.fill([0, 0, 0, 0]);
      var r = p.rand;
      for (var y = 0; y < 6; y++) for (var x = -y; x <= y; x++) {
        if (r() < 0.75) p.px(8 + x, 13 - (5 - y), ['#5a5a5a', '#6e6e6e', '#454545'][(r() * 3) | 0]);
      }
    });
    tile('item_leather', function (p) {
      p.fill([0, 0, 0, 0]);
      for (var y = 4; y < 13; y++) for (var x = 3; x < 13; x++) {
        if ((x === 3 || x === 12) && (y === 4 || y === 12)) continue;
        p.px(x, y, (x === 3 || x === 12 || y === 4 || y === 12) ? '#8d5c2e' : '#b5793a');
      }
      p.px(6, 7, '#c98e4b'); p.px(9, 9, '#9c6a36');
    });
    tile('item_snowball', function (p) {
      p.fill([0, 0, 0, 0]);
      blob(p, 8, 8, 4, '#f4fafa', '#ffffff', '#c8dce0');
    });
    function bucketP(fill) {
      return function (p) {
        p.fill([0, 0, 0, 0]);
        // handle
        for (var i = 0; i < 5; i++) p.px(5 + i, 3 - (i === 0 || i === 4 ? 0 : 1), '#9a9a9a');
        // bucket body (wider at top, narrower at bottom)
        for (var y = 0; y < 8; y++) {
          var inset = (y / 3) | 0;
          for (var x = 3 + inset; x <= 12 - inset; x++) {
            var edge = x === 3 + inset || x === 12 - inset || y === 7;
            p.px(x, 5 + y, edge ? '#7a7a7a' : '#c8c8c8');
          }
        }
        p.rect(4, 5, 8, 1, '#e8e8e8');
        if (fill) p.rect(5, 5, 6, 2, fill);
      };
    }
    tile('item_bucket', bucketP(null));
    tile('item_bucket_water', bucketP('#3d6ae0'));
    tile('item_bucket_lava', bucketP('#f88a1d'));
    tile('item_flint_steel', function (p) {
      p.fill([0, 0, 0, 0]);
      // steel ring, C shape
      var arc = [[9, 3], [11, 3], [8, 4], [12, 4], [7, 6], [13, 6], [7, 8], [13, 8], [8, 10], [12, 10], [9, 11], [11, 11], [10, 3]];
      for (var i = 0; i < arc.length; i++) p.px(arc[i][0], arc[i][1], '#b0b0b0');
      blob(p, 5, 11, 2.5, '#33373b', '#4a4f54', '#202326');
    });
    // tools 5x5
    var kinds = ['pick', 'axe', 'shovel', 'hoe', 'sword'];
    var mats = ['wood', 'stone', 'iron', 'gold', 'diamond'];
    for (var k = 0; k < kinds.length; k++) {
      for (var m = 0; m < mats.length; m++) {
        tile('tool_' + kinds[k] + '_' + mats[m], charMapPainter(TOOL_MAPS[kinds[k]], TOOL_PAL[mats[m]]));
      }
    }
    // particles
    tile('part_smoke', function (p) {
      p.fill([0, 0, 0, 0]);
      var r = p.rand;
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var d = Math.hypot(x - 8, y - 8);
        if (d < 6 && r() < 1 - d / 7) p.px(x, y, [120, 120, 120, 220 - d * 25]);
      }
    });
    tile('part_flame', function (p) {
      p.fill([0, 0, 0, 0]);
      var r = p.rand;
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var d = Math.hypot(x - 8, (y - 9) * 0.8);
        if (d < 5.5 && r() < 1 - d / 6) p.px(x, y, d < 2.5 ? '#fff1a8' : (d < 4 ? '#ffc23a' : '#f8741d'));
      }
    });
    tile('part_splash', function (p) {
      p.fill([0, 0, 0, 0]);
      blob(p, 8, 8, 3, [93, 134, 236, 200], [150, 180, 255, 220], [60, 90, 200, 180]);
    });
    tile('part_explo', function (p) {
      p.fill([0, 0, 0, 0]);
      var r = p.rand;
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var d = Math.hypot(x - 8, y - 8);
        if (d < 7 && r() < 1 - d / 8) {
          var g = 200 + r() * 55;
          p.px(x, y, [g, g - r() * 60, g - 120, 230 - d * 20]);
        }
      }
    });
  }

  function blob(p, cx, cy, rad, base, hi, lo) {
    var r = p.rand;
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var d = Math.hypot(x - cx, y - cy);
      if (d < rad + (r() - 0.5)) {
        var c = base;
        if (x - cx < -1 && y - cy < -1) c = hi;
        else if (x - cx > 1 && y - cy > 1) c = lo;
        p.px(x, y, c);
      }
    }
  }

  // ---------- mob models + skins ----------
  // part: size[w,h,d](px), uv offset within region, pivot is the attach point in the entity (px, origin at foot, y up, +z forward), off is box center relative to pivot
  var MODELS = {
    humanoid: {
      tex: 'skin_zombie', texW: 64, texH: 32, parts: [
        { name: 'head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 24, 0], off: [0, 4, 0], anim: 'head' },
        { name: 'body', size: [8, 12, 4], uv: [16, 16], pivot: [0, 24, 0], off: [0, -6, 0] },
        { name: 'armR', size: [4, 12, 4], uv: [40, 16], pivot: [-6, 23, 0], off: [0, -5, 0], anim: 'armR' },
        { name: 'armL', size: [4, 12, 4], uv: [40, 16], pivot: [6, 23, 0], off: [0, -5, 0], anim: 'armL' },
        { name: 'legR', size: [4, 12, 4], uv: [0, 16], pivot: [-2, 12, 0], off: [0, -6, 0], anim: 'legR' },
        { name: 'legL', size: [4, 12, 4], uv: [0, 16], pivot: [2, 12, 0], off: [0, -6, 0], anim: 'legL' }
      ]
    },
    pig: {
      tex: 'skin_pig', texW: 64, texH: 32, parts: [
        { name: 'head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 9, -7], off: [0, 1, -2], anim: 'head' },
        { name: 'body', size: [10, 8, 14], uv: [24, 0], pivot: [0, 9, 0], off: [0, 0, 0] },
        { name: 'leg0', size: [4, 6, 4], uv: [0, 16], pivot: [-3, 6, -4], off: [0, -3, 0], anim: 'legR' },
        { name: 'leg1', size: [4, 6, 4], uv: [0, 16], pivot: [3, 6, -4], off: [0, -3, 0], anim: 'legL' },
        { name: 'leg2', size: [4, 6, 4], uv: [0, 16], pivot: [-3, 6, 4], off: [0, -3, 0], anim: 'legL' },
        { name: 'leg3', size: [4, 6, 4], uv: [0, 16], pivot: [3, 6, 4], off: [0, -3, 0], anim: 'legR' }
      ]
    },
    cow: {
      tex: 'skin_cow', texW: 64, texH: 64, parts: [
        { name: 'head', size: [8, 8, 6], uv: [0, 0], pivot: [0, 20, -8], off: [0, 1, -2], anim: 'head' },
        { name: 'body', size: [12, 10, 18], uv: [0, 32], pivot: [0, 17, 0], off: [0, 0, 0] },
        { name: 'leg0', size: [4, 12, 4], uv: [0, 16], pivot: [-3, 12, -5], off: [0, -6, 0], anim: 'legR' },
        { name: 'leg1', size: [4, 12, 4], uv: [0, 16], pivot: [3, 12, -5], off: [0, -6, 0], anim: 'legL' },
        { name: 'leg2', size: [4, 12, 4], uv: [0, 16], pivot: [-3, 12, 6], off: [0, -6, 0], anim: 'legL' },
        { name: 'leg3', size: [4, 12, 4], uv: [0, 16], pivot: [3, 12, 6], off: [0, -6, 0], anim: 'legR' }
      ]
    },
    sheep: {
      tex: 'skin_sheep', texW: 64, texH: 64, parts: [
        { name: 'head', size: [6, 6, 8], uv: [0, 0], pivot: [0, 18, -7], off: [0, 1, -2], anim: 'head' },
        { name: 'body', size: [10, 8, 16], uv: [0, 32], pivot: [0, 15, 0], off: [0, 0, 0] },
        { name: 'leg0', size: [4, 12, 4], uv: [0, 16], pivot: [-3, 12, -4], off: [0, -6, 0], anim: 'legR' },
        { name: 'leg1', size: [4, 12, 4], uv: [0, 16], pivot: [3, 12, -4], off: [0, -6, 0], anim: 'legL' },
        { name: 'leg2', size: [4, 12, 4], uv: [0, 16], pivot: [-3, 12, 5], off: [0, -6, 0], anim: 'legL' },
        { name: 'leg3', size: [4, 12, 4], uv: [0, 16], pivot: [3, 12, 5], off: [0, -6, 0], anim: 'legR' }
      ]
    },
    creeper: {
      tex: 'skin_creeper', texW: 64, texH: 32, parts: [
        { name: 'head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 18, 0], off: [0, 4, 0], anim: 'head' },
        { name: 'body', size: [8, 12, 4], uv: [16, 16], pivot: [0, 18, 0], off: [0, -6, 0] },
        { name: 'leg0', size: [4, 6, 4], uv: [0, 16], pivot: [-2, 6, -3], off: [0, -3, 0], anim: 'legR' },
        { name: 'leg1', size: [4, 6, 4], uv: [0, 16], pivot: [2, 6, -3], off: [0, -3, 0], anim: 'legL' },
        { name: 'leg2', size: [4, 6, 4], uv: [0, 16], pivot: [-2, 6, 3], off: [0, -3, 0], anim: 'legL' },
        { name: 'leg3', size: [4, 6, 4], uv: [0, 16], pivot: [2, 6, 3], off: [0, -3, 0], anim: 'legR' }
      ]
    }
  };
  // player and zombie share the model but use different skins
  var SKIN_FOR = { zombie: 'skin_zombie', player: 'skin_player' };

  // MC skin box unwrap: returns each face [x,y,w,h] (relative to the skin region)
  function boxUV(u, v, w, h, d) {
    return {
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, h],      // -x
      front: [u + d, v + d, w, h],  // -z (face points -z)
      left: [u + d + w, v + d, d, h],
      back: [u + d + w + d, v + d, w, h]
    };
  }

  // ---------- skin painting ----------
  function paintRegions(alloc, ctx) {
    function fillRect(rg, r, c) { ctx.fillStyle = c; ctx.fillRect(rg.x + r[0], rg.y + r[1], r[2], r[3]); }
    function speck(rg, r, rand, colors, density) {
      for (var i = 0; i < r[2] * r[3] * density; i++) {
        ctx.fillStyle = colors[(rand() * colors.length) | 0];
        ctx.fillRect(rg.x + r[0] + (rand() * r[2]) | 0, rg.y + r[1] + (rand() * r[3]) | 0, 1, 1);
      }
    }
    function px(rg, x, y, c) { ctx.fillStyle = c; ctx.fillRect(rg.x + x, rg.y + y, 1, 1); }
    function paintBoxAll(rg, uvb, base, rand, vary) {
      var faces = ['top', 'bottom', 'right', 'front', 'left', 'back'];
      for (var i = 0; i < 6; i++) {
        fillRect(rg, uvb[faces[i]], base);
        if (vary) speck(rg, uvb[faces[i]], rand, vary, 0.25);
      }
    }

    // -- pig --
    var rg = alloc('skin_pig', 64, 32);
    var rand = Util.mulberry32(101);
    var headUV = boxUV(0, 0, 8, 8, 8), bodyUV = boxUV(24, 0, 10, 8, 14), legUV = boxUV(0, 16, 4, 6, 4);
    paintBoxAll(rg, headUV, '#eea4a4', rand, ['#e29393', '#f5b5b5']);
    paintBoxAll(rg, bodyUV, '#eea4a4', rand, ['#e29393', '#f5b5b5', '#d98484']);
    paintBoxAll(rg, legUV, '#e29393', rand, ['#d98484']);
    // face: eyes + snout
    px(rg, headUV.front[0] + 1, headUV.front[1] + 2, '#ffffff'); px(rg, headUV.front[0] + 1, headUV.front[1] + 3, '#1d1d3a');
    px(rg, headUV.front[0] + 6, headUV.front[1] + 2, '#ffffff'); px(rg, headUV.front[0] + 6, headUV.front[1] + 3, '#1d1d3a');
    fillRect(rg, [headUV.front[0] + 2, headUV.front[1] + 4, 4, 3], '#d98484');
    px(rg, headUV.front[0] + 3, headUV.front[1] + 5, '#a85e5e'); px(rg, headUV.front[0] + 4, headUV.front[1] + 5, '#a85e5e');

    // -- cow --
    rg = alloc('skin_cow', 64, 64);
    rand = Util.mulberry32(102);
    headUV = boxUV(0, 0, 8, 8, 6); bodyUV = boxUV(0, 32, 12, 10, 18); legUV = boxUV(0, 16, 4, 12, 4);
    paintBoxAll(rg, headUV, '#5d4232', rand, ['#4f3829', '#6e503d']);
    paintBoxAll(rg, bodyUV, '#5d4232', rand, ['#4f3829', '#6e503d']);
    // white patches
    speck(rg, bodyUV.top, rand, ['#e8e4dc', '#dcd6ca'], 0.35);
    speck(rg, bodyUV.left, rand, ['#e8e4dc'], 0.25);
    speck(rg, bodyUV.right, rand, ['#e8e4dc'], 0.25);
    paintBoxAll(rg, legUV, '#4a3526', rand, ['#3c2b1e']);
    // white face + eyes + snout
    fillRect(rg, [headUV.front[0] + 2, headUV.front[1] + 3, 4, 5], '#e8e4dc');
    px(rg, headUV.front[0] + 1, headUV.front[1] + 2, '#ffffff'); px(rg, headUV.front[0] + 1, headUV.front[1] + 3, '#1d1d3a');
    px(rg, headUV.front[0] + 6, headUV.front[1] + 2, '#ffffff'); px(rg, headUV.front[0] + 6, headUV.front[1] + 3, '#1d1d3a');
    fillRect(rg, [headUV.front[0] + 3, headUV.front[1] + 6, 2, 2], '#caa28c');

    // -- sheep --
    rg = alloc('skin_sheep', 64, 64);
    rand = Util.mulberry32(103);
    headUV = boxUV(0, 0, 6, 6, 8); bodyUV = boxUV(0, 32, 10, 8, 16); legUV = boxUV(0, 16, 4, 12, 4);
    paintBoxAll(rg, headUV, '#d8c0b0', rand, ['#caa898']);
    paintBoxAll(rg, bodyUV, '#e8e8e8', rand, ['#f6f6f6', '#d8d8d8', '#ffffff']);
    paintBoxAll(rg, legUV, '#e0e0e0', rand, ['#cfcfcf']);
    fillRect(rg, [legUV.front[0], legUV.front[1] + 9, 4, 3], '#c0a896');
    px(rg, headUV.front[0] + 1, headUV.front[1] + 2, '#ffffff'); px(rg, headUV.front[0] + 1, headUV.front[1] + 3, '#1d1d3a');
    px(rg, headUV.front[0] + 4, headUV.front[1] + 2, '#ffffff'); px(rg, headUV.front[0] + 4, headUV.front[1] + 3, '#1d1d3a');
    fillRect(rg, [headUV.front[0] + 2, headUV.front[1] + 4, 2, 1], '#b08878');

    // -- creeper --
    rg = alloc('skin_creeper', 64, 32);
    rand = Util.mulberry32(104);
    headUV = boxUV(0, 0, 8, 8, 8); bodyUV = boxUV(16, 16, 8, 12, 4); legUV = boxUV(0, 16, 4, 6, 4);
    var camo = ['#4fae4f', '#3a8f3a', '#62c162', '#2e7a2e', '#55b855'];
    function camoFill(uvb) {
      var faces = ['top', 'bottom', 'right', 'front', 'left', 'back'];
      for (var i = 0; i < 6; i++) { fillRect(rg, uvb[faces[i]], '#4fae4f'); speck(rg, uvb[faces[i]], rand, camo, 1.2); }
    }
    camoFill(headUV); camoFill(bodyUV); camoFill(legUV);
    // classic creeper face
    var f = headUV.front;
    fillRect(rg, [f[0] + 1, f[1] + 2, 2, 2], '#0a0a0a'); fillRect(rg, [f[0] + 5, f[1] + 2, 2, 2], '#0a0a0a');
    fillRect(rg, [f[0] + 3, f[1] + 4, 2, 3], '#0a0a0a');
    fillRect(rg, [f[0] + 2, f[1] + 5, 1, 3], '#0a0a0a'); fillRect(rg, [f[0] + 5, f[1] + 5, 1, 3], '#0a0a0a');

    // -- zombie --
    rg = alloc('skin_zombie', 64, 32);
    rand = Util.mulberry32(105);
    paintHumanoid(rg, rand, { skin: '#6a9a4e', skinD: '#578040', shirt: '#3e8e8e', shirtD: '#347676', pants: '#4a3e8e', pantsD: '#3b3273', hair: '#3c5e2a', eye: '#1d1d1d' });

    // -- player (Steve style) --
    rg = alloc('skin_player', 64, 32);
    rand = Util.mulberry32(106);
    paintHumanoid(rg, rand, { skin: '#d3a07c', skinD: '#c08e6c', shirt: '#2ba2a2', shirtD: '#238888', pants: '#4658a8', pantsD: '#3a4a8e', hair: '#3b2a1a', eye: '#3b4ed8' });

    function paintHumanoid(rg, rand, c) {
      var hUV = boxUV(0, 0, 8, 8, 8), bUV = boxUV(16, 16, 8, 12, 4), aUV = boxUV(40, 16, 4, 12, 4), lUV = boxUV(0, 16, 4, 12, 4);
      paintBoxAll(rg, hUV, c.skin, rand, [c.skinD]);
      // hair
      fillRect(rg, hUV.top, c.hair);
      fillRect(rg, [hUV.front[0], hUV.front[1], 8, 2], c.hair);
      fillRect(rg, [hUV.back[0], hUV.back[1], 8, 3], c.hair);
      fillRect(rg, [hUV.left[0], hUV.left[1], 8, 2], c.hair);
      fillRect(rg, [hUV.right[0], hUV.right[1], 8, 2], c.hair);
      // face
      var f = hUV.front;
      px(rg, f[0] + 1, f[1] + 4, '#ffffff'); px(rg, f[0] + 2, f[1] + 4, c.eye);
      px(rg, f[0] + 6, f[1] + 4, '#ffffff'); px(rg, f[0] + 5, f[1] + 4, c.eye);
      fillRect(rg, [f[0] + 3, f[1] + 5, 2, 1], c.skinD);
      fillRect(rg, [f[0] + 2, f[1] + 7, 4, 1], c.skinD);
      // body = shirt
      paintBoxAll(rg, bUV, c.shirt, rand, [c.shirtD]);
      // arms: 2px shirt sleeve + skin
      paintBoxAll(rg, aUV, c.skin, rand, [c.skinD]);
      var fcs = ['right', 'front', 'left', 'back'];
      for (var i = 0; i < 4; i++) {
        var r2 = aUV[fcs[i]];
        fillRect(rg, [r2[0], r2[1], r2[2], 2], c.shirt);
      }
      // legs = pants, feet 2px gray
      paintBoxAll(rg, lUV, c.pants, rand, [c.pantsD]);
      for (i = 0; i < 4; i++) {
        var r3 = lUV[fcs[i]];
        fillRect(rg, [r3[0], r3[1] + 10, r3[2], 2], '#5a5a5a');
      }
    }

    // -- sun / moon --
    rg = alloc('sun', 32, 32);
    ctx.fillStyle = '#fdf2b0'; ctx.fillRect(rg.x, rg.y, 32, 32);
    ctx.fillStyle = '#fff9d8'; ctx.fillRect(rg.x + 4, rg.y + 4, 24, 24);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(rg.x + 9, rg.y + 9, 14, 14);
    rg = alloc('moon', 32, 32);
    ctx.fillStyle = '#d8dce8'; ctx.fillRect(rg.x, rg.y, 32, 32);
    ctx.fillStyle = '#c2c8da'; ctx.fillRect(rg.x + 3, rg.y + 3, 26, 26);
    rand = Util.mulberry32(107);
    ctx.fillStyle = '#aab0c6';
    for (var i = 0; i < 9; i++) {
      var s = 2 + (rand() * 4) | 0;
      ctx.fillRect(rg.x + 3 + (rand() * 24) | 0, rg.y + 3 + (rand() * 24) | 0, s, s);
    }
  }

  // ---------- item icons (dataURL for DOM) ----------
  var iconCache = {};
  function iconFor(id) {
    if (iconCache[id]) return iconCache[id];
    var c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    var url;
    if (Blocks.isBlockItem(id)) {
      var b = Blocks.BLOCKS[id];
      if (b.render === 'cube' || b.render === 'liquid' || b.render === 'snow' || b.render === 'cactus') {
        drawIsoBlock(x, b);
      } else {
        var name = b.tex.all || b.tex.side;
        var tc = tintedTile(name, b.tint);
        x.drawImage(tc, 4, 4, 40, 40);
      }
    } else {
      var it = Blocks.ITEMS[id];
      if (it) x.drawImage(Tex.canvasOf(it.tile), 4, 4, 40, 40);
    }
    url = c.toDataURL();
    iconCache[id] = url;
    return url;
  }
  var PLAINS_TINT = [145, 189, 89];
  function tintedTile(name, tint) {
    var src = Tex.canvasOf(name);
    if (!tint) return src;
    var c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    var x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    var d = x.getImageData(0, 0, 16, 16);
    for (var i = 0; i < d.data.length; i += 4) {
      d.data[i] = d.data[i] * PLAINS_TINT[0] / 255;
      d.data[i + 1] = d.data[i + 1] * PLAINS_TINT[1] / 255;
      d.data[i + 2] = d.data[i + 2] * PLAINS_TINT[2] / 255;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  function faceTile(b, face) { // face: 'top'|'side'|'front'
    var t = b.tex;
    var name = (face === 'top' ? (t.top || t.all) : (face === 'front' ? (t.front || t.side || t.all) : (t.side || t.all))) || t.all;
    return name;
  }
  function darkened(srcCanvas, f) {
    var c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    var x = c.getContext('2d');
    x.drawImage(srcCanvas, 0, 0);
    var d = x.getImageData(0, 0, 16, 16);
    for (var i = 0; i < d.data.length; i += 4) {
      d.data[i] *= f; d.data[i + 1] *= f; d.data[i + 2] *= f;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  function drawIsoBlock(x, b) {
    var topName = faceTile(b, 'top'), sideName = faceTile(b, 'side'), frontName = faceTile(b, 'front');
    var topC = tintedTile(topName, b.tint && (topName === 'grass_top' || b.tint));
    if (topName === 'snow' || topName.indexOf('leaves') < 0 && !b.tint) topC = tintedTile(topName, b.tint);
    var sideC = Tex.canvasOf(sideName);
    var frontC = Tex.canvasOf(frontName);
    if (b.tint && sideName.indexOf('leaves') >= 0) { sideC = tintedTile(sideName, 1); frontC = sideC; }
    var leftD = darkened(frontC, 0.66), rightD = darkened(sideC, 0.82);
    x.imageSmoothingEnabled = false;
    // top face
    x.setTransform(11 / 16, 5.5 / 16, -11 / 16, 5.5 / 16, 24, 4);
    x.drawImage(topC, 0, 0);
    // left face
    x.setTransform(11 / 16, 5.5 / 16, 0, 13 / 16, 13, 9.5 + 5.5);
    x.drawImage(leftD, 0, 0);
    // right face
    x.setTransform(11 / 16, -5.5 / 16, 0, 13 / 16, 24, 15 + 5.5);
    x.drawImage(rightD, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- GUI small icons (heart/food/bubble) ----------
  var guiCache = null;
  function gui() {
    if (guiCache) return guiCache;
    function spr(fn) {
      var c = document.createElement('canvas');
      c.width = 9; c.height = 9;
      var x = c.getContext('2d');
      fn(function (px, py, col) { x.fillStyle = col; x.fillRect(px, py, 1, 1); });
      return c.toDataURL();
    }
    function heart(p, main, hi) {
      var m = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
      for (var y = 0; y < m.length; y++) for (var x = 0; x < 7; x++)
        if (m[y][x] === 'x') p(x + 1, y + 1, main);
      if (hi) { p(2, 2, hi); p(3, 2, hi); }
    }
    guiCache = {
      heart: spr(function (p) { heart(p, '#e02020', '#ff6a6a'); }),
      heartHalf: spr(function (p) {
        heart(p, '#3a3a3a', null);
        var m = ['.xx....', 'xxxx...', 'xxxx...', '.xxx...', '..xx...', '...x...'];
        for (var y = 0; y < m.length; y++) for (var x = 0; x < 7; x++)
          if (m[y][x] === 'x') p(x + 1, y + 1, '#e02020');
      }),
      heartEmpty: spr(function (p) { heart(p, '#3a3a3a', '#5a5a5a'); }),
      food: spr(function (p) {
        var m = ['....xx.', '...xxxx', '..xxxx.', '.xxxx..', 'xxxx...', 'xxx....', '.x.....'];
        for (var y = 0; y < m.length; y++) for (var x = 0; x < 7; x++)
          if (m[y][x] === 'x') p(x + 1, y + 1, y < 3 ? '#b5651d' : '#d8945c');
      }),
      foodEmpty: spr(function (p) {
        var m = ['....xx.', '...xxxx', '..xxxx.', '.xxxx..', 'xxxx...', 'xxx....', '.x.....'];
        for (var y = 0; y < m.length; y++) for (var x = 0; x < 7; x++)
          if (m[y][x] === 'x') p(x + 1, y + 1, '#3a3a3a');
      }),
      bubble: spr(function (p) {
        var m = ['.xxx.', 'x...x', 'x...x', 'x...x', '.xxx.'];
        for (var y = 0; y < 5; y++) for (var x = 0; x < 5; x++)
          if (m[y][x] === 'x') p(x + 2, y + 2, '#5d86ec');
        p(3, 3, '#aac4ff');
      })
    };
    return guiCache;
  }

  return {
    define: define, paintRegions: paintRegions,
    MODELS: MODELS, SKIN_FOR: SKIN_FOR, boxUV: boxUV,
    iconFor: iconFor, gui: gui
  };
})();
