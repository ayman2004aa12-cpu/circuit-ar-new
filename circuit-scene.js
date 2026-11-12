// Classroom circuit kit. All geometry is local and sits above the XR8 ground.
export function createCircuitKit({THREE:T,board,registerInteractive,writeLabel}) {
  const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.46,metalness:.12,...extra});
  const white=mat(0xf5f3e9), navy=mat(0x153b50), metal=mat(0xc1cbd0,{metalness:.82,roughness:.25});
  const brass=mat(0xcfa44d,{metalness:.74,roughness:.28}), copper=mat(0xc47e42,{metalness:.72,roughness:.3});
  const mesh=(geometry,material,parent=board,x=0,y=0,z=0)=>{const m=new T.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;};
  const box=(w,h,d,m,p=board,x=0,y=0,z=0)=>mesh(new T.BoxGeometry(w,h,d),m,p,x,y,z);
  const cyl=(r,h,m,p=board,x=0,y=0,z=0)=>mesh(new T.CylinderGeometry(r,r,h,28),m,p,x,y,z);
  const points=values=>values.map(p=>new T.Vector3(...p));
  const tube=(values,r,m,parent=board)=>mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points(values)),28,r,8,false),m,parent);
  const label=(text,x,z,w=.20,h=.047,bg='#f5f3e9',fg='#153b50')=>{const p=writeLabel(text,w,h,bg,fg);p.position.set(x,.0355,z);board.add(p);return p;};
  // A quiet, bright work surface gives the real components visual priority.
  box(1.04,.024,.98,navy,board,0,.012,0);
  box(1.015,.010,.955,white,board,0,.029,0);
  for(const x of [-.47,.47])for(const z of [-.43,.43])cyl(.012,.004,metal,board,x,.037,z);
  label('مختبر الدائرة الكهربائية',0,-.080,.33,.042,'#f5f3e9','#153b50');
  label('ركّب  •  جرّب  •  اكتشف',0,.035,.27,.052,'#f5f3e9','#48717b');
  // Battery: one cylindrical cell, end caps, positive bump, and a holder.
  box(.17,.025,.365,navy,board,-.32,.051,0);
  for(const z of [-.13,.13])box(.15,.025,.026,metal,board,-.32,.077,z);
  const cell=cyl(.057,.284,mat(0xe8b94b,{metalness:.4}),board,-.32,.125,0);cell.rotation.x=Math.PI/2;
  for(const z of [-.142,.142]){const end=cyl(.057,.008,metal,board,-.32,.125,z);end.rotation.x=Math.PI/2;}
  const bump=cyl(.023,.016,brass,board,-.32,.125,-.153);bump.rotation.x=Math.PI/2;
  const sleeve=cyl(.058,.135,navy,board,-.32,.125,.012);sleeve.rotation.x=Math.PI/2;
  const batteryText=writeLabel('1.5 V',.105,.077,'#153b50','#ffffff');batteryText.position.set(-.32,.184,.012);board.add(batteryText);
  label('بطارية',-.32,.255,.18);
  // Screw-base incandescent bulb with visible leads and a real filament.
  cyl(.085,.030,navy,board,.32,.053,0);cyl(.068,.030,white,board,.32,.080,0);
  cyl(.042,.065,metal,board,.32,.122,0);
  for(let i=0;i<5;i++){
    const thread=mesh(new T.TorusGeometry(.043,.0035,6,24),metal,board,.32,.098+i*.012,0);thread.rotation.x=Math.PI/2;
  }
  const bulbMat=mat(0xd8f3ff,{transparent:true,opacity:.23,roughness:.10,metalness:.03,emissive:0xffc65b,emissiveIntensity:0,depthWrite:false});
  const bulb=mesh(new T.SphereGeometry(.079,28,20),bulbMat,board,.32,.226,0);bulb.scale.y=1.15;
  const filamentMat=mat(0x9b6132,{emissive:0xffbe36,emissiveIntensity:0,metalness:.4});
  const filamentPoints=[];
  for(let i=0;i<=64;i++){const u=i/64;filamentPoints.push([.291+.058*u,.226+.008*Math.cos(u*Math.PI*12),.008*Math.sin(u*Math.PI*12)]);}
  const filament=tube(filamentPoints,.0035,filamentMat);filament.name='lamp-filament';bulb.name='lamp-glass';
  tube([[.302,.142,0],[.302,.194,0],[.291,.234,0]],.0025,copper);
  tube([[.338,.142,0],[.338,.194,0],[.349,.234,0]],.0025,copper);
  label('مصباح',.32,.255,.18);
  // A hinge and blade make the open gap physically visible.
  box(.305,.027,.135,navy,board,0,.050,-.29);
  box(.278,.014,.112,white,board,0,.071,-.29);
  for(const x of [-.12,.12])box(.032,.025,.044,brass,board,x,.091,-.29);
  const switchLever=new T.Group();switchLever.position.set(-.12,.106,-.29);board.add(switchLever);switchLever.name='switch-blade';
  const blade=box(.24,.013,.026,copper,switchLever,.12,0,0);
  box(.059,.029,.054,navy,switchLever,.16,.018,0);
  registerInteractive(blade,{switch:true});
  const switchTarget=box(.28,.11,.11,new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),board,0,.108,-.29);
  registerInteractive(switchTarget,{switch:true});switchLever.rotation.z=.65;
  label('مفتاح',0,-.190,.18,.044);
  const terminalInfo=[
    {id:'batteryPlus',x:-.43,z:-.18,name:'+',component:'battery'},
    {id:'batteryMinus',x:-.43,z:.18,name:'−',component:'battery'},
    {id:'switchIn',x:-.12,z:-.29,name:'أ',component:'switch'},
    {id:'switchOut',x:.12,z:-.29,name:'ب',component:'switch'},
    {id:'lampPlus',x:.43,z:-.18,name:'أ',component:'lamp'},
    {id:'lampMinus',x:.43,z:.18,name:'ب',component:'lamp'},
  ];
  const ports=new Map();
  for(const cfg of terminalInfo){
    const root=new T.Group();root.position.set(cfg.x,.047,cfg.z);board.add(root);
    const base=cyl(.043,.026,navy,root);
    const ring=mesh(new T.TorusGeometry(.034,.006,8,24),mat(0x94aaa9,{emissive:0x20c9bd,emissiveIntensity:0}),root,0,.014,0);ring.rotation.x=-Math.PI/2;ring.userData.hintPort=cfg.id;
    const connector=cyl(.022,.025,brass,root,0,.012,0);
    const hit=cyl(.049,.030,new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),root,0,.015,0);
    registerInteractive(hit,{port:cfg.id});ports.set(cfg.id,{...cfg,root,base,ring,connector});
    // Keep only the battery polarities prominent; lamp and switch are nonpolar.
    const dx=0;
    label(cfg.name,cfg.x+dx,cfg.z+(cfg.component==='switch'?.065:cfg.z<0?-.062:.062),.036,.032,'#f5f3e9',cfg.id==='batteryPlus'?'#b93642':'#153b50');
  }
  // Exposed short internal leads visually link every socket to its component.
  tube([[-.43,.075,-.18],[-.40,.081,-.18],[-.32,.125,-.159]],.005,copper);
  tube([[-.43,.075,.18],[-.40,.081,.18],[-.32,.125,.147]],.005,copper);
  tube([[.43,.075,-.18],[.43,.066,-.095],[.302,.096,0],[.302,.142,0]],.005,copper);
  tube([[.43,.075,.18],[.43,.066,.095],[.338,.096,0],[.338,.142,0]],.005,copper);
  // Separate loose cables are placed in a lower tray, never preconnected.
  box(.64,.007,.150,mat(0xdce8e5,{roughness:.8}),board,0,.039,.365);
  label('الأسلاك الثلاثة',0,.463,.30,.034,'#f5f3e9','#48717b');
  const wireInitial=[
    [{x:-.26,z:.325},{x:-.10,z:.325}],
    [{x:-.08,z:.382},{x:.08,z:.382}],
    [{x:.10,z:.325},{x:.26,z:.325}],
  ];
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
  const g=glowCanvas.getContext('2d'),gradient=g.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,246,186,.9)');gradient.addColorStop(.35,'rgba(255,204,65,.45)');gradient.addColorStop(1,'rgba(255,190,40,0)');
  g.fillStyle=gradient;g.fillRect(0,0,128,128);
  const halo=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(glowCanvas),transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
  halo.position.set(.32,.23,0);halo.scale.set(.30,.30,1);board.add(halo);
  const light=new T.PointLight(0xffd37b,0,.65);light.position.set(.32,.25,0);board.add(light);
  return {
    ports, lamp:{bulb,bulbMat,filament,filamentMat,halo,light},switchLever,
    internalPaths:{
      battery:points([[-.43,.075,.18],[-.32,.145,0],[-.43,.075,-.18]]),
      switch:points([[-.12,.106,-.29],[0,.106,-.29],[.12,.106,-.29]]),
      lamp:points([[.43,.075,-.18],[.302,.14,0],[.291,.234,0],[.349,.234,0],[.338,.14,0],[.43,.075,.18]]),
    },
    layout:{terminalInfo,wireInitial,handleHeight:.075,boardBounds:{minX:-.47,maxX:.47,minZ:-.43,maxZ:.44}},
  };
}
