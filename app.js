// CircuitAR — 8th Wall world-tracking prototype.
// Three.js objects are generated in code; no remote 3D models are needed.
// The experience deliberately has NO non-AR fallback pretending to be AR.
import * as THREE from './vendor/three/three.module.js';
import {chooseSurfaceHit} from './placement.js';
import {assessCircuit} from './circuit-logic.js';
window.THREE = THREE; // Required by the 8th Wall Threejs pipeline.

const $ = (id) => document.getElementById(id);
const canvas = $('camerafeed');
const state = {
  xrReady: false, started: false, placed: false, tracking: 'INITIALIZING',
  surface: null, reticle: null, sessionTimer: null, bound: false, lastHit: 0,
  scene: null, camera: null, renderer: null, board: null, selected: null,
  pointer: null, switchClosed: false, lamp: null, switchLever: null, arrowMeshes: [],
  ports: new Map(), raycaster: new THREE.Raycaster(), interactive: [],
  wires: [],
  trackingReason: 'INITIALIZING', startedAt: 0, realityFrames: 0,
  motionEvents: 0, orientationEvents: 0, lastMotion: 0, lastOrientation: 0,
  rawHits: [], hitError: '', cameraTrack: null, video: null,
  videoWidth: 0, videoHeight: 0, orientation: null, lastDiagnostics: 0,
  aimX: null, aimY: null,
};
const WHITE = 0xe8f3fc, NAVY = 0x173449, CYAN = 0x35c9d0, GOLD = 0xffc66c;
const material = (color, extra={}) => new THREE.MeshStandardMaterial({color, roughness:.38, metalness:.16, ...extra});
const metal = material(0xc6d7e2,{roughness:.22,metalness:.74});
const white = material(WHITE);
const navy = material(NAVY);
const gold = material(GOLD,{metalness:.32});
const wireMaterials = [material(0xf85f65), material(0x49d1ed), material(0xffd257)];
const terminalInfo = [
  {id:'batteryPlus', x:-.345, z:-.125, name:'+'},
  {id:'batteryMinus', x:-.215, z:-.125, name:'−'},
  {id:'switchIn', x:-.056, z:-.12, name:'1'},
  {id:'switchOut',x:.062,z:-.12,name:'2'},
  {id:'lampPlus',x:.216,z:-.12,name:'+'},
  {id:'lampMinus',x:.346,z:-.12,name:'−'},
];
const requiredPairs = [
  ['batteryPlus','switchIn'], ['switchOut','lampPlus'], ['lampMinus','batteryMinus'],
];
const wireInitial = [
  [{x:-.32,z:.115},{x:-.17,z:.115}],
  [{x:-.055,z:.205},{x:.10,z:.205}],
  [{x:.175,z:.305},{x:.335,z:.305}],
];

