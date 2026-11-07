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
type MediaSize='node'|'inspector';

/**
 * Prefer the exact illustrations cropped from the user's original project
 * screenshot. Fall back to a credited representative product image or Aegis icon.
 * Assets are shipped separately in the BLUE SOC original-diagram image pack.
 */
export function BlueSocDeviceMedia({asset,size='node'}:{asset:BlueSocAsset;size?:MediaSize}){
  const media=BLUE_SOC_MEDIA[asset.id];
  const [source,setSource]=useState<'original'|'vendor'|'generic'>('original');
  useEffect(()=>setSource('original'),[asset.id]);
  const src=source==='original'? `/blue-soc/original/${asset.id}.webp`
    :source==='vendor' && media?media.src:genericAssets[asset.kind];
  const handleError=()=>setSource(old=>old==='original'&&media?'vendor':'generic');
  const inspector=size==='inspector';
  return <div className={inspector?'space-y-2':'shrink-0'} data-testid={`blue-soc-image-${asset.id}`}>
    <div className={inspector
      ?'flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-600 bg-white p-3'
      :'flex h-[54px] w-[66px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-500/50 bg-white p-1'}>
      <img
        key={src}
        src={src}
        alt={source==='original'?`Original project diagram artwork: ${asset.name}`:source==='vendor'&&media?media.caption:`${asset.kind} illustration`}
        width={inspector?640:120}
        height={inspector?280:90}
        loading="lazy"
        decoding="async"
        onError={handleError}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
    {inspector&&(
      <div className="space-y-1 text-[11px] leading-5 text-slate-400">
        {source==='original'?
          <>
            <p className="font-medium text-cyan-100">From your original BLUE SOC architecture screenshot</p>
            <p>These are the same diagram illustrations you supplied. They represent assigned lab roles, not photographs of the deployed equipment.</p>
          </>
          :source==='vendor'&&media?
          <>
            <p className="text-slate-200">{media.caption}</p>
            <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2">{media.credit}</a>
            <p>{media.licenseNote}</p>
          </>
          :<p>Aegis device-type illustration. An original photo is unavailable for this asset.</p>}
      </div>
    )}
  </div>;
}
