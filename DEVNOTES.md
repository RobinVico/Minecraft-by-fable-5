**English** · [中文](DEVNOTES.zh-CN.md)

# MineJS Dev Notes (internal architecture doc)

A browser-based Minecraft clone. Zero dependencies, native WebGL2, classic script tags (not modules, so it opens directly via file://).
Double-click index.html to play. All textures are generated procedurally (canvas pixel art), no external assets.

## Files & load order (the script order in index.html = dependency order)
1. js/util.js      — Util: RNG(mulberry32/hash), Perlin 2D/3D + fBm, mat4, frustum, clamp/lerp
2. js/blocks.js    — B(block id constants), BLOCKS[id] specs, IT(item ids), ITEMS[], RECIPES, SMELT, FUEL, English names
3. js/textures.js  — Tex: 512x512 atlas block textures; tile painter framework; Tex.uv(idx)
4. js/textures2.js — item/tool pixel art, mob skins, cracks, sun & moon, particles, GUI icon dataURLs
5. js/lighting.js  — Light: skylight/block light BFS add & remove, column initialization, region recompute
6. js/worldgen.js  — Gen: biomes/height/caves/ore veins/trees/decorations; cross-chunk trees use a deterministic hash
7. js/world.js     — World: column storage, get/setBlock, tick(fluids/random tick/block entities), explosions, save RLE
8. js/mesher.js    — Mesher.buildColumn(world,col) → {opq, trans} vertex data (AO + smooth lighting)
9. js/render.js    — Render: GL pipeline, chunks/sky/clouds/sun-moon-stars/entities/particles/selection box/cracks/held item
10. js/entities.js — Ent: entity physics, drops, falling blocks, TNT, mobs + AI, spawner
11. js/player.js   — Player: input, movement (walk/run/sneak/swim), mining/placing/attacking, health & hunger
12. js/inventory.js— Inv: slots, recipe matching (shaped/shapeless + mirror), furnace logic
13. js/ui.js       — UI: HUD (health, hunger, oxygen, hotbar), container windows, drag & drop, tooltip
14. js/screens.js  — Screens: title/pause/options/death/F3/achievement toast/multi-world management
15. js/audio.js    — Sfx: WebAudio synthesized sound effects + generative music
16. js/main.js     — Game: main loop, chunk management, 20Hz tick, saving, TEST hooks

## Core conventions
- Coordinates: x east, y up (0..127), z south. Column = 16x16x128. key = cx+","+cz
- In-column index idx = x | (z<<4) | (y<<8)  (x,z:0-15, y:0-127), array length 32768
- column = {cx,cz, blocks:Uint8Array, meta:Uint8Array, sky:Uint8Array, blk:Uint8Array,
  height:Uint8Array(256, highest opaque y+1), state(0 empty/1 generated/2 renderable), dirtyMesh,
  blockEntities:Map<idx,obj>, modified:bool, mesh:{opq,trans}, biomes:Uint8Array(256)}
- World API: getBlock/getMeta/setBlock(x,y,z,id,meta,flags) flags: 1=lighting 2=mesh 4=neighbor update
  getSky/getBlk/getColumn/ensureColumn/raycast(o,d,max)/explode(x,y,z,power)
- setBlock boundary changes must mark adjacent columns (including diagonals, needed for AO) dirtyMesh
- Lighting: two Uint8Arrays (sky, blk) 0..15. Skylight 15 goes straight down with no attenuation. Water opacity 2, leaves 1.
  Night brightness = max(blk, sky*dayFactor), computed in the shader
- Block spec BLOCKS[id]: {name, tex:{all|top,bottom,side,front,...}, solid, opaque, opacity,
  hard(seconds), tool('pick'|'axe'|'shovel'|null), tier(0 wood 1 stone 2 iron 3 diamond, required to drop), drops(meta,toolInfo)=>[],
  light, render('cube'|'cross'|'liquid'|'torch'|'ladder'|'snow'|'crop'|'none'), sound, tint,
  cutout, transp, gravity, climb, box(collision box: null=none / [x0,y0,z0,x1,y1,z1])}
- Item ids: blocks 1..99, items 100+. ITEMS[id]={name,tile,stack,tool:{type,tier,speed,dur,dmg},food:{pts,sat},fuel,burnRes}
- Item stack = {id,n,dur?}
- Entity: {pos:[x,y,z](center of feet), vel, w(half-width), h, yaw, hp, onGround, ...} swept collision per axis
- Main loop: rAF render + accumulator 20Hz world tick; player movement per frame
- Time: t=0..24000 ticks (one day = 20 minutes), daytime 0-12000, sunset 12000-13800, night 13800-22200, sunrise 22200-24000
- Save: localStorage key "minejs:<wid>:meta|col:<cx>,<cz>", column RLE→base64, only modified columns
- Test: URL ?test=1 exposes window.TEST {setTime,tp,look,mine,place,give,spawn,perf,ready}

## Validation workflow
- node --check on every file
- test/logic-test.js: run logic tests for util+blocks+lighting+worldgen+world+mesher+inventory under node
- test/shot.sh: headless Chrome screenshot + console error collection (file:// + ?test=1)

## Progress — all done ✓
- [x] All 16 js files + index.html
- [x] node logic tests 49/49 passing (test/logic-test.js)
- [x] Browser screenshot verification: terrain/night/caves/biomes/mobs/UI(inventory/crafting table/furnace/creative)/
      cracks/selection box/third person/explosion/death screen/title screen all visually confirmed
- [x] In-browser closed-loop assertions: mine→drop→pickup ✓, save→reload→blocks and inventory restored ✓,
      explosion damage+knockback+regen ✓, 900-tick soak with no errors ✓
- [x] README

## Headless testing notes (important)
- The screenshot from chrome --headless=new --screenshot --virtual-time-budget is an "earlier rendered frame";
  the DOM is in its final state but the canvas may lag; the relationship between frame count and budget is unreliable
- Workaround: run all test commands synchronously on the 1st frame after ready (testFrameTick stage1);
  when time advancement is needed, use &warp=N to synchronously fast-forward game ticks; pin time with &time=N every tick
- Test URL commands: test/seed/dist/mode/time/tp/look/give/sel/mob/freeze/biome/cave/
  setblock(y=99 on the ground)/open/boom/mine/use/press/third/crack/warp/report/mute/savetest
- Sound effects during warp frantically create audio nodes and bog down the page → &mute=1
- Test mode does not write localStorage (except savetest, which deletes itself after use)

## Design parameters
- World height 128, sea level 62, default render distance 6 columns (adjustable 3-10)
- Biomes: Ocean/Beach/Plains/Forest/Birch Forest/Taiga/Snowy Tundra/Desert/Mountains (from continentalness + temperature + humidity + peak noise)
- Ores: Coal 16x y5-80 / Iron 12x y5-54 / Gold 2x y5-30 / Diamond 1x y5-15, random-walk blobs
- Mobs: pig/cow/sheep (passive), zombie (night, burns in daytime), creeper (explodes); caps: hostile 12, passive 10
- Crafting: Planks/sticks/Crafting Table/Furnace/5 tool types x 5 tiers/Torch/Chest/ladder/TNT/bread/bucket/flint and steel/storage block/stone bricks/snow block/jack o'lantern
- Smelting: Cobblestone→stone, sand→glass, iron & gold ore→ingots, Log→Charcoal, raw meat→cooked meat; fuel: Coal/wood/lava bucket
- Farming: hoe→farmland, seeds (drop from breaking grass), wheat 8 stages, bread; trampling farmland turns it back into dirt
- Fluids: horizontal spread water 7 blocks / lava 3 blocks, vertical infinite, 2 source water blocks adjacent + a solid block below → new source (infinite water), water meeting lava → Obsidian/Cobblestone
- Gravity blocks: sand/gravel (falling entities); gravel has a 10% chance to drop flint
- Redstone/Nether/enchanting/experience/armor/beds/doors: not implemented (armor, doors, and beds are optional extensions)
