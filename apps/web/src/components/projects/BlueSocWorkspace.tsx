'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, Circle,
  ExternalLink, FileText, Gauge, Globe2, Monitor, Network, Pause, Play,
  RotateCcw, Router, Search, Server, ShieldAlert, ShieldCheck, ShieldX,
  SlidersHorizontal, Wifi,
} from 'lucide-react';
import { BLUE_SOC_ASSETS, BLUE_SOC_CONNECTIONS, ZONE_STYLES, type BlueSocAsset, type SecurityZone } from '@/content/blueSocArchitecture';
import { BLUE_SOC_REQUIREMENTS, BLUE_SOC_TEAM_REQUIREMENTS } from '@/content/blueSocRequirements';
import { BLUE_SOC_FLOWS, FLOW_LAYER_NAMES } from '@/content/blueSocMotion';
import { BlueSocMotionOverlay } from '@/components/projects/BlueSocMotionOverlay';
import { BlueSocDeviceMedia } from '@/components/projects/BlueSocDeviceMedia';

const WIDTH=1240;
const HEIGHT=1250;
const NODE_WIDTH=170;
const NODE_HEIGHT=108;
const CHECKLIST_KEY='aegis.blue-soc.requirement-checks.v1';
const VERIFIED_KEY='aegis.blue-soc.confirmed-devices.v1';
const BLUE_SOC_URL='https://blue-dashboard-ten.vercel.app';

