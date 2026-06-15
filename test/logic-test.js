// Node logic tests: world generation / lighting / fluid / furnace / explosion / save / mesh
'use strict';
var path = require('path');
function load(name) { return require(path.join(__dirname, '..', 'js', name)); }

global.Util = load('util.js');
global.Blocks = load('blocks.js');
global.Light = load('lighting.js');
global.Gen = load('worldgen.js');
global.World = load('world.js');
// Tex stub (mesher only needs uv/idx)
var fakeIdx = {}; var nextFake = 1;
global.Tex = {
  uv: function (i) { return [(i % 32) * 16 / 512, ((i / 32) | 0) * 16 / 512]; },
  idx: function (name) { if (!(name in fakeIdx)) fakeIdx[name] = nextFake++; return fakeIdx[name]; }
};
// Resolve faces (done by Tex.build in the browser)
(function () {
  var BL = global.Blocks.BLOCKS;
  for (var id = 0; id < BL.length; id++) {
    var b = BL[id];
    if (!b) continue;
    var t = b.tex || {};
    var all = t.all !== undefined ? global.Tex.idx(t.all) : undefined;
    var side = t.side !== undefined ? global.Tex.idx(t.side) : all;
    var top = t.top !== undefined ? global.Tex.idx(t.top) : (all !== undefined ? all : side);
    var bottom = t.bottom !== undefined ? global.Tex.idx(t.bottom) : (all !== undefined ? all : side);
    b.faces = [side, side, top, bottom, side, side];
    b.frontTile = t.front !== undefined ? global.Tex.idx(t.front) : side;
  }
})();
global.Mesher = load('mesher.js');

var B = Blocks.B, IT = Blocks.IT;
var failed = 0, passed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function section(s) { console.log('— ' + s); }

// ============ World generation ============
section('World generation');
var w = new World('12345');
for (var cz = -2; cz <= 2; cz++) for (var cx = -2; cx <= 2; cx++) w.ensureColumn(cx, cz);
var col = w.getColumn(0, 0);
assert(col && col.state === 1, 'column generated');
assert(w.getBlock(0, 0, 0) === B.BEDROCK, 'y=0 bedrock');
var foundStone = false, foundSurface = false;
for (var y = 1; y < 127; y++) {
  if (w.getBlock(3, y, 3) === B.STONE) foundStone = true;
}
assert(foundStone, 'has stone');
var h0 = Gen.heightAt(3, 3);
var surf = w.getBlock(3, h0, 3);
assert(surf !== B.AIR, 'surface block not air (h=' + h0 + ' id=' + surf + ')');
// height map consistency
var hm = col.height[3 | (3 << 4)];
var topOpaque = 0;
for (y = 127; y >= 0; y--) {
  var id = col.blocks[3 | (3 << 4) | (y << 8)];
  if (id && Blocks.BLOCKS[id].opacity > 0) { topOpaque = y + 1; break; }
}
assert(hm === topOpaque, 'height map matches blocks (' + hm + ' vs ' + topOpaque + ')');

