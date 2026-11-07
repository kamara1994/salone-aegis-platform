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

export function BlueSocDeviceMedia({asset,size='node'}:{asset:BlueSocAsset;size?:MediaSize}){
  const media=BLUE_SOC_MEDIA[asset.id];
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[asset.id]);
  const src=media&&!failed?media.src:genericAssets[asset.kind];
  const inspector=size==='inspector';
  return <div className={inspector?'space-y-2':'shrink-0'}>
    <div className={inspector
      ?'flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-600 bg-white/95 p-3'
      :'flex h-[54px] w-[66px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-500/50 bg-white/90 p-1'}>
      {/* Externally sourced representative product images. Never claim these are exact lab hardware. */}
      <img
        key={src}
        src={src}
        alt={media&&!failed?media.caption:`${asset.kind} illustrative device icon`}
        width={inspector?640:120}
        height={inspector?280:90}
        loading="lazy"
        decoding="async"
        onError={()=>setFailed(true)}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
    {inspector&&(
      <div className="space-y-1 text-[11px] leading-5 text-slate-400">
        {media&&!failed?
          <>
            <p className="text-slate-200">{media.caption}</p>
            <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2">{media.credit}</a>
            <p>{media.licenseNote}</p>
          </>
        :<p>Device-type illustration. A verified photo of the lab hardware is not available.</p>}
      </div>
    )}
  </div>;
}