function status(message) { $('message').textContent = message; }
function sphere(radius, mat, segments=18) { return new THREE.Mesh(new THREE.SphereGeometry(radius, segments, 12), mat); }
function box(w,h,d,mat) { return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); }
function cylinder(r1,r2,h,mat,segments=24) { return new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat); }
function add(parent,obj,x=0,y=0,z=0) { obj.position.set(x,y,z);parent.add(obj);return obj; }
function interactive(mesh, info) { mesh.userData = {...mesh.userData,...info}; state.interactive.push(mesh);return mesh; }
function writeLabel(text, width=.14, height=.065, bg='#173449',fg='#ffffff') {
  const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*height/width);
  const g=c.getContext('2d');g.direction='rtl';g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);
  g.fillStyle=fg;let fontSize=Math.min(160,c.height*.6);g.font=`bold ${fontSize}px Arial, sans-serif`;
  if(g.measureText(text).width>c.width*.92){fontSize*=c.width*.92/g.measureText(text).width;g.font=`bold ${fontSize}px Arial, sans-serif`;}
  g.textAlign='center';g.textBaseline='middle';g.fillText(text,c.width/2,c.height/2);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const obj=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));
  obj.rotation.x=-Math.PI/2;return obj;
}
function addPort(parent, cfg) {
  const root=new THREE.Group();root.position.set(cfg.x,.048,cfg.z);parent.add(root);
  const base=add(root,cylinder(.037,.037,.018,metal),0,0,0);
  const connector=add(root,cylinder(.019,.019,.023,gold),0,.017,0);
  const hit=add(root,cylinder(.055,.055,.014,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})),0,.025,0);
  interactive(hit,{port:cfg.id});
  const port = {id:cfg.id,x:cfg.x,z:cfg.z,root,connector,base};
  state.ports.set(cfg.id,port);
  const label=writeLabel(cfg.name,.045,.03,'#173449','#ffffff');add(parent,label,cfg.x,.041,cfg.z+.055);
}
function createBattery(board) {
  const x=-.279,z=-.235;
  const foundation=add(board,box(.21,.028,.16,metal),x,.045,z);
  const body=add(board,box(.18,.093,.125,navy),x,.102,z);
  const stripe=add(board,box(.039,.094,.127,gold),x-.062,.103,z);
  add(board,writeLabel('بطارية',.15,.05),x,.153,z);
  return {foundation,body,stripe};
}
function createSwitch(board) {
  const x=0,z=-.235;
  add(board,box(.19,.035,.14,metal),x,.055,z);
  const bed=add(board,box(.11,.029,.067,navy),x,.086,z);
  const lever=add(board,box(.09,.023,.029,material(0xefab73)),x-.014,.117,z);
  interactive(lever,{switch:true});interactive(bed,{switch:true});
  state.switchLever=lever;
  add(board,writeLabel('مفتاح',.16,.05),x,.116,z-.081);
}
function createLamp(board) {
  const x=.282,z=-.235;
  add(board,cylinder(.066,.078,.025,metal),x,.06,z);
  add(board,cylinder(.040,.044,.039,navy),x,.089,z);
  const bulbMat=material(0xe0ebf2,{transparent:true,opacity:.92,emissive:0x1a2430,emissiveIntensity:.25,roughness:.13,metalness:0});
  const bulb=add(board,sphere(.061,bulbMat,24),x,.153,z);
  add(board,cylinder(.016,.016,.065,material(0xeaae62,{emissive:0x5c2a00})),x,.135,z);
  const light=new THREE.PointLight(0xffcc66,0,0.65);light.position.set(x,.16,z);board.add(light);
  const halo = add(board,new THREE.Mesh(new THREE.TorusGeometry(.076,.008,9,32), new THREE.MeshBasicMaterial({color:0xffd66b,transparent:true,opacity:0})), x,.155,z);
  halo.rotation.x=Math.PI/2;
  state.lamp={bulb,light,halo,bulbMat};
  add(board,writeLabel('مصباح',.16,.05),x,.047,z-.097);
}
function createWire(index,board) {
  const wire={index,color:wireMaterials[index],ends:wireInitial[index].map((p)=>({...p,port:null})),tube:null,handles:[],arrow:null,curve:null};
  for (let i=0;i<2;i++) {
    const handle=sphere(.028,material([0xff868b,0x8ceeff,0xffe7a1][index],{emissive:[0x491012,0x073e45,0x554015][index],emissiveIntensity:.5}));
    interactive(handle,{wire:index,end:i});board.add(handle);wire.handles.push(handle);
  }
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.015,.043,8),new THREE.MeshBasicMaterial({color:0x82fff3}));
  arrow.visible=false;board.add(arrow);wire.arrow=arrow;
  state.wires.push(wire);refreshWire(wire);
}
function refreshWire(wire) {
  if (!state.board) return;
  const a=wire.ends[0],b=wire.ends[1];
  const pa=new THREE.Vector3(a.x,.085,a.z), pb=new THREE.Vector3(b.x,.085,b.z);
  const between=pa.clone().lerp(pb,.5);between.y=.135;
  wire.curve=new THREE.CatmullRomCurve3([pa,between,pb]);
  if (wire.tube) {state.board.remove(wire.tube);wire.tube.geometry.dispose();}
  wire.tube=new THREE.Mesh(new THREE.TubeGeometry(wire.curve,18,.008,7,false),wire.color);
  state.board.add(wire.tube);
  wire.handles[0].position.copy(pa);wire.handles[1].position.copy(pb);
}
function createBoard(scene) {
  state.board=new THREE.Group();state.board.visible=false;scene.add(state.board);
  const board=state.board;
  board.scale.setScalar(.65);
  add(board,box(.87,.025,.69,material(0xe8edf0,{roughness:.65})),0,.012,0);
  add(board,box(.88,.012,.7,material(0x247e91,{metalness:.55})),0,-.008,0);
  add(board,writeLabel('مختبر الدوائر الكهربائية',.51,.058,'#173449','#bafaff'),0,.027,-.305);
  add(board,writeLabel('اسحب أطراف الأسلاك إلى دوائر التوصيل',.49,.052,'#2a5364','#ffffff'),0,.028,.385);
  add(board,box(.79,.012,.245,material(0xd2e3ea)),0,.031,-.192);
  for(const cfg of terminalInfo)addPort(board,cfg);
  createBattery(board);createSwitch(board);createLamp(board);
  for(let i=0;i<3;i++)createWire(i,board);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.92,.75),new THREE.ShadowMaterial({opacity:.28}));
  shadow.rotation.x=-Math.PI/2;shadow.receiveShadow=true;board.add(shadow);
  // Keep the AR board level with the single horizontal plane tracked by 8th Wall.
  refreshElectricalState();
}
function wireMatch(wire,pair) {
  const endpoints=wire.ends.map(e=>e.port);return endpoints.includes(pair[0])&&endpoints.includes(pair[1]);
}
function refreshElectricalState() {
  const result=assessCircuit(state.wires,state.switchClosed);
  $('connections').textContent=`التوصيلات الصحيحة: ${result.correctCount} / 3`;
  $('lampState').textContent=result.lit?'💡 المصباح مضيء':'المصباح مطفأ';
  $('lampState').classList.toggle('is-lit', result.lit);
  $('switchBtn').textContent=state.switchClosed?'فتح المفتاح':'إغلاق المفتاح';
  $('switchBtn').setAttribute('aria-pressed',String(state.switchClosed));
  if(state.lamp){
    state.lamp.bulbMat.color.setHex(result.lit?0xffefad:0xe0ebf2);
    state.lamp.bulbMat.emissive.setHex(result.lit?0xffa600:0x1a2430);
    state.lamp.bulbMat.emissiveIntensity=result.lit?2.8:.25;
    state.lamp.light.intensity=result.lit?1.7:0;
    state.lamp.halo.material.opacity=result.lit?.8:0;
  }
  if(state.switchLever) {
    state.switchLever.rotation.z=state.switchClosed?0:-.55;
    state.switchLever.material.color.setHex(state.switchClosed?0x55d6ad:0xefab73);
  }
  state.wires.forEach(w=>w.arrow.visible=result.lit&&requiredPairs.some(p=>wireMatch(w,p)));
  if(result.lit) status('أحسنت! اكتملت الدائرة وأُغلق المفتاح، فأضاء المصباح.');
  else if(result.connected)status('اكتملت الدائرة! اضغط المفتاح لإغلاقه وتشغيل المصباح.');
  else if(result.correctCount===3)status('تحقق من جميع أطراف التوصيل.');
  else if(state.placed)status('المس أحد أطراف السلك واسحبه إلى منفذ دائري. يجب تركيب ثلاثة أسلاك صحيحة.');
}
function resetWires() {
  state.wires.forEach((wire,i)=>{wire.ends=wireInitial[i].map(p=>({...p,port:null}));refreshWire(wire);});
  state.selected=null;state.switchClosed=false;refreshElectricalState();
}
function projectScreen(event) {
  state.scene?.updateMatrixWorld(true);
  state.camera?.updateMatrixWorld(true);
  const bounds=canvas.getBoundingClientRect();
  return new THREE.Vector2(((event.clientX-bounds.left)/bounds.width)*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);
}
function pickObject(event){
  if(!state.camera)return null;
  state.raycaster.setFromCamera(projectScreen(event),state.camera);
  const hits=state.raycaster.intersectObjects(state.interactive,false);
  // A handle overlaps its socket after connection: keep it selectable for detaching.
  if(hits.length)return (hits.find(h=>h.object.userData.wire!==undefined) || hits[0]).object;
  // Preserve a 44 CSS-pixel touch target even when a physical handle projects smaller.
  const bounds=canvas.getBoundingClientRect();
  let nearest=null,distance=22;
  for(const mesh of state.interactive){
    if(mesh.userData.switch)continue;
    const p=mesh.getWorldPosition(new THREE.Vector3()).project(state.camera);
    if(p.z < -1 || p.z > 1)continue;
    const d=Math.hypot(bounds.left+(p.x+1)*bounds.width/2-event.clientX,bounds.top+(1-p.y)*bounds.height/2-event.clientY);
    if(d<distance){distance=d;nearest=mesh;}
  }
  return nearest;
}
function worldPointOnLevel(event,level) {
  if(!state.camera)return null;
  state.raycaster.setFromCamera(projectScreen(event),state.camera);
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-level);
  return state.raycaster.ray.intersectPlane(plane,new THREE.Vector3());
}
function nearestPort(local) {
  let chosen=null,dist=Infinity;
  for(const port of state.ports.values()) {
    const d=Math.hypot(local.x-port.x,local.z-port.z);
    if(d<dist){dist=d;chosen=port;}
  }
  return dist<.082?chosen:null;
}
function attachEnd(wireId,endId,portId) {
  const wire=state.wires[wireId],end=wire.ends[endId],port=state.ports.get(portId);
  if(!port)return false;
  if(state.wires.some(w=>w.ends.some((e,i)=>e.port===portId && !(w===wire && i===endId)))){
    status('هذا المنفذ مشغول. افصل الطرف الموجود أولًا أو اختر منفذًا آخر.');return false;
  }
  end.port=portId;end.x=port.x;end.z=port.z;refreshWire(wire);
  refreshElectricalState();return true;
}
function beginWireSelection(id,end) {
  clearSelection();
  state.selected={wire:id,end};
  state.wires[id].handles[end].scale.setScalar(1.35);
  status('حرّك طرف السلك إلى منفذ التوصيل، أو المس المنفذ مباشرة.');
}
function onPointerDown(e) {
  if(!state.placed || state.pointer || state.tracking!=='NORMAL' || !$('helpPanel').classList.contains('hidden'))return;
  const target=pickObject(e);
  if(target?.userData?.wire!==undefined){
    state.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
    beginWireSelection(target.userData.wire,target.userData.end);
    canvas.setPointerCapture?.(e.pointerId);e.preventDefault();return;
  }
  if(target?.userData?.port && state.selected){
    attachEnd(state.selected.wire,state.selected.end,target.userData.port);
    clearSelection();return;
  }
  if(target?.userData?.switch){state.switchClosed=!state.switchClosed;refreshElectricalState();return;}
  clearSelection();
}
function onPointerMove(e){
  if(!state.pointer || state.pointer.id!==e.pointerId || !state.selected)return;
  if(Math.hypot(e.clientX-state.pointer.x,e.clientY-state.pointer.y)<6 && !state.pointer.moved)return;
  state.pointer.moved=true;
  const level=state.board.localToWorld(new THREE.Vector3(0,.085,0)).y;
  const world=worldPointOnLevel(e,level);
  if(!world)return;
  const local=state.board.worldToLocal(world.clone());
  const wire=state.wires[state.selected.wire];const end=wire.ends[state.selected.end];
  end.port=null;end.x=THREE.MathUtils.clamp(local.x,-.41,.41);end.z=THREE.MathUtils.clamp(local.z,-.31,.34);
  refreshWire(wire);refreshElectricalState();e.preventDefault();
}
function onPointerUp(e){
  if(!state.pointer || state.pointer.id!==e.pointerId)return;
  if(state.pointer.moved&&state.selected){
    const wire=state.wires[state.selected.wire],end=wire.ends[state.selected.end];
    const nearest=nearestPort(end);
    if(nearest)attachEnd(state.selected.wire,state.selected.end,nearest.id);
    else status('اقترب من المنفذ الدائري حتى يثبت طرف السلك، أو المس المنفذ بعد اختيار الطرف.');
    clearSelection();
  }
  // A simple tap keeps selected so the user can tap a terminal next.
  state.pointer=null;
  try{canvas.releasePointerCapture?.(e.pointerId);}catch{}
}
function clearSelection() {
  if(state.selected)state.wires[state.selected.wire]?.handles[state.selected.end].scale.setScalar(1);
  state.selected=null;
}
function cancelPointer(){
  const id=state.pointer?.id;
  state.pointer=null;clearSelection();
  if(id!==undefined && canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
  refreshElectricalState();
}
function surfaceHit(){
  if(!state.camera)return null;
  // x/y normalized to the camera canvas at the visible crosshair.
  const bounds=canvas.getBoundingClientRect(),aim=$('crosshair').getBoundingClientRect();
  const x=(aim.left+aim.width/2-bounds.left)/bounds.width;
  const y=(aim.top+aim.height/2-bounds.top)/bounds.height;
  state.aimX=x;state.aimY=y;
  try{
    const hits=XR8.XrController.hitTest(x,y,['DETECTED_SURFACE','ESTIMATED_SURFACE']);
    state.rawHits=Array.isArray(hits)?hits:[];state.hitError='';
    // Inspect engine output while initializing, but place only with stable tracking.
    return state.tracking==='NORMAL'?chooseSurfaceHit(state.rawHits):null;
  }catch(error){
    state.rawHits=[];state.hitError=error?.message || String(error);return null;
  }
}
function placeBoard(){
  if(!state.started || !state.board)return status('ابدأ الكاميرا وانتظر جاهزية المشهد.');
  // Recheck on click rather than using a stale pose after the device moves.
  const hit=surfaceHit();
  if(!hit)return status('لم نعثر على سطح أفقي بعد. وجّه العلامة نحو أرضية مضاءة ذات تفاصيل وحرّك الجهاز ببطء.');
  cancelPointer();
  state.board.position.copy(hit.position);
  const dir=state.camera.position.clone().sub(state.board.position);
  state.board.rotation.set(0,Math.atan2(dir.x,dir.z),0);
  state.board.visible=true;state.placed=true;
  state.board.updateMatrixWorld(true);
  state.reticle.visible=false;
  $('crosshair').classList.add('hidden');
  $('placeBtn').classList.add('hidden');
  $('resetBtn').disabled=false;$('switchBtn').disabled=false;$('moveBtn').disabled=false;
  status(hit.type==='ESTIMATED_SURFACE'?'تم وضع الدائرة على سطح تقديري متتبع. تحقق من ارتفاعه، ثم وصّل الأسلاك.':'تم تثبيت الدائرة. اسحب طرف كل سلك إلى منفذ، أو المس الطرف ثم المنفذ.');
}
function animateAr(time){
  if(!state.board||!state.placed || state.tracking!=='NORMAL')return;
  const result=assessCircuit(state.wires,state.switchClosed);
  if(!result.lit)return;
  state.wires.forEach(wire=>{
    const pair=requiredPairs.find(pair=>wireMatch(wire,pair));if(!pair || !wire.curve)return;
    const indexOfStart=wire.ends.findIndex(e=>e.port===pair[0]);
    const t=((time*.00035)+(wire.index*.17))%1;const u=indexOfStart===0?t:1-t;
    const p=wire.curve.getPoint(u);const tangent=wire.curve.getTangent(u);
    if(indexOfStart!==0)tangent.negate();
    wire.arrow.position.copy(p);wire.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent.normalize());
  });
  if(state.lamp)state.lamp.halo.material.opacity=.55+.24*Math.sin(time*.004);
}
function trackingHint(){
  const hints={
    INITIALIZING:'جارٍ بناء خريطة المكان. حرّك الجهاز جانبيًا ببطء مع إبقاء السطح ظاهرًا، ولا تكتفِ بتدويره.',
    NOT_ENOUGH_TEXTURE:'تفاصيل السطح غير كافية للتتبع. وجّه الكاميرا إلى نقوش أو حواف واضحة مع إضاءة جيدة.',
    TOO_MUCH_MOTION:'حركة الجهاز سريعة. أبطئ الحركة وثبّت الجهاز قليلًا حتى يستقر التتبع.',
    RELOCALIZING:'جارٍ استعادة موضع الجهاز. وجّه الكاميرا إلى السطح نفسه الذي مسحته سابقًا.',
  };
  return hints[state.trackingReason] || 'التتبع غير مستقر بعد. افتح «فحص الكاميرا والتتبع» لمعرفة الحالة الفعلية.';
}
function ensureDiagnostics(){
  if($('sessionDiagnostics'))return;
  const details=document.createElement('details');details.id='sessionDiagnostics';
  details.style.cssText='margin-top:10px;border-top:1px solid #517c90;padding-top:8px;pointer-events:auto';
  const summary=document.createElement('summary');summary.textContent='فحص الكاميرا والتتبع';
  summary.style.cssText='cursor:pointer;min-height:44px;display:list-item;line-height:44px;font-size:12px;color:#b9eee9';
  const text=document.createElement('pre');text.id='diagnosticText';
  text.style.cssText='margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:24vh;overflow:auto;font:12px/1.8 system-ui;color:#e5f5ff';
  const copy=document.createElement('button');copy.id='copyDiagnostics';copy.className='secondary';copy.type='button';copy.textContent='نسخ التشخيص';
  copy.style.cssText='min-height:44px;margin-top:8px;font-size:12px';
  copy.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(text.textContent);copy.textContent='تم النسخ';}
    catch{copy.textContent='تعذر النسخ؛ التقط صورة للتشخيص';}
  });
  details.append(summary,text,copy);($('controls').querySelector('.control-card') || $('controls')).appendChild(details);
}
function renderDiagnostics(){
  if(!$('sessionDiagnostics'))return;
  let settings={};try{settings=state.cameraTrack?.getSettings?.() || {};}catch{}
  const bounds=canvas.getBoundingClientRect();
  const vw=state.video?.videoWidth || state.videoWidth || settings.width || 0;
  const vh=state.video?.videoHeight || state.videoHeight || settings.height || 0;
  const usable=state.rawHits.filter(h=>chooseSurfaceHit([h])).length;
  const zoom=Number.isFinite(settings.zoom)?String(settings.zoom):'غير متاح';
  const age=last=>last?`${Math.round((performance.now()-last)/1000)} ث`:'لم تصل بيانات رقمية';
  const details=$('sessionDiagnostics');
  Object.assign(details.dataset,{
    trackingStatus:state.tracking,trackingReason:state.trackingReason,
    motionEvents:String(state.motionEvents),orientationEvents:String(state.orientationEvents),
    rawHitCount:String(state.rawHits.length),usableSurfaceCount:String(usable),
    videoWidth:String(vw),videoHeight:String(vh),zoom,
    viewportWidth:String(window.innerWidth),viewportHeight:String(window.innerHeight),
    displayWidth:String(Math.round(bounds.width)),displayHeight:String(Math.round(bounds.height)),
    devicePixelRatio:String(window.devicePixelRatio || 1),
    aimX:String(state.aimX),aimY:String(state.aimY),
  });
  $('diagnosticText').textContent=[
    'الإصدار: retina-20261112',
    `حالة التتبع: ${state.tracking}`,
    `سبب التتبع: ${state.trackingReason}`,
    `إطارات بيانات التتبع: ${state.realityFrames}`,
    `نتائج السطح: ${state.rawHits.length}؛ صالحة للمسافة: ${usable}`,
    `أنواع النتائج: ${state.rawHits.map(h=>`${h.type} (${Number.isFinite(h.distance)?h.distance.toFixed(2):'?'} م)`).join('، ') || 'لا توجد'}`,
    `الحركة: ${state.motionEvents}؛ آخر بيانات: ${age(state.lastMotion)}`,
    `الاتجاه: ${state.orientationEvents}؛ آخر بيانات: ${age(state.lastOrientation)}`,
    `الكاميرا: ${state.cameraTrack?.label || 'الاسم غير متاح'}`,
    `الفيديو: ${vw} × ${vh}؛ الاتجاه: ${state.orientation ?? 'غير متاح'}`,
    `مساحة العرض: ${Math.round(bounds.width)} × ${Math.round(bounds.height)}`,
    `نافذة المتصفح: ${window.innerWidth} × ${window.innerHeight}؛ كثافة البكسل: ${window.devicePixelRatio || 1}`,
    `دقة الرسم الداخلية: ${canvas.width} × ${canvas.height}`,
    `نقطة اختبار السطح: ${state.aimX?.toFixed(3) ?? '?'}، ${state.aimY?.toFixed(3) ?? '?'}`,
    `تكبير مسار الكاميرا: ${zoom}؛ تكبير الصفحة: ${window.visualViewport?.scale ?? 1}`,
    state.hitError?`خطأ اختبار السطح: ${state.hitError}`:'',
    'اختلاف أبعاد الفيديو والعرض قد يقص أطراف الصورة. غياب بيانات الحساس وحده لا يثبت رفض الإذن.',
  ].filter(Boolean).join('\n');
}
function updateTracking(detail={}){
  state.tracking=detail.status || detail.trackingStatus || state.tracking;
  state.trackingReason=detail.reason || detail.trackingReason || (state.tracking==='NORMAL'?'NONE':state.trackingReason);
  const normal=state.tracking==='NORMAL';
  $('tracking').textContent=normal?'✓ تتبع الجهاز مستقر':
    state.trackingReason==='INITIALIZING'?'جارٍ تهيئة تتبع المكان…':
    state.trackingReason==='NOT_ENOUGH_TEXTURE'?'يحتاج التتبع إلى تفاصيل أوضح':
    state.trackingReason==='TOO_MUCH_MOTION'?'أبطئ حركة الجهاز لتحسين التتبع':'التتبع غير مستقر بعد';
  if(!normal){
    state.surface=null;
    if(state.reticle)state.reticle.visible=false;
    $('placeBtn').disabled=true;
    if(state.pointer)cancelPointer();
    status((state.placed?'التتبع ضعيف. ':'')+trackingHint());
  }
}
function resizeCanvas(){
  // CSS pins the display size to the viewport even when XR8/Three.js writes
  // inline sizes. Only the drawing buffer is multiplied by pixel density.
  const ratio=window.devicePixelRatio || 1;
  const width=Math.round(canvas.clientWidth*ratio),height=Math.round(canvas.clientHeight*ratio);
  if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
}
function initializeScenePipeline(){
  return {
    name:'circuitar-scene',
    listeners:[{event:'reality.trackingstatus',process:({detail})=>updateTracking(detail)}],
    onStart:()=>{
      if(!state.started)return;
      clearTimeout(state.sessionTimer);
      const {scene,camera,renderer}=XR8.Threejs.xrScene();
      state.scene=scene;state.camera=camera;state.renderer=renderer;
      scene.add(new THREE.HemisphereLight(0xffffff,0x667788,2.4));
      const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,5,3);scene.add(light);
      camera.position.set(0,1.6,0);
      XR8.XrController.updateCameraProjectionMatrix({origin:camera.position,facing:camera.quaternion});
      createBoard(scene);
      state.reticle=new THREE.Mesh(new THREE.RingGeometry(.055,.07,32),new THREE.MeshBasicMaterial({color:CYAN,side:THREE.DoubleSide}));
      state.reticle.rotation.x=-Math.PI/2;state.reticle.visible=false;scene.add(state.reticle);
      $('startPanel').classList.add('hidden');$('controls').classList.remove('hidden');
      $('stopBtn').classList.remove('hidden');$('crosshair').classList.remove('hidden');
      $('retryBtn').classList.add('hidden');
      ensureDiagnostics();renderDiagnostics();
      status('حرّك الجهاز ببطء. عندما تظهر حلقة على السطح اضغط «وضع الدائرة».');
    },
    onUpdate:({processCpuResult})=>{
      const reality=processCpuResult?.reality;
      if(reality){
        state.realityFrames++;
        if(reality.trackingStatus && (reality.trackingStatus!==state.tracking || reality.trackingReason && reality.trackingReason!==state.trackingReason))
          updateTracking({status:reality.trackingStatus,reason:reality.trackingReason});
      }
      if(!state.placed && performance.now()-state.lastHit>100){
        state.lastHit=performance.now();state.surface=surfaceHit();
        if(state.reticle){
          state.reticle.visible=!!state.surface;
          if(state.surface)state.reticle.position.copy(state.surface.position).add(new THREE.Vector3(0,.004,0));
        }
        $('placeBtn').disabled=!state.surface;
        $('crosshair').classList.toggle('surface-found',!!state.surface);
        if(state.surface)$('tracking').textContent='✓ سطح جاهز — اضغط وضع الدائرة';
        else if(state.tracking==='NORMAL')$('tracking').textContent='التتبع مستقر — وجّه العلامة إلى السطح';
      }
      if(performance.now()-state.lastDiagnostics>500){
        state.lastDiagnostics=performance.now();renderDiagnostics();
        if(!state.placed && state.tracking!=='NORMAL' && performance.now()-state.startedAt>10000)
          status(trackingHint()+' إذا استمر الانتظار، افتح فحص الكاميرا والتتبع وأرسل صورة بياناته.');
      }
    },
    onRender:()=>animateAr(performance.now()),
    onVideoSizeChange:({videoWidth,videoHeight,orientation})=>{
      state.videoWidth=videoWidth;state.videoHeight=videoHeight;state.orientation=orientation;
    },
    onDeviceOrientationChange:({videoWidth,videoHeight,orientation})=>{
      state.videoWidth=videoWidth;state.videoHeight=videoHeight;state.orientation=orientation;
    },
    onCameraStatusChange:({status:cameraStatus,stream,video})=>{
      if(stream)state.cameraTrack=stream.getVideoTracks?.()[0] || null;
      if(video)state.video=video;
      if(cameraStatus==='failed')showSessionError('تعذر فتح الكاميرا. اسمح بالكاميرا والحركة من إعدادات Safari، ثم أعد المحاولة.');
    },
    onException:error=>showSessionError('توقف محرك الواقع المعزز: '+(error?.message || String(error))),
  };
}
function showSessionError(message){
  if(!state.started)return;
  console.error('CircuitAR session:',message);
  endSession(message);
}
function endSession(message='أُوقفت الكاميرا. اضغط لبدء تجربة جديدة.'){
  clearTimeout(state.sessionTimer);cancelPointer();
  state.started=false;state.placed=false;state.tracking='INITIALIZING';
  try{XR8.stop();XR8.clearCameraPipelineModules();}catch(error){console.warn(error);}
  // Dispose GPU resources before restarting; XR8 will provide a new scene.
  const geometries=new Set(),materials=new Set(),textures=new Set();
  for(const root of [state.board,state.reticle])root?.traverse(obj=>{
    if(obj.geometry)geometries.add(obj.geometry);
    for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material]))if(mat){materials.add(mat);if(mat.map)textures.add(mat.map);}
  });
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
  state.board=null;state.reticle=null;state.scene=null;state.camera=null;state.renderer=null;
  state.wires=[];state.ports.clear();state.interactive=[];state.switchClosed=false;state.lamp=null;state.switchLever=null;state.surface=null;
  state.cameraTrack=null;state.video=null;
  $('controls').classList.add('hidden');$('startPanel').classList.remove('hidden');
  $('placeBtn').classList.remove('hidden');$('placeBtn').disabled=true;
  $('crosshair').classList.remove('surface-found');state.lastHit=0;
  $('crosshair').classList.add('hidden');$('stopBtn').classList.add('hidden');
  $('startBtn').disabled=false;$('startBtn').textContent='بدء الواقع المعزز';
  $('loadStatus').textContent=message;$('tracking').textContent='الكاميرا متوقفة';
}
async function startSession(){
  if(state.started || !state.xrReady)return;
  state.started=true;
  Object.assign(state,{
    startedAt:performance.now(),tracking:'INITIALIZING',trackingReason:'INITIALIZING',realityFrames:0,
    motionEvents:0,orientationEvents:0,lastMotion:0,lastOrientation:0,lastDiagnostics:0,
    rawHits:[],hitError:'',cameraTrack:null,video:null,videoWidth:0,videoHeight:0,orientation:null,
    aimX:null,aimY:null,
  });
  $('startBtn').disabled=true;$('loadStatus').textContent='اسمح بالكاميرا والحركة عندما يطلب المتصفح ذلك…';
  $('placeBtn').disabled=true;$('resetBtn').disabled=true;$('switchBtn').disabled=true;$('moveBtn').disabled=true;
  try{
    resizeCanvas();
    XR8.XrController.configure({disableWorldTracking:false,scale:'absolute'});
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      initializeScenePipeline(),
    ]);
    state.sessionTimer=setTimeout(()=>showSessionError('لم تبدأ جلسة AR خلال 60 ثانية. تحقق من إذن الكاميرا والحركة وتوافق الجهاز ثم أعد المحاولة.'),60000);
    await XR8.run({canvas,webgl2:true,allowedDevices:XR8.XrConfig.device().MOBILE,
      cameraConfig:{direction:XR8.XrConfig.camera().BACK}});
  }catch(error){showSessionError('تعذر بدء AR: '+(error?.message || error));}
}
export function initializeApp(){
  if(state.bound)return;
  state.bound=true;state.xrReady=true;
  const numeric=value=>typeof value==='number' && Number.isFinite(value);
  window.addEventListener('devicemotion',event=>{
    if(!state.started)return;
    const groups=[event.acceleration,event.accelerationIncludingGravity,event.rotationRate];
    if(groups.some(group=>group && ['x','y','z','alpha','beta','gamma'].some(key=>numeric(group[key])))){
      state.motionEvents++;state.lastMotion=performance.now();
    }
  });
  window.addEventListener('deviceorientation',event=>{
    if(state.started && ['alpha','beta','gamma'].some(key=>numeric(event[key]))){
      state.orientationEvents++;state.lastOrientation=performance.now();
    }
  });
  $('startBtn').disabled=false;$('startBtn').textContent='بدء الواقع المعزز';
  $('loadStatus').textContent='المحرك جاهز — ستُطلب صلاحية الكاميرا والحركة.';
  $('tracking').textContent='جاهز لبدء التجربة';
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',onPointerMove);
  canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',cancelPointer);
  canvas.addEventListener('lostpointercapture',()=>{if(state.pointer)cancelPointer();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(state.started)showSessionError('فُقد سياق الرسوم. أغلق التطبيقات الأخرى ثم أعد بدء التجربة.');});
  window.addEventListener('resize',resizeCanvas);
  $('startBtn').addEventListener('click',startSession);
  $('stopBtn').addEventListener('click',()=>endSession());
  $('placeBtn').addEventListener('click',placeBoard);
  $('resetBtn').addEventListener('click',()=>{cancelPointer();resetWires();});
  $('switchBtn').addEventListener('click',()=>{if(state.placed){state.switchClosed=!state.switchClosed;refreshElectricalState();}});
  $('moveBtn').addEventListener('click',()=>{
    if(!state.board)return;cancelPointer();state.placed=false;state.board.visible=false;
    $('placeBtn').classList.remove('hidden');$('placeBtn').disabled=true;$('crosshair').classList.remove('hidden');
    $('resetBtn').disabled=true;$('switchBtn').disabled=true;$('moveBtn').disabled=true;
    status('وجّه العلامة إلى سطح جديد. عند ظهور الحلقة اضغط «وضع الدائرة».');
  });
  $('helpBtn').addEventListener('click',()=>{cancelPointer();$('helpPanel').classList.remove('hidden');$('closeHelpBtn').focus();});
  $('closeHelpBtn').addEventListener('click',()=>{$('helpPanel').classList.add('hidden');$('helpBtn').focus();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){$('helpPanel').classList.add('hidden');$('helpBtn').focus();}
    if(event.key==='Tab' && !$('helpPanel').classList.contains('hidden')){event.preventDefault();$('closeHelpBtn').focus();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden && state.started)endSession('أُوقفت الكاميرا عند مغادرة الصفحة. ابدأ تجربة جديدة عند العودة.');});
  window.addEventListener('pagehide',()=>{if(state.started)endSession();});
  window.addEventListener('error',event=>{if(state.started && event.error)showSessionError('خطأ في التجربة: '+event.message);});
  window.addEventListener('unhandledrejection',event=>{if(state.started)showSessionError('خطأ في الجلسة: '+(event.reason?.message || event.reason));});
}
