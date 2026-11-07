'use client';

import { useState } from 'react';
import Link from 'next/link';

type Zone = 'OUTSIDE' | 'DMZ' | 'INSIDE' | 'INTERCONNECT' | 'SECURE';
type Item = { id: string; title: string; subtitle: string; zone: Zone; x: number; y: number; controls: string[] };
const items: Item[] = [
  { id:'internet',title:'Internet / Remote User',subtitle:'Untrusted',zone:'OUTSIDE',x:50,y:8,controls:['External test client','VPN entry point'] },
  { id:'pa',title:'Palo Alto NGFW',subtitle:'Perimeter • NAT • VPN',zone:'OUTSIDE',x:50,y:23,controls:['Dynamic / static NAT','GlobalProtect remote access','Duo + FreeRADIUS MFA','Outside-to-DMZ allowlist'] },
  { id:'web',title:'Web Tier',subtitle:'2 web servers + load balancer',zone:'DMZ',x:19,y:41,controls:['Failover exercise','Public web service','Static NAT ingress'] },
  { id:'guac',title:'Guacamole',subtitle:'Zero Trust remote access',zone:'DMZ',x:19,y:59,controls:['Duo-protected access','Application sessions'] },
  { id:'inside',title:'Inside Client',subtitle:'User and admin workstation',zone:'INSIDE',x:81,y:41,controls:['Private RFC1918 addressing','PAT Internet egress','Restricted secure-zone access'] },
  { id:'inter',title:'Interconnect',subtitle:'Firewall transit network',zone:'INTERCONNECT',x:50,y:45,controls:['Firewall-to-firewall routing','Zone boundary policy'] },
  { id:'forti',title:'FortiGate VDOM',subtitle:'Secure-zone gateway',zone:'INTERCONNECT',x:50,y:59,controls:['Secure-zone routing','Deny untrusted lateral access'] },
  { id:'siem',title:'Security Onion + Splunk',subtitle:'IDS / SIEM',zone:'SECURE',x:25,y:82,controls:['Network alert detection','Custom Rigby web-name alert','Firewall and web logs'] },
  { id:'automation',title:'n8n + AI',subtitle:'Threat triage and response',zone:'SECURE',x:75,y:82,controls:['Query SIEM','Review offending source IP','Palo Alto block verification'] },
];
const links:[string,string][]=[['internet','pa'],['pa','web'],['pa','inside'],['pa','inter'],['inter','forti'],['forti','siem'],['forti','automation'],['web','guac'],['siem','automation']];
const zoneColors:Record<Zone,string>={OUTSIDE:'#c78d9b',DMZ:'#edbd77',INSIDE:'#8db8f0',INTERCONNECT:'#a6a0e8',SECURE:'#79d8b1'};
const milestones=[
  ['P1','Architecture and zone segmentation'],
  ['P2','Palo Alto rules, NAT and redundant DMZ web servers'],
  ['P3','Remote access VPN'],
  ['P4','Duo + FreeRADIUS MFA'],
  ['P5','Guacamole zero-trust access'],
  ['P6','Security Onion and custom Rigby detection'],
  ['P7','Splunk firewall and web-server logs'],
  ['P8','n8n + AI assisted firewall blocking'],
];
export default function SecurityArchitecturePage(){
  const [selected,setSelected]=useState<Item>(items[1]);
  const [mode,setMode]=useState<'architecture'|'exercise'>('architecture');
  const [step,setStep]=useState(0);
  const stages=['Submit isolated test web request containing Rigby','Security Onion detects matching traffic','Splunk shows searchable alert','n8n reviews event and identifies lab source IP','Palo Alto lab rule is checked for containment'];
  return <main style={{minHeight:'100vh',background:'#07101e',color:'#e8f1ff',fontFamily:'system-ui, sans-serif',padding:'clamp(18px,3vw,46px)'}}>
    <div style={{maxWidth:1320,margin:'auto'}}>
      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><div style={{fontSize:12,letterSpacing:3,color:'#70d9d5'}}>SALONE AEGIS / SECURITY LAB</div><h1 style={{fontSize:'clamp(25px,3vw,42px)',margin:'10px 0'}}>Enterprise Security Architecture</h1></div>
        <Link href="/lab" style={{color:'#9ad9ff',textDecoration:'underline'}}>Open Lab Designer</Link>
      </header>
      <p style={{color:'#a8b8d0',maxWidth:820,lineHeight:1.6}}>Interactive P1–P8 reference architecture for the Palo Alto, FortiGate, DMZ, inside and secure-zone project. Device roles and connectivity shown below are a design blueprint, not verified live infrastructure.</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'24px 0'}}>
        <button onClick={()=>setMode('architecture')} aria-pressed={mode==='architecture'} style={btn(mode==='architecture')}>Architecture</button>
        <button onClick={()=>setMode('exercise')} aria-pressed={mode==='exercise'} style={btn(mode==='exercise')}>P8 Walkthrough</button>
        <span style={{border:'1px solid #8b743c',borderRadius:8,padding:'9px 12px',fontSize:12,color:'#e6c780'}}>DESIGN / NOT LIVE TELEMETRY</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,2.3fr) minmax(260px,1fr)',gap:16,alignItems:'start'}} className="aegis-layout">
        <section aria-label="Interactive security topology" style={{position:'relative',border:'1px solid #263d5b',borderRadius:16,background:'radial-gradient(circle at 50% 38%,#152a45,#0b1729 72%)',minHeight:640,overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px)',backgroundSize:'28px 28px'}}/>
          <svg viewBox="0 0 1000 700" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} aria-hidden="true">
            {links.map(([a,b])=>{const x=items.find(n=>n.id===a)!,y=items.find(n=>n.id===b)!;return <line key={a+b} x1={x.x*10} y1={x.y*7} x2={y.x*10} y2={y.y*7} stroke="#76b2d9" strokeOpacity=".65" strokeWidth="2" strokeDasharray={a==='siem'?'8 5':'none'}/>})}
          </svg>
          {items.map(item=><button key={item.id} type="button" onClick={()=>setSelected(item)} aria-pressed={selected.id===item.id} style={{position:'absolute',left:item.x+'%',top:item.y+'%',transform:'translate(-50%,-50%)',width:item.id==='web'||item.id==='siem'?160:145,maxWidth:'27%',minHeight:66,border:'1px solid '+(selected.id===item.id?'#ffffff':zoneColors[item.zone]),background:'#10243c',color:'#f1f7ff',borderRadius:9,padding:7,cursor:'pointer',boxShadow:selected.id===item.id?'0 0 0 3px #5ac8f144':'none'}}>
              <span style={{fontSize:9,color:zoneColors[item.zone],fontWeight:700,letterSpacing:1}}>{item.zone}</span><span style={{display:'block',fontSize:12,fontWeight:700,margin:'4px 0'}}>{item.title}</span><span style={{display:'block',fontSize:10,color:'#b3c7de'}}>{item.subtitle}</span>
            </button>)}
          <span style={{position:'absolute',bottom:12,left:14,color:'#9bb0c9',fontSize:11}}>Click a node to inspect its intended role. Lines show logical relationships, not physical cabling.</span>
        </section>
        <aside style={{border:'1px solid #263d5b',borderRadius:16,padding:20,background:'#101e30'}}>
          <div style={{fontSize:11,letterSpacing:2,color:zoneColors[selected.zone]}}>{selected.zone} ZONE</div>
          <h2 style={{fontSize:22,margin:'12px 0 4px'}}>{selected.title}</h2>
          <p style={{color:'#a8b8d0',fontSize:13}}>{selected.subtitle}</p>
          <h3 style={{fontSize:14,marginTop:24}}>Required functions</h3>
          <ul style={{paddingLeft:20,lineHeight:1.9,fontSize:13,color:'#c4d4e8'}}>{selected.controls.map(c=><li key={c}>{c}</li>)}</ul>
          <div style={{marginTop:20,padding:12,background:'#1d2e43',borderRadius:8,fontSize:12,color:'#cbd8e9'}}>Validation status: Not connected to real device telemetry. Confirm each service independently before marking it operational.</div>
          {mode==='exercise'&&<div style={{marginTop:24,borderTop:'1px solid #38506c',paddingTop:18}}>
            <h3 style={{fontSize:15}}>P8 guided walkthrough</h3>
            <p style={{fontSize:13,lineHeight:1.6,color:'#c8d8ea'}}>{step+1} / {stages.length}: {stages[step]}</p>
            <div style={{display:'flex',gap:8}}><button style={btn(false)} onClick={()=>setStep(x=>Math.max(x-1,0))} disabled={step===0}>Previous</button><button style={btn(true)} onClick={()=>setStep(x=>(x+1)%stages.length)}>{step===stages.length-1?'Restart':'Next'}</button></div>
            <p style={{fontSize:11,color:'#d7bd83'}}>Educational sequence only. No actual SIEM query or firewall change is performed.</p>
          </div>}
        </aside>
      </div>
      <section style={{marginTop:32}}><h2>Project milestones</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>
        {milestones.map(([id,label])=><div key={id} style={{border:'1px solid #243c58',borderRadius:10,padding:14,background:'#0f2034'}}><div style={{color:'#76d5e5',fontSize:12,fontWeight:700}}>{id} · DESIGN REQUIREMENT</div><div style={{marginTop:6,fontSize:13}}>{label}</div></div>)}
      </div></section>
      <p style={{fontSize:12,color:'#8fa7bd',marginTop:24}}>This page is a visual reference. Use the existing Lab Designer for packet simulation and editable topology; use actual integrated telemetry for verified live status.</p>
    </div>
    <style jsx global>{`@media(max-width:800px){.aegis-layout{grid-template-columns:1fr!important}.aegis-layout section{min-height:560px!important}.aegis-layout section button{font-size:10px!important;padding:4px!important}}`}</style>
  </main>;
}
function btn(active:boolean):React.CSSProperties{return{border:'1px solid '+(active?'#4cb4d7':'#3c536c'),borderRadius:8,background:active?'#164267':'#10243d',color:'#e6f5ff',padding:'9px 13px',cursor:'pointer',fontSize:12}}
