import { describe, expect, it } from 'vitest';
import {
  BLUE_SOC_CANVAS_WIDTH, BLUE_SOC_CANVAS_HEIGHT,
  BLUE_SOC_NODE_WIDTH, BLUE_SOC_NODE_HEIGHT,
  defaultBlueSocPositions, loadBlueSocPositions,
  moveBlueSocPosition, serializeBlueSocPositions,
} from '@/content/blueSocEditableLayout';
import { BLUE_SOC_ASSETS } from '@/content/blueSocArchitecture';

describe('BLUE SOC editable architecture positions', () => {
  it('starts with every original device exactly where it was drawn', () => {
    const positions=defaultBlueSocPositions();
    expect(Object.keys(positions)).toHaveLength(BLUE_SOC_ASSETS.length);
    for(const device of BLUE_SOC_ASSETS)
      expect(positions[device.id]).toEqual({x:device.x,y:device.y});
  });

  it('rounds to grid and clamps dragged nodes inside the visible canvas', () => {
    expect(moveBlueSocPosition({x:25,y:25},true)).toEqual({x:24,y:24});
    expect(moveBlueSocPosition({x:-900,y:99999},false)).toEqual({
      x:0,y:BLUE_SOC_CANVAS_HEIGHT-BLUE_SOC_NODE_HEIGHT,
    });
    const right=moveBlueSocPosition({x:Infinity,y:0},false);
    expect(right.x).toBe(BLUE_SOC_CANVAS_WIDTH-BLUE_SOC_NODE_WIDTH);
    expect(right.y).toBe(0);
  });

  it('round trips 19 custom positions without modifying the original blueprint', () => {
    const moved=defaultBlueSocPositions();
    moved.palo={x:500,y:336};
    moved.forti={x:525,y:616};
    const roundTrip=loadBlueSocPositions(serializeBlueSocPositions(moved));
    expect(roundTrip.palo).toEqual({x:500,y:336});
    expect(roundTrip.forti).toEqual({x:525,y:616});
    expect(roundTrip.onion).toEqual({
      x:BLUE_SOC_ASSETS.find(x=>x.id==='onion')!.x,
      y:BLUE_SOC_ASSETS.find(x=>x.id==='onion')!.y,
    });
  });

  it('rejects corrupted, unknown, future-version and invalid coordinate data', () => {
    const defaults=defaultBlueSocPositions();
    expect(loadBlueSocPositions('broken-json')).toEqual(defaults);
    expect(loadBlueSocPositions(JSON.stringify({version:2,positions:{palo:{x:1,y:1}}}))).toEqual(defaults);
    const raw=JSON.stringify({version:1,positions:{
      palo:{x:'not-a-coordinate',y:333},
      forti:{x:100,y:NaN},
      'unknown-host':{x:200,y:200},
      inside:{x:75,y:125},
    }});
    const restored=loadBlueSocPositions(raw);
    expect(restored.palo).toEqual(defaults.palo);
    expect(restored.forti).toEqual(defaults.forti);
    expect(restored.inside).toEqual({x:75,y:125});
    expect((restored as Record<string,unknown>)['unknown-host']).toBeUndefined();
  });
});
