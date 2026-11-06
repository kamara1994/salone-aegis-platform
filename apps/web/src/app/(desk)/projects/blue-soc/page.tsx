'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BLUE_SOC_ASSETS, BLUE_SOC_CONNECTIONS, BLUE_SOC_MILESTONES, ZONE_STYLES, type BlueSocAsset, type SecurityZone } from '@/content/blueSocArchitecture';

const W=1200,H=1160;
const NODE_W=162,NODE_H=82;

function endpoint(asset:BlueSocAsset, side:'left'|'right'|'top'|'bottom'){
  switch(side){
    case 'left':return {x:asset.x,y:asset.y+NODE_H/2};
    case 'right':return {x:asset.x+NODE_W,y:asset.y+NODE_H/2};
    case 'top':return {x:asset.x+NODE_W/2,y:asset.y};
    default:return {x:asset.x+NODE_W/2,y:asset.y+NODE_H};
  }
}
function route(a:{x:number;y:number},b:{x:number;y:number},from:'left'|'right'|'top'|'bottom',to:'left'|'right'|'top'|'bottom'){
  if(from==='left'||from==='right'){
    const mid=(a.x+b.x)/2;
    return `M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`;
  }
  const mid=(a.y+b.y)/2;
  if(to==='left'||to==='right')return `M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`;
  return `M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`;
}
function mark(kind:BlueSocAsset['kind']){
  switch(kind){case 'firewall':return '▦';case 'cloud':return '☁';case 'server':return '▣';case 'service':return '◈';default:return '▤';}
}

