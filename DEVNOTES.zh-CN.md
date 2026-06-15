[English](DEVNOTES.md) · **中文**

# MineJS 开发笔记（内部架构文档）

网页版 Minecraft 复刻。零依赖，原生 WebGL2，经典 script 标签（非 module，保证 file:// 直开）。
双击 index.html 即玩。所有贴图程序化生成（canvas 像素画），无外部资源。

## 文件与加载顺序（index.html 中的 script 顺序 = 依赖顺序）
1. js/util.js      — Util: RNG(mulberry32/hash), Perlin 2D/3D + fBm, mat4, frustum, clamp/lerp
2. js/blocks.js    — B(方块id常量), BLOCKS[id]规格, IT(物品id), ITEMS[], RECIPES, SMELT, FUEL, 中文名
3. js/textures.js  — Tex: 512x512 atlas 画块贴图; tile painter 框架; Tex.uv(idx)
4. js/textures2.js — 物品/工具像素画、生物皮肤、裂纹、太阳月亮、粒子、GUI 图标 dataURL
5. js/lighting.js  — Light: 天光/方块光 BFS 增减、列初始化、区域重算
6. js/worldgen.js  — Gen: 群系/高度/洞穴/矿脉/树/装饰; 跨区块树用确定性 hash
7. js/world.js     — World: 列存储、get/setBlock、tick(流体/随机tick/方块实体)、爆炸、存档RLE
8. js/mesher.js    — Mesher.buildColumn(world,col) → {opq, trans} 顶点数据 (AO+平滑光照)
9. js/render.js    — Render: GL 管线、区块/天空/云/日月星/实体/粒子/选框/裂纹/手持
10. js/entities.js — Ent: 实体物理、掉落物、下落方块、TNT、生物+AI、生成器
11. js/player.js   — Player: 输入、移动(走/跑/潜/游)、挖掘/放置/攻击、生命饥饿
12. js/inventory.js— Inv: 槽位、合成匹配(shaped/shapeless+镜像)、熔炉逻辑
13. js/ui.js       — UI: HUD(血量饥饿氧气热栏)、容器窗口、拖拽、tooltip
14. js/screens.js  — Screens: 标题/暂停/选项/死亡/F3/成就toast/多世界管理
15. js/audio.js    — Sfx: WebAudio 合成音效 + 生成式音乐
16. js/main.js     — Game: 主循环、区块管理、20Hz tick、存档、TEST 钩子

## 核心约定
- 坐标: x东 y上(0..127) z南。列(column) = 16x16x128。key = cx+","+cz
- 列内索引 idx = x | (z<<4) | (y<<8)  (x,z:0-15, y:0-127), 数组长 32768
- column = {cx,cz, blocks:Uint8Array, meta:Uint8Array, sky:Uint8Array, blk:Uint8Array,
  height:Uint8Array(256, 最高不透明y+1), state(0空/1已生成/2可渲染), dirtyMesh,
  blockEntities:Map<idx,obj>, modified:bool, mesh:{opq,trans}, biomes:Uint8Array(256)}
- World API: getBlock/getMeta/setBlock(x,y,z,id,meta,flags) flags: 1=光照 2=网格 4=邻居更新
  getSky/getBlk/getColumn/ensureColumn/raycast(o,d,max)/explode(x,y,z,power)
- setBlock 边界变更要标记相邻(含对角, AO 需要) 列 dirtyMesh
- 光照: 两个 Uint8Array (sky, blk) 0..15。天光15垂直向下不衰减。水不透明度2、树叶1。
  夜晚亮度 = max(blk, sky*dayFactor) 在 shader 完成
- 方块规格 BLOCKS[id]: {name, tex:{all|top,bottom,side,front,...}, solid, opaque, opacity,
  hard(秒), tool('pick'|'axe'|'shovel'|null), tier(0木1石2铁3钻, 掉落所需), drops(meta,toolInfo)=>[],
  light, render('cube'|'cross'|'liquid'|'torch'|'ladder'|'snow'|'crop'|'none'), sound, tint,
  cutout, transp, gravity, climb, box(碰撞箱: null=无 / [x0,y0,z0,x1,y1,z1])}