// ============ Lighting ============
section('Lighting');
// Skylight above the surface is 15
var sx = 5, sz = 5, sh = Gen.heightAt(sx, sz);
assert(w.getSky(sx, sh + 2, sz) === 15, 'skylight above surface=15 (got ' + w.getSky(sx, sh + 2, sz) + ')');
// range check
var lightOK = true;
for (var i = 0; i < 32768; i++) {
  if (col.sky[i] > 15 || col.blk[i] > 15) { lightOK = false; break; }
}
assert(lightOK, 'light values 0..15');
// place a torch in a sealed cave
var tx = 8, tz = 8, ty = 30;
// first carve a 3x3x3 sealed cavity (manually)
for (var dx2 = -1; dx2 <= 1; dx2++) for (var dy2 = -1; dy2 <= 1; dy2++) for (var dz2 = -1; dz2 <= 1; dz2++) {
  w.setBlock(tx + dx2, ty + dy2, tz + dz2, B.AIR);
}
// a floating torch is removed by the support check (MC behavior)
w.setBlock(tx, ty, tz, B.TORCH, 0);
assert(w.getBlock(tx, ty, tz) === B.AIR, 'floating torch drops automatically');
// place it on the cavity floor (stone below)
var fy = ty - 1;
var preBlk = w.getBlk(tx, fy, tz);
w.setBlock(tx, fy, tz, B.TORCH, 0);
assert(w.getBlock(tx, fy, tz) === B.TORCH, 'torch placed successfully');
assert(w.getBlk(tx, fy, tz) === 14, 'torch center brightness 14 (got ' + w.getBlk(tx, fy, tz) + ')');
assert(w.getBlk(tx, fy + 1, tz) === 13, 'brightness above torch 13 (got ' + w.getBlk(tx, fy + 1, tz) + ')');
w.setBlock(tx, fy, tz, B.AIR);
assert(w.getBlk(tx, fy, tz) === preBlk && w.getBlk(tx, fy + 1, tz) <= preBlk + 1, 'brightness restored after torch removed');
// vertical skylight injection when digging
var gx = 2, gz = 2, gh = Gen.heightAt(gx, gz);
var surfId = w.getBlock(gx, gh, gz);
if (surfId !== B.AIR) {
  w.setBlock(gx, gh, gz, B.AIR);
  assert(w.getSky(gx, gh, gz) === 15, 'skylight 15 after digging surface');
  w.setBlock(gx, gh, gz, B.STONE);
  assert(w.getSky(gx, gh - 1, gz) < 15 || Blocks.BLOCKS[w.getBlock(gx, gh - 1, gz)].opacity === 0,
    'below not 15 after covering back');
}

// ============ Mesh ============
section('Mesh');
var mesh = Mesher.buildColumn(w, col);
assert(mesh.o && mesh.o.count > 0, 'opaque mesh not empty (' + (mesh.o ? mesh.o.count : 0) + ' idx)');
assert(mesh.o.pos.length / 3 === mesh.o.uv.length / 2, 'vertex count matches');
assert(mesh.o.count % 6 === 0, 'index count is a multiple of 6');
assert(mesh.o.light.length / 2 === mesh.o.pos.length / 3, 'light data aligned');

// ============ Recipe data ============
section('Recipe/item data');
assert(Blocks.RECIPES.length > 40, 'recipe count ' + Blocks.RECIPES.length);
assert(Blocks.SMELT[B.ORE_IRON].id === IT.IRON_INGOT, 'iron ore smelting');
assert(Blocks.fuelOf(IT.COAL) === 1600, 'coal burn value');
assert(Blocks.stackMax(IT.PICK_IRON) === 1, 'tools not stackable');
assert(Blocks.stackMax(B.STONE) === 64, 'blocks stack to 64');
assert(Blocks.toolOf(IT.PICK_DIAMOND).tier === 3, 'diamond pickaxe tier 3');
assert(Blocks.foodOf(IT.BREAD).pts === 5, 'bread food value');
var nameOK = true;
for (var bid = 1; bid < 60; bid++) {
  if (Blocks.BLOCKS[bid] && !Blocks.BLOCKS[bid].name) nameOK = false;
}
assert(nameOK, 'all blocks have names');

// ============ Save RLE ============
section('Save serialization');
var ser = w.serializeColumn(col);
var col2 = { blocks: new Uint8Array(32768), meta: new Uint8Array(32768), blockEntities: new Map() };
w.deserializeColumn(col2, JSON.parse(JSON.stringify(ser)));
var same = true;
for (i = 0; i < 32768; i++) {
  if (col.blocks[i] !== col2.blocks[i] || col.meta[i] !== col2.meta[i]) { same = false; break; }
}
assert(same, 'RLE round-trip consistent');

