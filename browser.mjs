// Automated browser coverage. XR poses and tracking below are mocks, not hardware AR.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
let playwright;
try{playwright=await import('playwright');}
catch(error){
  const fallback='/workspace/browser-tools/package.json';
  if(!existsSync('/workspace/browser-tools/node_modules/playwright/package.json'))throw new Error('Install test tooling: npm install --no-save playwright && npx playwright install chromium',{cause:error});
  playwright=createRequire(fallback)('playwright');
}
const {chromium}=playwright;
const root=resolve(import.meta.dirname,'..');
const artifacts=resolve(import.meta.dirname,'../docs/screenshots');
await mkdir(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json'};
const server=createServer(async(req,res)=>{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!path.startsWith('/circuit-ar/')){res.writeHead(404).end();return;}
  path=path.slice('/circuit-ar'.length);
  if(path.endsWith('/'))path+='index.html';
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(data);}
  catch{res.writeHead(404).end('missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/circuit-ar/`;
const executablePath=process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const results=[];
const mock=`(() => {
 const T=window.THREE;
 const m=window.__mockXR={scene:new T.Scene(),camera:new T.PerspectiveCamera(45,innerWidth/innerHeight,.01,100),renderer:null,hits:[],tracking:'NORMAL',modules:[],running:false};
 const empty=()=>({name:'mock'});
 window.XR8={
   GlTextureRenderer:{pipelineModule:empty},
   Threejs:{pipelineModule:empty,xrScene:()=>m},
   XrController:{pipelineModule:empty,configure:()=>{},updateCameraProjectionMatrix:()=>{},hitTest:()=>m.hits},
   XrConfig:{device:()=>({MOBILE:'mobile'}),camera:()=>({BACK:'back'})},
   addCameraPipelineModules:mods=>m.modules.push(...mods),clearCameraPipelineModules:()=>m.modules=[],
   stop:()=>{m.running=false;m.renderer?.dispose();},
   run:async({canvas})=>{
     if(m.silentStart)return;
     m.scene=new T.Scene();m.scene.background=new T.Color(0x18303e);
     m.camera=new T.PerspectiveCamera(45,innerWidth/innerHeight,.01,100);
     m.renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
     m.renderer.setSize(innerWidth,innerHeight,false);
     m.running=true;m.tracking='NORMAL';
     for(const mod of m.modules)mod.onStart?.({canvas});
     m.camera.lookAt(0,0,-1);m.camera.updateMatrixWorld(true);
     const frame=()=>{if(!m.running)return;for(const mod of m.modules)mod.onUpdate?.({processCpuResult:{reality:{trackingStatus:m.tracking}}});for(const mod of m.modules)mod.onRender?.();m.renderer.render(m.scene,m.camera);requestAnimationFrame(frame);};frame();
   }
 };
 window.dispatchEvent(new Event('xrloaded'));
})();`;
function record(name,details={}){results.push({name,passed:true,...details});console.log('PASS',name);}
async function setupMock(page){await page.route('**/vendor/8thwall/xr.js',route=>route.fulfill({contentType:'text/javascript',body:mock}));}
async function ready(page){await page.goto(url);await page.waitForFunction(()=>!document.getElementById('startBtn').disabled,{timeout:65000});}
async function screenPoint(page,query){return page.evaluate(query=>{
 const m=window.__mockXR;let match=null;m.scene.updateMatrixWorld(true);m.camera.updateMatrixWorld(true);
 m.scene.traverse(obj=>{if(Object.entries(query).every(([k,v])=>obj.userData?.[k]===v))match=obj;});
 if(!match)throw new Error('Mesh missing '+JSON.stringify(query));
 const p=match.getWorldPosition(new window.THREE.Vector3()).project(m.camera);
 return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
},query);}
async function drag(page,from,to){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();}
async function clickObject(page,query){const p=await screenPoint(page,query);await page.touchscreen.tap(p.x,p.y);}
async function touchDrag(page,from,to){
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y,id:1}]});
 for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/12,y:from.y+(to.y-from.y)*i/12,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
