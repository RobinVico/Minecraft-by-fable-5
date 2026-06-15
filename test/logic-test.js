// Node 逻辑测试: 世界生成 / 光照 / 流体 / 熔炉 / 爆炸 / 存档 / 网格
'use strict';
var path = require('path');
function load(name) { return require(path.join(__dirname, '..', 'js', name)); }

global.Util = load('util.js');
global.Blocks = load('blocks.js');
global.Light = load('lighting.js');
global.Gen = load('worldgen.js');
global.World = load('world.js');
// Tex 桩 (mesher 只需 uv/idx)
var fakeIdx = {}; var nextFake = 1;
global.Tex = {
  uv: function (i) { return [(i % 32) * 16 / 512, ((i / 32) | 0) * 16 / 512]; },
  idx: function (name) { if (!(name in fakeIdx)) fakeIdx[name] = nextFake++; return fakeIdx[name]; }
};
// 解析 faces (浏览器中由 Tex.build 完成)
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

// ============ 世界生成 ============
section('世界生成');
var w = new World('12345');
for (var cz = -2; cz <= 2; cz++) for (var cx = -2; cx <= 2; cx++) w.ensureColumn(cx, cz);
var col = w.getColumn(0, 0);
assert(col && col.state === 1, '列已生成');
assert(w.getBlock(0, 0, 0) === B.BEDROCK, 'y=0 基岩');
var foundStone = false, foundSurface = false;
for (var y = 1; y < 127; y++) {
  if (w.getBlock(3, y, 3) === B.STONE) foundStone = true;
}
assert(foundStone, '有石头');
var h0 = Gen.heightAt(3, 3);
var surf = w.getBlock(3, h0, 3);
assert(surf !== B.AIR, '地表方块非空气 (h=' + h0 + ' id=' + surf + ')');
// 高度图一致性
var hm = col.height[3 | (3 << 4)];
var topOpaque = 0;
for (y = 127; y >= 0; y--) {
  var id = col.blocks[3 | (3 << 4) | (y << 8)];
  if (id && Blocks.BLOCKS[id].opacity > 0) { topOpaque = y + 1; break; }
}
assert(hm === topOpaque, '高度图与方块一致 (' + hm + ' vs ' + topOpaque + ')');

// ============ 光照 ============
section('光照');
// 地表上方天光 15
var sx = 5, sz = 5, sh = Gen.heightAt(sx, sz);
assert(w.getSky(sx, sh + 2, sz) === 15, '地表上方天光=15 (got ' + w.getSky(sx, sh + 2, sz) + ')');
// 范围检查
var lightOK = true;
for (var i = 0; i < 32768; i++) {
  if (col.sky[i] > 15 || col.blk[i] > 15) { lightOK = false; break; }
}
assert(lightOK, '光照值 0..15');
// 封闭洞内放火把
var tx = 8, tz = 8, ty = 30;
// 先开一个 3x3x3 封闭腔 (手动)
for (var dx2 = -1; dx2 <= 1; dx2++) for (var dy2 = -1; dy2 <= 1; dy2++) for (var dz2 = -1; dz2 <= 1; dz2++) {
  w.setBlock(tx + dx2, ty + dy2, tz + dz2, B.AIR);
}
// 悬空火把会被支撑检查移除 (MC 行为)
w.setBlock(tx, ty, tz, B.TORCH, 0);
assert(w.getBlock(tx, ty, tz) === B.AIR, '悬空火把自动脱落');
// 放在腔底 (下方是石头)
var fy = ty - 1;
var preBlk = w.getBlk(tx, fy, tz);
w.setBlock(tx, fy, tz, B.TORCH, 0);
assert(w.getBlock(tx, fy, tz) === B.TORCH, '火把放置成功');
assert(w.getBlk(tx, fy, tz) === 14, '火把中心亮度14 (got ' + w.getBlk(tx, fy, tz) + ')');
assert(w.getBlk(tx, fy + 1, tz) === 13, '火把上方亮度13 (got ' + w.getBlk(tx, fy + 1, tz) + ')');
w.setBlock(tx, fy, tz, B.AIR);
assert(w.getBlk(tx, fy, tz) === preBlk && w.getBlk(tx, fy + 1, tz) <= preBlk + 1, '移除火把后亮度恢复');
// 挖洞天光垂直注入
var gx = 2, gz = 2, gh = Gen.heightAt(gx, gz);
var surfId = w.getBlock(gx, gh, gz);
if (surfId !== B.AIR) {
  w.setBlock(gx, gh, gz, B.AIR);
  assert(w.getSky(gx, gh, gz) === 15, '挖开地表后天光15');
  w.setBlock(gx, gh, gz, B.STONE);
  assert(w.getSky(gx, gh - 1, gz) < 15 || Blocks.BLOCKS[w.getBlock(gx, gh - 1, gz)].opacity === 0,
    '盖回后下方非15');
}

