// ============ mesher.js — chunk mesh generation (face culling + AO + smooth lighting) ============
'use strict';
var Mesher = (function () {
  var B = Blocks.B, BL = Blocks.BLOCKS;

  // opaque lookup table (for AO and culling)
  var OPAQ = new Uint8Array(256);
  (function () {
    for (var i = 0; i < BL.length; i++) if (BL[i]) OPAQ[i] = (BL[i].opaque && BL[i].solid) ? 1 : 0;
  })();

  // faces: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
  var FACES = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0], o: [1, 1, 1], shade: 0.65 },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0], o: [0, 1, 0], shade: 0.65 },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 1, 0], shade: 1.0 },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [0, 0, 1], shade: 0.55 },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0], o: [0, 1, 1], shade: 0.82 },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0], o: [1, 1, 0], shade: 0.82 }
  ];
  var AO_MUL = [0.45, 0.66, 0.84, 1.0];
  var T = 16 / 512; // tile uv size

  function Builder() {
    this.pos = []; this.uv = []; this.light = []; this.tint = []; this.idx = []; this.vc = 0;
  }
  Builder.prototype.quad = function (vs, uvs, ls, ts, flip) {
    var base = this.vc;
    for (var i = 0; i < 4; i++) {
      this.pos.push(vs[i][0], vs[i][1], vs[i][2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.light.push(ls[i][0], ls[i][1]);
      this.tint.push(ts[0], ts[1], ts[2]);
    }
    if (!flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base + 1, base, base + 3, base + 1, base + 3, base + 2);
    this.vc += 4;
  };
  Builder.prototype.pack = function () {
    if (this.vc === 0) return null;
    return {
      pos: new Float32Array(this.pos),
      uv: new Float32Array(this.uv),
      light: new Uint8Array(this.light),
      tint: new Uint8Array(this.tint),
      idx: this.vc < 16384 ? new Uint16Array(this.idx) : new Uint32Array(this.idx),
      count: this.idx.length
    };
  };

  var WHITE = [255, 255, 255];

  function buildColumn(world, col) {
    var cx = col.cx, cz = col.cz;
    var wx0 = cx * 16, wz0 = cz * 16;
    // 3x3 neighbor column cache
    var cols3 = [];
    for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) {
      cols3.push(world.getColumn(cx + dx, cz + dz));
    }
    function colOf(x, z) {
      return cols3[((x >> 4) - cx + 1) + ((z >> 4) - cz + 1) * 3];
    }
    function gb(x, y, z) {
      if (y < 0 || y >= 128) return 0;
      var c = colOf(x, z);
      return c ? c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0;
    }
    function gsky(x, y, z) {
      if (y >= 128) return 15;
      if (y < 0) return 0;
      var c = colOf(x, z);
      return c ? c.sky[(x & 15) | ((z & 15) << 4) | (y << 8)] : 15;
    }
    function gblk(x, y, z) {
      if (y < 0 || y >= 128) return 0;
      var c = colOf(x, z);
      return c ? c.blk[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0;
    }
    function gmeta(x, y, z) {
      if (y < 0 || y >= 128) return 0;
      var c = colOf(x, z);
      return c ? c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0;
    }

    var opq = new Builder(), trans = new Builder();

    // generic cube face emission (with AO + smooth lighting)
    // hTop: top y coordinate (for liquids), defaults to 1
    function emitFace(bld, x, y, z, f, tileI, tintRGB, hTop, noAO) {
      var F = FACES[f];
      var uvb = Tex.uv(tileI);
      var u0 = uvb[0], v0 = uvb[1];
      var nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
      var vs = [], uvs = [], ls = [];
      var aoSum = [0, 0, 0, 0];
      for (var ci = 0; ci < 4; ci++) {
        var s = (ci === 1 || ci === 2) ? 1 : 0;
        var t = (ci === 2 || ci === 3) ? 1 : 0;
        // position
        var px = F.o[0] + s * F.u[0] + t * F.v[0];
        var py = F.o[1] + s * F.u[1] + t * F.v[1];
        var pz = F.o[2] + s * F.u[2] + t * F.v[2];
        if (hTop !== 1 && py === 1) py = hTop;
        vs.push([x - wx0 + px, y + py, z - wz0 + pz]);
        uvs.push([u0 + s * T, v0 + t * T]);
        // AO + light sampling
        var du = s ? F.u : [-F.u[0], -F.u[1], -F.u[2]];
        var dv = t ? F.v : [-F.v[0], -F.v[1], -F.v[2]];
        var s1 = OPAQ[gb(nx + du[0], ny + du[1], nz + du[2])];
        var s2 = OPAQ[gb(nx + dv[0], ny + dv[1], nz + dv[2])];
        var sc = OPAQ[gb(nx + du[0] + dv[0], ny + du[1] + dv[1], nz + du[2] + dv[2])];
        var ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + sc);
        var aoF = noAO ? 1 : AO_MUL[ao];
        aoSum[ci] = ao;
        // light averaging
        var skySum = gsky(nx, ny, nz), blkSum = gblk(nx, ny, nz), cnt = 1;
        if (!s1) { skySum += gsky(nx + du[0], ny + du[1], nz + du[2]); blkSum += gblk(nx + du[0], ny + du[1], nz + du[2]); cnt++; }
        if (!s2) { skySum += gsky(nx + dv[0], ny + dv[1], nz + dv[2]); blkSum += gblk(nx + dv[0], ny + dv[1], nz + dv[2]); cnt++; }
        if (!(s1 && s2) && !sc) {
          skySum += gsky(nx + du[0] + dv[0], ny + du[1] + dv[1], nz + du[2] + dv[2]);
          blkSum += gblk(nx + du[0] + dv[0], ny + du[1] + dv[1], nz + du[2] + dv[2]);
          cnt++;
        }
        var m = F.shade * aoF * 255 / 15;
        ls.push([Math.min(255, skySum / cnt * m) | 0, Math.min(255, blkSum / cnt * m) | 0]);
      }
      var flip = (aoSum[0] + aoSum[2]) < (aoSum[1] + aoSum[3]);
      bld.quad(vs, uvs, ls, tintRGB, flip);
    }

    // custom quad (this cell's light, no AO)
    function emitQuad(bld, x, y, z, pts, uvr, tintRGB, both, shade) {
      shade = shade || 1;
      var sky = gsky(x, y, z), blk = gblk(x, y, z);
      var m = shade * 255 / 15;
      var l = [Math.min(255, sky * m) | 0, Math.min(255, blk * m) | 0];
      var ls = [l, l, l, l];
      var vs = [], uvs = [];
      for (var i = 0; i < 4; i++) {
        vs.push([x - wx0 + pts[i][0], y + pts[i][1], z - wz0 + pts[i][2]]);
        uvs.push([uvr[i][0], uvr[i][1]]);
      }
      bld.quad(vs, uvs, ls, tintRGB, false);
      if (both) {
        var vs2 = [vs[3], vs[2], vs[1], vs[0]];
        var uvs2 = [uvs[3], uvs[2], uvs[1], uvs[0]];
        bld.quad(vs2, uvs2, ls, tintRGB, false);
      }
    }

    function tileUVRect(tileI) {
      var b = Tex.uv(tileI);
      return [[b[0], b[1]], [b[0] + T, b[1]], [b[0] + T, b[1] + T], [b[0], b[1] + T]];
    }
    // sub-region uv (pixels): px0..px1, py0..py1
    function subUV(tileI, px0, py0, px1, py1) {
      var b = Tex.uv(tileI);
      var s = T / 16;
      return [[b[0] + px0 * s, b[1] + py0 * s], [b[0] + px1 * s, b[1] + py0 * s],
              [b[0] + px1 * s, b[1] + py1 * s], [b[0] + px0 * s, b[1] + py1 * s]];
    }

    function liquidHeight(id, meta) {
      if (meta === 0 || (meta & 8)) return 0.875;
      return Math.max(0.135, (8 - (meta & 7)) / 9);
    }

    var FACING_TO_FACE = [4, 5, 0, 1]; // meta facing → face index

    for (var y = 0; y < 128; y++) {
      for (var lz = 0; lz < 16; lz++) {
        for (var lx = 0; lx < 16; lx++) {
          var id = col.blocks[lx | (lz << 4) | (y << 8)];
          if (id === 0) continue;
          var b = BL[id];
          if (!b || b.render === 'none') continue;
          var x = wx0 + lx, z = wz0 + lz;
          var meta = col.meta[lx | (lz << 4) | (y << 8)];
          var ti = (lx | (lz << 4)) * 3;
          var tint = b.tint ? [col.tint[ti], col.tint[ti + 1], col.tint[ti + 2]] : WHITE;
          var f, nb, nid;

          switch (b.render) {
            case 'cube':
            case 'cactus': {
              var isCactus = b.render === 'cactus';
              var grassTopOnly = (id === B.GRASS);
              for (f = 0; f < 6; f++) {
                var Fc = FACES[f];
                nid = gb(x + Fc.n[0], y + Fc.n[1], z + Fc.n[2]);
                nb = BL[nid];
                if (OPAQ[nid]) continue;
                if (nid === id && (id === B.GLASS || id === B.ICE)) continue;
                var tile = b.faces[f];
                if (b.facing && f === FACING_TO_FACE[meta & 3]) tile = b.frontTile;
                var faceTint = (b.tint && (!grassTopOnly || f === 2)) ? tint : WHITE;
                var bld = b.transp ? trans : opq;
                if (isCactus && f < 6 && f !== 2 && f !== 3) {
                  // inset sides by 1/16
                  var inset = 1 / 16;
                  var pts = [];
                  var Fc2 = FACES[f];
                  for (var ci2 = 0; ci2 < 4; ci2++) {
                    var s2 = (ci2 === 1 || ci2 === 2) ? 1 : 0;
                    var t2 = (ci2 === 2 || ci2 === 3) ? 1 : 0;
                    var px2 = Fc2.o[0] + s2 * Fc2.u[0] + t2 * Fc2.v[0] - Fc2.n[0] * inset;
                    var py2 = Fc2.o[1] + s2 * Fc2.u[1] + t2 * Fc2.v[1];
                    var pz2 = Fc2.o[2] + s2 * Fc2.u[2] + t2 * Fc2.v[2] - Fc2.n[2] * inset;
                    pts.push([px2, py2, pz2]);
                  }
                  emitQuad(opq, x, y, z, pts, tileUVRect(tile), WHITE, false, FACES[f].shade);
                } else {
                  emitFace(bld, x, y, z, f, tile, faceTint, 1, false);
                }
              }
              break;
            }
            case 'liquid': {
              var h = liquidHeight(id, meta);
              var bldL = trans;
              for (f = 0; f < 6; f++) {
                var FL = FACES[f];
                nid = gb(x + FL.n[0], y + FL.n[1], z + FL.n[2]);
                if (nid === id) continue;
                if (f !== 2 && OPAQ[nid]) continue;
                emitFace(bldL, x, y, z, f, b.faces[f], WHITE, f === 2 ? h : (f === 3 ? 1 : h), true);
              }
              break;
            }
            case 'cross': {
              var uvr = tileUVRect(b.tex.all ? Tex.idx(b.tex.all) : b.faces[0]);
              var a = 0.146, c = 1 - 0.146;
              emitQuad(opq, x, y, z, [[a, 1, a], [c, 1, c], [c, 0, c], [a, 0, a]], uvr, b.tint ? tint : WHITE, true);
              emitQuad(opq, x, y, z, [[c, 1, a], [a, 1, c], [a, 0, c], [c, 0, a]], uvr, b.tint ? tint : WHITE, true);
              break;
            }
            case 'crop': {
              var stage = Math.min(7, meta);
              var cropTile = Tex.idx('wheat_' + stage);
              var uvc = tileUVRect(cropTile);
              var pos4 = [0.25, 0.75];
              for (var pi = 0; pi < 2; pi++) {
                var xx = pos4[pi];
                emitQuad(opq, x, y, z, [[xx, 1, 0], [xx, 1, 1], [xx, 0, 1], [xx, 0, 0]], uvc, WHITE, true);
                emitQuad(opq, x, y, z, [[0, 1, xx], [1, 1, xx], [1, 0, xx], [0, 0, xx]], uvc, WHITE, true);
              }
              break;
            }
            case 'torch': {
              var tt = Tex.idx('torch');
              // offset and lean (wall-mounted)
              var ox = 0, oz = 0, lean = null;
              if (meta >= 1 && meta <= 4) {
                var wd = [[1, 0], [-1, 0], [0, 1], [0, -1]][meta - 1];
                ox = wd[0] * 0.35; oz = wd[1] * 0.35;
                lean = wd;
              }
              function tp(px3, py3, pz3) {
                var sx = px3 - 0.5, sz = pz3 - 0.5;
                if (lean) {
                  var k = (1 - py3) * 0.35;
                  return [px3 + ox * 1 + lean[0] * k - lean[0] * 0.1, py3 + (lean ? 0.18 : 0), pz3 + oz * 1 + lean[1] * k - lean[1] * 0.1];
                }
                return [px3 + ox, py3, pz3 + oz];
              }
              void tp;
              var x0t = 7 / 16, x1t = 9 / 16, ht = 10 / 16;
              var sideUV = subUV(tt, 7, 6, 9, 16);
              var topUV = subUV(tt, 7, 4, 9, 6);
              function tw(p) {
                if (!lean) return [p[0] + ox, p[1], p[2] + oz];
                var k = (ht - p[1]) * 0.5;
                return [p[0] + ox + lean[0] * k * 0.8, p[1] + 0.12, p[2] + oz + lean[1] * k * 0.8];
              }
              // four sides
              var quads = [
                [[x0t, ht, x0t], [x1t, ht, x0t], [x1t, 0, x0t], [x0t, 0, x0t]],
                [[x1t, ht, x1t], [x0t, ht, x1t], [x0t, 0, x1t], [x1t, 0, x1t]],
                [[x0t, ht, x1t], [x0t, ht, x0t], [x0t, 0, x0t], [x0t, 0, x1t]],
                [[x1t, ht, x0t], [x1t, ht, x1t], [x1t, 0, x1t], [x1t, 0, x0t]]
              ];
              for (var qi = 0; qi < 4; qi++) {
                var q = quads[qi];
                var qpts = [tw(q[0]), tw(q[1]), tw(q[2]), tw(q[3])];
                emitQuad(opq, x, y, z, qpts, sideUV, WHITE, false);
              }
              var topPts = [tw([x0t, ht, x0t]), tw([x1t, ht, x0t]), tw([x1t, ht, x1t]), tw([x0t, ht, x1t])];
              emitQuad(opq, x, y, z, topPts, topUV, WHITE, false);
              break;
            }
            case 'ladder': {
              var lm = meta & 3;
              var ld = [[1, 0], [-1, 0], [0, 1], [0, -1]][lm];
              var off = 1 / 16;
              var luv = tileUVRect(Tex.idx('ladder'));
              var lpts;
              if (ld[0] === 1) lpts = [[1 - off, 1, 0], [1 - off, 1, 1], [1 - off, 0, 1], [1 - off, 0, 0]];
              else if (ld[0] === -1) lpts = [[off, 1, 1], [off, 1, 0], [off, 0, 0], [off, 0, 1]];
              else if (ld[1] === 1) lpts = [[1, 1, 1 - off], [0, 1, 1 - off], [0, 0, 1 - off], [1, 0, 1 - off]];
              else lpts = [[0, 1, off], [1, 1, off], [1, 0, off], [0, 0, off]];
              emitQuad(opq, x, y, z, lpts, luv, WHITE, true);
              break;
            }
            case 'snow': {
              var sh = 0.125;
              var stile = b.faces[0];
              // top face
              emitFace(opq, x, y, z, 2, stile, WHITE, sh, false);
              // four side 2px strips
              var sUV = subUV(stile, 0, 14, 16, 16);
              var sq = [
                [[0, sh, 0], [1, sh, 0], [1, 0, 0], [0, 0, 0]],
                [[1, sh, 1], [0, sh, 1], [0, 0, 1], [1, 0, 1]],
                [[0, sh, 1], [0, sh, 0], [0, 0, 0], [0, 0, 1]],
                [[1, sh, 0], [1, sh, 1], [1, 0, 1], [1, 0, 0]]
              ];
              var sdirs = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
              for (var si = 0; si < 4; si++) {
                if (OPAQ[gb(x + sdirs[si][0], y, z + sdirs[si][2])]) continue;
                emitQuad(opq, x, y, z, sq[si], sUV, WHITE, false, 0.8);
              }
              break;
            }
          }
        }
      }
    }
    return { o: opq.pack(), t: trans.pack() };
  }

  return { buildColumn: buildColumn, FACES: FACES, OPAQ: OPAQ };
})();
if (typeof module !== 'undefined') module.exports = Mesher;
