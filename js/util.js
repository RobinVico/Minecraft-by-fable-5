// ============ util.js — Math / RNG / Noise / Matrix ============
'use strict';
var Util = (function () {

  // ---------- Basics ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function mod(a, n) { return ((a % n) + n) % n; }

  // ---------- RNG ----------
  // mulberry32: fast seedable PRNG
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Integer coordinate hash → [0,1), for deterministic per-position random (trees, ores, and other cross-chunk features)
  function hash2(seed, x, z) {
    var h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3(seed, x, y, z) {
    var h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 2246822519) ^ Math.imul(z, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // String → 32-bit seed
  function strSeed(s) {
    s = String(s);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10) | 0;
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  }

  // ---------- Perlin noise ----------
  function Perlin(seed) {
    var rand = mulberry32(seed);
    var p = new Uint8Array(512);
    var perm = [];
    for (var i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) {
      var j = (rand() * (i + 1)) | 0;
      var t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (i = 0; i < 512; i++) p[i] = perm[i & 255];
    this.p = p;
  }
  var GRAD3 = new Float32Array([
    1,1,0,-1,1,0,1,-1,0,-1,-1,0, 1,0,1,-1,0,1,1,0,-1,-1,0,-1, 0,1,1,0,-1,1,0,1,-1,0,-1,-1
  ]);
  Perlin.prototype.noise2 = function (x, y) {
    var p = this.p;
    var X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y; X &= 255; Y &= 255;
    var u = x * x * x * (x * (x * 6 - 15) + 10);
    var v = y * y * y * (y * (y * 6 - 15) + 10);
    var A = p[X] + Y, B = p[X + 1] + Y;
    function g(h, x, y) {
      h = (h & 7) * 3;
      // use the xy components of the first 8 entries of the 3D gradient table
      return GRAD3[h] * x + GRAD3[h + 1] * y;
    }
    var n00 = g(p[A], x, y), n10 = g(p[B], x - 1, y);
    var n01 = g(p[A + 1], x, y - 1), n11 = g(p[B + 1], x - 1, y - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v); // ≈ [-1,1]
  };
  Perlin.prototype.noise3 = function (x, y, z) {
    var p = this.p;
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
    var u = x * x * x * (x * (x * 6 - 15) + 10);
    var v = y * y * y * (y * (y * 6 - 15) + 10);
    var w = z * z * z * (z * (z * 6 - 15) + 10);
    var A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    var B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    function g(h, x, y, z) {
      h = (h % 12) * 3;
      return GRAD3[h] * x + GRAD3[h + 1] * y + GRAD3[h + 2] * z;
    }
    return lerp(
      lerp(lerp(g(p[AA], x, y, z), g(p[BA], x - 1, y, z), u),
           lerp(g(p[AB], x, y - 1, z), g(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(g(p[AA + 1], x, y, z - 1), g(p[BA + 1], x - 1, y, z - 1), u),
           lerp(g(p[AB + 1], x, y - 1, z - 1), g(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
  // fractal Brownian motion
  Perlin.prototype.fbm2 = function (x, y, oct, lac, gain) {
    var amp = 1, freq = 1, sum = 0, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  };
  Perlin.prototype.fbm3 = function (x, y, z, oct, lac, gain) {
    var amp = 1, freq = 1, sum = 0, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  };
  // ridge noise (used for caves: small |n| → tunnel)
  Perlin.prototype.ridge2 = function (x, y) { return 1 - Math.abs(this.noise2(x, y)); };

  // ---------- mat4 (column-major, WebGL-compatible) ----------
  var M = {
    create: function () { var m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    identity: function (m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    perspective: function (m, fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      m.fill(0);
      m[0] = f / aspect; m[5] = f;
      m[10] = (far + near) * nf; m[11] = -1;
      m[14] = 2 * far * near * nf;
      return m;
    },
    multiply: function (out, a, b) {
      var a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],
          a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
      for (var i = 0; i < 4; i++) {
        var b0=b[i*4],b1=b[i*4+1],b2=b[i*4+2],b3=b[i*4+3];
        out[i*4]   = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[i*4+1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[i*4+2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[i*4+3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      }
      return out;
    },
    translate: function (out, m, x, y, z) {
      if (out !== m) out.set(m);
      out[12] = m[0]*x + m[4]*y + m[8]*z + m[12];
      out[13] = m[1]*x + m[5]*y + m[9]*z + m[13];
      out[14] = m[2]*x + m[6]*y + m[10]*z + m[14];
      out[15] = m[3]*x + m[7]*y + m[11]*z + m[15];
      return out;
    },
    rotateX: function (out, m, rad) {
      var s = Math.sin(rad), c = Math.cos(rad);
      var a10=m[4],a11=m[5],a12=m[6],a13=m[7],a20=m[8],a21=m[9],a22=m[10],a23=m[11];
      if (out !== m) { out.set(m); }
      out[4]=a10*c+a20*s; out[5]=a11*c+a21*s; out[6]=a12*c+a22*s; out[7]=a13*c+a23*s;
      out[8]=a20*c-a10*s; out[9]=a21*c-a11*s; out[10]=a22*c-a12*s; out[11]=a23*c-a13*s;
      return out;
    },
    rotateY: function (out, m, rad) {
      var s = Math.sin(rad), c = Math.cos(rad);
      var a00=m[0],a01=m[1],a02=m[2],a03=m[3],a20=m[8],a21=m[9],a22=m[10],a23=m[11];
      if (out !== m) { out.set(m); }
      out[0]=a00*c-a20*s; out[1]=a01*c-a21*s; out[2]=a02*c-a22*s; out[3]=a03*c-a23*s;
      out[8]=a00*s+a20*c; out[9]=a01*s+a21*c; out[10]=a02*s+a22*c; out[11]=a03*s+a23*c;
      return out;
    },
    rotateZ: function (out, m, rad) {
      var s = Math.sin(rad), c = Math.cos(rad);
      var a00=m[0],a01=m[1],a02=m[2],a03=m[3],a10=m[4],a11=m[5],a12=m[6],a13=m[7];
      if (out !== m) { out.set(m); }
      out[0]=a00*c+a10*s; out[1]=a01*c+a11*s; out[2]=a02*c+a12*s; out[3]=a03*c+a13*s;
      out[4]=a10*c-a00*s; out[5]=a11*c-a01*s; out[6]=a12*c-a02*s; out[7]=a13*c-a03*s;
      return out;
    },
    scale: function (out, m, x, y, z) {
      out[0]=m[0]*x; out[1]=m[1]*x; out[2]=m[2]*x; out[3]=m[3]*x;
      out[4]=m[4]*y; out[5]=m[5]*y; out[6]=m[6]*y; out[7]=m[7]*y;
      out[8]=m[8]*z; out[9]=m[9]*z; out[10]=m[10]*z; out[11]=m[11]*z;
      out[12]=m[12]; out[13]=m[13]; out[14]=m[14]; out[15]=m[15];
      return out;
    },
    clone: function (m) { return new Float32Array(m); }
  };

  // view matrix: camera at eye, yaw (around y), pitch (around x)
  // convention: yaw=0 faces -z, increasing yaw turns left (counterclockwise from above); positive pitch = look up
  function viewMatrix(out, eye, yaw, pitch) {
    M.identity(out);
    M.rotateX(out, out, -pitch);
    M.rotateY(out, out, -yaw);
    M.translate(out, out, -eye[0], -eye[1], -eye[2]);
    return out;
  }
  function dirFromAngles(yaw, pitch) {
    var cp = Math.cos(pitch);
    return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }

  // frustum plane extraction (from VP matrix), returns 6 planes [a,b,c,d]
  function frustumPlanes(vp, out) {
    out = out || [];
    var rows = [
      [vp[3]+vp[0], vp[7]+vp[4], vp[11]+vp[8], vp[15]+vp[12]],   // left
      [vp[3]-vp[0], vp[7]-vp[4], vp[11]-vp[8], vp[15]-vp[12]],   // right
      [vp[3]+vp[1], vp[7]+vp[5], vp[11]+vp[9], vp[15]+vp[13]],   // bottom
      [vp[3]-vp[1], vp[7]-vp[5], vp[11]-vp[9], vp[15]-vp[13]],   // top
      [vp[3]+vp[2], vp[7]+vp[6], vp[11]+vp[10], vp[15]+vp[14]],  // near
      [vp[3]-vp[2], vp[7]-vp[6], vp[11]-vp[10], vp[15]-vp[14]]   // far
    ];
    for (var i = 0; i < 6; i++) {
      var p = rows[i];
      var len = Math.hypot(p[0], p[1], p[2]) || 1;
      out[i] = [p[0]/len, p[1]/len, p[2]/len, p[3]/len];
    }
    return out;
  }
  // AABB vs frustum intersection test
  function aabbInFrustum(planes, x0, y0, z0, x1, y1, z1) {
    for (var i = 0; i < 6; i++) {
      var p = planes[i];
      var px = p[0] > 0 ? x1 : x0, py = p[1] > 0 ? y1 : y0, pz = p[2] > 0 ? z1 : z0;
      if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
  }

  return {
    clamp: clamp, lerp: lerp, smooth: smooth, mod: mod,
    mulberry32: mulberry32, hash2: hash2, hash3: hash3, strSeed: strSeed,
    Perlin: Perlin, M: M,
    viewMatrix: viewMatrix, dirFromAngles: dirFromAngles,
    frustumPlanes: frustumPlanes, aabbInFrustum: aabbInFrustum
  };
})();
if (typeof module !== 'undefined') module.exports = Util;
