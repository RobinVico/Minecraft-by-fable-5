// ============ audio.js — WebAudio 程序化音效 + 生成式音乐 ============
'use strict';
var Sfx = (function () {
  var ctx = null, master = null, musicGain = null;
  var volume = 0.7, musicOn = true;
  var noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.35;
      musicGain.connect(master);
      // 白噪声缓冲
      var len = ctx.sampleRate * 1.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) {
      return false;
    }
  }
  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
  }
  function setMusic(on) { musicOn = on; }

  // 3D 定位: 由玩家位置/朝向计算音量与声像
  function spatial(pos) {
    if (!pos || !window.Player) return { vol: 1, pan: 0 };
    var P = Player.P;
    var dx = pos[0] - P.pos[0], dy = pos[1] - (P.pos[1] + 1.6), dz = pos[2] - P.pos[2];
    var d = Math.hypot(dx, dy, dz);
    var vol = 1 / (1 + d * 0.13);
    if (d > 28) return { vol: 0, pan: 0 };
    // 右向量 = (cos yaw, 0, -sin yaw)
    var rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    var pan = d > 0.5 ? Util.clamp((dx * rx + dz * rz) / d * 0.8, -1, 1) : 0;
    return { vol: vol, pan: pan };
  }

  function out(vol, pan, t0, dur) {
    var g = ctx.createGain();
    g.gain.value = vol;
    var node = g;
    if (pan && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    void t0; void dur;
    return g;
  }

  // 噪声爆发
  function noise(opts) {
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = opts.rate || 1;
    var f = ctx.createBiquadFilter();
    f.type = opts.ftype || 'bandpass';
    f.frequency.value = opts.freq || 600;
    f.Q.value = opts.q !== undefined ? opts.q : 1;
    if (opts.fslide) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.fslide), t + (opts.dur || 0.2));
    var g = out(0, opts.pan || 0);
    src.connect(f);
    f.connect(g);
    var v = opts.vol || 0.5;
    var a = opts.attack || 0.004;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + (opts.dur || 0.2));
    src.start(t, Math.random(), (opts.dur || 0.2) + 0.05);
  }
  // 音调
  function tone(opts) {
    var t = ctx.currentTime + (opts.delay || 0);
    var o = ctx.createOscillator();
    o.type = opts.type || 'square';
    o.frequency.setValueAtTime(opts.freq || 440, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, opts.slide), t + (opts.dur || 0.15));
    var g = out(0, opts.pan || 0);
    var lp = null;
    if (opts.lowpass) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.lowpass;
      o.connect(lp); lp.connect(g);
    } else o.connect(g);
    var v = opts.vol || 0.3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.001, t + (opts.dur || 0.15));
    o.start(t);
    o.stop(t + (opts.dur || 0.15) + 0.05);
  }

  // 材质 → 噪声参数
  var MAT = {
    stone: { freq: 520, q: 0.8, dur: 0.12, vol: 0.4 },
    wood: { freq: 240, q: 1.2, dur: 0.1, vol: 0.45 },
    grass: { freq: 950, q: 0.6, dur: 0.1, vol: 0.32 },
    gravel: { freq: 660, q: 0.7, dur: 0.12, vol: 0.4 },
    sand: { freq: 1400, q: 0.5, dur: 0.09, vol: 0.3 },
    glass: { freq: 2300, q: 2, dur: 0.1, vol: 0.32 },
    cloth: { freq: 800, q: 0.4, dur: 0.09, vol: 0.26 },
    snow: { freq: 1100, q: 0.4, dur: 0.09, vol: 0.3 }
  };

  var muted = (typeof location !== 'undefined' && /[?&]mute=1/.test(location.search));
  function play(name, opts) {
    opts = opts || {};
    if (muted) return;
    if (!ensure()) return;
    var sp = spatial(opts.pos);
    if (sp.vol <= 0.01) return;
    var vol = sp.vol * (opts.vol !== undefined ? opts.vol : 1);
    var pitch = opts.pitch || 1;
    var i, parts, mat;
    parts = name.split('_');
    var kind = parts[0];
    mat = MAT[parts[1]] || MAT.stone;

    switch (kind) {
      case 'dig':
        noise({ freq: mat.freq * pitch, q: mat.q, dur: mat.dur, vol: mat.vol * vol * 0.8, pan: sp.pan });
        break;
      case 'break':
        noise({ freq: mat.freq * 0.8 * pitch, q: mat.q, dur: mat.dur * 2.2, vol: mat.vol * vol, pan: sp.pan });
        if (parts[1] === 'glass') {
          for (i = 0; i < 3; i++) tone({ freq: 1800 + Math.random() * 1400, slide: 900, type: 'sine', dur: 0.12, vol: 0.12 * vol, pan: sp.pan, delay: i * 0.03 });
        }
        break;
      case 'place':
        noise({ freq: mat.freq * 0.7, q: mat.q, dur: mat.dur * 1.4, vol: mat.vol * vol, pan: sp.pan });
        break;
      case 'step':
        noise({ freq: mat.freq * 1.1 * pitch, q: mat.q * 0.7, dur: mat.dur * 0.7, vol: mat.vol * vol * 0.5, pan: sp.pan });
        break;
      case 'pop':
        tone({ freq: 380 * pitch, slide: 900 * pitch, type: 'square', dur: 0.09, vol: 0.16 * vol, lowpass: 2200, pan: sp.pan });
        break;
      case 'hurt':
        tone({ freq: 230, slide: 110, type: 'square', dur: 0.14, vol: 0.3 * vol, lowpass: 900 });
        break;
      case 'fall':
        noise({ freq: 300, q: 0.6, dur: 0.18, vol: 0.4 * vol, ftype: 'lowpass' });
        break;
      case 'eat':
        noise({ freq: 700 * pitch, q: 1.4, dur: 0.07, vol: 0.3 * vol });
        break;
      case 'burp':
        tone({ freq: 160, slide: 70, type: 'sawtooth', dur: 0.3, vol: 0.25 * vol, lowpass: 600 });
        break;
      case 'attack':
        noise({ freq: 1800, fslide: 500, q: 0.4, dur: 0.1, vol: 0.18 * vol, ftype: 'bandpass' });
        break;
      case 'explode':
        noise({ freq: 800 * pitch, fslide: 55, q: 0.3, dur: 1.1, vol: 0.85 * vol, ftype: 'lowpass', attack: 0.002, pan: sp.pan });
        tone({ freq: 70, slide: 36, type: 'sine', dur: 0.8, vol: 0.5 * vol, pan: sp.pan });
        break;
      case 'hiss':
        noise({ freq: 2400, q: 0.4, dur: 1.3, vol: 0.4 * vol, ftype: 'highpass', attack: 0.4, pan: sp.pan });
        break;
      case 'fuse':
        noise({ freq: 3000, q: 0.5, dur: 0.5, vol: 0.25 * vol, ftype: 'highpass', pan: sp.pan });
        break;
      case 'zombie':
        tone({ freq: 110 * pitch, slide: 75, type: 'sawtooth', dur: 0.45, vol: 0.3 * vol, lowpass: 420, attack: 0.08, pan: sp.pan });
        break;
      case 'mob':
        if (parts[1] === 'death') {
          tone({ freq: 320 * pitch, slide: 90, type: 'square', dur: 0.4, vol: 0.26 * vol, lowpass: 800, pan: sp.pan });
        } else {
          tone({ freq: 420 * pitch, slide: 240, type: 'square', dur: 0.15, vol: 0.22 * vol, lowpass: 1100, pan: sp.pan });
        }
        break;
      case 'splash':
        noise({ freq: 1300, fslide: 500, q: 0.5, dur: 0.35, vol: 0.4 * vol, pan: sp.pan });
        break;
      case 'fizz':
        noise({ freq: 2600, q: 0.5, dur: 0.5, vol: 0.4 * vol, ftype: 'highpass', pan: sp.pan });
        break;
      case 'ignite':
        noise({ freq: 1800, fslide: 3500, q: 0.7, dur: 0.25, vol: 0.3 * vol, pan: sp.pan });
        break;
      case 'tool':
        tone({ freq: 900, slide: 200, type: 'square', dur: 0.25, vol: 0.3 * vol });
        noise({ freq: 1500, q: 1.5, dur: 0.2, vol: 0.2 * vol });
        break;
      case 'chest':
        noise({ freq: 300, q: 1.4, dur: parts[1] === 'open' ? 0.25 : 0.15, vol: 0.3 * vol, pan: sp.pan });
        break;
      case 'click':
        tone({ freq: 700, type: 'square', dur: 0.04, vol: 0.12 * vol, lowpass: 1800 });
        break;
      case 'death':
        tone({ freq: 280, slide: 60, type: 'sawtooth', dur: 0.9, vol: 0.4 * vol, lowpass: 700 });
        break;
      case 'level':
        for (i = 0; i < 4; i++) tone({ freq: [520, 660, 780, 1040][i], type: 'square', dur: 0.18, vol: 0.1 * vol, delay: i * 0.09, lowpass: 2400 });
        break;
      case 'cave':
        tone({ freq: 90 + Math.random() * 60, slide: 50, type: 'sine', dur: 3.2, vol: 0.22 * vol, attack: 1.2 });
        tone({ freq: 140 + Math.random() * 80, slide: 70, type: 'sine', dur: 2.6, vol: 0.14 * vol, attack: 0.9, delay: 0.4 });
        break;
    }
  }

  // ---------- 生成式音乐 ----------
  var musicTimer = 120; // 秒
  var pentatonic = [0, 2, 4, 7, 9, 12, 14, 16];
  function musicTick(dt, calm) {
    if (!musicOn || !ctx) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer = 130 + Math.random() * 120;
    if (!calm) return;
    playPhrase();
  }
  function playPhrase() {
    var base = 220 * Math.pow(2, ((Math.random() * 3) | 0) / 12);
    var t = 0;
    var notes = 7 + (Math.random() * 8 | 0);
    var prev = 2;
    for (var i = 0; i < notes; i++) {
      prev = Util.clamp(prev + ((Math.random() * 3) | 0) - 1, 0, pentatonic.length - 1);
      var f = base * Math.pow(2, pentatonic[prev] / 12);
      var dur = Math.random() < 0.3 ? 1.2 : 0.6;
      (function (f2, t2, d2) {
        // 柔和拨弦: 正弦 + 轻微泛音, 接 musicGain
        var tt = ctx.currentTime + t2;
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f2;
        var o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.value = f2 * 2;
        var g = ctx.createGain();
        var g2 = ctx.createGain();
        g2.gain.value = 0.18;
        o.connect(g); o2.connect(g2); g2.connect(g);
        g.connect(musicGain);
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(0.16, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, tt + d2 * 2.2);
        o.start(tt); o.stop(tt + d2 * 2.4);
        o2.start(tt); o2.stop(tt + d2 * 2.4);
      })(f, t, dur);
      t += dur * (Math.random() < 0.25 ? 1.5 : 1);
    }
  }

  // 环境音 (洞穴)
  var caveTimer = 60;
  function ambientTick(dt, underground) {
    if (!ctx) return;
    caveTimer -= dt;
    if (caveTimer <= 0) {
      caveTimer = 45 + Math.random() * 90;
      if (underground && Math.random() < 0.6) play('cave', {});
    }
  }

  return {
    ensure: ensure, play: play, setVolume: setVolume, setMusic: setMusic,
    musicTick: musicTick, ambientTick: ambientTick,
    getVolume: function () { return volume; }, getMusic: function () { return musicOn; }
  };
})();