export default function BlueSocProject(){
  const [selected,setSelected]=useState('palo');
  const [visible,setVisible]=useState<SecurityZone|'all'>('all');
  const [activeMilestone,setActiveMilestone]=useState('P1');
  const [showLabels,setShowLabels]=useState(true);
  const [scale,setScale]=useState(1);
  const active=BLUE_SOC_ASSETS.find(a=>a.id===selected)??BLUE_SOC_ASSETS[0];
  const phase=BLUE_SOC_MILESTONES.find(p=>p.code===activeMilestone)??BLUE_SOC_MILESTONES[0];
  const assetById=useMemo(()=>new Map(BLUE_SOC_ASSETS.map(a=>[a.id,a])),[]);
  return <div className="min-h-full bg-[#07111f] text-[#e5f3ff]">
    <div className="mx-auto max-w-[1550px] space-y-5 p-4 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[.25em] text-sky-300">Projects / BLUE SOC / P1–P8</div>
          <h1 className="text-2xl font-bold md:text-4xl">Enterprise Security Lab Architecture</h1>
          <p className="max-w-3xl text-sm leading-6 text-[#a7bfd5]">Interactive recreation of your original topology, including the five trust zones, VLANs, assigned host addresses, two firewalls, VPN, monitoring and automation. Select a device or a milestone to inspect its design.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-sky-600/50 px-3 py-2 text-sm hover:bg-sky-900/30" href="/lab">Open editable lab</Link>
          <Link className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" href="/topology">Current topology</Link>
        </div>
      </header>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        <strong>Reference architecture, not a live device feed.</strong> IP addresses and VLANs are transcribed from the project drawing. The original diagram also contains overlapping or unclear labels. Validate interfaces, subnets and firewall rules before real deployment. Use the Lab Designer for design simulations; no equipment has been configured by this page.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm font-semibold text-slate-300">Zones</span>
        {(['all','outside','dmz','inside','interconnect','secure'] as const).map(z=><button key={z} type="button" onClick={()=>setVisible(z)} aria-pressed={visible===z} className={`rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${visible===z?'border-sky-400 bg-sky-500/20 text-white':'border-slate-700 text-slate-300 hover:border-slate-400'}`}>{z==='all'?'All zones':z}</button>)}
        <button type="button" onClick={()=>setShowLabels(p=>!p)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800">{showLabels?'Hide':'Show'} VLAN labels</button>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <button aria-label="Zoom out" className="rounded border border-slate-700 px-3 py-1.5" onClick={()=>setScale(v=>Math.max(.65,+(v-.1).toFixed(2)))}>−</button>
          <span>{Math.round(scale*100)}%</span>
          <button aria-label="Zoom in" className="rounded border border-slate-700 px-3 py-1.5" onClick={()=>setScale(v=>Math.min(1.4,+(v+.1).toFixed(2)))}>+</button>
          <button className="rounded border border-slate-700 px-2 py-1.5" onClick={()=>setScale(1)}>Reset</button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="overflow-auto rounded-xl border border-slate-700/80 bg-[#0b1626]" aria-label="Interactive BLUE SOC architecture map">
          <div style={{width:W*scale,height:H*scale,position:'relative'}} className="origin-top-left">
            <div style={{width:W,height:H,transform:`scale(${scale})`,transformOrigin:'top left',position:'relative',backgroundImage:'linear-gradient(rgba(120,160,190,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(120,160,190,.08) 1px,transparent 1px)',backgroundSize:'24px 24px'}}>
              {([
                {zone:'outside' as const,x:178,y:16,w:785,h:345},
                {zone:'dmz' as const,x:696,y:198,w:480,h:325},
                {zone:'inside' as const,x:18,y:525,w:405,h:415},
                {zone:'interconnect' as const,x:426,y:408,w:225,h:305},
                {zone:'secure' as const,x:540,y:528,w:638,h:594},
              ]).map(z=><div key={z.zone} style={{position:'absolute',left:z.x,top:z.y,width:z.w,height:z.h,border:`1px dashed ${ZONE_STYLES[z.zone].color}80`,background:ZONE_STYLES[z.zone].fill,borderRadius:18,pointerEvents:'none'}}>
                <span style={{position:'absolute',top:7,left:12,color:ZONE_STYLES[z.zone].color,fontSize:12,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{ZONE_STYLES[z.zone].title}</span>
              </div>)}
              <svg style={{position:'absolute',inset:0,pointerEvents:'none'}} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
                <defs><marker id="aegis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#7daed3"/></marker></defs>
                {BLUE_SOC_CONNECTIONS.map(edge=>{
                  const a=assetById.get(edge.from),b=assetById.get(edge.to);
                  if(!a||!b)return null;
                  const from=edge.sourcePort??'right',to=edge.targetPort??'left';
                  const p1=endpoint(a,from),p2=endpoint(b,to);
                  const muted=visible!=='all'&&a.zone!==visible&&b.zone!==visible;
                  return <g key={edge.id} opacity={muted ? 0.14 : 1}>
                    <path d={route(p1,p2,from,to)} stroke="#7daed3" strokeWidth="2.5" fill="none" markerEnd="url(#aegis-arrow)" strokeDasharray={edge.kind==='logical'?'6 5':undefined}/>
                    {showLabels&&edge.label&&<g transform={`translate(${(p1.x+p2.x)/2},${(p1.y+p2.y)/2-9})`}>
                      <rect x={-Math.max(60,edge.label.length*3.7)} y={-12} width={Math.max(120,edge.label.length*7.4)} height="22" rx="4" fill="#13253c" stroke="#3e5f82"/>
                      <text textAnchor="middle" y="3" fill="#a9dfff" fontSize="11">{edge.label}</text>
                    </g>}
                  </g>;
                })}
              </svg>
              {BLUE_SOC_ASSETS.map(a=>{
                const muted=visible!=='all'&&a.zone!==visible;
                const color=ZONE_STYLES[a.zone].color;
                return <button key={a.id} type="button" onClick={()=>setSelected(a.id)} aria-label={`${a.name}, ${a.zone} zone`} aria-pressed={active.id===a.id} style={{position:'absolute',left:a.x,top:a.y,width:NODE_W,minHeight:NODE_H,border:`2px solid ${active.id===a.id?'#f0f9ff':color}`,borderRadius:12,background:'#10253a',color:'#e8f2ff',padding:'8px 10px',opacity:muted ? 0.28 : 1,textAlign:'left',boxShadow:active.id===a.id?'0 0 0 4px rgba(56,189,248,.2)':'0 5px 18px rgba(0,0,0,.25)',cursor:'pointer'}}>
                  <span style={{display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:700}}><span style={{color,fontSize:21}}>{mark(a.kind)}</span>{a.name}</span>
                  <span style={{display:'block',marginTop:2,fontSize:11,color:'#b3c9db'}}>{a.detail}</span>
                  {a.address&&<span style={{display:'block',fontSize:11,color:'#89d5b2',marginTop:4}}>{a.address}</span>}
                </button>;
              })}
              <div className="absolute bottom-2 left-3 text-xs text-slate-400">Logical topology recreated from original student diagram · Click nodes for details</div>
            </div>
          </div>
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-700 bg-[#101f32] p-5">
            <span className="text-xs uppercase tracking-[.2em]" style={{color:ZONE_STYLES[active.zone].color}}>{active.zone} zone</span>
            <h2 className="mt-2 text-xl font-semibold">{active.name}</h2>
            <div className="mt-1 text-sm text-slate-400">{active.detail}</div>
            {active.address&&<div className="mt-2 rounded bg-[#19314c] px-3 py-2 font-mono text-sm text-[#95e5c1]">{active.address}</div>}
            <h3 className="mt-5 text-sm font-semibold">Purpose / checks</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-slate-300">{active.responsibilities.map(x=><li key={x}>{x}</li>)}</ul>
            <p className="mt-4 text-xs text-amber-200">Inventory not yet verified live.</p>
          </section>
          <section className="rounded-xl border border-slate-700 bg-[#101f32] p-5">
            <h2 className="font-semibold">P1–P8 verification plan</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">{BLUE_SOC_MILESTONES.map(m=><button key={m.code} onClick={()=>setActiveMilestone(m.code)} aria-pressed={phase.code===m.code} className={`rounded border px-2 py-1 text-xs ${phase.code===m.code?'border-sky-400 bg-sky-500/20':'border-slate-600'}`}>{m.code}</button>)}</div>
            <p className="mt-3 font-medium">{phase.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{phase.test}</p>
            <div className="mt-3 text-xs text-amber-200">Status: needs verification</div>
          </section>
        </aside>
      </div>
      <section className="rounded-xl border border-slate-700 bg-[#101f32] p-4">
        <h2 className="font-semibold">From architecture to working demo</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">This page preserves the original placement and addressing. The current /lab network simulator is a separate interactive design environment. To make this topology executable, the next step is to map these assets into its device/port inventory, implement routing and firewall policies, and run explicit isolation, NAT and connectivity checks. Connecting actual firewalls and SIEM data is a separate verified integration task.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/lab" className="rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold hover:bg-sky-600">Continue in Lab Designer</Link>
          <Link href="/soc" className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">SOC workspace</Link>
        </div>
      </section>
    </div>
  </div>;
}