// ============ 网格 ============
section('网格');
var mesh = Mesher.buildColumn(w, col);
assert(mesh.o && mesh.o.count > 0, '不透明网格非空 (' + (mesh.o ? mesh.o.count : 0) + ' idx)');
assert(mesh.o.pos.length / 3 === mesh.o.uv.length / 2, '顶点数一致');
assert(mesh.o.count % 6 === 0, '索引数为6的倍数');
assert(mesh.o.light.length / 2 === mesh.o.pos.length / 3, '光照数据对齐');

// ============ 配方数据 ============
section('配方/物品数据');
assert(Blocks.RECIPES.length > 40, '配方数量 ' + Blocks.RECIPES.length);
assert(Blocks.SMELT[B.ORE_IRON].id === IT.IRON_INGOT, '铁矿熔炼');
assert(Blocks.fuelOf(IT.COAL) === 1600, '煤燃烧值');
assert(Blocks.stackMax(IT.PICK_IRON) === 1, '工具不可堆叠');
assert(Blocks.stackMax(B.STONE) === 64, '方块堆64');
assert(Blocks.toolOf(IT.PICK_DIAMOND).tier === 3, '钻镐等级3');
assert(Blocks.foodOf(IT.BREAD).pts === 5, '面包食物值');
var nameOK = true;
for (var bid = 1; bid < 60; bid++) {
  if (Blocks.BLOCKS[bid] && !Blocks.BLOCKS[bid].name) nameOK = false;
}
assert(nameOK, '方块都有名字');

// ============ 存档 RLE ============
section('存档序列化');
var ser = w.serializeColumn(col);
var col2 = { blocks: new Uint8Array(32768), meta: new Uint8Array(32768), blockEntities: new Map() };
w.deserializeColumn(col2, JSON.parse(JSON.stringify(ser)));
var same = true;
for (i = 0; i < 32768; i++) {
  if (col.blocks[i] !== col2.blocks[i] || col.meta[i] !== col2.meta[i]) { same = false; break; }
}
assert(same, 'RLE 往返一致');

// ============ 流体 ============
section('流体');
// 高空石台 11x11 + 围墙, 中心放水源
var py = 100, pcx = 4, pcz = 4;
for (dx2 = -5; dx2 <= 5; dx2++) for (dz2 = -5; dz2 <= 5; dz2++) {
  w.setBlock(pcx + dx2, py, pcz + dz2, B.STONE);
}
w.setBlock(pcx, py + 1, pcz, B.WATER, 0);
var active = new Set();
w.columns.forEach(function (c, k) { active.add(k); });
for (i = 0; i < 200; i++) w.tick(active, function () { return 0.99; }); // rng 不触发随机tick变化
assert(w.getBlock(pcx + 1, py + 1, pcz) === B.WATER, '水向旁扩散');
assert(w.getMeta(pcx + 1, py + 1, pcz) === 1, '扩散等级1 (got ' + w.getMeta(pcx + 1, py + 1, pcz) + ')');
assert(w.getBlock(pcx + 4, py + 1, pcz) === B.WATER, '水扩散4格');
assert(w.getBlock(pcx + 5, py + 1, pcz + 5) !== B.WATER, '对角9格外无水');
// 无限水源: 一格间隔两个源
for (dx2 = -5; dx2 <= 5; dx2++) for (dz2 = -5; dz2 <= 5; dz2++) {
  if (w.getBlock(pcx + dx2, py + 1, pcz + dz2) === B.WATER) w.setBlock(pcx + dx2, py + 1, pcz + dz2, B.AIR);
}
w.setBlock(pcx - 1, py + 1, pcz, B.WATER, 0);
w.setBlock(pcx + 1, py + 1, pcz, B.WATER, 0);
for (i = 0; i < 60; i++) w.tick(active, function () { return 0.99; });
assert(w.getBlock(pcx, py + 1, pcz) === B.WATER && w.getMeta(pcx, py + 1, pcz) === 0, '无限水源生成');
// 水 + 岩浆 → 黑曜石
w.setBlock(pcx, py + 3, pcz + 3, B.LAVA, 0);
w.setBlock(pcx, py + 3, pcz + 2, B.WATER, 0);
for (i = 0; i < 80; i++) w.tick(active, function () { return 0.99; });
var converted = w.getBlock(pcx, py + 3, pcz + 3);
assert(converted === B.OBSIDIAN || converted === B.COBBLE, '岩浆遇水石化 (got ' + converted + ')');

// ============ 熔炉 ============
section('熔炉');
w.setBlock(10, py + 1, 10, B.FURNACE, 0);
var be = w.getBE(10, py + 1, 10);
assert(be && be.type === 'furnace', '熔炉方块实体');
be.items[0] = { id: B.ORE_IRON, n: 2 };
be.items[1] = { id: IT.COAL, n: 1 };
for (i = 0; i < 250; i++) w.tick(active, function () { return 0.99; });
assert(be.items[2] && be.items[2].id === IT.IRON_INGOT, '熔出铁锭');
assert(w.getBlock(10, py + 1, 10) === B.FURNACE_LIT, '熔炉点燃态');
assert(w.getBlk(10, py + 2, 10) > 0, '点燃熔炉发光');

