/**
 * Local, editable positions for the BLUE SOC architecture canvas.
 * Moving a device changes only the presentation, not its network zone,
 * VLAN, IP configuration, connectivity or live-state verification.
 */
import { BLUE_SOC_ASSETS } from './blueSocArchitecture';

export interface BlueSocPosition { x:number; y:number }
export type BlueSocPositions = Record<string,BlueSocPosition>;

export const BLUE_SOC_CANVAS_WIDTH=1240;
export const BLUE_SOC_CANVAS_HEIGHT=1250;
export const BLUE_SOC_NODE_WIDTH=170;
export const BLUE_SOC_NODE_HEIGHT=108;
export const BLUE_SOC_GRID_STEP=12;
export const BLUE_SOC_LAYOUT_KEY='aegis.blue-soc.positions.v1';

const validAssetIds=new Set(BLUE_SOC_ASSETS.map(asset=>asset.id));

export function defaultBlueSocPositions():BlueSocPositions {
  return Object.fromEntries(BLUE_SOC_ASSETS.map(asset=>[asset.id,{x:asset.x,y:asset.y}]));
}

export function clampBlueSocPosition(pos:BlueSocPosition):BlueSocPosition {
  return {
    x:Math.max(0,Math.min(BLUE_SOC_CANVAS_WIDTH-BLUE_SOC_NODE_WIDTH,pos.x)),
    y:Math.max(0,Math.min(BLUE_SOC_CANVAS_HEIGHT-BLUE_SOC_NODE_HEIGHT,pos.y)),
  };
}

export function moveBlueSocPosition(pos:BlueSocPosition,snap:boolean):BlueSocPosition {
  const safe=clampBlueSocPosition(pos);
  if(!snap)return {x:Math.round(safe.x),y:Math.round(safe.y)};
  return clampBlueSocPosition({
    x:Math.round(safe.x/BLUE_SOC_GRID_STEP)*BLUE_SOC_GRID_STEP,
    y:Math.round(safe.y/BLUE_SOC_GRID_STEP)*BLUE_SOC_GRID_STEP,
  });
}

/** Untrusted browser storage: ignore unknown IDs, malformed data and invalid coordinates. */
export function loadBlueSocPositions(raw:string|null):BlueSocPositions {
  const positions=defaultBlueSocPositions();
  if(!raw)return positions;
  try{
    const saved:unknown=JSON.parse(raw);
    if(!saved || typeof saved!=='object' || Array.isArray(saved))return positions;
    const envelope=saved as {version?:unknown;positions?:unknown};
    if(envelope.version!==1 || !envelope.positions || typeof envelope.positions!=='object' || Array.isArray(envelope.positions))return positions;
    for(const [id,value] of Object.entries(envelope.positions)){
      if(!validAssetIds.has(id) || !value || typeof value!=='object' || Array.isArray(value))continue;
      const p=value as Partial<BlueSocPosition>;
      if(typeof p.x!=='number' || typeof p.y!=='number' || !Number.isFinite(p.x) || !Number.isFinite(p.y))continue;
      positions[id]=clampBlueSocPosition({x:p.x,y:p.y});
    }
  }catch{
    // Corrupted browser storage should never prevent the project from opening.
  }
  return positions;
}

export function serializeBlueSocPositions(positions:BlueSocPositions):string {
  const clean=defaultBlueSocPositions();
  for(const id of validAssetIds){
    const p=positions[id];
    if(p && Number.isFinite(p.x) && Number.isFinite(p.y))clean[id]=clampBlueSocPosition(p);
  }
  return JSON.stringify({version:1,positions:clean});
}
