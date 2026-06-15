// ============ blocks.js — block/item/recipe/smelting/fuel registry ============
'use strict';
var Blocks = (function () {

  // ---------- block ID ----------
  var B = {
    AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, PLANKS_OAK: 5, SAPLING_OAK: 6,
    BEDROCK: 7, WATER: 8, LAVA: 9, SAND: 10, GRAVEL: 11, ORE_GOLD: 12, ORE_IRON: 13,
    ORE_COAL: 14, LOG_OAK: 15, LEAVES_OAK: 16, GLASS: 17, SANDSTONE: 18,
    LOG_BIRCH: 19, LEAVES_BIRCH: 20, PLANKS_BIRCH: 21,
    LOG_SPRUCE: 22, LEAVES_SPRUCE: 23, PLANKS_SPRUCE: 24,
    WOOL: 25, DANDELION: 26, POPPY: 27, MUSHROOM_BROWN: 28, MUSHROOM_RED: 29,
    BLOCK_GOLD: 30, BLOCK_IRON: 31, BLOCK_DIAMOND: 32, TNT: 33, OBSIDIAN: 34,
    TORCH: 35, CHEST: 36, ORE_DIAMOND: 37, CRAFTING_TABLE: 38, FARMLAND: 39,
    FURNACE: 40, LADDER: 41, SNOW_LAYER: 42, ICE: 43, SNOW_BLOCK: 44, CACTUS: 45,
    STONE_BRICKS: 46, WHEAT: 47, TALL_GRASS: 48, DEAD_BUSH: 49, PUMPKIN: 50,
    JACK_O_LANTERN: 51, SNOWY_GRASS: 52, SAPLING_BIRCH: 53, SAPLING_SPRUCE: 54,
    MOSSY_COBBLE: 55, FURNACE_LIT: 56
  };

  // ---------- item ID (>=100) ----------
  var IT = {
    STICK: 100, COAL: 101, CHARCOAL: 102, IRON_INGOT: 103, GOLD_INGOT: 104,
    DIAMOND: 105, FLINT: 106, SEEDS: 107, WHEAT: 108, BREAD: 109, APPLE: 110,
    PORK_RAW: 111, PORK_COOKED: 112, BEEF_RAW: 113, BEEF_COOKED: 114,
    MUTTON_RAW: 115, MUTTON_COOKED: 116, ROTTEN_FLESH: 117, GUNPOWDER: 118,
    LEATHER: 119, SNOWBALL: 120, BUCKET: 121, BUCKET_WATER: 122, BUCKET_LAVA: 123,
    FLINT_STEEL: 124,
    PICK_WOOD: 130, AXE_WOOD: 131, SHOVEL_WOOD: 132, HOE_WOOD: 133, SWORD_WOOD: 134,
    PICK_STONE: 135, AXE_STONE: 136, SHOVEL_STONE: 137, HOE_STONE: 138, SWORD_STONE: 139,
    PICK_IRON: 140, AXE_IRON: 141, SHOVEL_IRON: 142, HOE_IRON: 143, SWORD_IRON: 144,
    PICK_GOLD: 145, AXE_GOLD: 146, SHOVEL_GOLD: 147, HOE_GOLD: 148, SWORD_GOLD: 149,
    PICK_DIAMOND: 150, AXE_DIAMOND: 151, SHOVEL_DIAMOND: 152, HOE_DIAMOND: 153, SWORD_DIAMOND: 154
  };

  // ---------- block specs ----------
  // defaults: solid=true opaque=true opacity=15 hard=1 tool=null tier=0 light=0
  //         render='cube' sound='stone' drops=itself
  var BLOCKS = [];
  function def(id, spec) {
    var b = {
      id: id, name: spec.name, tex: spec.tex || { all: 'stone' },
      solid: spec.solid !== undefined ? spec.solid : true,
      opaque: spec.opaque !== undefined ? spec.opaque : true,
      opacity: spec.opacity !== undefined ? spec.opacity : 15,
      hard: spec.hard !== undefined ? spec.hard : 1,
      tool: spec.tool || null,           // valid tool type
      tier: spec.tier || 0,              // tool tier required to drop (pairs with tool)
      needTool: spec.needTool || false,  // true: no drop without the matching tool
      drops: spec.drops || null,         // fn(meta, rng) => [{id,n}] ; null=drops itself
      light: spec.light || 0,
      render: spec.render || 'cube',
      sound: spec.sound || 'stone',
      tint: spec.tint || 0,              // 1=tinted by biome
      cutout: spec.cutout || false,      // cutout texture (leaves/plants)
      transp: spec.transp || false,      // translucent pass (water/ice/glass)
      gravity: spec.gravity || false,
      climb: spec.climb || false,
      replaceable: spec.replaceable || false, // replaceable when placing a block (grass/flower/water)
      box: spec.box !== undefined ? spec.box : null, // null default: solid?full box:none
      resist: spec.resist !== undefined ? spec.resist : (spec.hard || 1), // blast resistance
      facing: spec.facing || false       // record facing meta when placed (0-3)
    };
    BLOCKS[id] = b;
  }

  def(B.AIR, { name: 'Air', solid: false, opaque: false, opacity: 0, render: 'none', hard: 0 });
  def(B.STONE, { name: 'Stone', tex: { all: 'stone' }, hard: 1.5, tool: 'pick', needTool: true, resist: 6,
    drops: function () { return [{ id: B.COBBLE, n: 1 }]; } });
  def(B.GRASS, { name: 'Grass Block', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
    hard: 0.6, tool: 'shovel', sound: 'grass', tint: 1,
    drops: function () { return [{ id: B.DIRT, n: 1 }]; } });
  def(B.DIRT, { name: 'Dirt', tex: { all: 'dirt' }, hard: 0.5, tool: 'shovel', sound: 'gravel' });
  def(B.COBBLE, { name: 'Cobblestone', tex: { all: 'cobble' }, hard: 2, tool: 'pick', needTool: true, resist: 6 });
  def(B.PLANKS_OAK, { name: 'Oak Planks', tex: { all: 'planks_oak' }, hard: 2, tool: 'axe', sound: 'wood', resist: 3 });
  def(B.SAPLING_OAK, { name: 'Oak Sapling', tex: { all: 'sapling_oak' }, solid: false, opaque: false, opacity: 0,
    hard: 0, render: 'cross', sound: 'grass', cutout: true, replaceable: false });
  def(B.BEDROCK, { name: 'Bedrock', tex: { all: 'bedrock' }, hard: -1, resist: 99999 });
  def(B.WATER, { name: 'Water', tex: { all: 'water' }, solid: false, opaque: false, opacity: 2, hard: -1,
    render: 'liquid', transp: true, replaceable: true, resist: 100 });
  def(B.LAVA, { name: 'Lava', tex: { all: 'lava' }, solid: false, opaque: false, opacity: 0, hard: -1,
    render: 'liquid', light: 15, transp: true, replaceable: true, resist: 100 });
  def(B.SAND, { name: 'Sand', tex: { all: 'sand' }, hard: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
  def(B.GRAVEL, { name: 'Gravel', tex: { all: 'gravel' }, hard: 0.6, tool: 'shovel', sound: 'gravel', gravity: true,
    drops: function (meta, rng) { return [{ id: rng() < 0.1 ? IT.FLINT : B.GRAVEL, n: 1 }]; } });
  def(B.ORE_GOLD, { name: 'Gold Ore', tex: { all: 'ore_gold' }, hard: 3, tool: 'pick', tier: 2, needTool: true, resist: 6 });
  def(B.ORE_IRON, { name: 'Iron Ore', tex: { all: 'ore_iron' }, hard: 3, tool: 'pick', tier: 1, needTool: true, resist: 6 });
  def(B.ORE_COAL, { name: 'Coal Ore', tex: { all: 'ore_coal' }, hard: 3, tool: 'pick', needTool: true, resist: 6,
    drops: function () { return [{ id: IT.COAL, n: 1 }]; } });
  def(B.LOG_OAK, { name: 'Oak Log', tex: { top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_oak' },
    hard: 2, tool: 'axe', sound: 'wood', resist: 3 });
  def(B.LEAVES_OAK, { name: 'Oak Leaves', tex: { all: 'leaves_oak' }, opaque: false, opacity: 1, hard: 0.2,
    sound: 'grass', tint: 1, cutout: true, resist: 0.2,
    drops: function (meta, rng) {
      var r = rng();
      if (r < 0.05) return [{ id: B.SAPLING_OAK, n: 1 }];
      if (r < 0.055) return [{ id: IT.APPLE, n: 1 }];
      return [];
    } });
  def(B.GLASS, { name: 'Glass', tex: { all: 'glass' }, opaque: false, opacity: 0, hard: 0.3, sound: 'glass',
    cutout: true, drops: function () { return []; } });
  def(B.SANDSTONE, { name: 'Sandstone', tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' },
    hard: 0.8, tool: 'pick', needTool: true });
  def(B.LOG_BIRCH, { name: 'Birch Log', tex: { top: 'log_birch_top', bottom: 'log_birch_top', side: 'log_birch' },
    hard: 2, tool: 'axe', sound: 'wood', resist: 3 });
  def(B.LEAVES_BIRCH, { name: 'Birch Leaves', tex: { all: 'leaves_birch' }, opaque: false, opacity: 1, hard: 0.2,
    sound: 'grass', tint: 1, cutout: true, resist: 0.2,
    drops: function (meta, rng) { return rng() < 0.05 ? [{ id: B.SAPLING_BIRCH, n: 1 }] : []; } });
  def(B.PLANKS_BIRCH, { name: 'Birch Planks', tex: { all: 'planks_birch' }, hard: 2, tool: 'axe', sound: 'wood', resist: 3 });
  def(B.LOG_SPRUCE, { name: 'Spruce Log', tex: { top: 'log_spruce_top', bottom: 'log_spruce_top', side: 'log_spruce' },
    hard: 2, tool: 'axe', sound: 'wood', resist: 3 });
  def(B.LEAVES_SPRUCE, { name: 'Spruce Leaves', tex: { all: 'leaves_spruce' }, opaque: false, opacity: 1, hard: 0.2,
    sound: 'grass', tint: 1, cutout: true, resist: 0.2,
    drops: function (meta, rng) { return rng() < 0.05 ? [{ id: B.SAPLING_SPRUCE, n: 1 }] : []; } });
  def(B.PLANKS_SPRUCE, { name: 'Spruce Planks', tex: { all: 'planks_spruce' }, hard: 2, tool: 'axe', sound: 'wood', resist: 3 });
  def(B.WOOL, { name: 'Wool', tex: { all: 'wool' }, hard: 0.8, sound: 'cloth' });
  def(B.DANDELION, { name: 'Dandelion', tex: { all: 'dandelion' }, solid: false, opaque: false, opacity: 0, hard: 0,
    render: 'cross', sound: 'grass', cutout: true });
  def(B.POPPY, { name: 'Poppy', tex: { all: 'poppy' }, solid: false, opaque: false, opacity: 0, hard: 0,
    render: 'cross', sound: 'grass', cutout: true });
  def(B.MUSHROOM_BROWN, { name: 'Brown Mushroom', tex: { all: 'mushroom_brown' }, solid: false, opaque: false, opacity: 0,
    hard: 0, render: 'cross', sound: 'grass', cutout: true });
  def(B.MUSHROOM_RED, { name: 'Red Mushroom', tex: { all: 'mushroom_red' }, solid: false, opaque: false, opacity: 0,
    hard: 0, render: 'cross', sound: 'grass', cutout: true });
  def(B.BLOCK_GOLD, { name: 'Gold Block', tex: { all: 'block_gold' }, hard: 3, tool: 'pick', tier: 2, needTool: true, resist: 6 });
  def(B.BLOCK_IRON, { name: 'Iron Block', tex: { all: 'block_iron' }, hard: 5, tool: 'pick', tier: 1, needTool: true, resist: 6 });
  def(B.BLOCK_DIAMOND, { name: 'Diamond Block', tex: { all: 'block_diamond' }, hard: 5, tool: 'pick', tier: 2, needTool: true, resist: 6 });
  def(B.TNT, { name: 'TNT', tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hard: 0,
    sound: 'grass', resist: 0 });
  def(B.OBSIDIAN, { name: 'Obsidian', tex: { all: 'obsidian' }, hard: 50, tool: 'pick', tier: 3, needTool: true, resist: 99999 });
  def(B.TORCH, { name: 'Torch', tex: { all: 'torch' }, solid: false, opaque: false, opacity: 0, hard: 0,
    render: 'torch', sound: 'wood', light: 14, cutout: true });
  def(B.CHEST, { name: 'Chest', tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' },
    hard: 2.5, tool: 'axe', sound: 'wood', facing: true, resist: 3 });
  def(B.ORE_DIAMOND, { name: 'Diamond Ore', tex: { all: 'ore_diamond' }, hard: 3, tool: 'pick', tier: 2, needTool: true, resist: 6,
    drops: function () { return [{ id: IT.DIAMOND, n: 1 }]; } });
  def(B.CRAFTING_TABLE, { name: 'Crafting Table', tex: { top: 'table_top', bottom: 'planks_oak', side: 'table_side', front: 'table_front' },
    hard: 2.5, tool: 'axe', sound: 'wood', resist: 3 });
  def(B.FARMLAND, { name: 'Farmland', tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' }, hard: 0.6,
    tool: 'shovel', sound: 'gravel', drops: function () { return [{ id: B.DIRT, n: 1 }]; } });
  def(B.FURNACE, { name: 'Furnace', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' },
    hard: 3.5, tool: 'pick', needTool: true, facing: true, resist: 6 });
  def(B.LADDER, { name: 'Ladder', tex: { all: 'ladder' }, solid: false, opaque: false, opacity: 0, hard: 0.4,
    render: 'ladder', sound: 'wood', climb: true, cutout: true });
  def(B.SNOW_LAYER, { name: 'Snow', tex: { all: 'snow' }, opaque: false, opacity: 0, hard: 0.1, tool: 'shovel',
    sound: 'snow', render: 'snow', box: [0, 0, 0, 1, 0.125, 1], replaceable: true,
    drops: function () { return [{ id: IT.SNOWBALL, n: 1 }]; } });
  def(B.ICE, { name: 'Ice', tex: { all: 'ice' }, opaque: false, opacity: 2, hard: 0.5, tool: 'pick',
    sound: 'glass', transp: true, drops: function () { return []; } });
  def(B.SNOW_BLOCK, { name: 'Snow Block', tex: { all: 'snow' }, hard: 0.2, tool: 'shovel', sound: 'snow',
    drops: function () { return [{ id: IT.SNOWBALL, n: 4 }]; } });
  def(B.CACTUS, { name: 'Cactus', tex: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' },
    opaque: false, opacity: 0, hard: 0.4, sound: 'cloth', render: 'cactus' });
  def(B.STONE_BRICKS, { name: 'Stone Bricks', tex: { all: 'stone_bricks' }, hard: 1.5, tool: 'pick', needTool: true, resist: 6 });
  def(B.WHEAT, { name: 'Wheat', tex: { all: 'wheat_0' }, solid: false, opaque: false, opacity: 0, hard: 0,
    render: 'crop', sound: 'grass', cutout: true,
    drops: function (meta, rng) {
      if (meta >= 7) {
        var d = [{ id: IT.WHEAT, n: 1 }];
        var s = (rng() * 3) | 0; if (s > 0) d.push({ id: IT.SEEDS, n: s });
        return d;
      }
      return [{ id: IT.SEEDS, n: 1 }];
    } });
  def(B.TALL_GRASS, { name: 'Grass', tex: { all: 'tall_grass' }, solid: false, opaque: false, opacity: 0, hard: 0,
    render: 'cross', sound: 'grass', tint: 1, cutout: true, replaceable: true,
    drops: function (meta, rng) { return rng() < 0.25 ? [{ id: IT.SEEDS, n: 1 }] : []; } });
  def(B.DEAD_BUSH, { name: 'Dead Bush', tex: { all: 'dead_bush' }, solid: false, opaque: false, opacity: 0, hard: 0,
    render: 'cross', sound: 'grass', cutout: true, replaceable: true,
    drops: function (meta, rng) { var n = (rng() * 3) | 0; return n ? [{ id: IT.STICK, n: n }] : []; } });
  def(B.PUMPKIN, { name: 'Pumpkin', tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_face' },
    hard: 1, tool: 'axe', sound: 'wood', facing: true });
  def(B.JACK_O_LANTERN, { name: 'Jack o\'Lantern', tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_lit' },
    hard: 1, tool: 'axe', sound: 'wood', light: 15, facing: true });
  def(B.SNOWY_GRASS, { name: 'Snowy Grass Block', tex: { top: 'snow', bottom: 'dirt', side: 'grass_side_snow' },
    hard: 0.6, tool: 'shovel', sound: 'grass',
    drops: function () { return [{ id: B.DIRT, n: 1 }]; } });
  def(B.SAPLING_BIRCH, { name: 'Birch Sapling', tex: { all: 'sapling_birch' }, solid: false, opaque: false, opacity: 0,
    hard: 0, render: 'cross', sound: 'grass', cutout: true });
  def(B.SAPLING_SPRUCE, { name: 'Spruce Sapling', tex: { all: 'sapling_spruce' }, solid: false, opaque: false, opacity: 0,
    hard: 0, render: 'cross', sound: 'grass', cutout: true });
  def(B.MOSSY_COBBLE, { name: 'Mossy Cobblestone', tex: { all: 'mossy_cobble' }, hard: 2, tool: 'pick', needTool: true, resist: 6 });
  def(B.FURNACE_LIT, { name: 'Furnace', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_lit' },
    hard: 3.5, tool: 'pick', needTool: true, facing: true, light: 13, resist: 6,
    drops: function () { return [{ id: B.FURNACE, n: 1 }]; } });

  // ---------- tools ----------
  var TOOL_MATS = {
    wood:    { tier: 0, speed: 2,  dur: 60,   swordDmg: 4, axeDmg: 3 },
    stone:   { tier: 1, speed: 4,  dur: 132,  swordDmg: 5, axeDmg: 4 },
    iron:    { tier: 2, speed: 6,  dur: 251,  swordDmg: 6, axeDmg: 5 },
    gold:    { tier: 0, speed: 12, dur: 33,   swordDmg: 4, axeDmg: 3 },
    diamond: { tier: 3, speed: 8,  dur: 1562, swordDmg: 7, axeDmg: 6 }
  };
  var MAT_NAMES = { wood: 'Wooden', stone: 'Stone', iron: 'Iron', gold: 'Golden', diamond: 'Diamond' };
  var TOOL_KINDS = [
    { key: 'PICK', type: 'pick', name: 'Pickaxe', dmg: 2 },
    { key: 'AXE', type: 'axe', name: 'Axe', dmg: 0 },     // dmg uses axeDmg
    { key: 'SHOVEL', type: 'shovel', name: 'Shovel', dmg: 2 },
    { key: 'HOE', type: 'hoe', name: 'Hoe', dmg: 1 },
    { key: 'SWORD', type: 'sword', name: 'Sword', dmg: 0 }  // dmg uses swordDmg
  ];

  // ---------- item specs ----------
  var ITEMS = {};
  function defItem(id, spec) { spec.id = id; ITEMS[id] = spec; }
  defItem(IT.STICK, { name: 'Stick', tile: 'item_stick', fuel: 100 });
  defItem(IT.COAL, { name: 'Coal', tile: 'item_coal', fuel: 1600 });
  defItem(IT.CHARCOAL, { name: 'Charcoal', tile: 'item_charcoal', fuel: 1600 });
  defItem(IT.IRON_INGOT, { name: 'Iron Ingot', tile: 'item_iron_ingot' });
  defItem(IT.GOLD_INGOT, { name: 'Gold Ingot', tile: 'item_gold_ingot' });
  defItem(IT.DIAMOND, { name: 'Diamond', tile: 'item_diamond' });
  defItem(IT.FLINT, { name: 'Flint', tile: 'item_flint' });
  defItem(IT.SEEDS, { name: 'Wheat Seeds', tile: 'item_seeds', plant: B.WHEAT });
  defItem(IT.WHEAT, { name: 'Wheat', tile: 'item_wheat' });
  defItem(IT.BREAD, { name: 'Bread', tile: 'item_bread', food: { pts: 5, sat: 6 } });
  defItem(IT.APPLE, { name: 'Apple', tile: 'item_apple', food: { pts: 4, sat: 2.4 } });
  defItem(IT.PORK_RAW, { name: 'Raw Porkchop', tile: 'item_pork_raw', food: { pts: 3, sat: 1.8 } });
  defItem(IT.PORK_COOKED, { name: 'Cooked Porkchop', tile: 'item_pork_cooked', food: { pts: 8, sat: 12.8 } });
  defItem(IT.BEEF_RAW, { name: 'Raw Beef', tile: 'item_beef_raw', food: { pts: 3, sat: 1.8 } });
  defItem(IT.BEEF_COOKED, { name: 'Steak', tile: 'item_beef_cooked', food: { pts: 8, sat: 12.8 } });
  defItem(IT.MUTTON_RAW, { name: 'Raw Mutton', tile: 'item_mutton_raw', food: { pts: 2, sat: 1.2 } });
  defItem(IT.MUTTON_COOKED, { name: 'Cooked Mutton', tile: 'item_mutton_cooked', food: { pts: 6, sat: 9.6 } });
  defItem(IT.ROTTEN_FLESH, { name: 'Rotten Flesh', tile: 'item_rotten_flesh', food: { pts: 4, sat: 0.8, bad: 0.8 } });
  defItem(IT.GUNPOWDER, { name: 'Gunpowder', tile: 'item_gunpowder' });
  defItem(IT.LEATHER, { name: 'Leather', tile: 'item_leather' });
  defItem(IT.SNOWBALL, { name: 'Snowball', tile: 'item_snowball', stack: 16 });
  defItem(IT.BUCKET, { name: 'Bucket', tile: 'item_bucket', stack: 1 });
  defItem(IT.BUCKET_WATER, { name: 'Water Bucket', tile: 'item_bucket_water', stack: 1 });
  defItem(IT.BUCKET_LAVA, { name: 'Lava Bucket', tile: 'item_bucket_lava', stack: 1, fuel: 20000, fuelLeft: IT.BUCKET });
  defItem(IT.FLINT_STEEL, { name: 'Flint and Steel', tile: 'item_flint_steel', stack: 1, tool: { type: 'igniter', tier: 0, speed: 1, dur: 64, dmg: 1 } });
  // generate the 5x5 tool grid
  var matKeys = ['wood', 'stone', 'iron', 'gold', 'diamond'];
  for (var mi = 0; mi < matKeys.length; mi++) {
    var mk = matKeys[mi], mat = TOOL_MATS[mk];
    for (var ki = 0; ki < TOOL_KINDS.length; ki++) {
      var kind = TOOL_KINDS[ki];
      var id = IT[kind.key + '_' + mk.toUpperCase()];
      var dmg = kind.type === 'sword' ? mat.swordDmg : (kind.type === 'axe' ? mat.axeDmg : kind.dmg);
      defItem(id, {
        name: MAT_NAMES[mk] + ' ' + kind.name, tile: 'tool_' + kind.type + '_' + mk, stack: 1,
        tool: { type: kind.type, tier: mat.tier, speed: mat.speed, dur: mat.dur, dmg: dmg, fuel: mk === 'wood' ? 200 : 0 }
      });
    }
  }

  // ---------- generic lookups ----------
  function isBlockItem(id) { return id > 0 && id < 100; }
  function name(id) {
    if (isBlockItem(id)) return BLOCKS[id] ? BLOCKS[id].name : '?';
    return ITEMS[id] ? ITEMS[id].name : '?';
  }
  function stackMax(id) {
    if (isBlockItem(id)) return 64;
    var it = ITEMS[id];
    if (!it) return 64;
    if (it.tool) return 1;
    return it.stack || 64;
  }
  function toolOf(id) { var it = ITEMS[id]; return it && it.tool ? it.tool : null; }
  function foodOf(id) { var it = ITEMS[id]; return it && it.food ? it.food : null; }
  function fuelOf(id) {
    if (ITEMS[id] && ITEMS[id].fuel) return ITEMS[id].fuel;
    if (isBlockItem(id)) {
      var b = BLOCKS[id];
      if (!b) return 0;
      if (id === B.PLANKS_OAK || id === B.PLANKS_BIRCH || id === B.PLANKS_SPRUCE ||
          id === B.LOG_OAK || id === B.LOG_BIRCH || id === B.LOG_SPRUCE ||
          id === B.CRAFTING_TABLE || id === B.CHEST || id === B.LADDER) return 300;
      if (id === B.SAPLING_OAK || id === B.SAPLING_BIRCH || id === B.SAPLING_SPRUCE) return 100;
    }
    return 0;
  }

  // ---------- crafting recipes ----------
  var PL = [B.PLANKS_OAK, B.PLANKS_BIRCH, B.PLANKS_SPRUCE]; // any planks
  var COALS = [IT.COAL, IT.CHARCOAL];
  var S = IT.STICK, C = B.COBBLE;
  var RECIPES = [];
  function shaped(rows, outId, outN) { RECIPES.push({ shaped: rows, out: { id: outId, n: outN || 1 } }); }
  function shapeless(mix, outId, outN) { RECIPES.push({ mix: mix, out: { id: outId, n: outN || 1 } }); }

  shapeless([B.LOG_OAK], B.PLANKS_OAK, 4);
  shapeless([B.LOG_BIRCH], B.PLANKS_BIRCH, 4);
  shapeless([B.LOG_SPRUCE], B.PLANKS_SPRUCE, 4);
  shaped([[PL], [PL]], IT.STICK, 4);
  shaped([[PL, PL], [PL, PL]], B.CRAFTING_TABLE, 1);
  shaped([[C, C, C], [C, 0, C], [C, C, C]], B.FURNACE, 1);
  shaped([[PL, PL, PL], [PL, 0, PL], [PL, PL, PL]], B.CHEST, 1);
  shaped([[COALS], [S]], B.TORCH, 4);
  shaped([[S, 0, S], [S, S, S], [S, 0, S]], B.LADDER, 3);
  shaped([[IT.WHEAT, IT.WHEAT, IT.WHEAT]], IT.BREAD, 1);
  shaped([[IT.GUNPOWDER, B.SAND, IT.GUNPOWDER], [B.SAND, IT.GUNPOWDER, B.SAND], [IT.GUNPOWDER, B.SAND, IT.GUNPOWDER]], B.TNT, 1);
  shaped([[IT.IRON_INGOT, 0, IT.IRON_INGOT], [0, IT.IRON_INGOT, 0]], IT.BUCKET, 1);
  shapeless([IT.IRON_INGOT, IT.FLINT], IT.FLINT_STEEL, 1);
  shaped([[B.STONE, B.STONE], [B.STONE, B.STONE]], B.STONE_BRICKS, 4);
  shaped([[B.PUMPKIN], [B.TORCH]], B.JACK_O_LANTERN, 1);
  shaped([[IT.SNOWBALL, IT.SNOWBALL], [IT.SNOWBALL, IT.SNOWBALL]], B.SNOW_BLOCK, 1);
  shaped([[B.WOOL, B.WOOL], [B.WOOL, B.WOOL]], B.WOOL, 4); // placeholder/meaningless? removed
  RECIPES.pop();
  // storage blocks
  var nine = function (m) { return [[m, m, m], [m, m, m], [m, m, m]]; };
  shaped(nine(IT.IRON_INGOT), B.BLOCK_IRON, 1);
  shaped(nine(IT.GOLD_INGOT), B.BLOCK_GOLD, 1);
  shaped(nine(IT.DIAMOND), B.BLOCK_DIAMOND, 1);
  shapeless([B.BLOCK_IRON], IT.IRON_INGOT, 9);
  shapeless([B.BLOCK_GOLD], IT.GOLD_INGOT, 9);
  shapeless([B.BLOCK_DIAMOND], IT.DIAMOND, 9);
  // tool recipes
  var TOOL_MAT_ITEM = { wood: PL, stone: C, iron: IT.IRON_INGOT, gold: IT.GOLD_INGOT, diamond: IT.DIAMOND };
  for (mi = 0; mi < matKeys.length; mi++) {
    var mk2 = matKeys[mi], T = TOOL_MAT_ITEM[mk2], U = mk2.toUpperCase();
    shaped([[T, T, T], [0, S, 0], [0, S, 0]], IT['PICK_' + U], 1);
    shaped([[T, T], [T, S], [0, S]], IT['AXE_' + U], 1);
    shaped([[T], [S], [S]], IT['SHOVEL_' + U], 1);
    shaped([[T, T], [0, S], [0, S]], IT['HOE_' + U], 1);
    shaped([[T], [T], [S]], IT['SWORD_' + U], 1);
  }

  // ---------- smelting ----------
  var SMELT = {};
  SMELT[B.COBBLE] = { id: B.STONE, n: 1 };
  SMELT[B.SAND] = { id: B.GLASS, n: 1 };
  SMELT[B.ORE_IRON] = { id: IT.IRON_INGOT, n: 1 };
  SMELT[B.ORE_GOLD] = { id: IT.GOLD_INGOT, n: 1 };
  SMELT[B.LOG_OAK] = { id: IT.CHARCOAL, n: 1 };
  SMELT[B.LOG_BIRCH] = { id: IT.CHARCOAL, n: 1 };
  SMELT[B.LOG_SPRUCE] = { id: IT.CHARCOAL, n: 1 };
  SMELT[IT.PORK_RAW] = { id: IT.PORK_COOKED, n: 1 };
  SMELT[IT.BEEF_RAW] = { id: IT.BEEF_COOKED, n: 1 };
  SMELT[IT.MUTTON_RAW] = { id: IT.MUTTON_COOKED, n: 1 };
  SMELT[B.MOSSY_COBBLE] = { id: B.STONE, n: 1 };

  // ---------- creative inventory ----------
  var CREATIVE = [
    B.STONE, B.COBBLE, B.MOSSY_COBBLE, B.STONE_BRICKS, B.DIRT, B.GRASS, B.SAND, B.SANDSTONE, B.GRAVEL,
    B.LOG_OAK, B.PLANKS_OAK, B.LOG_BIRCH, B.PLANKS_BIRCH, B.LOG_SPRUCE, B.PLANKS_SPRUCE,
    B.LEAVES_OAK, B.LEAVES_BIRCH, B.LEAVES_SPRUCE,
    B.SAPLING_OAK, B.SAPLING_BIRCH, B.SAPLING_SPRUCE,
    B.GLASS, B.WOOL, B.OBSIDIAN, B.BEDROCK, B.ICE, B.SNOW_BLOCK, B.SNOW_LAYER,
    B.ORE_COAL, B.ORE_IRON, B.ORE_GOLD, B.ORE_DIAMOND,
    B.BLOCK_IRON, B.BLOCK_GOLD, B.BLOCK_DIAMOND,
    B.TORCH, B.CRAFTING_TABLE, B.FURNACE, B.CHEST, B.LADDER, B.TNT,
    B.PUMPKIN, B.JACK_O_LANTERN, B.CACTUS, B.DANDELION, B.POPPY,
    B.MUSHROOM_BROWN, B.MUSHROOM_RED, B.TALL_GRASS, B.DEAD_BUSH, B.WATER, B.LAVA,
    IT.STICK, IT.COAL, IT.CHARCOAL, IT.IRON_INGOT, IT.GOLD_INGOT, IT.DIAMOND, IT.FLINT,
    IT.SEEDS, IT.WHEAT, IT.BREAD, IT.APPLE,
    IT.PORK_RAW, IT.PORK_COOKED, IT.BEEF_RAW, IT.BEEF_COOKED, IT.MUTTON_RAW, IT.MUTTON_COOKED,
    IT.ROTTEN_FLESH, IT.GUNPOWDER, IT.LEATHER, IT.SNOWBALL,
    IT.BUCKET, IT.BUCKET_WATER, IT.BUCKET_LAVA, IT.FLINT_STEEL,
    IT.PICK_WOOD, IT.AXE_WOOD, IT.SHOVEL_WOOD, IT.HOE_WOOD, IT.SWORD_WOOD,
    IT.PICK_STONE, IT.AXE_STONE, IT.SHOVEL_STONE, IT.HOE_STONE, IT.SWORD_STONE,
    IT.PICK_IRON, IT.AXE_IRON, IT.SHOVEL_IRON, IT.HOE_IRON, IT.SWORD_IRON,
    IT.PICK_GOLD, IT.AXE_GOLD, IT.SHOVEL_GOLD, IT.HOE_GOLD, IT.SWORD_GOLD,
    IT.PICK_DIAMOND, IT.AXE_DIAMOND, IT.SHOVEL_DIAMOND, IT.HOE_DIAMOND, IT.SWORD_DIAMOND
  ];

  return {
    B: B, IT: IT, BLOCKS: BLOCKS, ITEMS: ITEMS, PL: PL,
    RECIPES: RECIPES, SMELT: SMELT, CREATIVE: CREATIVE,
    isBlockItem: isBlockItem, name: name, stackMax: stackMax,
    toolOf: toolOf, foodOf: foodOf, fuelOf: fuelOf
  };
})();
if (typeof module !== 'undefined') module.exports = Blocks;