function point(d:BlueSocAsset,side:'left'|'right'|'top'|'bottom') {
  return side==='left'?{x:d.x,y:d.y+NODE_HEIGHT/2}
    :side==='right'?{x:d.x+NODE_WIDTH,y:d.y+NODE_HEIGHT/2}
    :side==='top'?{x:d.x+NODE_WIDTH/2,y:d.y}
    :{x:d.x+NODE_WIDTH/2,y:d.y+NODE_HEIGHT};
}
function cablePath(a:{x:number;y:number},b:{x:number;y:number},from:string,to:string){
  if(from==='left'||from==='right'){
    const mid=(a.x+b.x)/2;
    return `M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`;
  }
  const mid=(a.y+b.y)/2;
  if(to==='left'||to==='right')return `M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`;
  return `M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`;
}
function readObject(key:string):Record<string,boolean>{
  try{
    const raw=window.localStorage.getItem(key);
    const value=raw?JSON.parse(raw):{};
    return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,boolean>:{};
  }catch{return {};}
}
function persist(key:string,data:Record<string,boolean>){
  try{window.localStorage.setItem(key,JSON.stringify(data));}catch{}
}
function Button({children,onClick,active=false,disabled=false,title}:{
  children:React.ReactNode;onClick:()=>void;active?:boolean;disabled?:boolean;title?:string;
}){
  return <button type="button" title={title} onClick={onClick} disabled={disabled}
    className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active?'border-cyan-400 bg-cyan-500/20 text-cyan-50':'border-slate-600 bg-[#11243b] text-slate-200 hover:border-cyan-500/70 hover:bg-[#193451]'}`}>{children}</button>;
}
function InfoStat({value,label,foot}: {value:string;label:string;foot:string}){
  return <div className="rounded-lg border border-slate-700/80 bg-[#13243a] px-4 py-3">
    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
    <div className="mt-1 text-2xl font-semibold text-slate-50">{value}</div>
    <div className="mt-1 text-xs text-slate-400">{foot}</div>
  </div>;
}
export default function BlueSocWorkspace(){
  const [selected,setSelected]=useState('palo');
  const [zone,setZone]=useState<SecurityZone|'all'>('all');
  const [scenarioId,setScenarioId]=useState<string>(BLUE_SOC_FLOWS[0].id);
  const [running,setRunning]=useState(true);
  const [playbackStep,setPlaybackStep]=useState(0);
  const [speed,setSpeed]=useState(1);
  const [tab,setTab]=useState<'overview'|'requirements'|'inventory'>('overview');
  const [milestone,setMilestone]=useState('P1');
  const [checks,setChecks]=useState<Record<string,boolean>>({});
  const [checkedDevices,setCheckedDevices]=useState<Record<string,boolean>>({});
  const [search,setSearch]=useState('');
  const [notesOpen,setNotesOpen]=useState(false);
  useEffect(()=>{setChecks(readObject(CHECKLIST_KEY));setCheckedDevices(readObject(VERIFIED_KEY));},[]);
  const scenario=BLUE_SOC_FLOWS.find(s=>s.id===scenarioId)!;
  const currentHop=scenario.steps[playbackStep]??scenario.steps[0];
  const active=BLUE_SOC_ASSETS.find(d=>d.id===selected)??BLUE_SOC_ASSETS[0];
  const selectedRequirement=BLUE_SOC_REQUIREMENTS.find(r=>r.id===milestone)!;
  const allTasks=BLUE_SOC_REQUIREMENTS.flatMap(r=>r.tasks.map((_,i)=>`${r.id}:${i}`));
  const completed=allTasks.filter(k=>checks[k]).length;
  const currentTaskCount=selectedRequirement.tasks.filter((_,i)=>checks[`${selectedRequirement.id}:${i}`]).length;
  const byId=useMemo(()=>new Map(BLUE_SOC_ASSETS.map(d=>[d.id,d])),[]);
  useEffect(()=>{
    setPlaybackStep(0);
  },[scenarioId]);
  useEffect(()=>{
    if(!running)return;
    const token=window.setInterval(()=>setPlaybackStep(n=>(n+1)%scenario.steps.length),Math.round(2700/speed));
    return ()=>window.clearInterval(token);
  },[running,scenario.steps.length,speed]);
  const toggleCheck=(key:string)=>{
    setChecks(old=>{const next={...old,[key]:!old[key]};persist(CHECKLIST_KEY,next);return next;});
  };
  const toggleVerified=(id:string)=>{
    setCheckedDevices(old=>{const next={...old,[id]:!old[id]};persist(VERIFIED_KEY,next);return next;});
  };
  const percent=Math.round(100*completed/allTasks.length);
  const visibleAssets=BLUE_SOC_ASSETS.filter(a=>(zone==='all'||a.zone===zone)&&(`${a.name} ${a.address??''} ${a.detail}`.toLowerCase().includes(search.toLowerCase())));
  return <div className="min-h-full bg-[#081423] text-slate-100" data-testid="blue-soc-workspace">
    <div className="mx-auto max-w-[1700px] space-y-5 p-3 sm:p-5 lg:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300"><ShieldCheck className="h-4 w-4"/> Salone Aegis / Projects / BLUE SOC</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">BLUE SOC <span className="text-slate-400">Enterprise Security Lab</span></h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">Your original BYUI CIT lab architecture. Explore the real project names, IPs and VLANs; follow example traffic paths; and work through all P1–P8 requirements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/networking?item=projects" className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"><ArrowLeft className="h-4 w-4"/> Networking Projects</Link>
          <a href={BLUE_SOC_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-md border border-cyan-500 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"><ExternalLink className="h-4 w-4"/> Open BLUE SOC application</a>
        </div>
      </header>
      <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-100">
        <Activity className="h-4 w-4 shrink-0" /><strong>Interactive design simulation.</strong>
        Animated paths show intended flow, not captured packets or actual firewall activity. Names and IPs are from the original drawing. Real live statuses require authenticated integrations and lab verification.
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <InfoStat value="5" label="Security regions" foot="Outside · Transit · DMZ · Inside · Secure"/>
        <InfoStat value={String(BLUE_SOC_ASSETS.length)} label="Named assets" foot="IP inventory based on source drawing"/>
        <InfoStat value="8" label="Project milestones" foot="P1 through P8 with evidence lists"/>
        <InfoStat value={`${percent}%`} label="Requirement checklist" foot={`${completed} of ${allTasks.length} marked done in this browser`}/>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button active={tab==='overview'} onClick={()=>setTab('overview')}><Network className="h-4 w-4"/> Architecture and traffic</Button>
        <Button active={tab==='requirements'} onClick={()=>setTab('requirements')}><BookOpen className="h-4 w-4"/> Full project requirements</Button>
        <Button active={tab==='inventory'} onClick={()=>setTab('inventory')}><Server className="h-4 w-4"/> Device and IP inventory</Button>
      </div>

      {tab==='overview'&&<>
        <div className="rounded-xl border border-slate-700 bg-[#102237] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-semibold"><Activity className="h-5 w-5 text-cyan-300"/> Network flow demonstration</div>
              <p className="mt-1 text-xs text-slate-400">Choose a security scenario. Colored dots animate along logical connections. The packet path is illustrative, not live telemetry.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={()=>setRunning(s=>!s)} active={running}>{running?<><Pause className="h-4 w-4"/> Pause</>:<><Play className="h-4 w-4"/> Play</>}</Button>
              <Button onClick={()=>{setPlaybackStep(0);setRunning(false);}}><RotateCcw className="h-4 w-4"/> Reset</Button>
              <Button onClick={()=>setSpeed(s=>s===1?2:s===2 ? 0.5 : 1)}><Gauge className="h-4 w-4"/> {speed}× speed</Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {BLUE_SOC_FLOWS.map(sc=><Button key={sc.id} active={scenarioId===sc.id} onClick={()=>setScenarioId(sc.id)}>{sc.name}</Button>)}
          </div>
          <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-slate-700 bg-[#0b192b] px-3 py-3 sm:flex-row sm:items-center">
            <div className="text-sm"><span className="font-semibold" style={{color:scenario.color}}>{scenario.title}:</span> <span className="text-slate-300">{scenario.detail}</span></div>
            <span className="shrink-0 rounded-md border border-slate-600 px-2 py-1 text-xs text-cyan-100">Step {playbackStep+1} / {scenario.nodes.length}: {byId.get(scenario.nodes[playbackStep])?.name}</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">{scenario.outcome}</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
          <div className="min-w-0 overflow-auto rounded-xl border border-slate-700 bg-[#0b192b]" aria-label="Original project network architecture" data-testid="blue-soc-network-map">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 p-3">
              {(['all','outside','interconnect','dmz','inside','secure'] as const).map(z=><Button key={z} active={zone===z} onClick={()=>setZone(z)}>{z==='all'?'All zones':ZONE_STYLES[z].title}</Button>)}
            </div>
            <div className="relative" style={{width:WIDTH,height:HEIGHT}}>
              <div className="absolute inset-0" style={{backgroundImage:'linear-gradient(rgba(110,148,184,.07) 1px, transparent 1px),linear-gradient(90deg,rgba(110,148,184,.07) 1px,transparent 1px)',backgroundSize:'24px 24px'}}/>
              {([
                {zone:'outside' as const,x:175,y:15,w:795,h:367},
                {zone:'dmz' as const,x:694,y:215,w:485,h:325},
                {zone:'inside' as const,x:14,y:510,w:495,h:510},
                {zone:'interconnect' as const,x:420,y:410,w:250,h:314},
                {zone:'secure' as const,x:535,y:528,w:650,h:620},
              ]).map(g=><div key={g.zone} className="pointer-events-none absolute rounded-2xl border border-dashed" style={{left:g.x,top:g.y,width:g.w,height:g.h,borderColor:ZONE_STYLES[g.zone].color+'77',background:ZONE_STYLES[g.zone].fill}}>
                <span className="absolute left-3 top-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{color:ZONE_STYLES[g.zone].color}}>{ZONE_STYLES[g.zone].title}</span>
              </div>)}
              <svg className="pointer-events-none absolute inset-0" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
                <defs>
                  <marker id="blue-soc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#6c91b5"/></marker>
                </defs>
                {BLUE_SOC_CONNECTIONS.map(e=>{
                  const a=byId.get(e.from),b=byId.get(e.to);
                  if(!a||!b)return null;
                  const from=e.sourcePort??'right',to=e.targetPort??'left';
                  const path=cablePath(point(a,from),point(b,to),from,to);
                  const illuminated=activeEdges.has(e.id);
                  const subdued=zone!=='all'&&a.zone!==zone&&b.zone!==zone;
                  return <g key={e.id} opacity={subdued ? 0.13 : 1}>
                    <path d={path} stroke={illuminated?scenario.color:'#54708c'} strokeWidth={illuminated?3.8:2} strokeDasharray={e.kind==='logical'?'8 6':undefined} fill="none" markerEnd="url(#blue-soc-arrow)"/>
                    {illuminated&&running&&<g>
                      <circle r="7" fill={scenario.color} stroke="#fff" strokeWidth="1.8">
                        <animateMotion dur={`${2.2/speed}s`} repeatCount="indefinite" path={path}/>
                      </circle>
                      <circle r="3" fill="#fff"><animateMotion dur={`${2.2/speed}s`} repeatCount="indefinite" begin={`${1.1/speed}s`} path={path}/></circle>
                    </g>}
                    {e.label&&<g transform={`translate(${(point(a,from).x+point(b,to).x)/2},${(point(a,from).y+point(b,to).y)/2-14})`}>
                      <rect x={-Math.max(66,e.label.length*3.6)} y={-12} height="23" width={Math.max(132,e.label.length*7.2)} rx="5" fill="#16263a" stroke="#36506c"/>
                      <text fill="#a1cceb" fontSize="11" y="4" textAnchor="middle">{e.label}</text>
                    </g>}
                  </g>;
                })}
              </svg>
              {BLUE_SOC_ASSETS.map(a=>{
                const faded=zone!=='all'&&a.zone!==zone;
                const focus=a.id===selected;
                const stepFocus=currentHop.to===a.id;
                return <button type="button" key={a.id} onClick={()=>setSelected(a.id)}
                  aria-label={`${a.name} ${a.address??''}`} aria-pressed={focus}
                  className="absolute flex flex-col rounded-xl border-2 bg-[#122840] p-2 text-left shadow-lg transition-[box-shadow,opacity] hover:z-10 hover:shadow-[0_0_20px_#22d3ee55]"
                  style={{left:a.x,top:a.y,width:NODE_WIDTH,height:NODE_HEIGHT,opacity:faded ? 0.25 : 1,borderColor:stepFocus?scenario.color:focus?'#e2faff':ZONE_STYLES[a.zone].color,boxShadow:stepFocus?`0 0 0 5px ${scenario.color}44`:undefined}}>
                  <div className="flex min-h-0 items-center gap-2">
                    <BlueSocDeviceMedia asset={a}/>
                    <div className="min-w-0"><div className="text-[12px] font-bold leading-4">{a.name}</div><div className="mt-1 text-[10px] text-slate-300">{a.zone.toUpperCase()}</div></div>
                  </div>
                  <div className="mt-2 truncate font-mono text-[11px] text-emerald-300">{a.address??a.detail}</div>
                </button>;
              })}
            </div>
          </div>
          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-700 bg-[#11243a] p-4" data-testid="blue-soc-device-inspector">
              <div className="text-xs font-semibold uppercase tracking-widest" style={{color:ZONE_STYLES[active.zone].color}}>{ZONE_STYLES[active.zone].title}</div>
              <div className="mt-3 flex items-center gap-3"><BlueSocDeviceMedia asset={active}/><div><h2 className="text-xl font-semibold">{active.name}</h2><p className="text-xs text-slate-400">{active.detail}</p></div></div>
              <div className="mt-4"><BlueSocDeviceMedia asset={active} size="inspector"/></div>
              {active.address&&<div className="mt-3 rounded-lg bg-[#0c192c] px-3 py-2 font-mono text-sm text-emerald-300">{active.address}</div>}
              <h3 className="mt-5 text-sm font-semibold">Responsibilities and verification</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{active.responsibilities.map(x=><li key={x}>{x}</li>)}</ul>
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">Current status: no live health API configured for this asset. The illustrated state is not a measurement.</div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={!!checkedDevices[active.id]} onChange={()=>toggleVerified(active.id)} className="mt-0.5 accent-cyan-400"/>
                Mark this device's configuration manually reviewed (local progress only)
              </label>
            </section>
            <section className="rounded-xl border border-slate-700 bg-[#11243a] p-4">
              <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-cyan-300"/> Project milestone</h2>
              <div className="mt-3 flex flex-wrap gap-2">{BLUE_SOC_REQUIREMENTS.map(r=><Button key={r.id} active={milestone===r.id} onClick={()=>setMilestone(r.id)}>{r.id}</Button>)}</div>
              <h3 className="mt-3 text-sm font-semibold">{selectedRequirement.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-300">{selectedRequirement.goal}</p>
              <div className="mt-3 text-xs text-cyan-200">{currentTaskCount} / {selectedRequirement.tasks.length} locally checked</div>
              <Button onClick={()=>setTab('requirements')}><BookOpen className="h-4 w-4"/> Open full tasks and evidence</Button>
            </section>
          </aside>
        </div>
      </>}

      {tab==='requirements'&&<section className="space-y-5">
        <div className="rounded-xl border border-slate-700 bg-[#102237] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-semibold">Complete project requirements</h2><p className="mt-1 text-sm text-slate-300">Every P1–P8 deliverable, tasks, expected evidence, team evaluations and authorized testing. Tick tasks after you complete them; these are personal local progress markers, not automatic lab grades.</p></div>
            <div className="rounded-lg border border-cyan-600/50 px-4 py-2 text-right"><div className="text-xl font-semibold text-cyan-200">{percent}%</div><div className="text-xs text-slate-400">{completed} / {allTasks.length} checklist items</div></div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full bg-cyan-400 transition-all" style={{width:`${percent}%`}}/></div>
          <div className="mt-4 flex flex-wrap gap-2">{BLUE_SOC_REQUIREMENTS.map(r=><Button key={r.id} active={milestone===r.id} onClick={()=>setMilestone(r.id)}>{r.id}</Button>)}</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <article className="rounded-xl border border-slate-700 bg-[#102237] p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">{selectedRequirement.id} / Required milestone</div>
            <h3 className="mt-2 text-xl font-semibold">{selectedRequirement.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{selectedRequirement.goal}</p>
            <h4 className="mt-5 font-semibold">What you need to build and verify</h4>
            <div className="mt-3 space-y-3">
              {selectedRequirement.tasks.map((task,i)=><label key={i} className="flex cursor-pointer gap-3 rounded-lg border border-slate-700 bg-[#0b1b2f] p-3 hover:border-sky-500/50">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400" checked={!!checks[`${selectedRequirement.id}:${i}`]} onChange={()=>toggleCheck(`${selectedRequirement.id}:${i}`)}/>
                <span className="text-sm leading-6 text-slate-200">{task}</span>
              </label>)}
            </div>
          </article>
          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-700 bg-[#102237] p-4">
              <h3 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-cyan-300"/> Evidence to collect</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{selectedRequirement.evidence.map(x=><li key={x}>{x}</li>)}</ul>
            </section>
            <section className="rounded-xl border border-slate-700 bg-[#102237] p-4">
              <h3 className="font-semibold">Project-wide requirements</h3>
              {BLUE_SOC_TEAM_REQUIREMENTS.map(extra=><details key={extra.id} className="mt-3 rounded-lg border border-slate-700 p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-200">{extra.id} · {extra.title}</summary>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-5 text-slate-300">{extra.tasks.map(x=><li key={x}>{x}</li>)}</ul>
              </details>)}
            </section>
          </aside>
        </div>
      </section>}

      {tab==='inventory'&&<section className="rounded-xl border border-slate-700 bg-[#102237] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Named asset inventory</h2><p className="mt-1 text-sm text-slate-400">Preserves the drawing's original labels and addresses. Review ambiguous details against the device's real network configuration.</p></div>
          <div className="flex items-center gap-2 rounded-md border border-slate-600 px-3 py-2"><Search className="h-4 w-4 text-slate-400"/><input aria-label="Search device inventory" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search host, IP, zone" className="w-48 bg-transparent text-xs outline-none placeholder:text-slate-500"/></div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[660px] text-left text-sm">
            <thead><tr className="border-b border-slate-600 text-xs uppercase tracking-wide text-slate-400"><th className="px-3 py-3">Device</th><th className="px-3 py-3">Zone</th><th className="px-3 py-3">IP / CIDR</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Local review</th></tr></thead>
            <tbody>{visibleAssets.map(a=><tr key={a.id} className="border-b border-slate-700/80 hover:bg-[#1a324c]">
              <td className="px-3 py-3"><button onClick={()=>{setSelected(a.id);setTab('overview');}} className="font-semibold text-cyan-200 hover:underline">{a.name}</button></td>
              <td className="px-3 py-3 capitalize" style={{color:ZONE_STYLES[a.zone].color}}>{a.zone}</td>
              <td className="px-3 py-3 font-mono text-xs text-emerald-300">{a.address??'Not specified'}</td>
              <td className="px-3 py-3 text-slate-300">{a.detail}</td>
              <td className="px-3 py-3"><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!checkedDevices[a.id]} onChange={()=>toggleVerified(a.id)} className="accent-cyan-400"/> Reviewed</label></td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-400">Interface numbers, public web VIP, precise WAF/NLB placement, and full routing policies require reconciliation against the original lab configuration. No completion or live availability is inferred from this table.</p>
      </section>}
      <footer className="rounded-lg border border-slate-700/70 bg-[#102237] px-4 py-3 text-xs leading-5 text-slate-400">
        <strong className="text-slate-200">Architecture status:</strong> User-provided source diagram and project requirements. The illustrations are existing device-type assets shipped with Salone Aegis; they are not verified photographs of the deployed Palo Alto/FortiGate hardware. Network activity is a simulation. The independently hosted BLUE SOC application may have different data and availability.
      </footer>
    </div>
  </div>;
}
