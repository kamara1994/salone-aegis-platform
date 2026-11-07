'use client';

import { useEffect, useState } from 'react';
import type { BlueSocAsset } from '@/content/blueSocArchitecture';
import { BLUE_SOC_MEDIA } from '@/content/blueSocVisuals';

const genericAssets:Record<BlueSocAsset['kind'],string>={
  cloud:'/lab/devices/cloud.svg',
  firewall:'/lab/devices/firewall.svg',
  workstation:'/lab/devices/pc.svg',
  server:'/lab/devices/server.svg',
  service:'/lab/devices/server.svg',
};

/** Local 960×560 high-resolution studio-style role illustrations, not actual lab photographs. */
const deviceRenders:Record<string,string>={
  admin:'computer',
  'school-vpn':'vpn',
  internet:'cloud',
  palo:'palo',
  dmz:'network',
  dmz1:'web-server',
  dmz2:'guacamole',
  inter:'network',
  forti:'forti',
  inside:'network',
  duo:'mfa',
  n8n:'automation',
  secure:'network',
  s1:'computer',
  s2:'computer',
  s3:'computer',
  radius:'auth',
  splunk:'siem',
  onion:'ids',
};

type MediaSize='node'|'inspector';
type AssetSource='render'|'original'|'vendor'|'generic';

/**
 * Map nodes preserve the reference drawings. Hover and inspector cards
 * show the newly generated studio-style hardware render, with original
 * cropped images, sourced product photos and Aegis icons as fallbacks.
 */
export function BlueSocDeviceMedia({asset,size='node'}:{asset:BlueSocAsset;size?:MediaSize}){
  const inspector=size==='inspector';
  const media=BLUE_SOC_MEDIA[asset.id];
  const [source,setSource]=useState<AssetSource>(inspector?'render':'original');
  useEffect(()=>setSource(inspector?'render':'original'),[asset.id,inspector]);

  const rendered=deviceRenders[asset.id]??'computer';
  const src=source==='render'? `/blue-soc/rendered/${rendered}.webp`
    :source==='original'? `/blue-soc/original/${asset.id}.webp`
    :source==='vendor' && media?media.src:genericAssets[asset.kind];

  function fallback(){
    setSource(previous=>{
      if(previous==='render')return 'original';
      if(previous==='original')return media?'vendor':'generic';
      return 'generic';
    });
  }

  return <div className={inspector?'space-y-2':'shrink-0'} data-testid={`blue-soc-image-${asset.id}`}>
    <div className={inspector
      ?'flex h-[238px] w-full items-center justify-center overflow-hidden rounded-xl border border-sky-500/30 bg-[#0a1729]'
      :'flex h-[54px] w-[66px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-500/50 bg-white p-1'}>
      <img
        key={src}
        src={src}
        alt={source==='render'?`Studio illustration of ${asset.name}; not actual deployed equipment`
          :source==='original'?`Original project diagram: ${asset.name}`
          :source==='vendor'&&media?media.caption:`${asset.kind} icon`}
        width={inspector?960:120}
        height={inspector?560:90}
        loading="lazy"
        decoding="async"
        onError={fallback}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
    {inspector&&<div className="space-y-1 text-[11px] leading-5 text-slate-400">
      {source==='render'?<>
        <p className="font-medium text-cyan-100">Generated studio-style equipment illustration</p>
        <p>Representative of this lab role. Your original labels and addressing are preserved in the topology; the actual equipment model and hardware photograph are not verified.</p>
      </>:source==='original'?<>
        <p className="font-medium text-cyan-100">Image from your original network diagram</p>
        <p>This is the supplied diagram illustration, not a photograph of the deployed hardware.</p>
      </>:source==='vendor'&&media?<>
        <p className="text-slate-200">{media.caption}</p>
        <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2">{media.credit}</a>
        <p>{media.licenseNote}</p>
      </>:<p>Illustrative device icon only. No verified equipment photo is available.</p>}
    </div>}
  </div>;
}