try{
 const page=await browser.newPage({viewport:{width:1024,height:1366},hasTouch:true});
 const errors=[],remoteRequests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(new URL(url).origin))remoteRequests.push(request.url());});
 await setupMock(page);await ready(page);await page.screenshot({path:resolve(artifacts,'ipad-welcome.png')});
 record('Local ESM dependencies initialize at GitHub Pages subpath');
 await page.locator('#startBtn').click();await page.locator('#controls').waitFor({state:'visible'});
 assert.equal(await page.locator('#placeBtn').isDisabled(),true);
 assert.equal(await page.evaluate(()=>window.__mockXR.scene.children.find(o=>o.type==='Group').visible),false);
 record('No surface: placement disabled and circuit hidden');
 await page.evaluate(()=>window.__mockXR.hits=[{type:'FEATURE_POINT',position:{x:0,y:0,z:-1},distance:1}]);
 await page.waitForTimeout(150);assert.equal(await page.locator('#placeBtn').isDisabled(),true);
 record('Feature points cannot masquerade as a horizontal surface');
 await page.evaluate(()=>window.__mockXR.hits=[{type:'DETECTED_SURFACE',position:{x:0,y:0,z:-1},distance:1.8}]);
 await page.waitForFunction(()=>!document.getElementById('placeBtn').disabled);
 await page.locator('#placeBtn').click();
 assert.equal(await page.evaluate(()=>window.__mockXR.scene.children.find(o=>o.type==='Group').visible),true);
 assert.equal(await page.locator('#switchBtn').isDisabled(),false);
 // A marker is only in test screenshots, not shipped application UI.
 await page.evaluate(()=>{const marker=document.createElement('p');marker.id='testMarker';marker.textContent='اختبار آلي: التتبع والكاميرا محاكيان';marker.style='position:fixed;left:12px;top:110px;color:white;background:#742b2b;padding:8px;z-index:20;font-size:14px;pointer-events:none';document.body.append(marker);});
 await page.screenshot({path:resolve(artifacts,'mock-circuit-before.png')});
 const pixelCounts=await page.evaluate(()=>{const r=window.__mockXR.renderer;const gl=r.getContext();const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);let bright=0;for(let i=0;i<data.length;i+=4)if(data[i]>100&&data[i+1]>100&&data[i+2]>100)bright++;return bright;});
 assert.ok(pixelCounts>1000,`Expected rendered geometry, bright pixel count=${pixelCounts}`);
 record('Real WebGL2 draws the complete board from a mock surface pose',{brightPixels:pixelCounts});
 await touchDrag(page,await screenPoint(page,{wire:0,end:0}),await screenPoint(page,{port:'batteryPlus'}));
 await clickObject(page,{wire:0,end:1});await clickObject(page,{port:'switchIn'});
 assert.match(await page.locator('#connections').innerText(),/1 \/ 3/);
 record('Emulated touchscreen drag and taps attach real rendered wire endpoints');
 await drag(page,await screenPoint(page,{wire:1,end:0}),await screenPoint(page,{port:'batteryPlus'}));
 assert.match(await page.locator('#message').innerText(),/مشغول/);
 assert.match(await page.locator('#connections').innerText(),/1 \/ 3/);
 record('Occupied terminal rejects a second endpoint');
 await clickObject(page,{wire:1,end:0});await clickObject(page,{port:'switchOut'});
 await clickObject(page,{wire:1,end:1});await clickObject(page,{port:'lampPlus'});
 await clickObject(page,{wire:2,end:0});await clickObject(page,{port:'lampMinus'});
 await clickObject(page,{wire:2,end:1});await clickObject(page,{port:'batteryMinus'});
 assert.match(await page.locator('#connections').innerText(),/3 \/ 3/);
 assert.match(await page.locator('#lampState').innerText(),/مطفأ/);
 await page.locator('#switchBtn').click();assert.match(await page.locator('#lampState').innerText(),/مضيء/);
 const arrows=await page.evaluate(()=>{let n=0;window.__mockXR.scene.traverse(o=>{if(o.geometry?.type==='ConeGeometry'&&o.visible)n++});return n;});assert.equal(arrows,3);
 await page.screenshot({path:resolve(artifacts,'mock-circuit-lit.png')});
 record('Complete circuit lights bulb and animates three current arrows with closed switch');
 await page.locator('#switchBtn').click();assert.match(await page.locator('#lampState').innerText(),/مطفأ/);
 await clickObject(page,{switch:true});assert.match(await page.locator('#lampState').innerText(),/مضيء/);
 record('UI button and 3D switch both control the lamp');
 const from=await screenPoint(page,{wire:0,end:0});const to=await page.evaluate(()=>{const m=window.__mockXR,b=m.scene.children.find(o=>o.type==='Group');const p=b.localToWorld(new window.THREE.Vector3(-.35,.085,.25)).project(m.camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await drag(page,from,to);assert.match(await page.locator('#lampState').innerText(),/مطفأ/);assert.match(await page.locator('#connections').innerText(),/2 \/ 3/);
 record('Dragging an attached endpoint detaches it and immediately extinguishes the lamp');
 await page.locator('#moveBtn').click();await page.evaluate(()=>{window.__mockXR.hits=[{type:'ESTIMATED_SURFACE',position:{x:.2,y:.3,z:-1.1},distance:1.6}];});
 await page.waitForFunction(()=>!document.getElementById('placeBtn').disabled);await page.locator('#placeBtn').click();
 await drag(page,await screenPoint(page,{wire:0,end:0}),await screenPoint(page,{port:'batteryPlus'}));assert.match(await page.locator('#lampState').innerText(),/مضيء/);
 record('Repositioned board at raised/yawed pose keeps wiring and supports scaled drag');
 await page.locator('#helpBtn').click();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'closeHelpBtn');await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__mockXR.tracking='LIMITED');await page.waitForFunction(()=>document.getElementById('tracking').textContent.includes('حرّك الجهاز'));assert.match(await page.locator('#message').innerText(),/التتبع ضعيف/);
 record('Tracking loss gives actionable feedback; help dialog traps focus');
 await page.locator('#stopBtn').click();await page.locator('#startPanel').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__mockXR.running),false);
 await page.locator('#startBtn').click();await page.locator('#controls').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.getElementById('placeBtn').disabled);assert.equal(await page.locator('#placeBtn').isVisible(),true);await page.locator('#placeBtn').click();
 record('Stop releases mock rendering session and restart supports fresh placement');
 await page.evaluate(()=>window.__mockXR.modules.forEach(mod=>mod.onCameraStatusChange?.({status:'failed'})));await page.locator('#startPanel').waitFor({state:'visible'});assert.equal(await page.locator('#startBtn').isDisabled(),false);assert.match(await page.locator('#loadStatus').innerText(),/الكاميرا/);
 record('Camera failure is visible and permits restarting');
 assert.deepEqual(remoteRequests,[]);record('Application interaction makes no external runtime network requests');
 assert.deepEqual(errors,[]);record('No uncaught JavaScript errors during interaction');await page.close();
 // Real engine load: verifies shipped distribution, not world tracking or device camera.
 const actual=await browser.newPage({viewport:{width:390,height:844}});const actualErrors=[];actual.on('pageerror',e=>actualErrors.push(e.message));await ready(actual);
 await actual.screenshot({path:resolve(artifacts,'phone-welcome.png')});
 assert.deepEqual(actualErrors,[]);record('Unmocked local 8th Wall binary reaches ready state without camera start');await actual.close();
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1024,height:1366},{width:1366,height:1024}]){
   const p=await browser.newPage({viewport});await setupMock(p);await ready(p);
   const layout=await p.evaluate(()=>{const b=document.getElementById('startBtn').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,buttonVisible:b.top>=0&&b.bottom<=innerHeight,height:b.height};});
   assert.equal(layout.overflow,false);assert.equal(layout.buttonVisible,true);assert.ok(layout.height>=44);record(`Responsive layout ${viewport.width}×${viewport.height}`);await p.close();
 }
 const missingJS=await browser.newPage();await missingJS.route('**/vendor/three/three.module.js',r=>r.abort());await missingJS.goto(url);await missingJS.locator('#retryBtn').waitFor({state:'visible'});assert.equal(await missingJS.locator('#startBtn').isDisabled(),true);record('Missing module shows a recoverable error instead of indefinite loading');await missingJS.close();
 const missingXR=await browser.newPage();await missingXR.route('**/vendor/8thwall/xr.js',r=>r.abort());await missingXR.goto(url);await missingXR.locator('#retryBtn').waitFor({state:'visible'});assert.match(await missingXR.locator('#loadStatus').innerText(),/xr.js/);record('Missing engine script reports its exact local path and allows retry');await missingXR.close();
 const timeout=await browser.newPage();await timeout.addInitScript(()=>{const native=window.setTimeout;window.setTimeout=(fn,delay,...args)=>native(fn,delay===60000&&window.__mockXR?.silentStart?10:delay,...args);});await setupMock(timeout);await ready(timeout);await timeout.evaluate(()=>window.__mockXR.silentStart=true);await timeout.locator('#startBtn').click();await timeout.waitForFunction(()=>document.getElementById('loadStatus').textContent.includes('60 ثانية'));assert.equal(await timeout.locator('#startBtn').isDisabled(),false);record('Session start timeout ends loading and permits retry (clock accelerated)');await timeout.close();
 const missingCSS=await browser.newPage();await missingCSS.route('**/styles.css*',r=>r.abort());await setupMock(missingCSS);await ready(missingCSS);const fallback=await missingCSS.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,text:document.getElementById('startBtn').textContent}));assert.equal(fallback.background,'rgb(9, 27, 45)');record('Missing stylesheet retains readable inline fallback');await missingCSS.close();
} finally {
 await writeFile(resolve(artifacts,'browser-results.json'),JSON.stringify({date:new Date().toISOString(),note:'Tracking and camera mocked in interaction tests. Real engine load tested without AR session. No physical iPhone/iPad tested.',results},null,2));
 await browser.close();server.close();
}
