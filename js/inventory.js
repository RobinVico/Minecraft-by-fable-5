// ============ inventory.js — 物品栏 / 合成匹配 / 容器点击逻辑 ============
'use strict';
var Inv = (function () {

  var slots = new Array(36).fill(null);   // 0-8 快捷栏, 9-35 背包
  var selected = 0;
  var cursor = null;                      // 鼠标上的物品堆
  var dirty = true;

  var craftGrid = new Array(9).fill(null);
  var craftSize = 2;                      // 2 或 3
  var openBE = null;                      // 当前打开的方块实体 (furnace/chest)
  var openType = null;

  function markDirty() { dirty = true; }
  function isDirty() { var d = dirty; dirty = false; return d; }

  function held() { return slots[selected]; }
  function select(i) {
    if (i < 0) i = 8;
    if (i > 8) i = 0;
    if (selected !== i) {
      selected = i;
      Player.P.equipT = 1;
      markDirty();
    }
  }
  function scroll(dir) { select(selected + dir); }

  function consumeHeld(n) {
    var st = slots[selected];
    if (!st) return;
    st.n -= n;
    if (st.n <= 0) slots[selected] = null;
    markDirty();
  }
  function replaceHeld(stack) {
    slots[selected] = stack;
    markDirty();
  }

  // 添加物品堆, 返回剩余数量
  function add(stack) {
    if (!stack || stack.n <= 0) return 0;
    var max = Blocks.stackMax(stack.id);
    var n = stack.n;
    // 合并
    if (stack.dur === undefined) {
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 0; i < 36; i++) {
          var s = slots[i];
          if (pass === 0) {
            if (s && s.id === stack.id && s.dur === undefined && s.n < max) {
              var t = Math.min(max - s.n, n);
              s.n += t; n -= t;
              if (n <= 0) { markDirty(); return 0; }
            }
          }
        }
        if (pass === 0) continue;
      }
    }
    for (var j = 0; j < 36; j++) {
      if (!slots[j]) {
        slots[j] = { id: stack.id, n: Math.min(n, max), dur: stack.dur };
        n -= slots[j].n;
        if (n <= 0) { markDirty(); return 0; }
      }
    }
    markDirty();
    return n;
  }

  function give(id, n) {
    return add({ id: id, n: n || 1 });
  }

  // ---------- 配方匹配 ----------
  function cellMatch(spec, cell) {
    if (!spec) return !cell;
    if (!cell) return false;
    if (Array.isArray(spec)) return spec.indexOf(cell.id) >= 0;
    return cell.id === spec;
  }
  function matchShapedAt(rows, grid, gw, r0, c0, rw, rh, mirror) {
    for (var r = 0; r < rh; r++) {
      for (var c = 0; c < rw; c++) {
        var spec = rows[r] ? rows[r][mirror ? rw - 1 - c : c] : 0;
        var cell = grid[(r0 + r) * gw + (c0 + c)];
        if (!cellMatch(spec || 0, cell)) return false;
      }
    }
    return true;
  }
  function matchRecipe(grid, gw) {
    // 边界框
    var minR = 9, maxR = -1, minC = 9, maxC = -1, count = 0;
    for (var r = 0; r < gw; r++) for (var c = 0; c < gw; c++) {
      if (grid[r * gw + c]) {
        count++;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
    if (count === 0) return null;
    var bw = maxC - minC + 1, bh = maxR - minR + 1;
    var RE = Blocks.RECIPES;
    for (var i = 0; i < RE.length; i++) {
      var rec = RE[i];
      if (rec.shaped) {
        var rows = rec.shaped;
        var rh = rows.length, rw = 0;
        for (var rr = 0; rr < rh; rr++) rw = Math.max(rw, rows[rr].length);
        if (rw !== bw || rh !== bh) continue;
        if (matchShapedAt(rows, grid, gw, minR, minC, rw, rh, false) ||
            matchShapedAt(rows, grid, gw, minR, minC, rw, rh, true)) {
          return rec;
        }
      } else if (rec.mix) {
        if (count !== rec.mix.length) continue;
        // 多重集匹配
        var used = [];
        var ok = true;
        for (var mi = 0; mi < rec.mix.length; mi++) {
          var spec = rec.mix[mi];
          var found = false;
          for (var gi = 0; gi < gw * gw; gi++) {
            if (!grid[gi] || used.indexOf(gi) >= 0) continue;
            if (cellMatch(spec, grid[gi])) { used.push(gi); found = true; break; }
          }
          if (!found) { ok = false; break; }
        }
        if (ok) return rec;
      }
    }
    return null;
  }

  function craftResult() {
    var rec = matchRecipe(craftGrid, craftSize === 2 ? 2 : 3);
    return rec ? { id: rec.out.id, n: rec.out.n } : null;
  }
  // 取走合成结果: 消耗材料
  function consumeCraft() {
    var gw = craftSize === 2 ? 2 : 3;
    for (var i = 0; i < gw * gw; i++) {
      var s = craftGrid[i];
      if (s) {
        s.n--;
        if (s.n <= 0) craftGrid[i] = null;
      }
    }
    markDirty();
  }

  // ---------- 槽位访问 ----------
  function getSlot(area, i) {
    switch (area) {
      case 'hotbar': return slots[i];
      case 'main': return slots[9 + i];
      case 'craft': return craftGrid[i];
      case 'result': return craftResult();
      case 'furnace': return openBE ? openBE.items[i] : null;
      case 'chest': return openBE ? openBE.items[i] : null;
    }
    return null;
  }
  function setSlot(area, i, st) {
    switch (area) {
      case 'hotbar': slots[i] = st; break;
      case 'main': slots[9 + i] = st; break;
      case 'craft': craftGrid[i] = st; break;
      case 'furnace': if (openBE) openBE.items[i] = st; break;
      case 'chest': if (openBE) openBE.items[i] = st; break;
    }
    markDirty();
  }

  function canMerge(a, b) {
    return a && b && a.id === b.id && a.dur === undefined && b.dur === undefined;
  }

  // ---------- 点击逻辑 ----------
  function clickSlot(area, i, button, shift) {
    // 创造物品栏
    if (area === 'creative') {
      var cid = Blocks.CREATIVE[i];
      if (cid === undefined) return;
      if (shift) { give(cid, Blocks.stackMax(cid)); return; }
      if (!cursor) cursor = { id: cid, n: button === 2 ? 1 : Blocks.stackMax(cid) };
      else cursor = null;
      markDirty();
      return;
    }
    if (area === 'trash') {
      cursor = null;
      markDirty();
      return;
    }
    // 合成结果
    if (area === 'result') {
      var res = craftResult();
      if (!res) return;
      if (shift) {
        // 合成全部
        var guard = 0;
        while (guard++ < 64) {
          var r2 = craftResult();
          if (!r2) break;
          if (add({ id: r2.id, n: r2.n }) !== 0) break;
          Game.stat('crafted', r2.id);
          consumeCraft();
        }
      } else {
        if (!cursor) {
          cursor = res;
          Game.stat('crafted', res.id);
          consumeCraft();
        } else if (canMerge(cursor, res) && cursor.n + res.n <= Blocks.stackMax(res.id)) {
          cursor.n += res.n;
          Game.stat('crafted', res.id);
          consumeCraft();
        }
      }
      markDirty();
      return;
    }
    var st = getSlot(area, i);
    // 熔炉输出槽只能取
    var outputOnly = (area === 'furnace' && i === 2);

    if (shift && st) {
      // 快速移动
      quickMove(area, i, st);
      return;
    }
    if (button === 0) { // 左键
      if (!cursor) {
        if (st) { setSlot(area, i, null); cursor = st; }
      } else if (outputOnly) {
        if (st && canMerge(cursor, st)) {
          var mx = Blocks.stackMax(st.id);
          var mv = Math.min(st.n, mx - cursor.n);
          cursor.n += mv; st.n -= mv;
          if (st.n <= 0) setSlot(area, i, null);
        }
      } else if (!st) {
        setSlot(area, i, cursor);
        cursor = null;
      } else if (canMerge(st, cursor)) {
        var max2 = Blocks.stackMax(st.id);
        var mv2 = Math.min(cursor.n, max2 - st.n);
        st.n += mv2; cursor.n -= mv2;
        if (cursor.n <= 0) cursor = null;
      } else {
        setSlot(area, i, cursor);
        cursor = st;
      }
    } else if (button === 2) { // 右键
      if (!cursor) {
        if (st) {
          var half = Math.ceil(st.n / 2);
          cursor = { id: st.id, n: half, dur: st.dur };
          st.n -= half;
          if (st.n <= 0) setSlot(area, i, null);
        }
      } else if (!outputOnly) {
        if (!st) {
          setSlot(area, i, { id: cursor.id, n: 1, dur: cursor.dur });
          cursor.n--;
          if (cursor.n <= 0) cursor = null;
        } else if (canMerge(st, cursor) && st.n < Blocks.stackMax(st.id)) {
          st.n++; cursor.n--;
          if (cursor.n <= 0) cursor = null;
        }
      }
    }
    markDirty();
  }

  function quickMove(area, i, st) {
    setSlot(area, i, null);
    var left;
    if (area === 'main' || area === 'hotbar') {
      // 移入打开的容器
      if (openType === 'chest' && openBE) {
        left = addToList(openBE.items, st);
      } else if (openType === 'furnace' && openBE) {
        if (Blocks.SMELT[st.id]) left = addToListAt(openBE.items, 0, st);
        else if (Blocks.fuelOf(st.id) > 0) left = addToListAt(openBE.items, 1, st);
        else left = st.n;
        if (left > 0) {
          // 背包内互换区域
          st.n = left;
          left = area === 'main' ? addToRange(0, 9, st) : addToRange(9, 36, st);
        }
      } else if (openType === 'craft' || openType === 'inv') {
        left = area === 'main' ? addToRange(0, 9, st) : addToRange(9, 36, st);
      } else {
        left = area === 'main' ? addToRange(0, 9, st) : addToRange(9, 36, st);
      }
    } else {
      // 容器 → 背包
      left = add(st);
    }
    if (left > 0) {
      st.n = left;
      setSlot(area, i, st);
    }
    markDirty();
  }
  function addToList(arr, st) {
    var max = Blocks.stackMax(st.id);
    var n = st.n;
    for (var i = 0; i < arr.length && n > 0; i++) {
      if (arr[i] && canMerge(arr[i], st) && arr[i].n < max) {
        var t = Math.min(max - arr[i].n, n);
        arr[i].n += t; n -= t;
      }
    }
    for (var j = 0; j < arr.length && n > 0; j++) {
      if (!arr[j]) {
        arr[j] = { id: st.id, n: Math.min(n, max), dur: st.dur };
        n -= arr[j].n;
      }
    }
    return n;
  }
  function addToListAt(arr, idx, st) {
    var max = Blocks.stackMax(st.id);
    if (!arr[idx]) {
      arr[idx] = { id: st.id, n: Math.min(st.n, max), dur: st.dur };
      return st.n - arr[idx].n;
    }
    if (canMerge(arr[idx], st)) {
      var t = Math.min(max - arr[idx].n, st.n);
      arr[idx].n += t;
      return st.n - t;
    }
    return st.n;
  }
  function addToRange(a, b, st) {
    var max = Blocks.stackMax(st.id);
    var n = st.n;
    for (var i = a; i < b && n > 0; i++) {
      if (slots[i] && canMerge(slots[i], st) && slots[i].n < max) {
        var t = Math.min(max - slots[i].n, n);
        slots[i].n += t; n -= t;
      }
    }
    for (var j = a; j < b && n > 0; j++) {
      if (!slots[j]) {
        slots[j] = { id: st.id, n: Math.min(n, max), dur: st.dur };
        n -= slots[j].n;
      }
    }
    return n;
  }

  // 打开/关闭容器
  function openFor(type, be) {
    openType = type;
    openBE = be || null;
    craftSize = (type === 'craft') ? 3 : 2;
  }
  function closeContainer() {
    // 合成格物品退回
    for (var i = 0; i < 9; i++) {
      if (craftGrid[i]) {
        var leftN = add(craftGrid[i]);
        if (leftN > 0) {
          craftGrid[i].n = leftN;
          Ent.throwItem(Player.pos[0], Player.pos[1] + 1.2, Player.pos[2], craftGrid[i], 0, 1, 0);
        }
        craftGrid[i] = null;
      }
    }
    if (cursor) {
      var l2 = add(cursor);
      if (l2 > 0) {
        cursor.n = l2;
        Ent.throwItem(Player.pos[0], Player.pos[1] + 1.2, Player.pos[2], cursor, 0, 1, 0);
      }
      cursor = null;
    }
    openType = null;
    openBE = null;
    markDirty();
  }

  function dropSelected(all) {
    var st = slots[selected];
    if (!st) return;
    var n = all ? st.n : 1;
    var d = Player.lookDir();
    var eye = Player.eyePos();
    Ent.throwItem(eye[0], eye[1] - 0.25, eye[2],
      { id: st.id, n: n, dur: st.dur },
      d[0] * 6, d[1] * 6 + 1.5, d[2] * 6);
    st.n -= n;
    if (st.n <= 0) slots[selected] = null;
    markDirty();
  }

  function serialize() {
    return { slots: slots, selected: selected };
  }
  function deserialize(d) {
    if (!d) return;
    for (var i = 0; i < 36; i++) slots[i] = d.slots[i] || null;
    selected = d.selected || 0;
    markDirty();
  }
  function clear() {
    slots.fill(null);
    craftGrid.fill(null);
    cursor = null;
    selected = 0;
    markDirty();
  }

  return {
    slots: function () { return slots; },
    selectedIdx: function () { return selected; },
    cursorStack: function () { return cursor; },
    held: held, select: select, scroll: scroll,
    consumeHeld: consumeHeld, replaceHeld: replaceHeld,
    add: add, give: give,
    craftGrid: function () { return craftGrid; },
    craftSize: function () { return craftSize; },
    craftResult: craftResult,
    getSlot: getSlot, clickSlot: clickSlot,
    openFor: openFor, closeContainer: closeContainer,
    dropSelected: dropSelected,
    markDirty: markDirty, isDirty: isDirty,
    serialize: serialize, deserialize: deserialize, clear: clear
  };
})();
if (typeof module !== 'undefined') module.exports = Inv;
