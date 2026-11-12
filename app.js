// CircuitAR — 8th Wall world-tracking prototype.
// Three.js objects are generated in code; no remote 3D models are needed.
// The experience deliberately has NO non-AR fallback pretending to be AR.
import * as THREE from './vendor/three/three.module.js';
import {chooseSurfaceHit,intersectTrackedGround} from './placement.js?v=ground-20261112';
import {assessCircuit} from './circuit-logic.js?v=education-20261112';
import {createCircuitKit} from './circuit-scene.js?v=education-20261112';
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
  placementSource: 'NONE', groundDistance: null,
  kit:null, result:null, internalArrows:[], lesson:{mode:'guided',prediction:null,hasLit:false,testedOpen:false,testedBreak:false,hint:false},
};
const WHITE = 0xe8f3fc, NAVY = 0x173449, CYAN = 0x35c9d0, GOLD = 0xffc66c;
const material = (color, extra={}) => new THREE.MeshStandardMaterial({color, roughness:.38, metalness:.16, ...extra});
const metal = material(0xc6d7e2,{roughness:.22,metalness:.74});
const white = material(WHITE);
const navy = material(NAVY);
const gold = material(GOLD,{metalness:.32});
const wireMaterials = [material(0xf85f65), material(0x49d1ed), material(0xffd257)];
let wireInitial=[];
const HANDLE_HEIGHT=.075;