// ============ Fluid ============
section('Fluid');
// elevated 11x11 stone platform + walls, water source in center
var py = 100, pcx = 4, pcz = 4;
for (dx2 = -5; dx2 <= 5; dx2++) for (dz2 = -5; dz2 <= 5; dz2++) {
  w.setBlock(pcx + dx2, py, pcz + dz2, B.STONE);
}
w.setBlock(pcx, py + 1, pcz, B.WATER, 0);
var active = new Set();
w.columns.forEach(function (c, k) { active.add(k); });
for (i = 0; i < 200; i++) w.tick(active, function () { return 0.99; }); // rng does not trigger random-tick changes
assert(w.getBlock(pcx + 1, py + 1, pcz) === B.WATER, 'water spreads sideways');
assert(w.getMeta(pcx + 1, py + 1, pcz) === 1, 'spread level 1 (got ' + w.getMeta(pcx + 1, py + 1, pcz) + ')');
assert(w.getBlock(pcx + 4, py + 1, pcz) === B.WATER, 'water spreads 4 blocks');
assert(w.getBlock(pcx + 5, py + 1, pcz + 5) !== B.WATER, 'no water beyond 9 diagonal blocks');
// infinite water source: two sources one block apart
for (dx2 = -5; dx2 <= 5; dx2++) for (dz2 = -5; dz2 <= 5; dz2++) {
  if (w.getBlock(pcx + dx2, py + 1, pcz + dz2) === B.WATER) w.setBlock(pcx + dx2, py + 1, pcz + dz2, B.AIR);
}
w.setBlock(pcx - 1, py + 1, pcz, B.WATER, 0);
w.setBlock(pcx + 1, py + 1, pcz, B.WATER, 0);
for (i = 0; i < 60; i++) w.tick(active, function () { return 0.99; });
assert(w.getBlock(pcx, py + 1, pcz) === B.WATER && w.getMeta(pcx, py + 1, pcz) === 0, 'infinite water source forms');
// water + lava -> obsidian
w.setBlock(pcx, py + 3, pcz + 3, B.LAVA, 0);
w.setBlock(pcx, py + 3, pcz + 2, B.WATER, 0);
for (i = 0; i < 80; i++) w.tick(active, function () { return 0.99; });
var converted = w.getBlock(pcx, py + 3, pcz + 3);
assert(converted === B.OBSIDIAN || converted === B.COBBLE, 'lava solidifies on contact with water (got ' + converted + ')');

// ============ Furnace ============
section('Furnace');
w.setBlock(10, py + 1, 10, B.FURNACE, 0);
var be = w.getBE(10, py + 1, 10);
assert(be && be.type === 'furnace', 'furnace block entity');
be.items[0] = { id: B.ORE_IRON, n: 2 };
be.items[1] = { id: IT.COAL, n: 1 };
for (i = 0; i < 250; i++) w.tick(active, function () { return 0.99; });
assert(be.items[2] && be.items[2].id === IT.IRON_INGOT, 'smelts iron ingot');
assert(w.getBlock(10, py + 1, 10) === B.FURNACE_LIT, 'furnace lit state');
assert(w.getBlk(10, py + 2, 10) > 0, 'lit furnace emits light');

// ============ Explosion ============
section('Explosion');
w.ensureColumn(-2, -2);
var ex = -20, ez = -20, eh = 0;
// find a solid surface block (avoid cave entrances)
outer:
for (var sx2 = -24; sx2 <= -17; sx2++) for (var sz3 = -24; sz3 <= -17; sz3++) {
  var hh2 = Gen.heightAt(sx2, sz3);
  if (w.getBlock(sx2, hh2, sz3) !== B.AIR && w.getBlock(sx2, hh2 - 1, sz3) !== B.AIR) {
    ex = sx2; ez = sz3; eh = hh2;
    break outer;
  }
}
var preId = w.getBlock(ex, eh, ez);
assert(preId !== B.AIR, 'explosion center not empty');
var destroyed = w.explode(ex + 0.5, eh + 0.5, ez + 0.5, 4);
assert(destroyed > 10, 'explosion destroys blocks (' + destroyed + ')');
assert(w.getBlock(ex, eh, ez) === B.AIR, 'explosion center becomes air');
assert(w.getBlock(ex, 0, ez) === B.BEDROCK, 'bedrock not destroyed');
// crater lighting refreshed (no leftover 0xFF and the like)
var crater = w.getSky(ex, eh, ez);
assert(crater >= 0 && crater <= 15, 'crater lighting refreshed (' + crater + ')');

