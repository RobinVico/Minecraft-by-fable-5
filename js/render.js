// ============ render.js — WebGL2 渲染管线 ============
'use strict';
var Render = (function () {
  var gl, canvas;
  var M = Util.M;

  // ---------- 着色器源码 ----------
  var CHUNK_VS = '#version 300 es\nprecision highp float;\n' +
    'in vec3 aPos; in vec2 aUV; in vec2 aLight; in vec3 aTint;\n' +
    'uniform mat4 uVP; uniform vec3 uOrigin; uniform vec3 uCam;\n' +
    'out vec2 vUV; out vec2 vLight; out vec3 vTint; out float vDist;\n' +
    'void main(){ vec3 wp = aPos + uOrigin; gl_Position = uVP * vec4(wp, 1.0);\n' +
    '  vUV = aUV; vLight = aLight; vTint = aTint; vDist = distance(wp, uCam); }';
  var CHUNK_FS = '#version 300 es\nprecision highp float;\n' +
    'in vec2 vUV; in vec2 vLight; in vec3 vTint; in float vDist;\n' +
    'uniform sampler2D uTex; uniform float uDayF; uniform vec3 uFogCol; uniform vec2 uFogRange;\n' +
    'uniform float uAlpha; uniform int uCutout;\n' +
    'out vec4 frag;\n' +
    'void main(){ vec4 t = texture(uTex, vUV);\n' +
    '  if (uCutout == 1 && t.a < 0.5) discard;\n' +
    '  float skyL = vLight.x * uDayF;\n' +
    '  float light = max(vLight.y, skyL);\n' +
    '  float b = 0.03 + 0.97 * pow(light, 1.5);\n' +
    '  float warm = clamp((vLight.y - skyL) * 2.2, 0.0, 1.0) * vLight.y;\n' +
    '  vec3 tintL = mix(vec3(1.0), vec3(1.12, 0.92, 0.7), warm * 0.55);\n' +
    '  vec3 c = t.rgb * vTint * b * tintL;\n' +
    '  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);\n' +
    '  frag = vec4(mix(c, uFogCol, f), t.a * uAlpha); }';

  var SKY_VS = '#version 300 es\nprecision highp float;\n' +
    'in vec2 aPos; out vec2 vNDC;\n' +
    'void main(){ vNDC = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }';
  var SKY_FS = '#version 300 es\nprecision highp float;\n' +
    'in vec2 vNDC; out vec4 frag;\n' +
    'uniform mat4 uInvVP; uniform vec3 uCam; uniform vec3 uZen; uniform vec3 uHor;\n' +
    'uniform float uStarA; uniform vec3 uSunDir; uniform float uTime;\n' +
    'void main(){\n' +
    '  vec4 p = uInvVP * vec4(vNDC, 1.0, 1.0);\n' +
    '  vec3 dir = normalize(p.xyz / p.w - uCam);\n' +
    '  float h = dir.y;\n' +
    '  vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.6));\n' +
    '  if (h < 0.0) col = mix(uHor, uHor * 0.45, clamp(-h * 3.0, 0.0, 1.0));\n' +
    '  float g = pow(max(dot(dir, uSunDir), 0.0), 10.0);\n' +
    '  col += vec3(1.0, 0.75, 0.45) * g * 0.35;\n' +
    '  if (uStarA > 0.001 && h > 0.02) {\n' +
    '    vec3 sd = floor(dir * 110.0);\n' +
    '    float hsh = fract(sin(dot(sd, vec3(12.9898, 78.233, 37.719))) * 43758.5453);\n' +
    '    if (hsh > 0.997) { float tw = 0.6 + 0.4 * sin(uTime * 2.0 + hsh * 60.0); col += vec3(0.9) * uStarA * tw; }\n' +
    '  }\n' +
    '  frag = vec4(col, 1.0); }';

  var ENT_VS = '#version 300 es\nprecision highp float;\n' +
    'in vec3 aPos; in vec2 aUV; in float aShade;\n' +
    'uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uCam;\n' +
    'out vec2 vUV; out float vShade; out float vDist;\n' +
    'void main(){ vec4 wp = uModel * vec4(aPos, 1.0); gl_Position = uVP * wp;\n' +
    '  vUV = aUV; vShade = aShade; vDist = distance(wp.xyz, uCam); }';
  var ENT_FS = '#version 300 es\nprecision highp float;\n' +
    'in vec2 vUV; in float vShade; in float vDist;\n' +
    'uniform sampler2D uTex; uniform vec2 uLight; uniform float uDayF;\n' +
    'uniform vec3 uFogCol; uniform vec2 uFogRange; uniform vec4 uTintMix; uniform float uAlpha;\n' +
    'out vec4 frag;\n' +
    'void main(){ vec4 t = texture(uTex, vUV);\n' +
    '  if (t.a < 0.2) discard;\n' +
    '  float light = max(uLight.y, uLight.x * uDayF);\n' +
    '  float b = (0.03 + 0.97 * pow(light, 1.5)) * vShade;\n' +
    '  vec3 c = mix(t.rgb * b, uTintMix.rgb, uTintMix.a);\n' +
    '  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);\n' +
    '  frag = vec4(mix(c, uFogCol, f), uAlpha); }';

  var LINE_VS = '#version 300 es\nprecision highp float;\n' +
    'in vec3 aPos; uniform mat4 uVP; uniform vec3 uOrigin; uniform vec3 uScale;\n' +
    'void main(){ gl_Position = uVP * vec4(aPos * uScale + uOrigin, 1.0); }';
  var LINE_FS = '#version 300 es\nprecision highp float;\n' +
    'uniform vec4 uColor; out vec4 frag;\n' +
    'void main(){ frag = uColor; }';

  var PART_VS = '#version 300 es\nprecision highp float;\n' +
    'in vec3 aPos; in vec2 aUV; in vec2 aLight;\n' +
    'uniform mat4 uVP; uniform vec3 uCam;\n' +
    'out vec2 vUV; out vec2 vLight; out float vDist;\n' +
    'void main(){ gl_Position = uVP * vec4(aPos, 1.0); vUV = aUV; vLight = aLight; vDist = distance(aPos, uCam); }';
  var PART_FS = '#version 300 es\nprecision highp float;\n' +
    'in vec2 vUV; in vec2 vLight; in float vDist;\n' +
    'uniform sampler2D uTex; uniform float uDayF; uniform vec3 uFogCol; uniform vec2 uFogRange;\n' +
    'out vec4 frag;\n' +
    'void main(){ vec4 t = texture(uTex, vUV);\n' +
    '  if (t.a < 0.15) discard;\n' +
    '  float light = max(vLight.y, vLight.x * uDayF);\n' +
    '  float b = 0.03 + 0.97 * pow(light, 1.5);\n' +
    '  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);\n' +
    '  frag = vec4(mix(t.rgb * b, uFogCol, f), t.a); }';

  // ---------- GL 工具 ----------
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Link: ' + gl.getProgramInfoLog(p));
    }
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }

  var progChunk, progSky, progEnt, progLine, progPart;
  var atlasTex;
  var skyVAO, lineVAO, cloudTex, cloudVAO;
  var proj = M.create(), view = M.create(), vp = M.create(), invVP = M.create();
  var tmpM = M.create(), tmpM2 = M.create();
  var camPos = [0, 0, 0];
  var frustum = [];
  var fogColor = [0.7, 0.8, 1];
  var fogRange = [50, 90];
  var dayF = 1;
  var timeSec = 0;

  // ---------- 初始化 ----------
  function init(cv) {
    canvas = cv;
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 不可用');
    progChunk = program(CHUNK_VS, CHUNK_FS);
    progSky = program(SKY_VS, SKY_FS);
    progEnt = program(ENT_VS, ENT_FS);
    progLine = program(LINE_VS, LINE_FS);
    progPart = program(PART_VS, PART_FS);

    // 图集纹理 + 分层 mip (不跨 tile)
    atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    uploadAtlas();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 4);

    // 天空全屏三角
    skyVAO = gl.createVertexArray();
    gl.bindVertexArray(skyVAO);
    var sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // 选框线
    lineVAO = gl.createVertexArray();
    gl.bindVertexArray(lineVAO);
    var lb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lb);
    var e = 0.002, a = -e, b = 1 + e;
    var L = [a,a,a, b,a,a, b,a,a, b,a,b, b,a,b, a,a,b, a,a,b, a,a,a,
             a,b,a, b,b,a, b,b,a, b,b,b, b,b,b, a,b,b, a,b,b, a,b,a,
             a,a,a, a,b,a, b,a,a, b,b,a, b,a,b, b,b,b, a,a,b, a,b,b];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(L), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    buildClouds();
    buildEntityMeshes();
    buildCrackBuffer();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.5, 0.7, 1, 1);
    resize();
  }

  function uploadAtlas() {
    var cnv = Tex.atlasCanvas();
    var ctx = cnv.getContext('2d');
    var d0 = ctx.getImageData(0, 0, 512, 512);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
    var prev = d0.data, prevSize = 512;
    for (var lv = 1; lv <= 4; lv++) {
      var s = 512 >> lv;
      var out = new Uint8ClampedArray(s * s * 4);
      for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
        var i0 = ((y * 2) * prevSize + x * 2) * 4, i1 = i0 + 4;
        var i2 = i0 + prevSize * 4, i3 = i2 + 4;
        for (var c = 0; c < 4; c++) {
          out[(y * s + x) * 4 + c] = (prev[i0 + c] + prev[i1 + c] + prev[i2 + c] + prev[i3 + c]) >> 2;
        }
      }
      gl.texImage2D(gl.TEXTURE_2D, lv, gl.RGBA, s, s, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(out.buffer));
      prev = out; prevSize = s;
    }
  }

  // 水/岩浆动画上传
  function updateLiquidTiles(t) {
    var regions = Tex.tickLiquidAnim(t);
    if (!regions) return;
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(r.data.buffer));
      // mips
      var prev = r.data, ps = 16;
      for (var lv = 1; lv <= 4; lv++) {
        var s = 16 >> lv;
        var out = new Uint8ClampedArray(s * s * 4);
        for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
          var i0 = ((y * 2) * ps + x * 2) * 4, i1 = i0 + 4, i2 = i0 + ps * 4, i3 = i2 + 4;
          for (var c = 0; c < 4; c++) out[(y * s + x) * 4 + c] = (prev[i0 + c] + prev[i1 + c] + prev[i2 + c] + prev[i3 + c]) >> 2;
        }
        gl.texSubImage2D(gl.TEXTURE_2D, lv, r.x >> lv, r.y >> lv, s, s, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(out.buffer));
        prev = out; ps = s;
      }
    }
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth * dpr | 0, h = canvas.clientHeight * dpr | 0;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // ---------- 云 ----------
  function buildClouds() {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var x = c.getContext('2d');
    var img = x.createImageData(256, 256);
    var rnd = Util.mulberry32(777);
    var per = new Util.Perlin(777);
    for (var py = 0; py < 256; py++) for (var px = 0; px < 256; px++) {
      var cx = px >> 3, cy = py >> 3;
      var n = per.fbm2(cx * 0.12, cy * 0.12, 3, 2, 0.5);
      var on = n > 0.18;
      var i = (py * 256 + px) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = on ? 235 : 0;
    }
    void rnd;
    x.putImageData(img, 0, 0);
    cloudTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // 云面片 (粒子着色器复用: pos + uv + light)
    cloudVAO = gl.createVertexArray();
    gl.bindVertexArray(cloudVAO);
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, 6 * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    gl.bindVertexArray(null);
    cloudVAO.vb = vb;
  }

  function drawClouds(worldTime) {
    var y = 108;
    var drift = timeSec * 0.6;
    var S = 700;
    var cx = camPos[0], cz = camPos[2];
    var u0 = (cx - S + drift) / 1024, u1 = (cx + S + drift) / 1024;
    var v0 = (cz - S) / 1024, v1 = (cz + S) / 1024;
    var lt = dayF;
    var data = new Float32Array([
      cx - S, y, cz - S, u0, v0, 255, 0,
      cx + S, y, cz - S, u1, v0, 255, 0,
      cx + S, y, cz + S, u1, v1, 255, 0,
      cx - S, y, cz - S, u0, v0, 255, 0,
      cx + S, y, cz + S, u1, v1, 255, 0,
      cx - S, y, cz + S, u0, v1, 255, 0
    ]);
    // light 编码在 PART shader 是 0..255 → /255: 直接给 255 (天光满)
    for (var i = 0; i < 6; i++) { data[i * 7 + 5] = 1.0; data[i * 7 + 6] = 0; }
    void lt; void worldTime;
    gl.useProgram(progPart.p);
    gl.uniformMatrix4fv(progPart.u.uVP, false, vp);
    gl.uniform3fv(progPart.u.uCam, camPos);
    gl.uniform1f(progPart.u.uDayF, dayF);
    gl.uniform3fv(progPart.u.uFogCol, fogColor);
    gl.uniform2f(progPart.u.uFogRange, fogRange[1] * 2.5, fogRange[1] * 4);
    gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    gl.bindVertexArray(cloudVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudVAO.vb);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // ---------- 帧设置 ----------
  function begin(eye, yaw, pitch, fov, renderDist, day, fog, tsec) {
    resize();
    camPos[0] = eye[0]; camPos[1] = eye[1]; camPos[2] = eye[2];
    dayF = day;
    timeSec = tsec;
    fogColor = fog.color;
    fogRange = fog.range;
    var aspect = canvas.width / canvas.height;
    M.perspective(proj, fov * Math.PI / 180, aspect, 0.08, Math.max(300, renderDist * 16 * 1.6));
    Util.viewMatrix(view, eye, yaw, pitch);
    M.multiply(vp, proj, view);
    Util.frustumPlanes(vp, frustum);
    gl.clearColor(fog.color[0], fog.color[1], fog.color[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  // 逆矩阵 (仅天空用, 4x4 通用求逆)
  function invert(out, m) {
    var inv = new Float32Array(16);
    inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
    inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
    inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
    inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
    var det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
    if (!det) return out;
    det = 1.0 / det;
    for (var i = 0; i < 16; i++) out[i] = inv[i] * det;
    return out;
  }

  // ---------- 天空 ----------
  function drawSky(sky) {
    invert(invVP, vp);
    gl.useProgram(progSky.p);
    gl.uniformMatrix4fv(progSky.u.uInvVP, false, invVP);
    gl.uniform3fv(progSky.u.uCam, camPos);
    gl.uniform3fv(progSky.u.uZen, sky.zenith);
    gl.uniform3fv(progSky.u.uHor, sky.horizon);
    gl.uniform1f(progSky.u.uStarA, sky.starA);
    gl.uniform3fv(progSky.u.uSunDir, sky.sunDir);
    gl.uniform1f(progSky.u.uTime, timeSec);
    gl.depthMask(false);
    gl.bindVertexArray(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // 太阳与月亮 (公告板)
    drawCelestial(Tex.region('sun'), sky.sunDir, 16, false);
    drawCelestial(Tex.region('moon'), [-sky.sunDir[0], -sky.sunDir[1], -sky.sunDir[2]], 11, false);
    gl.depthMask(true);
  }

  var celesBuf = null;
  function drawCelestial(region, dir, size, additive) {
    if (!region || dir[1] < -0.35) return;
    if (!celesBuf) {
      celesBuf = gl.createVertexArray();
      gl.bindVertexArray(celesBuf);
      var vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, 6 * 7 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
      gl.bindVertexArray(null);
      celesBuf.vb = vb;
    }
    var d = 160;
    var cx2 = camPos[0] + dir[0] * d, cy2 = camPos[1] + dir[1] * d, cz2 = camPos[2] + dir[2] * d;
    var ux = 0, uy = 0, uz = 1;
    var vx = dir[1] * uz - dir[2] * uy, vy = dir[2] * ux - dir[0] * uz, vz = dir[0] * uy - dir[1] * ux;
    var u0 = region.x / 512, v0 = region.y / 512, u1 = (region.x + region.w) / 512, v1 = (region.y + region.h) / 512;
    var s = size;
    function vert(su, sv, uu, vv2) {
      return [cx2 + ux * su * s + vx * sv * s, cy2 + uy * su * s + vy * sv * s, cz2 + uz * su * s + vz * sv * s, uu, vv2, 1, 0];
    }
    var q = [].concat(
      vert(-1, -1, u0, v0), vert(1, -1, u1, v0), vert(1, 1, u1, v1),
      vert(-1, -1, u0, v0), vert(1, 1, u1, v1), vert(-1, 1, u0, v1)
    );
    gl.useProgram(progPart.p);
    gl.uniformMatrix4fv(progPart.u.uVP, false, vp);
    gl.uniform3fv(progPart.u.uCam, camPos);
    gl.uniform1f(progPart.u.uDayF, 1);
    gl.uniform3fv(progPart.u.uFogCol, fogColor);
    gl.uniform2f(progPart.u.uFogRange, 9999, 10000);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.bindVertexArray(celesBuf);
    gl.bindBuffer(gl.ARRAY_BUFFER, celesBuf.vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // ---------- 区块网格 ----------
  function uploadColumn(col, data) {
    deleteColumnMesh(col);
    col.mesh = { o: makeChunkVAO(data.o), t: makeChunkVAO(data.t) };
  }
  function makeChunkVAO(d) {
    if (!d) return null;
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var bufs = [];
    function attr(loc, arr, size, type, norm) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
      bufs.push(b);
    }
    attr(0, d.pos, 3, gl.FLOAT, false);
    attr(1, d.uv, 2, gl.FLOAT, false);
    attr(2, d.light, 2, gl.UNSIGNED_BYTE, true);
    attr(3, d.tint, 3, gl.UNSIGNED_BYTE, true);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.idx, gl.STATIC_DRAW);
    bufs.push(ibo);
    gl.bindVertexArray(null);
    return { vao: vao, count: d.count, type: (d.idx instanceof Uint16Array) ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, bufs: bufs };
  }
  function deleteColumnMesh(col) {
    if (!col.mesh) return;
    ['o', 't'].forEach(function (k) {
      var m = col.mesh[k];
      if (!m) return;
      m.bufs.forEach(function (b) { gl.deleteBuffer(b); });
      gl.deleteVertexArray(m.vao);
    });
    col.mesh = null;
  }

  function colVisible(col) {
    var x0 = col.cx * 16, z0 = col.cz * 16;
    return Util.aabbInFrustum(frustum, x0, 0, z0, x0 + 16, 128, z0 + 16);
  }

  function drawWorld(cols) {
    gl.useProgram(progChunk.p);
    gl.uniformMatrix4fv(progChunk.u.uVP, false, vp);
    gl.uniform3fv(progChunk.u.uCam, camPos);
    gl.uniform1f(progChunk.u.uDayF, dayF);
    gl.uniform3fv(progChunk.u.uFogCol, fogColor);
    gl.uniform2fv(progChunk.u.uFogRange, fogRange);
    gl.uniform1i(progChunk.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    var i, col, m;
    // 不透明 (近→远)
    gl.uniform1i(progChunk.u.uCutout, 1);
    gl.uniform1f(progChunk.u.uAlpha, 1);
    for (i = 0; i < cols.length; i++) {
      col = cols[i];
      if (!col.mesh || !col.mesh.o || !colVisible(col)) continue;
      m = col.mesh.o;
      gl.uniform3f(progChunk.u.uOrigin, col.cx * 16, 0, col.cz * 16);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
    }
    // 半透明 (远→近)
    gl.uniform1i(progChunk.u.uCutout, 0);
    gl.uniform1f(progChunk.u.uAlpha, 0.8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    for (i = cols.length - 1; i >= 0; i--) {
      col = cols[i];
      if (!col.mesh || !col.mesh.t || !colVisible(col)) continue;
      m = col.mesh.t;
      gl.uniform3f(progChunk.u.uOrigin, col.cx * 16, 0, col.cz * 16);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
    }
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // ---------- 实体 ----------
  var partMeshes = {};   // modelName -> [per-part {vao,count}]
  var blockCubeCache = {}; // blockId -> {vao,count} (掉落物/下落方块)
  var itemQuadCache = {};  // tileIdx -> {vao,count}

  function buildBoxMesh(hw, hh, hd, rects, region) {
    // rects: {top,bottom,right,front,left,back} 像素矩形 (区域内)
    var pos = [], uv = [], shade = [], idx = [], vc = 0;
    function face(verts, rect, sh) {
      var u0 = (region.x + rect[0]) / 512, v0 = (region.y + rect[1]) / 512;
      var u1 = (region.x + rect[0] + rect[2]) / 512, v1 = (region.y + rect[1] + rect[3]) / 512;
      var us = [u0, u1, u1, u0], vs = [v0, v0, v1, v1];
      for (var i = 0; i < 4; i++) {
        pos.push(verts[i][0], verts[i][1], verts[i][2]);
        uv.push(us[i], vs[i]);
        shade.push(sh);
      }
      idx.push(vc, vc + 2, vc + 1, vc, vc + 3, vc + 2);
      vc += 4;
    }
    // 前 -z (从前看: 左上,右上,右下,左下)
    face([[hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, -hd], [hw, -hh, -hd]], rects.front, 0.85);
    // 后 +z
    face([[-hw, hh, hd], [hw, hh, hd], [hw, -hh, hd], [-hw, -hh, hd]], rects.back, 0.85);
    // 右 +x
    face([[hw, hh, hd], [hw, hh, -hd], [hw, -hh, -hd], [hw, -hh, hd]], rects.right, 0.7);
    // 左 -x
    face([[-hw, hh, -hd], [-hw, hh, hd], [-hw, -hh, hd], [-hw, -hh, -hd]], rects.left, 0.7);
    // 上 +y
    face([[-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd]], rects.top, 1.0);
    // 下 -y
    face([[-hw, -hh, hd], [hw, -hh, hd], [hw, -hh, -hd], [-hw, -hh, -hd]], rects.bottom, 0.6);
    return makeEntVAO(new Float32Array(pos), new Float32Array(uv), new Float32Array(shade), new Uint16Array(idx));
  }
  function makeEntVAO(pos, uv, shade, idx) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function attr(loc, arr, size) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    attr(0, pos, 3);
    attr(1, uv, 2);
    attr(2, shade, 1);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao: vao, count: idx.length };
  }

  function buildEntityMeshes() {
    var MODELS = Tex2.MODELS;
    for (var name in MODELS) {
      var model = MODELS[name];
      var meshes = [];
      for (var i = 0; i < model.parts.length; i++) {
        var p = model.parts[i];
        var rects = Tex2.boxUV(p.uv[0], p.uv[1], p.size[0], p.size[1], p.size[2]);
        // 区域在绘制时按皮肤选择 → 网格 uv 基于默认 tex 区域; 不同皮肤同布局时共用模型但纹理区域不同
        meshes.push({ part: p, rectsRaw: rects });
      }
      partMeshes[name] = meshes;
    }
  }
  // 每个 (model, skin) 组合的网格实例化缓存
  var modelSkinCache = {};
  function meshesFor(modelName, skinName) {
    var key = modelName + '|' + skinName;
    if (modelSkinCache[key]) return modelSkinCache[key];
    var region = Tex.region(skinName);
    var model = Tex2.MODELS[modelName];
    var out = [];
    for (var i = 0; i < model.parts.length; i++) {
      var p = model.parts[i];
      var rects = Tex2.boxUV(p.uv[0], p.uv[1], p.size[0], p.size[1], p.size[2]);
      var mesh = buildBoxMesh(p.size[0] / 32, p.size[1] / 32, p.size[2] / 32, rects, region);
      mesh.part = p;
      out.push(mesh);
    }
    modelSkinCache[key] = out;
    return out;
  }

  // 方块小立方体 (掉落物 / 下落方块 / TNT实体)
  function blockCube(id) {
    if (blockCubeCache[id]) return blockCubeCache[id];
    var b = Blocks.BLOCKS[id];
    var faces = b.faces; // [+x,-x,+y,-y,+z,-z]
    var pos = [], uv = [], shade = [], idx = [], vc = 0;
    var tintCol = b.tint ? [0.57, 0.74, 0.35] : null;
    void tintCol; // 染色烘焙进着色器不可行, 掉落物用原灰度即可
    var T2 = 16 / 512;
    function face(verts, tileI, sh) {
      var u = Tex.uv(tileI);
      var us = [u[0], u[0] + T2, u[0] + T2, u[0]], vs = [u[1], u[1], u[1] + T2, u[1] + T2];
      for (var i = 0; i < 4; i++) {
        pos.push(verts[i][0], verts[i][1], verts[i][2]);
        uv.push(us[i], vs[i]);
        shade.push(sh);
      }
      idx.push(vc, vc + 2, vc + 1, vc, vc + 3, vc + 2);
      vc += 4;
    }
    var h = 0.5;
    face([[h, h, h], [h, h, -h], [h, -h, -h], [h, -h, h]], faces[0], 0.7);
    face([[-h, h, -h], [-h, h, h], [-h, -h, h], [-h, -h, -h]], faces[1], 0.7);
    face([[-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h]], faces[2], 1.0);
    face([[-h, -h, h], [h, -h, h], [h, -h, -h], [-h, -h, -h]], faces[3], 0.6);
    face([[-h, h, h], [h, h, h], [h, -h, h], [-h, -h, h]], faces[4], 0.85);
    face([[h, h, -h], [-h, h, -h], [-h, -h, -h], [h, -h, -h]], faces[5], 0.85);
    var m = makeEntVAO(new Float32Array(pos), new Float32Array(uv), new Float32Array(shade), new Uint16Array(idx));
    blockCubeCache[id] = m;
    return m;
  }

  // 物品面片
  function itemQuad(tileI) {
    if (itemQuadCache[tileI]) return itemQuadCache[tileI];
    var u = Tex.uv(tileI);
    var T2 = 16 / 512;
    var h = 0.5;
    var pos = [-h, h, 0, h, h, 0, h, -h, 0, -h, -h, 0, h, h, 0, -h, h, 0, -h, -h, 0, h, -h, 0];
    var uvA = [u[0], u[1], u[0] + T2, u[1], u[0] + T2, u[1] + T2, u[0], u[1] + T2,
               u[0], u[1], u[0] + T2, u[1], u[0] + T2, u[1] + T2, u[0], u[1] + T2];
    var shade = [1, 1, 1, 1, 1, 1, 1, 1];
    var idx = [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6];
    var m = makeEntVAO(new Float32Array(pos), new Float32Array(uvA), new Float32Array(shade), new Uint16Array(idx));
    itemQuadCache[tileI] = m;
    return m;
  }

  function beginEntities() {
    gl.useProgram(progEnt.p);
    gl.uniformMatrix4fv(progEnt.u.uVP, false, vp);
    gl.uniform3fv(progEnt.u.uCam, camPos);
    gl.uniform1f(progEnt.u.uDayF, dayF);
    gl.uniform3fv(progEnt.u.uFogCol, fogColor);
    gl.uniform2fv(progEnt.u.uFogRange, fogRange);
    gl.uniform1i(progEnt.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  }
  function drawEntMesh(mesh, model, light, tintMix, alpha) {
    gl.uniformMatrix4fv(progEnt.u.uModel, false, model);
    gl.uniform2f(progEnt.u.uLight, light[0] / 15, light[1] / 15);
    gl.uniform4fv(progEnt.u.uTintMix, tintMix || [0, 0, 0, 0]);
    gl.uniform1f(progEnt.u.uAlpha, alpha === undefined ? 1 : alpha);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  // ---------- 选框 / 裂纹 ----------
  function drawSelection(x, y, z, box) {
    gl.useProgram(progLine.p);
    gl.uniformMatrix4fv(progLine.u.uVP, false, vp);
    box = box || [0, 0, 0, 1, 1, 1];
    gl.uniform3f(progLine.u.uOrigin, x + box[0], y + box[1], z + box[2]);
    gl.uniform3f(progLine.u.uScale, box[3] - box[0], box[4] - box[1], box[5] - box[2]);
    gl.uniform4f(progLine.u.uColor, 0, 0, 0, 0.45);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(lineVAO);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  var crackVAO = null, crackVB = null;
  function buildCrackBuffer() {
    crackVAO = gl.createVertexArray();
    gl.bindVertexArray(crackVAO);
    crackVB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, crackVB);
    gl.bufferData(gl.ARRAY_BUFFER, 36 * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    gl.bindVertexArray(null);
  }
  function drawCrack(x, y, z, stage) {
    var tile = Tex.idx('crack_' + Math.min(9, stage));
    var u = Tex.uv(tile);
    var T2 = 16 / 512;
    var e = 0.004;
    var a = -e, b2 = 1 + e;
    var v = [];
    function quad(p0, p1, p2, p3) {
      var pts = [p0, p1, p2, p3];
      var us = [u[0], u[0] + T2, u[0] + T2, u[0]], vs = [u[1], u[1], u[1] + T2, u[1] + T2];
      var order = [0, 2, 1, 0, 3, 2];
      for (var i = 0; i < 6; i++) {
        var pi = order[i];
        v.push(x + pts[pi][0], y + pts[pi][1], z + pts[pi][2], us[pi], vs[pi], 1, 0);
      }
    }
    quad([b2, b2, b2], [b2, b2, a], [b2, a, a], [b2, a, b2]);
    quad([a, b2, a], [a, b2, b2], [a, a, b2], [a, a, a]);
    quad([a, b2, a], [b2, b2, a], [b2, b2, b2], [a, b2, b2]);
    quad([a, a, b2], [b2, a, b2], [b2, a, a], [a, a, a]);
    quad([a, b2, b2], [b2, b2, b2], [b2, a, b2], [a, a, b2]);
    quad([b2, b2, a], [a, b2, a], [a, a, a], [b2, a, a]);
    gl.useProgram(progPart.p);
    gl.uniformMatrix4fv(progPart.u.uVP, false, vp);
    gl.uniform3fv(progPart.u.uCam, camPos);
    gl.uniform1f(progPart.u.uDayF, 1);
    gl.uniform3fv(progPart.u.uFogCol, fogColor);
    gl.uniform2f(progPart.u.uFogRange, 9999, 10000);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.bindVertexArray(crackVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, crackVB);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-3, -3);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // ---------- 粒子 ----------
  var partVAO = null, partVB = null;
  function ensurePartBuf() {
    if (partVAO) return;
    partVAO = gl.createVertexArray();
    gl.bindVertexArray(partVAO);
    partVB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, partVB);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    gl.bindVertexArray(null);
  }
  // particles: [{x,y,z,size,u0,v0,u1,v1,sky,blk}, ...]
  function drawParticles(list, yaw, pitch) {
    if (!list.length) return;
    ensurePartBuf();
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    // 相机右/上向量
    var rx = cy, ry = 0, rz = -sy;
    var ux2 = sy * sp, uy2 = cp, uz2 = cy * sp;
    var data = new Float32Array(list.length * 42);
    var o = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var s = p.size;
      var corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
      var us = [p.u0, p.u1, p.u1, p.u0], vs = [p.v0, p.v0, p.v1, p.v1];
      var order = [0, 2, 1, 0, 3, 2];
      for (var k = 0; k < 6; k++) {
        var ci = order[k];
        var cxv = corners[ci][0] * s, cyv = corners[ci][1] * s;
        data[o++] = p.x + rx * cxv + ux2 * cyv;
        data[o++] = p.y + ry * cxv + uy2 * cyv;
        data[o++] = p.z + rz * cxv + uz2 * cyv;
        data[o++] = us[ci]; data[o++] = vs[ci];
        data[o++] = p.sky / 15; data[o++] = p.blk / 15;
      }
    }
    gl.useProgram(progPart.p);
    gl.uniformMatrix4fv(progPart.u.uVP, false, vp);
    gl.uniform3fv(progPart.u.uCam, camPos);
    gl.uniform1f(progPart.u.uDayF, dayF);
    gl.uniform3fv(progPart.u.uFogCol, fogColor);
    gl.uniform2fv(progPart.u.uFogRange, fogRange);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.bindVertexArray(partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, partVB);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, list.length * 6);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  function clearDepth() { gl.clear(gl.DEPTH_BUFFER_BIT); }

  // ---------- 第一人称手持 ----------
  var heldM = M.create();
  function drawHeldItem(stack, light, anim) {
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(progEnt.p);
    gl.uniformMatrix4fv(progEnt.u.uVP, false, proj);
    gl.uniform3f(progEnt.u.uCam, 0, 0, 0);
    gl.uniform1f(progEnt.u.uDayF, dayF);
    gl.uniform3fv(progEnt.u.uFogCol, fogColor);
    gl.uniform2f(progEnt.u.uFogRange, 999, 1000);
    gl.uniform1i(progEnt.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    var m = heldM;
    M.identity(m);
    var sw = Math.sin(anim.swing * Math.PI);
    var eat = anim.eating > 0 ? Math.sin(anim.eating * 28) * 0.035 : 0;
    M.translate(m, m,
      0.56 - sw * 0.3 + Math.sin(anim.bobPhase) * 0.014 * anim.bobAmp,
      -0.52 + sw * 0.18 - anim.equip * 0.45 - Math.abs(Math.cos(anim.bobPhase)) * 0.018 * anim.bobAmp + eat,
      -0.78 - sw * 0.1 + (anim.eating > 0 ? 0.1 : 0));
    M.rotateY(m, m, -sw * 0.55);
    M.rotateX(m, m, -sw * 0.85);
    if (!stack) {
      // 空手手臂
      var meshes = meshesFor('humanoid', 'skin_player');
      var arm = null;
      for (var i = 0; i < meshes.length; i++) if (meshes[i].part.name === 'armR') arm = meshes[i];
      if (arm) {
        M.translate(m, m, 0.06, -0.32, 0.2);
        M.rotateX(m, m, 1.95);
        M.rotateZ(m, m, -0.3);
        M.scale(m, m, 1.1, 1.6, 1.1);
        drawEntMesh(arm, m, light, null, 1);
      }
      return;
    }
    if (Blocks.isBlockItem(stack.id)) {
      M.rotateY(m, m, Math.PI / 4 + 0.15);
      M.scale(m, m, 0.42, 0.42, 0.42);
      drawEntMesh(blockCube(stack.id), m, light, null, 1);
    } else {
      var it = Blocks.ITEMS[stack.id];
      if (!it) return;
      M.rotateY(m, m, 0.25);
      M.rotateZ(m, m, 0.3);
      M.scale(m, m, 0.62, 0.62, 0.62);
      drawEntMesh(itemQuad(Tex.idx(it.tile)), m, light, null, 1);
    }
  }

  return {
    init: init, gl: function () { return gl; },
    begin: begin, drawSky: drawSky, drawWorld: drawWorld, drawClouds: drawClouds,
    uploadColumn: uploadColumn, deleteColumnMesh: deleteColumnMesh,
    beginEntities: beginEntities, drawEntMesh: drawEntMesh, meshesFor: meshesFor,
    blockCube: blockCube, itemQuad: itemQuad,
    drawSelection: drawSelection, drawCrack: drawCrack, drawParticles: drawParticles,
    updateLiquidTiles: updateLiquidTiles, clearDepth: clearDepth, drawHeldItem: drawHeldItem,
    vp: function () { return vp; }, resize: resize,
    M: M
  };
})();