// ============ 爆炸 ============
section('爆炸');
w.ensureColumn(-2, -2);
var ex = -20, ez = -20, eh = 0;
// 找一块实心地表 (避开洞穴入口)
outer:
for (var sx2 = -24; sx2 <= -17; sx2++) for (var sz3 = -24; sz3 <= -17; sz3++) {
  var hh2 = Gen.heightAt(sx2, sz3);
  if (w.getBlock(sx2, hh2, sz3) !== B.AIR && w.getBlock(sx2, hh2 - 1, sz3) !== B.AIR) {
    ex = sx2; ez = sz3; eh = hh2;
    break outer;
  }
}
var preId = w.getBlock(ex, eh, ez);
assert(preId !== B.AIR, '爆心非空');
var destroyed = w.explode(ex + 0.5, eh + 0.5, ez + 0.5, 4);
assert(destroyed > 10, '爆炸摧毁方块 (' + destroyed + ')');
assert(w.getBlock(ex, eh, ez) === B.AIR, '爆心成空气');
assert(w.getBlock(ex, 0, ez) === B.BEDROCK, '基岩不毁');
// 爆坑里光照刷新 (无 0xFF 之类残留)
var crater = w.getSky(ex, eh, ez);
assert(crater >= 0 && crater <= 15, '爆坑光照已刷新 (' + crater + ')');

// ============ 随机 tick 行为 ============
section('随机tick');
// 草被盖死
var gx2 = 12, gz2 = 12, gh2 = Gen.heightAt(gx2, gz2);
if (w.getBlock(gx2, gh2, gz2) !== B.GRASS) w.setBlock(gx2, gh2, gz2, B.GRASS);
w.setBlock(gx2, gh2 + 1, gz2, B.STONE);
var targetIdx = (gx2 & 15) | ((gz2 & 15) << 4) | (gh2 << 8);
var col3 = w.getColumnAt(gx2, gz2);
w.randomTickColumn(col3, function () { return targetIdx / 32768; });
assert(w.getBlock(gx2, gh2, gz2) === B.DIRT, '草被遮盖变泥土');
w.setBlock(gx2, gh2 + 1, gz2, B.AIR);
// 小麦生长
w.setBlock(13, py + 1, 13, B.FARMLAND);
w.setBlock(13, py + 2, 13, B.WHEAT, 0);
var col4 = w.getColumnAt(13, 13);
var wIdx = (13 & 15) | ((13 & 15) << 4) | ((py + 2) << 8);
var rngSeq = [wIdx / 32768, 0.1, wIdx / 32768, 0.1, wIdx / 32768, 0.1];
var ri = 0;
for (i = 0; i < 3; i++) w.randomTickColumn(col4, function () { return rngSeq[(ri++) % rngSeq.length]; });
assert(w.getMeta(13, py + 2, 13) > 0, '小麦生长 (stage ' + w.getMeta(13, py + 2, 13) + ')');
// 树苗长树 (光照足够: 高台露天)
w.setBlock(6, py + 1, 6, B.DIRT);
w.setBlock(6, py + 2, 6, B.SAPLING_OAK);
var col5 = w.getColumnAt(6, 6);
var sIdx = (6 & 15) | ((6 & 15) << 4) | ((py + 2) << 8);
var ri2 = 0;
var seq2 = [sIdx / 32768, 0.01, 0.5, 0.5, 0.5, 0.5, 0.5];
for (i = 0; i < 3 && w.getBlock(6, py + 2, 6) === B.SAPLING_OAK; i++) {
  w.randomTickColumn(col5, function () { return seq2[(ri2++) % seq2.length]; });
}
assert(w.getBlock(6, py + 2, 6) === B.LOG_OAK, '树苗长成树 (got ' + w.getBlock(6, py + 2, 6) + ')');

// ============ 射线 ============
section('射线');
var rh = Gen.heightAt(0, 0);
var hit = w.raycast(0.5, rh + 3, 0.5, 0, -1, 0, 10, false);
assert(hit && hit.y === rh, '向下射线命中地表 (y=' + (hit && hit.y) + ' expect ' + rh + ')');
assert(hit.fy === 1, '命中顶面');
var miss = w.raycast(0.5, rh + 3, 0.5, 0, 1, 0, 10, false);
assert(miss === null || miss.y > rh, '向上射线不命中地面');

// ============ 重力方块 ============
section('重力方块');
var fell = [];
w.hooks.fall = function (x, y, z, id) { fell.push([x, y, z, id]); };
w.setBlock(14, py + 3, 14, B.SAND);
w.setBlock(14, py + 2, 14, B.STONE);
w.setBlock(14, py + 2, 14, B.AIR); // 移走支撑 → blockUpdate 触发
assert(fell.length === 1 && fell[0][3] === B.SAND, '沙子失去支撑下落');

console.log('\n通过 ' + passed + ' / ' + (passed + failed));
process.exit(failed ? 1 : 0);
