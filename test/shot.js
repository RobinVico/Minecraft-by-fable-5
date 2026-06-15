// headless Chrome 截图 + console 错误收集
// 用法: node test/shot.js <url后缀> <输出名> [等待ms] [脚本]
'use strict';
var { execFile } = require('child_process');
var path = require('path');
var fs = require('fs');

var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
var root = path.join(__dirname, '..');
var urlSuffix = process.argv[2] || '?test=1&seed=12345';
var outName = process.argv[3] || 'shot';
var waitMs = +(process.argv[4] || 9000);

var url = 'file://' + root + '/index.html' + urlSuffix;
var out = path.join(root, 'test', outName + '.png');

var args = [
  '--headless=new',
  '--disable-gpu-sandbox',
  '--no-first-run',
  '--hide-scrollbars',
  '--window-size=1280,800',
  '--screenshot=' + out,
  '--virtual-time-budget=' + waitMs,
  '--enable-logging=stderr',
  '--v=0',
  '--use-angle=swiftshader',
  url
];

execFile(CHROME, args, { timeout: 120000, maxBuffer: 20 * 1024 * 1024 }, function (err, stdout, stderr) {
  var lines = (stderr || '').split('\n');
  var interesting = lines.filter(function (l) {
    return /CONSOLE|Uncaught|Error|error/.test(l) &&
      !/deprecated|GroupMarker|gpu_|Fontconfig|dbus|DevTools|GPU stall|fallback|swiftshader.*warn/i.test(l);
  });
  console.log('URL:', url);
  console.log('截图:', fs.existsSync(out) ? out + ' (' + fs.statSync(out).size + ' bytes)' : '失败!');
  if (interesting.length) {
    console.log('--- console 消息 ---');
    interesting.slice(0, 40).forEach(function (l) { console.log(l.trim().slice(0, 300)); });
  } else {
    console.log('无 console 错误');
  }
  if (err && !fs.existsSync(out)) console.log('chrome err:', String(err).slice(0, 400));
});
