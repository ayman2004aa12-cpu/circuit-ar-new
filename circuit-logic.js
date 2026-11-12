// An incandescent lamp and a mechanical switch have interchangeable terminals.
// Conductivity depends on the closed series path, never on wire colors or labels.
const terminals=new Set(['batteryPlus','batteryMinus','switchIn','switchOut','lampPlus','lampMinus']);
const signature=(a,b)=>[a,b].sort().join(':');
const component=port=>port?.startsWith('battery')?'battery':port?.startsWith('switch')?'switch':port?.startsWith('lamp')?'lamp':null;
export const requiredConnections=[['batteryPlus','switchIn'],['switchOut','lampPlus'],['lampMinus','batteryMinus']];
const circuits=[];
for(const reverse of [false,true])for(const flipSwitch of [false,true])for(const flipLamp of [false,true]){
  const sw=flipSwitch?['switchOut','switchIn']:['switchIn','switchOut'];
  const lamp=flipLamp?['lampMinus','lampPlus']:['lampPlus','lampMinus'];
  const [first,second]=reverse?[lamp,sw]:[sw,lamp];
  circuits.push({pairs:[['batteryPlus',first[0]],[first[1],second[0]],[second[1],'batteryMinus']],matchesLessonRoute:!reverse});
}
export function assessCircuit(wires,switchClosed){
  const empty={correctCount:0,connected:false,lit:false,connectedWireCount:0,attachedEnds:0,currentPath:[],matchesLessonRoute:false,reason:'malformed'};
  if(!Array.isArray(wires))return empty;
  const edges=[],occupied=new Set();let attachedEnds=0,malformed=wires.length!==3,short=false;
  wires.forEach((wire,index)=>{
    if(!Array.isArray(wire?.ends)||wire.ends.length!==2){malformed=true;return;}
    const ports=wire.ends.map(end=>end?.port);
    for(const port of ports){
      if(port===null||port===undefined)continue;
      if(!terminals.has(port)){malformed=true;continue;}
      attachedEnds++;if(occupied.has(port))malformed=true;occupied.add(port);
    }
    if(!ports.every(port=>terminals.has(port)))return;
    const [a,b]=ports;
    if(a===b){short=true;return;}
    if(component(a)===component(b))short=true;
    edges.push({wire:index,a,b,key:signature(a,b)});
  });
  const unique=new Set(edges.map(edge=>edge.key));
  const scored=circuits.map(circuit=>({...circuit,score:circuit.pairs.filter(pair=>unique.has(signature(...pair))).length})).sort((a,b)=>b.score-a.score);
  const best=scored[0],connected=!malformed&&!short&&edges.length===3&&unique.size===3&&best.score===3;
  const currentPath=connected?best.pairs.map(([from,to])=>({wire:edges.find(edge=>edge.key===signature(from,to)).wire,from,to})):[];
  let reason=connected?(switchClosed===true?'closed':'open'):malformed?'malformed':short?'short':
    edges.some(edge=>!circuits.some(circuit=>circuit.pairs.some(pair=>signature(...pair)===edge.key)))||edges.length===3?'incorrect':'incomplete';
  return {correctCount:best.score,connected,lit:connected&&switchClosed===true,
    connectedWireCount:edges.length,attachedEnds:Math.min(attachedEnds,6),currentPath,
    matchesLessonRoute:connected&&best.matchesLessonRoute,reason};
}
