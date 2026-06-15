// ============ ui.js — HUD / 容器窗口 / 提示 ============
'use strict';
var UI = (function () {
  var els = {};
  var openType = null;
  var openBEPos = null;
  var slotEls = [];      // 打开窗口中的槽位元素
  var hotbarEls = [];
  var heartEls = [], foodEls = [], airEls = [];
  var lastHudState = '';
  var heldNameT = 0;
  var messageT = 0;

  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function init() {
    els.hud = $('hud');
    els.hotbar = $('hotbar');
    els.hearts = $('hearts');
    els.food = $('food');
    els.air = $('air');
    els.winroot = $('winroot');
    els.cursorItem = $('cursor-item');
    els.tooltip = $('tooltip');
    els.f3 = $('f3');
    els.damage = $('damage-flash');
    els.tint = $('screen-tint');
    els.heldName = $('held-name');
    els.message = $('action-message');
    els.toasts = $('toasts');
    els.deathScreen = $('death-screen');

    // 快捷栏
    for (var i = 0; i < 9; i++) {
      var s = mk('div', 'slot hotbar-slot', els.hotbar);
      s.dataset.area = 'hotbar';
      s.dataset.idx = i;
      buildSlotInner(s);
      hotbarEls.push(s);
    }
    // 心/食物/气泡
    var gui = Tex2.gui();
    for (i = 0; i < 10; i++) {
      var h = mk('img', 'stat-icon', els.hearts);
      h.src = gui.heart;
      heartEls.push(h);
      var f = mk('img', 'stat-icon', els.food);
      f.src = gui.food;
      foodEls.push(f);
      var a = mk('img', 'stat-icon', els.air);
      a.src = gui.bubble;
      airEls.push(a);
    }

    // 窗口事件
    els.winroot.addEventListener('mousedown', function (e) {
      var slot = e.target.closest('.slot');
      if (slot && slot.dataset.area) {
        Inv.clickSlot(slot.dataset.area, +slot.dataset.idx, e.button, e.shiftKey);
        refresh();
        e.preventDefault();
      }
    });
    els.winroot.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('mousemove', function (e) {
      els.cursorItem.style.left = e.clientX + 'px';
      els.cursorItem.style.top = e.clientY + 'px';
      var slot = e.target.closest ? e.target.closest('.slot') : null;
      if (slot && slot.dataset.area && isOpen()) {
        var st = slot.dataset.area === 'creative'
          ? { id: Blocks.CREATIVE[+slot.dataset.idx], n: 1 }
          : Inv.getSlot(slot.dataset.area, +slot.dataset.idx);
        if (st && st.id !== undefined) {
          els.tooltip.style.display = 'block';
          els.tooltip.style.left = (e.clientX + 14) + 'px';
          els.tooltip.style.top = (e.clientY - 8) + 'px';
          els.tooltip.textContent = Blocks.name(st.id);
        } else els.tooltip.style.display = 'none';
      } else els.tooltip.style.display = 'none';
    });
  }

  function buildSlotInner(s) {
    mk('img', 'slot-icon', s);
    mk('span', 'slot-count', s);
    var d = mk('div', 'slot-dur', s);
    mk('div', 'slot-dur-fill', d);
  }

  function renderSlotEl(el, st) {
    var img = el.querySelector('.slot-icon');
    var cnt = el.querySelector('.slot-count');
    var dur = el.querySelector('.slot-dur');
    if (!st) {
      img.style.display = 'none';
      cnt.textContent = '';
      dur.style.display = 'none';
      return;
    }
    img.style.display = 'block';
    img.src = Tex2.iconFor(st.id);
    cnt.textContent = st.n > 1 ? st.n : '';
    var tool = Blocks.toolOf(st.id);
    if (tool && st.dur !== undefined && st.dur < tool.dur) {
      dur.style.display = 'block';
      var fill = dur.querySelector('.slot-dur-fill');
      var p = st.dur / tool.dur;
      fill.style.width = (p * 100) + '%';
      fill.style.background = p > 0.5 ? '#5be059' : (p > 0.2 ? '#e0c33a' : '#e05050');
    } else dur.style.display = 'none';
  }

  // ---------- HUD ----------
  function updateHUD() {
    var P = Player.P;
    // 快捷栏
    if (Inv.isDirty()) {
      var slots = Inv.slots();
      for (var i = 0; i < 9; i++) {
        renderSlotEl(hotbarEls[i], slots[i]);
        hotbarEls[i].classList.toggle('selected', i === Inv.selectedIdx());
      }
      if (isOpen()) refresh();
      var st = Inv.held();
      if (st) showHeldName(Blocks.name(st.id));
    }
    // 状态条
    var state = P.hp + '|' + P.food + '|' + P.air + '|' + P.headInWater + '|' + P.gamemode;
    if (state !== lastHudState) {
      lastHudState = state;
      var gui = Tex2.gui();
      var creative = P.gamemode === 'creative';
      els.hearts.style.display = creative ? 'none' : 'flex';
      els.food.style.display = creative ? 'none' : 'flex';
      for (i = 0; i < 10; i++) {
        var hv = P.hp - i * 2;
        heartEls[i].src = hv >= 2 ? gui.heart : (hv === 1 ? gui.heartHalf : gui.heartEmpty);
        var fv = P.food - i * 2;
        foodEls[i].src = fv >= 1 ? gui.food : gui.foodEmpty;
        airEls[i].style.visibility = (P.headInWater && P.air > i) ? 'visible' : 'hidden';
      }
      els.air.style.display = P.headInWater ? 'flex' : 'none';
      els.hearts.classList.toggle('low', P.hp <= 6);
    }
    // 屏幕色调
    var tint = '';
    if (P.headInWater) tint = 'rgba(20,40,120,0.32)';
    else if (P.inLava) tint = 'rgba(220,80,10,0.5)';
    else if (P.fireT > 0) tint = 'rgba(220,100,10,0.28)';
    els.tint.style.background = tint;
    els.tint.style.display = tint ? 'block' : 'none';

    if (heldNameT > 0) {
      heldNameT -= 0.05;
      els.heldName.style.opacity = Math.min(1, heldNameT);
    }
    if (messageT > 0) {
      messageT -= 0.05;
      els.message.style.opacity = Math.min(1, messageT);
    }
  }

  function showHeldName(name) {
    els.heldName.textContent = name;
    heldNameT = 2.2;
    els.heldName.style.opacity = 1;
  }
  function message(text) {
    els.message.textContent = text;
    messageT = 2.6;
    els.message.style.opacity = 1;
  }

  function damageFlash() {
    els.damage.style.opacity = 0.5;
    setTimeout(function () { els.damage.style.opacity = 0; }, 120);
  }

  // ---------- 容器窗口 ----------
  function isOpen() { return openType !== null; }
  function currentOpen() { return openType; }

  function openContainer(type, be, pos) {
    if (isOpen()) close();
    openType = type;
    openBEPos = pos || null;
    Inv.openFor(type, be);
    buildWindow(type);
    els.winroot.style.display = 'flex';
    document.exitPointerLock && document.exitPointerLock();
    refresh();
  }

  function close() {
    if (!isOpen()) return false;
    if (openType === 'chest') Sfx.play('chest_close', {});
    Inv.closeContainer();
    openType = null;
    openBEPos = null;
    els.winroot.style.display = 'none';
    els.tooltip.style.display = 'none';
    els.cursorItem.style.display = 'none';
    return true;
  }

  function slotGrid(parent, area, count, cols) {
    var grid = mk('div', 'slot-grid', parent);
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', 44px)';
    for (var i = 0; i < count; i++) {
      var s = mk('div', 'slot', grid);
      s.dataset.area = area;
      s.dataset.idx = i;
      buildSlotInner(s);
      slotEls.push(s);
    }
    return grid;
  }

  function buildWindow(type) {
    els.winroot.innerHTML = '';
    slotEls = [];
    var win = mk('div', 'window', els.winroot);
    var title = mk('div', 'win-title', win);

    if (type === 'inv') {
      if (Player.P.gamemode === 'creative') return buildCreative(win, title);
      title.textContent = '物品栏';
      var top = mk('div', 'win-row', win);
      mk('div', 'win-label', top).textContent = '合成';
      var c2 = mk('div', 'craft-area', top);
      slotGrid(c2, 'craft', 4, 2);
      mk('div', 'craft-arrow', c2).textContent = '→';
      var rg = slotGrid(c2, 'result', 1, 1);
      rg.querySelector('.slot').classList.add('result-slot');
    } else if (type === 'craft') {
      title.textContent = '工作台';
      var c3 = mk('div', 'craft-area', win);
      slotGrid(c3, 'craft', 9, 3);
      mk('div', 'craft-arrow', c3).textContent = '→';
      var rg2 = slotGrid(c3, 'result', 1, 1);
      rg2.querySelector('.slot').classList.add('result-slot');
    } else if (type === 'furnace') {
      title.textContent = '熔炉';
      var fa = mk('div', 'furnace-area', win);
      var leftCol = mk('div', 'furnace-col', fa);
      slotGrid(leftCol, 'furnace', 1, 1).querySelector('.slot').dataset.idx = 0;
      var flame = mk('div', 'furnace-flame', leftCol);
      mk('div', 'furnace-flame-fill', flame);
      var fuelG = slotGrid(leftCol, 'furnace', 1, 1);
      fuelG.querySelector('.slot').dataset.idx = 1;
      var mid = mk('div', 'furnace-mid', fa);
      var arrow = mk('div', 'furnace-arrow', mid);
      mk('div', 'furnace-arrow-fill', arrow);
      var outG = slotGrid(fa, 'furnace', 1, 1);
      outG.querySelector('.slot').dataset.idx = 2;
      outG.querySelector('.slot').classList.add('result-slot');
    } else if (type === 'chest') {
      title.textContent = '箱子';
      slotGrid(win, 'chest', 27, 9);
    }

    // 玩家背包 + 快捷栏
    mk('div', 'win-sep', win);
    slotGrid(win, 'main', 27, 9);
    var hb = slotGrid(win, 'hotbar', 9, 9);
    hb.classList.add('win-hotbar');
  }

  function buildCreative(win, title) {
    title.textContent = '物品栏 (创造)';
    var wrap = mk('div', 'creative-wrap', win);
    var grid = mk('div', 'slot-grid creative-grid', wrap);
    grid.style.gridTemplateColumns = 'repeat(9, 44px)';
    for (var i = 0; i < Blocks.CREATIVE.length; i++) {
      var s = mk('div', 'slot', grid);
      s.dataset.area = 'creative';
      s.dataset.idx = i;
      buildSlotInner(s);
      slotEls.push(s);
    }
    var tr = mk('div', 'win-row', win);
    mk('div', 'win-label', tr).textContent = '丢弃 →';
    var trash = mk('div', 'slot trash-slot', tr);
    trash.dataset.area = 'trash';
    trash.dataset.idx = 0;
    trash.textContent = '✕';
    mk('div', 'win-sep', win);
    var hb = slotGrid(win, 'hotbar', 9, 9);
    hb.classList.add('win-hotbar');
  }

  function refresh() {
    for (var i = 0; i < slotEls.length; i++) {
      var s = slotEls[i];
      var area = s.dataset.area;
      if (area === 'creative') {
        var cid = Blocks.CREATIVE[+s.dataset.idx];
        renderSlotEl(s, cid !== undefined ? { id: cid, n: 1 } : null);
        continue;
      }
      if (area === 'trash') continue;
      renderSlotEl(s, Inv.getSlot(area, +s.dataset.idx));
    }
    // 鼠标物品
    var cur = Inv.cursorStack();
    if (cur) {
      els.cursorItem.style.display = 'block';
      els.cursorItem.innerHTML = '';
      var img = mk('img', '', els.cursorItem);
      img.src = Tex2.iconFor(cur.id);
      if (cur.n > 1) {
        var c = mk('span', 'slot-count', els.cursorItem);
        c.textContent = cur.n;
      }
    } else {
      els.cursorItem.style.display = 'none';
    }
    // 快捷栏同步
    var slots = Inv.slots();
    for (i = 0; i < 9; i++) renderSlotEl(hotbarEls[i], slots[i]);
  }

  // 熔炉进度 (打开时每帧)
  function updateOpenContainer() {
    if (openType !== 'furnace' || !openBEPos) return;
    var be = Game.world().getBE(openBEPos[0], openBEPos[1], openBEPos[2]);
    if (!be) { close(); return; }
    var ff = els.winroot.querySelector('.furnace-flame-fill');
    var af = els.winroot.querySelector('.furnace-arrow-fill');
    if (ff) ff.style.height = (be.burnMax > 0 ? be.burn / be.burnMax * 100 : 0) + '%';
    if (af) af.style.width = (be.prog / 200 * 100) + '%';
    if ((Game.tickNo() & 15) === 0) refresh();
  }

  // ---------- F3 ----------
  var f3Visible = false;
  function toggleF3() {
    f3Visible = !f3Visible;
    els.f3.style.display = f3Visible ? 'block' : 'none';
  }
  function updateF3(fps) {
    if (!f3Visible) return;
    var P = Player.P;
    var x = Math.floor(P.pos[0]), y = Math.floor(P.pos[1]), z = Math.floor(P.pos[2]);
    var w = Game.world();
    var biome = Gen.BIOME_NAMES[Gen.biomeAt(x, z)] || '?';
    var dirs = ['南 (+Z)', '西 (-X)', '北 (-Z)', '东 (+X)'];
    var dirIdx = Math.round(Util.mod(P.yaw, Math.PI * 2) / (Math.PI / 2)) % 4;
    els.f3.textContent =
      'MineJS | ' + fps + ' fps\n' +
      'XYZ: ' + P.pos[0].toFixed(2) + ' / ' + P.pos[1].toFixed(2) + ' / ' + P.pos[2].toFixed(2) + '\n' +
      '方块: ' + x + ' ' + y + ' ' + z + '  朝向: ' + dirs[dirIdx] + '\n' +
      '群系: ' + biome + '  亮度: 天' + w.getSky(x, y, z) + ' / 块' + w.getBlk(x, y, z) + '\n' +
      '时间: ' + w.time + ' (第' + (w.day + 1) + '天)  种子: ' + w.seedStr + '\n' +
      '区块: ' + w.columns.size + '  实体: ' + Ent.list().length + '  粒子: ' + Ent.particles().length + '\n' +
      '模式: ' + (P.gamemode === 'creative' ? '创造' : '生存') + (P.flying ? ' (飞行)' : '') +
      (window.__ts ? '\n' + window.__ts : '');
  }

  // ---------- 死亡 ----------
  function showDeath(cause) {
    els.deathScreen.style.display = 'flex';
    $('death-cause').textContent = '死因: ' + cause;
    document.exitPointerLock && document.exitPointerLock();
  }
  function hideDeath() {
    els.deathScreen.style.display = 'none';
  }

  // ---------- 成就 ----------
  function toast(title, sub, iconId) {
    var t = mk('div', 'toast', els.toasts);
    if (iconId !== undefined) {
      var img = mk('img', '', t);
      img.src = Tex2.iconFor(iconId);
    }
    var tx = mk('div', 'toast-text', t);
    mk('div', 'toast-title', tx).textContent = title;
    mk('div', 'toast-sub', tx).textContent = sub;
    Sfx.play('pop', { pitch: 1.4 });
    setTimeout(function () { t.classList.add('show'); }, 30);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 500);
    }, 3500);
  }

  return {
    init: init, updateHUD: updateHUD, refresh: refresh,
    openContainer: openContainer, close: close, isOpen: isOpen, currentOpen: currentOpen,
    updateOpenContainer: updateOpenContainer,
    damageFlash: damageFlash, showDeath: showDeath, hideDeath: hideDeath,
    toggleF3: toggleF3, updateF3: updateF3,
    message: message, showHeldName: showHeldName, toast: toast
  };
})();
