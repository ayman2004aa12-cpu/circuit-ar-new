// Real shipped XR8 binary + synthetic Chromium video. No XR APIs/poses are mocked.
// This verifies runtime integration and cleanup, not real-device AR or surface tracking.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, relative, sep} from 'node:path';

let playwright;
try { playwright = await import('playwright'); }
catch (error) {
  if (!existsSync('/workspace/browser-tools/node_modules/playwright/package.json')) {
    throw new Error('Install test tooling: npm install --no-save playwright && npx playwright install chromium', {cause: error});
  }
  playwright = createRequire('/workspace/browser-tools/package.json')('playwright');
}
const projectRoot = resolve(import.meta.dirname, '..');
const docs = resolve(projectRoot, 'docs');
const screenshots = resolve(docs, 'screenshots');
await mkdir(screenshots, {recursive: true});
const mount = '/circuit-ar/';
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.wasm':'application/wasm', '.json':'application/json', '.svg':'image/svg+xml'};
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(mount)) { res.writeHead(404).end('missing'); return; }
    path = path.slice(mount.length);
    if (!path || path.endsWith('/')) path += 'index.html';
    const file = resolve(projectRoot, path);
    const rel = relative(projectRoot, file);
    if (rel === '..' || rel.startsWith('..' + sep) || rel.startsWith(sep)) {
      res.writeHead(403).end(); return;
    }
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream'}).end(data);
  } catch { res.writeHead(404).end('missing'); }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const url = `http://127.0.0.1:${server.address().port}${mount}`;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const result = {
  testedAt: new Date().toISOString(),
  engine: 'actual bundled XR8; no API substitution',
  camera: 'synthetic Chromium video',
  physicalDeviceARTested: false,
  browser: 'Chromium with an iPad user agent; this is not Safari',
  checks: [], logs: [], responses: [],
};
let browser;
const pass = name => { result.checks.push({name, passed: true}); console.log('PASS', name); };
try {
  browser = await playwright.chromium.launch({executablePath, headless: true, args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream', '--enable-webgl', '--use-gl=angle',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ]});
  const context = await browser.newContext({
    viewport: {width: 820, height: 1180}, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  await context.addInitScript(() => {
    window.__measuredCameraTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args);
      window.__measuredCameraTracks.push(...stream.getTracks());
      return stream;
    };
  });
  const page = await context.newPage();
  const pageErrors = [], failures = [], remoteRequests = [];
  page.on('console', msg => result.logs.push({type: msg.type(), text: msg.text()}));
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', req => failures.push({url: req.url(), error: req.failure()?.errorText}));
  page.on('response', response => result.responses.push({status: response.status(), url: response.url()}));
  page.on('request', req => { if (!req.url().startsWith(new URL(url).origin)) remoteRequests.push(req.url()); });
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => !document.getElementById('startBtn').disabled, {timeout: 65000});
  assert.equal(await page.evaluate(() => !!window.XR8?.XrController && !!window.THREE), true);
  pass('Bundled real XR8/Three.js initialize at the GitHub Pages project subpath');
  await page.evaluate(() => {
    const note = document.createElement('p'); note.id = '__synthetic-camera-note';
    note.textContent = 'اختبار آلي • كاميرا مصطنعة • ليس اختبار iPad فعليًا';
    note.style = 'position:fixed;left:10px;right:10px;top:135px;text-align:center;background:#742b2b;color:white;padding:8px;z-index:50;pointer-events:none;font-size:12px';
    document.body.appendChild(note);
  });
  await page.screenshot({path: resolve(screenshots, 'repaired-start-ipad.png')});
  await page.locator('#startBtn').click();
  await page.locator('#controls').waitFor({state: 'visible', timeout: 65000});
  await page.waitForFunction(() => window.__measuredCameraTracks.some(track => track.readyState === 'live'), {timeout: 15000});
  const running = await page.evaluate(() => {
    const topAtCenter = id => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id;
    };
    const scene = XR8.Threejs.xrScene();
    return {
      tracking: document.getElementById('tracking').textContent,
      message: document.getElementById('message').textContent,
      tracks: window.__measuredCameraTracks.map(track => ({kind: track.kind, state: track.readyState})),
      atStop: topAtCenter('stopBtn'), atPlace: topAtCenter('placeBtn'),
      sceneChildren: scene.scene.children.length,
      boardCreated: scene.scene.children.some(object => object.type === 'Group' && object.children.length > 10),
      canvasWidth: scene.renderer.domElement.width, canvasHeight: scene.renderer.domElement.height,
    };
  });
  result.running = running;
  assert.ok(running.boardCreated && running.sceneChildren >= 4, 'Expected circuit geometry in actual XR8 scene');
  assert.ok(running.canvasWidth > 0 && running.canvasHeight > 0);
  assert.equal(running.atStop, 'stopBtn'); assert.equal(running.atPlace, 'placeBtn');
  assert.ok(running.tracks.some(track => track.kind === 'video' && track.state === 'live'));
  pass('Actual XR8 starts camera, creates circuit scene, and leaves UI above canvas');
  await page.screenshot({path: resolve(screenshots, 'repaired-fakecamera-ipad.png')});
  await page.locator('#stopBtn').click();
  await page.waitForFunction(() => window.__measuredCameraTracks.length > 0 && window.__measuredCameraTracks.every(track => track.readyState === 'ended'), {timeout: 10000});
  const stopped = await page.evaluate(() => ({
    tracks: window.__measuredCameraTracks.map(track => ({kind: track.kind, state: track.readyState})),
    startVisible: !document.getElementById('startPanel').classList.contains('hidden'),
    stopVisible: !document.getElementById('stopBtn').classList.contains('hidden'),
    status: document.getElementById('loadStatus').textContent,
  }));
  result.stopped = stopped;
  assert.equal(stopped.startVisible, true); assert.equal(stopped.stopVisible, false);
  pass('Clicking stop ends every measured camera track and restores the start panel');
  assert.deepEqual(pageErrors, []); assert.deepEqual(failures, []);
  assert.deepEqual(result.responses.filter(response => response.status >= 400), []);
  assert.deepEqual(remoteRequests, []);
  pass('No uncaught JavaScript errors, failed assets, or external runtime requests');
  result.passed = true;
} catch (error) {
  result.passed = false; result.error = error.stack || error.message; throw error;
} finally {
  await writeFile(resolve(docs, 'real-engine-fakecamera-results.json'), JSON.stringify(result, null, 2) + '\n');
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
