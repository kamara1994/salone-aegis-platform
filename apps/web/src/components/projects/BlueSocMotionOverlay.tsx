'use client';

import type { BlueSocFlow } from '@/content/blueSocMotion';
import { BLUE_SOC_ASSETS, type BlueSocAsset, type SecurityZone } from '@/content/blueSocArchitecture';

/** SVG overlay: a moving packet follows one step at a time, and previous hops remain highlighted. */
const CARD_WIDTH=170;
const CARD_HEIGHT=108;

function direction(a:BlueSocAsset,b:BlueSocAsset){
  const dx=b.x-a.x,dy=b.y-a.y;
  // Pick endpoints based on the distance between node centers.
  if(Math.abs(dx)>Math.abs(dy)*1.2){
    return dx>=0?({src:'right',dst:'left'} as const):({src:'left',dst:'right'} as const);
  }
  return dy>=0?({src:'bottom',dst:'top'} as const):({src:'top',dst:'bottom'} as const);
}
function anchor(a:BlueSocAsset,side:'left'|'right'|'top'|'bottom'){
  if(side==='left')return {x:a.x,y:a.y+CARD_HEIGHT/2};
  if(side==='right')return {x:a.x+CARD_WIDTH,y:a.y+CARD_HEIGHT/2};
  if(side==='top')return {x:a.x+CARD_WIDTH/2,y:a.y};
  return {x:a.x+CARD_WIDTH/2,y:a.y+CARD_HEIGHT};
}
function trace(a:BlueSocAsset,b:BlueSocAsset){
  const {src,dst}=direction(a,b);
  const p=anchor(a,src),q=anchor(b,dst);
  const span=Math.max(32,Math.min(180,Math.hypot(q.x-p.x,q.y-p.y)*.36));
  const d1=src==='right'?{x:span,y:0}:src==='left'?{x:-span,y:0}:src==='bottom'?{x:0,y:span}:{x:0,y:-span};
  const d2=dst==='right'?{x:span,y:0}:dst==='left'?{x:-span,y:0}:dst==='bottom'?{x:0,y:span}:{x:0,y:-span};
  return {
    path:`M ${p.x} ${p.y} C ${p.x+d1.x} ${p.y+d1.y} ${q.x+d2.x} ${q.y+d2.y} ${q.x} ${q.y}`,
    target:q,
  };
}
const flowNodeMap=new Map(BLUE_SOC_ASSETS.map(a=>[a.id,a]));
type Props={flow:BlueSocFlow;stepIndex:number;running:boolean;speed:number;zone:SecurityZone|'all'};

export function BlueSocMotionOverlay({flow,stepIndex,running,speed,zone}:Props){
  return <g aria-hidden="true" data-motion-layer="illustrative-replay">
    <defs>
      <filter id="blue-soc-animated-glow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="5"/>
      </filter>
      <marker id="blue-soc-flow-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill={flow.color}/>
      </marker>
    </defs>
    {flow.steps.map((leg,i)=>{
      const a=flowNodeMap.get(leg.from),b=flowNodeMap.get(leg.to);
      if(!a||!b)return null;
      const current=i===stepIndex,past=i<stepIndex;
      if(i>stepIndex)return null;
      const faint=zone!=='all'&&a.zone!==zone&&b.zone!==zone;
      const blocked=leg.status==='deny';
      const edgeColor=blocked?'#fb7185':flow.color;
      if(a.id===b.id){
        if(!current)return null;
        const cx=a.x+CARD_WIDTH/2,cy=a.y+CARD_HEIGHT/2;
        return <g key={flow.id+i} opacity={faint ? 0.2 : 1}>
          <circle cx={cx} cy={cy} r={70} fill="none" stroke={edgeColor} strokeWidth="3" strokeDasharray="8 6">
            {running&&<animate attributeName="r" values="58;100;58" dur={`${2/speed}s`} repeatCount="indefinite"/>}
            {running&&<animate attributeName="opacity" values=".9;.1;.9" dur={`${2/speed}s`} repeatCount="indefinite"/>}
          </circle>
        </g>;
      }
      const route=trace(a,b);
      const noDirectCable=leg.layer!=='network'&&leg.layer!=='control';
      const rejected=blocked&&current;
      const duration=2.7/speed;
      return <g key={flow.id+i} opacity={faint ? 0.12 : past ? 0.27 : 1}>
        {current&&<path d={route.path} fill="none" stroke={edgeColor} strokeWidth="13" opacity=".27" filter="url(#blue-soc-animated-glow)"/>}
        <path d={route.path} fill="none" stroke={edgeColor} strokeWidth={current?3.8:2.2}
          strokeDasharray={noDirectCable?'8 7':undefined}
          markerEnd={current?'url(#blue-soc-flow-tip)':undefined}/>
        {current&&running&&[0,1,2].map(n=><g key={`${flow.id}-${stepIndex}-packet-${n}`}>
          <circle r={n===0?8:4} fill={n===0?'#fff':edgeColor} stroke={n===0?edgeColor:'none'} strokeWidth="2">
            <animateMotion dur={`${duration}s`} begin={`${-n*duration/3}s`} repeatCount="indefinite" path={route.path}/>
          </circle>
        </g>)}
        {rejected&&<g transform={`translate(${route.target.x},${route.target.y})`}>
          <circle r="19" fill="#541c33" stroke="#fb7185" strokeWidth="3"/>
          <path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke="#ffd6e0" strokeWidth="3" strokeLinecap="round"/>
        </g>}
      </g>;
    })}
  </g>;
}
