// ============ screens.js — 标题 / 暂停 / 选项 / 加载 界面 ============
'use strict';
var Screens = (function () {
  var opts = {
    renderDist: 6, fov: 75, sens: 1.0, volume: 0.7, music: true, clouds: true
  };
  try {
    var saved = localStorage.getItem('minejs:options');
    if (saved) {
      var o = JSON.parse(saved);
      for (var k in opts) if (o[k] !== undefined) opts[k] = o[k];
    }
  } catch (e) { /* 忽略 */ }
  function saveOpts() {
    try { localStorage.setItem('minejs:options', JSON.stringify(opts)); } catch (e) { /* 满 */ }
  }

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).style.display = 'flex'; }
  function hide(id) { $(id).style.display = 'none'; }
  function hideAll() {
    ['title-screen', 'create-screen', 'pause-screen', 'options-screen', 'loading-screen'].forEach(hide);
  }

  function init() {
    // 标题
    $('btn-new-world').onclick = function () { Sfx.play('click', {}); showCreate(); };
    // 创建世界
    $('btn-create-go').onclick = function () {
      Sfx.play('click', {});
      var name = $('world-name').value.trim() || '新的世界';
      var seed = $('world-seed').value.trim() || String((Math.random() * 99999999) | 0);
      var mode = $('world-mode').value;
      hideAll();
      Game.createWorld(name, seed, mode);
    };
    $('btn-create-back').onclick = function () { Sfx.play('click', {}); hideAll(); showTitle(); };
    // 暂停
    $('btn-resume').onclick = function () { Sfx.play('click', {}); Game.resume(); };
    $('btn-options').onclick = function () { Sfx.play('click', {}); hide('pause-screen'); showOptions(true); };
    $('btn-quit').onclick = function () { Sfx.play('click', {}); Game.quitToTitle(); };
    // 选项
    $('btn-options-back').onclick = function () {
      Sfx.play('click', {});
      hide('options-screen');
      if (Game.isPlaying()) show('pause-screen');
      else showTitle();
    };
    bindSlider('opt-dist', 'renderDist', function (v) { return v + ' 区块'; });
    bindSlider('opt-fov', 'fov', function (v) { return v + '°'; });
    bindSlider('opt-sens', 'sens', function (v) { return (v * 100).toFixed(0) + '%'; });
    bindSlider('opt-vol', 'volume', function (v) {
      Sfx.setVolume(+v);
      return (v * 100).toFixed(0) + '%';
    });
    $('opt-music').onchange = function () {
      opts.music = this.checked;
      Sfx.setMusic(opts.music);
      saveOpts();
    };
    $('btn-respawn').onclick = function () { Sfx.play('click', {}); Player.respawn(); };
    $('btn-death-quit').onclick = function () { UI.hideDeath(); Game.quitToTitle(); };
    Sfx.setVolume(opts.volume);
    Sfx.setMusic(opts.music);
  }

  function bindSlider(id, key, fmt) {
    var el = $(id), lbl = $(id + '-val');
    el.value = opts[key];
    lbl.textContent = fmt(opts[key]);
    el.oninput = function () {
      opts[key] = +el.value;
      lbl.textContent = fmt(opts[key]);
      saveOpts();
    };
  }

  // ---------- 标题 ----------
  function showTitle() {
    hideAll();
    show('title-screen');
    var list = $('world-list');
    list.innerHTML = '';
    var worlds = Game.listWorlds();
    if (!worlds.length) {
      var empty = document.createElement('div');
      empty.className = 'world-empty';
      empty.textContent = '还没有世界, 创建一个吧!';
      list.appendChild(empty);
    }
    worlds.forEach(function (w) {
      var row = document.createElement('div');
      row.className = 'world-row';
      var info = document.createElement('div');
      info.className = 'world-info';
      info.innerHTML = '<b>' + escapeHtml(w.name) + '</b><span>种子: ' + escapeHtml(String(w.seed)) +
        ' · ' + (w.mode === 'creative' ? '创造' : '生存') + ' · 第' + ((w.day || 0) + 1) + '天</span>';
      var btnPlay = document.createElement('button');
      btnPlay.textContent = '进入';
      btnPlay.className = 'mc-btn small';
      btnPlay.onclick = function () {
        Sfx.play('click', {});
        hideAll();
        Game.loadWorld(w.id);
      };
      var btnDel = document.createElement('button');
      btnDel.textContent = '删除';
      btnDel.className = 'mc-btn small danger';
      btnDel.onclick = function () {
        Sfx.play('click', {});
        if (confirm('确定删除世界 "' + w.name + '"? 无法恢复!')) {
          Game.deleteWorld(w.id);
          showTitle();
        }
      };
      row.appendChild(info);
      row.appendChild(btnPlay);
      row.appendChild(btnDel);
      list.appendChild(row);
    });
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function showCreate() {
    hideAll();
    show('create-screen');
    $('world-name').value = '';
    $('world-seed').value = '';
  }

  function showPause() { show('pause-screen'); }
  function hidePause() { hide('pause-screen'); }
  function showOptions(fromPause) {
    void fromPause;
    show('options-screen');
  }
  function showLoading(msg, progress) {
    show('loading-screen');
    $('loading-msg').textContent = msg;
    $('loading-fill').style.width = (progress * 100).toFixed(1) + '%';
  }
  function hideLoading() { hide('loading-screen'); }

  return {
    init: init, opts: opts,
    showTitle: showTitle, showPause: showPause, hidePause: hidePause,
    showLoading: showLoading, hideLoading: hideLoading, hideAll: hideAll
  };
})();