function status(message) { $('message').textContent = message; }
function sphere(radius, mat, segments=18) { return new THREE.Mesh(new THREE.SphereGeometry(radius, segments, 12), mat); }
function box(w,h,d,mat) { return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); }
function cylinder(r1,r2,h,mat,segments=24) { return new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat); }
function add(parent,obj,x=0,y=0,z=0) { obj.position.set(x,y,z);parent.add(obj);return obj; }
function interactive(mesh, info) { mesh.userData = {...mesh.userData,...info}; state.interactive.push(mesh);return mesh; }
function writeLabel(text, width=.14, height=.065, bg='#173449',fg='#ffffff') {
  const c=document.createElement('canvas');c.width=512;c.height=Math.round(512*height/width);
  const g=c.getContext('2d');g.direction=/[ء-ي]/.test(text)?'rtl':'ltr';g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);
  g.fillStyle=fg;let fontSize=Math.min(160,c.height*.6);g.font=`bold ${fontSize}px Arial, sans-serif`;
  if(g.measureText(text).width>c.width*.92){fontSize*=c.width*.92/g.measureText(text).width;g.font=`bold ${fontSize}px Arial, sans-serif`;}
  g.textAlign='center';g.textBaseline='middle';g.fillText(text,c.width/2,c.height/2);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const obj=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));
  obj.rotation.x=-Math.PI/2;return obj;
}
function createWire(index,board) {
  const wire={index,color:wireMaterials[index],ends:wireInitial[index].map((p)=>({...p,port:null})),tube:null,handles:[],arrow:null,curve:null};
  for (let i=0;i<2;i++) {
    const handle=sphere(.028,material([0xff868b,0x8ceeff,0xffe7a1][index],{emissive:[0x491012,0x073e45,0x554015][index],emissiveIntensity:.5}));
    interactive(handle,{wire:index,end:i});board.add(handle);wire.handles.push(handle);
  }
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.015,.043,8),new THREE.MeshBasicMaterial({color:0x82fff3}));
  arrow.visible=false;arrow.userData.current='wire';board.add(arrow);wire.arrow=arrow;
  state.wires.push(wire);refreshWire(wire);
}
function routedPoints(wire,pa,pb){
  const h=.083+wire.index*.009,left=-.435-wire.index*.009,right=.435+wire.index*.009;
  const top=-.410-wire.index*.008,bottom=.258+wire.index*.013;
  const v=(x,z)=>new THREE.Vector3(x,h,z);
  const a=state.ports.get(wire.ends[0].port),b=state.ports.get(wire.ends[1].port);
  if(!a||!b){const mid=pa.clone().lerp(pb,.5);mid.y=.10;mid.z+=.018;return [pa,mid,pb];}
  let route=[];
  if(a.component===b.component){
    if(a.component==='battery')route=[v(left,a.z),v(left,b.z)];
    if(a.component==='lamp')route=[v(right,a.z),v(right,b.z)];
    if(a.component==='switch')route=[v(a.x,top),v(b.x,top)];
  }else{
    const canonical=(first,second)=>{
      if(first.component==='battery'&&second.component==='switch')return [v(left,first.z),v(left,top),v(second.x,top)];
      if(first.component==='switch'&&second.component==='lamp')return [v(first.x,top),v(right,top),v(right,second.z)];
      if(first.component==='battery'&&second.component==='lamp')return [v(left,first.z),v(left,bottom),v(right,bottom),v(right,second.z)];
      return null;
    };
    route=canonical(a,b)||canonical(b,a)?.reverse()||[];
  }
  return [pa,...route,pb];
}
function refreshWire(wire) {
  if(!state.board)return;
  const [a,b]=wire.ends,pa=new THREE.Vector3(a.x,HANDLE_HEIGHT,a.z),pb=new THREE.Vector3(b.x,HANDLE_HEIGHT,b.z);
  const path=routedPoints(wire,pa,pb).filter((p,i,all)=>!i||p.distanceToSquared(all[i-1])>1e-9);
  wire.curve=new THREE.CatmullRomCurve3(path,false,'centripetal');
  if(wire.tube){state.board.remove(wire.tube);wire.tube.geometry.dispose();}
  wire.tube=new THREE.Mesh(new THREE.TubeGeometry(wire.curve,56,.0075,8,false),wire.color);state.board.add(wire.tube);
  wire.handles[0].position.copy(pa);wire.handles[1].position.copy(pb);
}
function createBoard(scene) {
  state.board=new THREE.Group();state.board.name='educational-circuit';state.board.visible=false;state.board.scale.setScalar(.62);scene.add(state.board);
  state.kit=createCircuitKit({THREE,board:state.board,registerInteractive:interactive,writeLabel});
  state.ports=state.kit.ports;state.lamp=state.kit.lamp;state.switchLever=state.kit.switchLever;
  wireInitial=state.kit.layout.wireInitial;
  state.lesson={mode:'guided',prediction:null,hasLit:false,testedOpen:false,testedBreak:false,hint:false};
  for(let i=0;i<3;i++)createWire(i,state.board);
  state.internalArrows=[];
  for(const component of ['switch','lamp']){
    const curve=new THREE.CatmullRomCurve3(state.kit.internalPaths[component]);
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(.012,.032,8),new THREE.MeshBasicMaterial({color:0x0bafa6,depthTest:false}));
    arrow.visible=false;arrow.userData.current='component';arrow.renderOrder=2;state.board.add(arrow);state.internalArrows.push({component,curve,mesh:arrow});
  }
  refreshElectricalState();
}
function signature(a,b){return [a,b].sort().join(':');}
function hintPair(){
  const options=[];
  for(const reverse of [false,true])for(const flipSwitch of [false,true])for(const flipLamp of [false,true]){
    const sw=flipSwitch?['switchOut','switchIn']:['switchIn','switchOut'];
    const lp=flipLamp?['lampMinus','lampPlus']:['lampPlus','lampMinus'];
    const [first,second]=reverse?[lp,sw]:[sw,lp];
    options.push([['batteryPlus',first[0]],[first[1],second[0]],[second[1],'batteryMinus']]);
  }
  const complete=state.wires.filter(w=>w.ends.every(e=>e.port)).map(w=>signature(...w.ends.map(e=>e.port)));
  const score=option=>complete.filter(s=>option.some(p=>signature(...p)===s)).length;
  options.sort((a,b)=>score(b)-score(a));
  if(score(options[0])!==complete.length)return null;
  return options[0].find(pair=>!complete.includes(signature(...pair)))||null;
}
function renderLesson(){
  if(!$('lessonPanel'))return;
  const r=state.result||assessCircuit(state.wires,state.switchClosed),l=state.lesson;
  let step='ضع المختبر',title='ابدأ من أرضية واضحة',text='انتظر الحلقة، ثم ضع مختبر الدائرة أمامك.';
  if(state.placed){
    if(l.mode==='explore'){step='استكشاف حر';title='غيّر، جرّب، ثم فسّر';text='جرّب ترتيبًا آخر للمكونات، وافتح المفتاح وافصل سلكًا. ما الذي يبقي المصباح مضيئًا؟';}
    else if(!r.connected&&!l.hasLit){step='١ · ركّب';title='اصنع مسارًا مغلقًا';text='صل الأسلاك الثلاثة بحيث يمر المسار بالبطارية والمفتاح والمصباح. كل سلك له طرفان.';}
    else if(!l.hasLit){step='٢ · توقّع';title=l.prediction?'اختبر توقّعك':'ماذا سيحدث إذا أغلقت المفتاح؟';text=l.prediction?'أغلق المفتاح، ثم قارن النتيجة بتوقّعك.':'الأسلاك موصولة والمفتاح مفتوح. اختر توقّعك، ثم جرّب.';}
    else if(!l.testedOpen){step='٣ · جرّب';title='افتح المفتاح وراقب المصباح';text=l.prediction==='no'?'توقعت أن يبقى مطفأ، لكنه أضاء لأن المفتاح أكمل المسار. افتح المفتاح الآن.':l.prediction==='yes'?'توقعك صحيح: أضاء المصباح عند اكتمال المسار. افتح المفتاح وراقب الفجوة.':'رأيت المصباح يضيء. ماذا يحدث عندما تظهر فجوة في المفتاح؟';}
    else if(!l.testedBreak){step='٤ · اكتشف';title='هل للأسلاك دور؟';text=state.switchClosed?'اسحب طرف سلك خارج المنفذ. راقب المصباح ومسار التيار.':'فتح المفتاح قطع المسار فانطفأ المصباح. أغلقه، ثم افصل طرف سلك.';}
    else{step='اكتمل النشاط';title='اكتشفت سر الدائرة!';text='يضيء المصباح عندما يكون المسار كاملًا والمفتاح مغلقًا. فتح المفتاح أو فصل سلك يقطع التيار.';}
  }
  $('lessonStep').textContent=step;$('lessonTitle').textContent=title;$('lessonText').textContent=text;
  $('predictionControls').classList.toggle('hidden',!(state.placed&&l.mode==='guided'&&r.connected&&!l.hasLit&&!l.prediction));
  $('exploreBtn').textContent=l.mode==='explore'?'العودة للنشاط':'استكشاف حر';$('exploreBtn').setAttribute('aria-pressed',String(l.mode==='explore'));
  $('exploreBtn').disabled=!state.placed;$('hintBtn').disabled=!state.placed||r.connected;
  $('hintBtn').setAttribute('aria-pressed',String(l.hint));
  const pair=l.hint&&!r.connected?hintPair():null;
  for(const port of state.ports.values()){
    const occupied=state.wires.some(w=>w.ends.some(e=>e.port===port.id));
    port.ring.material.color.setHex(pair?.includes(port.id)?0x17a99b:occupied?0x367c91:0x94aaa9);
    port.ring.material.emissiveIntensity=pair?.includes(port.id) ? .65 : 0;
  }
  if(pair){
    const names={batteryPlus:'موجب البطارية',batteryMinus:'سالب البطارية',switchIn:'المفتاح (أ)',switchOut:'المفتاح (ب)',lampPlus:'المصباح (أ)',lampMinus:'المصباح (ب)'};
    $('lessonText').textContent=`تلميح: صل ${names[pair[0]]} بـ ${names[pair[1]]}. أُضيء المنفذان لمساعدتك، واختر أي سلك.`;
  }else if(l.hint&&!r.connected)$('lessonText').textContent='تتبّع الأسلاك: يوجد توصيل خارج مسار المكونات. افصل طرفًا وجرّب مسارًا يمر بالمفتاح والمصباح.';
  $('lessonPanel').dataset.stage=step;$('controls').dataset.circuitConnected=String(r.connected);$('controls').dataset.lampLit=String(r.lit);$('controls').dataset.circuitReason=r.reason||'';$('controls').dataset.attachedEnds=String(r.attachedEnds||0);
}
function refreshElectricalState() {
  const previous=state.result,result=assessCircuit(state.wires,state.switchClosed);state.result=result;
  if(result.lit)state.lesson.hasLit=true;
  if(state.lesson.hasLit&&previous?.lit&&result.connected&&!state.switchClosed)state.lesson.testedOpen=true;
  if(state.lesson.hasLit&&previous?.lit&&!result.connected&&state.switchClosed)state.lesson.testedBreak=true;
  $('connections').textContent=`الأسلاك الموصولة: ${result.connectedWireCount??result.correctCount} / 3`;
  $('lampState').textContent=result.lit?'💡 المصباح مضيء':'المصباح مطفأ';$('lampState').classList.toggle('is-lit',result.lit);
  $('switchBtn').textContent=state.switchClosed?'فتح المفتاح':'إغلاق المفتاح';$('switchBtn').setAttribute('aria-pressed',String(state.switchClosed));
  if(state.lamp){
    const l=state.lamp;l.bulbMat.color.setHex(result.lit?0xffefd0:0xd8f3ff);l.bulbMat.emissiveIntensity=result.lit?.12:0;
    l.filamentMat.color.setHex(result.lit?0xfff0b3:0x9b6132);l.filamentMat.emissiveIntensity=result.lit?4:0;
    l.light.intensity=result.lit?.35:0;l.halo.material.opacity=result.lit?.55:0;
  }
  if(state.switchLever)state.switchLever.rotation.z=state.switchClosed?0:.65;
  state.wires.forEach(w=>w.arrow.visible=result.lit);state.internalArrows.forEach(a=>a.mesh.visible=result.lit);
  if(state.placed){
    if(result.lit)status(result.matchesLessonRoute===false?'أضاء المصباح! ترتيبك يعمل أيضًا؛ المهم مسار مغلق يمر بالمكونات.':'أضاء المصباح! التيار يمر في المسار المغلق من موجب البطارية إلى سالبها.');
    else if(result.connected)status('المسار مكتمل بالأسلاك، لكن المفتاح مفتوح: توجد فجوة تمنع مرور التيار.');
    else if(result.reason==='short'||result.reason==='incorrect')status('تتبّع المسار من البطارية. يجب أن يمر بالمفتاح والمصباح دون تجاوزهما.');
    else if(previous?.lit)status('انقطع المسار عند طرف السلك، فانطفأ المصباح وتوقفت أسهم التيار.');
    else status('اسحب طرف السلك إلى منفذ، أو المس الطرف ثم المنفذ. يمكن فصل أي طرف وإعادة توصيله.');
  }
  renderLesson();
}
function resetWires() {
  state.wires.forEach((wire,i)=>{wire.ends=wireInitial[i].map(p=>({...p,port:null}));refreshWire(wire);});
  state.selected=null;state.switchClosed=false;state.lesson={mode:'guided',prediction:null,hasLit:false,testedOpen:false,testedBreak:false,hint:false};refreshElectricalState();
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
  if(hits.length)return (hits.find(h=>h.object.userData.wire!==undefined) || hits.find(h=>h.object.userData.port) || hits[0]).object;
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
  const level=state.board.localToWorld(new THREE.Vector3(0,HANDLE_HEIGHT,0)).y;
  const world=worldPointOnLevel(e,level);
  if(!world)return;
  const local=state.board.worldToLocal(world.clone());
  const wire=state.wires[state.selected.wire];const end=wire.ends[state.selected.end];
  const bounds=state.kit.layout.boardBounds;
  end.port=null;end.x=THREE.MathUtils.clamp(local.x,bounds.minX,bounds.maxX);end.z=THREE.MathUtils.clamp(local.z,bounds.minZ,bounds.maxZ);
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
  }catch(error){
    state.rawHits=[];state.hitError=error?.message || String(error);
  }
  state.placementSource='NONE';state.groundDistance=null;
  if(state.tracking!=='NORMAL')return null;
  const explicitSurface=chooseSurfaceHit(state.rawHits);
  if(explicitSurface){state.placementSource='XR8_SURFACE';return explicitSurface;}
  // 8th Wall defines its single, dynamically tracked floor at world Y=0.
  // This is the official Three.js ground-placement convention, not a pose
  // invented in front of the viewer. Never use it without a tracked camera.
  state.camera.updateMatrixWorld(true);
  state.raycaster.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),state.camera);
  const ground=intersectTrackedGround({
    origin:state.raycaster.ray.origin,direction:state.raycaster.ray.direction,tracking:state.tracking,
  });
  if(ground){state.placementSource='XR8_GROUND';state.groundDistance=ground.distance;}
  return ground;
}
function placeBoard(){
  if(!state.started || !state.board)return status('ابدأ الكاميرا وانتظر جاهزية المشهد.');
  // Recheck on click rather than using a stale pose after the device moves.
  const hit=surfaceHit();
  if(!hit)return status('وجّه العلامة لأسفل نحو أرضية قريبة، وانتظر استقرار تتبع الجهاز.');
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
  renderLesson();
  status(hit.type==='TRACKED_GROUND'?'تم وضع الدائرة على الأرضية التي يتتبعها المحرك. اسحب أطراف الأسلاك لتوصيلها.':
    hit.type==='ESTIMATED_SURFACE'?'تم وضع الدائرة على سطح تقديري من المحرك. تحقق من ارتفاعه، ثم وصّل الأسلاك.':
    'تم تثبيت الدائرة. اسحب طرف كل سلك إلى منفذ، أو المس الطرف ثم المنفذ.');
}
function animateAr(time){
  if(!state.board||!state.placed||state.tracking!=='NORMAL'||!state.result?.lit)return;
  const path=state.result.currentPath||[];
  state.wires.forEach(wire=>{
    const segment=path.find(p=>p.wire===wire.index);if(!segment||!wire.curve)return;
    const forward=wire.ends[0].port===segment.from,t=(time*.00023+wire.index*.27)%1,u=forward?t:1-t;
    const tangent=wire.curve.getTangent(u).multiplyScalar(forward?1:-1).normalize();
    wire.arrow.position.copy(wire.curve.getPoint(u));wire.arrow.position.y+=.008;
    wire.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);
  });
  for(const entry of state.internalArrows){
    const outgoing=path.find(p=>p.from.startsWith(entry.component)),canonical=entry.component==='switch'?'switchOut':'lampMinus';
    const forward=outgoing?.from===canonical,t=(time*.00023+.12)%1,u=forward?t:1-t;
    entry.mesh.position.copy(entry.curve.getPoint(u));entry.mesh.position.y+=.006;
    entry.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),entry.curve.getTangent(u).multiplyScalar(forward?1:-1).normalize());
  }
  state.lamp.halo.material.opacity=.50+.05*Math.sin(time*.003);
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
  details.append(summary,text,copy);$('helpPanel').insertBefore(details,$('closeHelpBtn'));
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
    placementSource:state.placementSource,groundDistance:state.groundDistance===null?'':String(state.groundDistance),
  });
  $('diagnosticText').textContent=[
    'الإصدار: education-20261112',
    `حالة التتبع: ${state.tracking}`,
    `سبب التتبع: ${state.trackingReason}`,
    `إطارات بيانات التتبع: ${state.realityFrames}`,
    `نتائج السطح: ${state.rawHits.length}؛ صالحة للمسافة: ${usable}`,
    `أنواع النتائج: ${state.rawHits.map(h=>`${h.type} (${Number.isFinite(h.distance)?h.distance.toFixed(2):'?'} م)`).join('، ') || 'لا توجد'}`,
    `مصدر الوضع: ${state.placementSource==='XR8_GROUND'?'أرضية 8th Wall المتتبعة':state.placementSource==='XR8_SURFACE'?'نتيجة سطح من المحرك':'لا توجد نقطة أرضية مناسبة بعد'}`,
    `مسافة الأرضية: ${state.groundDistance===null?'غير متاحة':state.groundDistance.toFixed(2)+' م'}`,
    `ارتفاع الكاميرا في العالم: ${state.camera?state.camera.getWorldPosition(new THREE.Vector3()).y.toFixed(3)+' م':'غير متاح'}`,
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
    state.placementSource='NONE';state.groundDistance=null;
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
      scene.add(new THREE.HemisphereLight(0xffffff,0x778c97,1.8));
      const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,5,3);scene.add(light);
      camera.position.set(0,1.6,0);
      XR8.XrController.updateCameraProjectionMatrix({origin:camera.position,facing:camera.quaternion});
      createBoard(scene);
      state.reticle=new THREE.Mesh(new THREE.RingGeometry(.055,.07,32),new THREE.MeshBasicMaterial({color:CYAN,side:THREE.DoubleSide}));
      state.reticle.rotation.x=-Math.PI/2;state.reticle.visible=false;scene.add(state.reticle);
      $('startPanel').classList.add('hidden');$('controls').classList.remove('hidden');
      $('stopBtn').classList.remove('hidden');$('crosshair').classList.remove('hidden');
      $('retryBtn').classList.add('hidden');$('lessonPanel').classList.remove('hidden');renderLesson();
      ensureDiagnostics();renderDiagnostics();
      status('انتظر استقرار التتبع ووجّه العلامة لأسفل نحو الأرضية. عند ظهور الحلقة اضغط «وضع الدائرة».');
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
        if(state.surface){
          $('tracking').textContent=state.placementSource==='XR8_GROUND'?'✓ الأرضية المتتبعة جاهزة — ضع الدائرة':'✓ سطح جاهز — اضغط وضع الدائرة';
          status(state.placementSource==='XR8_GROUND'?'اضغط «وضع الدائرة» لتثبيتها على أرضية المحرك المتتبعة.':'اضغط «وضع الدائرة» عند الموضع المحدد بالحلقة.');
        }else if(state.tracking==='NORMAL'){
          $('tracking').textContent='التتبع مستقر — وجّه العلامة لأسفل نحو الأرضية';
          status('وجّه العلامة إلى أرضية قريبة، بعيدًا عن الأفق أو الجدار. يحدد المحرك مستوى أرضية واحدًا.');
        }
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
  state.cameraTrack=null;state.video=null;state.kit=null;state.result=null;state.internalArrows=[];
  $('controls').classList.add('hidden');$('lessonPanel').classList.add('hidden');$('startPanel').classList.remove('hidden');
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
    placementSource:'NONE',groundDistance:null,
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
    $('resetBtn').disabled=true;$('switchBtn').disabled=true;$('moveBtn').disabled=true;renderLesson();
    status('وجّه العلامة إلى سطح جديد. عند ظهور الحلقة اضغط «وضع الدائرة».');
  });
  $('hintBtn').addEventListener('click',()=>{state.lesson.hint=!state.lesson.hint;renderLesson();});
  $('exploreBtn').addEventListener('click',()=>{state.lesson.mode=state.lesson.mode==='guided'?'explore':'guided';state.lesson.hint=false;renderLesson();});
  for(const [id,value] of [['predictYes','yes'],['predictNo','no']])$(id).addEventListener('click',()=>{state.lesson.prediction=value;renderLesson();});
  $('helpBtn').addEventListener('click',()=>{cancelPointer();$('helpPanel').classList.remove('hidden');$('closeHelpBtn').focus();});
  $('closeHelpBtn').addEventListener('click',()=>{$('helpPanel').classList.add('hidden');$('helpBtn').focus();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){$('helpPanel').classList.add('hidden');$('helpBtn').focus();}
    if(event.key==='Tab' && !$('helpPanel').classList.contains('hidden')){
      const targets=[...$('helpPanel').querySelectorAll('button,summary,a[href]')].filter(el=>el.getClientRects().length && !el.disabled);
      const index=targets.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+targets.length)%targets.length;
      if(targets.length){event.preventDefault();targets[next].focus();}
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden && state.started)endSession('أُوقفت الكاميرا عند مغادرة الصفحة. ابدأ تجربة جديدة عند العودة.');});
  window.addEventListener('pagehide',()=>{if(state.started)endSession();});
  window.addEventListener('error',event=>{if(state.started && event.error)showSessionError('خطأ في التجربة: '+event.message);});
  window.addEventListener('unhandledrejection',event=>{if(state.started)showSessionError('خطأ في الجلسة: '+(event.reason?.message || event.reason));});
}