// ============ Random tick behavior ============
section('Random tick');
// grass smothered when covered
var gx2 = 12, gz2 = 12, gh2 = Gen.heightAt(gx2, gz2);
if (w.getBlock(gx2, gh2, gz2) !== B.GRASS) w.setBlock(gx2, gh2, gz2, B.GRASS);
w.setBlock(gx2, gh2 + 1, gz2, B.STONE);
var targetIdx = (gx2 & 15) | ((gz2 & 15) << 4) | (gh2 << 8);
var col3 = w.getColumnAt(gx2, gz2);
w.randomTickColumn(col3, function () { return targetIdx / 32768; });
assert(w.getBlock(gx2, gh2, gz2) === B.DIRT, 'covered grass turns to dirt');
w.setBlock(gx2, gh2 + 1, gz2, B.AIR);
// wheat growth
w.setBlock(13, py + 1, 13, B.FARMLAND);
w.setBlock(13, py + 2, 13, B.WHEAT, 0);
var col4 = w.getColumnAt(13, 13);
var wIdx = (13 & 15) | ((13 & 15) << 4) | ((py + 2) << 8);
var rngSeq = [wIdx / 32768, 0.1, wIdx / 32768, 0.1, wIdx / 32768, 0.1];
var ri = 0;
for (i = 0; i < 3; i++) w.randomTickColumn(col4, function () { return rngSeq[(ri++) % rngSeq.length]; });
assert(w.getMeta(13, py + 2, 13) > 0, 'wheat grows (stage ' + w.getMeta(13, py + 2, 13) + ')');
// sapling grows into tree (enough light: open elevated platform)
w.setBlock(6, py + 1, 6, B.DIRT);
w.setBlock(6, py + 2, 6, B.SAPLING_OAK);
var col5 = w.getColumnAt(6, 6);
var sIdx = (6 & 15) | ((6 & 15) << 4) | ((py + 2) << 8);
var ri2 = 0;
var seq2 = [sIdx / 32768, 0.01, 0.5, 0.5, 0.5, 0.5, 0.5];
for (i = 0; i < 3 && w.getBlock(6, py + 2, 6) === B.SAPLING_OAK; i++) {
  w.randomTickColumn(col5, function () { return seq2[(ri2++) % seq2.length]; });
}
assert(w.getBlock(6, py + 2, 6) === B.LOG_OAK, 'sapling grows into tree (got ' + w.getBlock(6, py + 2, 6) + ')');

// ============ Raycast ============
section('Raycast');
var rh = Gen.heightAt(0, 0);
var hit = w.raycast(0.5, rh + 3, 0.5, 0, -1, 0, 10, false);
assert(hit && hit.y === rh, 'downward ray hits surface (y=' + (hit && hit.y) + ' expect ' + rh + ')');
assert(hit.fy === 1, 'hits top face');
var miss = w.raycast(0.5, rh + 3, 0.5, 0, 1, 0, 10, false);
assert(miss === null || miss.y > rh, 'upward ray does not hit ground');

// ============ Gravity blocks ============
section('Gravity blocks');
var fell = [];
w.hooks.fall = function (x, y, z, id) { fell.push([x, y, z, id]); };
w.setBlock(14, py + 3, 14, B.SAND);
w.setBlock(14, py + 2, 14, B.STONE);
w.setBlock(14, py + 2, 14, B.AIR); // remove support -> triggers blockUpdate
assert(fell.length === 1 && fell[0][3] === B.SAND, 'sand falls when it loses support');

console.log('\nPassed ' + passed + ' / ' + (passed + failed));
process.exit(failed ? 1 : 0);
