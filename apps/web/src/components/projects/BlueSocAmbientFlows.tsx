'use client';

import { BLUE_SOC_ASSETS, BLUE_SOC_CONNECTIONS, ZONE_STYLES, type BlueSocAsset, type SecurityZone } from '@/content/blueSocArchitecture';

/**
 * Ambient, simulated traffic that covers every region of the user's original
 * topology. This is deliberately NOT real network telemetry. Each path uses
 * the underlying logical connections; IDS / log / API relationships are
 * rendered as separate dashed event overlays.
 */
type Relation={from:string;to:string;kind:'mirror'|'identity'|'log'|'automation'};
const logicalEvents:Relation[]=[
  {from:'dmz1',to:'onion',kind:'mirror'},
  {from:'onion',to:'splunk',kind:'log'},
  {from:'splunk',to:'n8n',kind:'automation'},
  {from:'n8n',to:'palo',kind:'automation'},
  {from:'duo',to:'radius',kind:'identity'},
];

const byId=new Map(BLUE_SOC_ASSETS.map(d=>[d.id,d]));
const W=170,H=108;
function end(a:BlueSocAsset, side:'left'|'right'|'top'|'bottom'){
  if(side==='left')return {x:a.x,y:a.y+H/2};
  if(side==='right')return {x:a.x+W,y:a.y+H/2};
  if(side==='top')return {x:a.x+W/2,y:a.y};
  return {x:a.x+W/2,y:a.y+H};
}
function portSide(a:BlueSocAsset,b:BlueSocAsset){
  const dx=b.x-a.x,dy=b.y-a.y;
  if(Math.abs(dx)>=Math.abs(dy)*1.15)
    return dx>0?{from:'right' as const,to:'left' as const}:{from:'left' as const,to:'right' as const};
  return dy>0?{from:'bottom' as const,to:'top' as const}:{from:'top' as const,to:'bottom' as const};
}
function cable(a:BlueSocAsset,b:BlueSocAsset,from?:'left'|'right'|'top'|'bottom',to?:'left'|'right'|'top'|'bottom'){
  const sides=portSide(a,b);
  const f=from??sides.from,t=to??sides.to;
  const p=end(a,f),q=end(b,t);
  if(f==='left'||f==='right'){
    const x=(p.x+q.x)/2;
    return `M ${p.x} ${p.y} H ${x} V ${q.y} H ${q.x}`;
  }
  const y=(p.y+q.y)/2;
  return `M ${p.x} ${p.y} V ${y} H ${q.x} V ${q.y}`;
}
function eventArc(a:BlueSocAsset,b:BlueSocAsset){
  const p={x:a.x+W/2,y:a.y+H/2};
  const q={x:b.x+W/2,y:b.y+H/2};
  const mx=(p.x+q.x)/2,my=(p.y+q.y)/2;
  // Curved to distinguish monitoring/logging/control-plane information from routed packets.
  const curve=Math.max(54,Math.min(140,Math.hypot(q.x-p.x,q.y-p.y)*.22));
  return `M ${p.x} ${p.y} Q ${mx+curve} ${my-curve} ${q.x} ${q.y}`;
}
const eventColor:Record<Relation['kind'],string>={
  mirror:'#fbbf24',
  identity:'#67e8f9',
  log:'#a78bfa',
  automation:'#fb923c',
};

export function BlueSocAmbientFlows({running,enabled,speed,zone}:{
  running:boolean;enabled:boolean;speed:number;zone:SecurityZone|'all'
}){
  if(!enabled)return null;
  return <g data-testid="blue-soc-all-zones-ambient-flow" aria-hidden="true">
    {BLUE_SOC_CONNECTIONS.map((edge,index)=>{
      const a=byId.get(edge.from),b=byId.get(edge.to);
      if(!a||!b)return null;
      const d=cable(a,b,edge.sourcePort,edge.targetPort);
      const color=ZONE_STYLES[b.zone].color;
      const faded=zone!=='all'&&a.zone!==zone&&b.zone!==zone;
      return <g key={edge.id} opacity={faded?0.12:0.85}>
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 12" opacity="0.38"/>
        {running&&[0,1].map(n=><g key={n}>
          <circle r={n===0?4.8:2.7} fill={n===0?'#e7fbff':color} stroke={n===0?color:'none'} strokeWidth="1.5">
            <animateMotion dur={`${(4+index%4)/speed}s`} begin={`${-(index*.67+n*2)}s`} path={d} repeatCount="indefinite"/>
          </circle>
        </g>)}
      </g>;
    })}
    {logicalEvents.map((rel,index)=>{
      const a=byId.get(rel.from),b=byId.get(rel.to);
      if(!a||!b)return null;
      const d=eventArc(a,b);
      const faded=zone!=='all'&&a.zone!==zone&&b.zone!==zone;
      const color=eventColor[rel.kind];
      return <g key={rel.from+rel.to} opacity={faded?0.1:0.9}>
        <path d={d} fill="none" stroke={color} strokeWidth="1.3" strokeDasharray="3 10" opacity="0.42"/>
        {running&&<circle r="4.5" fill={color} stroke="#0b1724" strokeWidth="1.5">
          <animateMotion dur={`${(6+index*.55)/speed}s`} begin={`${-index*1.2}s`} repeatCount="indefinite" path={d}/>
        </circle>}
      </g>;
    })}
  </g>;
}