- 物品 id: 方块 1..99, 物品 100+。ITEMS[id]={name,tile,stack,tool:{type,tier,speed,dur,dmg},food:{pts,sat},fuel,burnRes}
- 物品堆 stack = {id,n,dur?}
- 实体: {pos:[x,y,z](脚底中心), vel, w(半宽), h, yaw, hp, onGround, ...} 每轴扫掠碰撞
- 主循环: rAF 渲染 + 累加器 20Hz 世界tick; 玩家移动按帧
- 时间: t=0..24000 ticks (20分钟一天), 白天0-12000, 日落12000-13800, 夜13800-22200, 日出22200-24000
- 存档: localStorage key "minejs:<wid>:meta|col:<cx>,<cz>", 列 RLE→base64, 仅 modified 列
- 测试: URL ?test=1 暴露 window.TEST {setTime,tp,look,mine,place,give,spawn,perf,ready}

## 验证流程
- node --check 每个文件
- test/logic-test.js: node 跑 util+blocks+lighting+worldgen+world+mesher+inventory 的逻辑测试
- test/shot.sh: headless Chrome 截图 + console 错误收集 (file:// + ?test=1)

## 进度 — 全部完成 ✓
- [x] 全部 16 个 js 文件 + index.html
- [x] node 逻辑测试 49/49 通过 (test/logic-test.js)
- [x] 浏览器截图验证: 地形/夜晚/洞穴/群系/生物/UI(物品栏/工作台/熔炉/创造)/
      裂纹/选框/第三人称/爆炸/死亡界面/标题界面 全部目视确认
- [x] 浏览器内闭环断言: 挖掘→掉落→拾取 ✓, 存档→重载→方块与背包恢复 ✓,
      爆炸伤害+击退+回血 ✓, 900刻浸泡无报错 ✓
- [x] README

## headless 测试经验 (重要)
- chrome --headless=new --screenshot --virtual-time-budget 的截图是"较早的绘制帧",
  DOM 是最终态而 canvas 可能滞后; 帧数与预算关系不可靠
- 对策: 测试指令全部在就绪后第1帧同步执行 (testFrameTick stage1);
  需要时间推进的用 &warp=N 同步快进游戏刻; 时间用 &time=N 每刻钉死
- 测试 URL 指令: test/seed/dist/mode/time/tp/look/give/sel/mob/freeze/biome/cave/
  setblock(y=99贴地)/open/boom/mine/use/press/third/crack/warp/report/mute/savetest
- 音效在 warp 中会狂建音频节点拖死页面 → &mute=1
- 测试模式不写 localStorage (savetest 除外, 用后自删)

## 既定设计参数
- 世界高128, 海平面62, 默认渲染距离6列(可调3-10)
- 群系: 海洋/沙滩/平原/森林/桦木林/针叶林/雪原/沙漠/山地(由大陆度+温度+湿度+山峰噪声)
- 矿: 煤16次y5-80 / 铁12次y5-54 / 金2次y5-30 / 钻1次y5-15, 随机游走团
- 生物: 猪牛羊(被动) 僵尸(夜, 白天燃烧) 苦力怕(爆炸) 上限: 敌对12 被动10
- 合成: 木板/木棍/工作台/熔炉/工具5种x5阶/火把/箱子/梯子/TNT/面包/桶/打火石/储物块/石砖/雪块/南瓜灯
- 熔炼: 圆石→石头, 沙→玻璃, 铁金矿→锭, 原木→木炭, 生肉→熟肉; 燃料: 煤/木/岩浆桶
- 农业: 锄→耕地, 种子(打草掉), 小麦8阶段, 面包; 踩踏耕地变回泥土
- 流体: 水平传播水7格/岩浆3格, 垂直无限, 2源水相邻+下方实体→新源(无限水), 水遇岩浆→黑曜石/圆石
- 重力方块: 沙/沙砾(下落实体); 沙砾10%掉燧石
- 红石/下界/附魔/经验/盔甲/床/门: 不做(盔甲门床为可选扩展)
