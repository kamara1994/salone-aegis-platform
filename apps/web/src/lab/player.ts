'use client';
// Playback state for packet animation on the canvas (Packet Tracer's simulation mode).
import { create } from 'zustand';

export interface PlayerState {
  traceId: string | null;
  /** Index of the hop the packet is travelling to */
  step: number;
  /** 0..1 progress along the current hop */
  progress: number;
  playing: boolean;
  speed: number;
  load(traceId: string): void;
  setStep(step: number): void;
  setProgress(p: number): void;
  play(): void;
  pause(): void;
  setSpeed(s: number): void;
  stop(): void;
}

export const usePlayer = create<PlayerState>((set) => ({
  traceId: null,
  step: 0,
  progress: 0,
  playing: false,
  speed: 1,
  load(traceId) {
    set({ traceId, step: 0, progress: 0, playing: true });
  },
  setStep(step) {
    set({ step, progress: 1, playing: false });
  },
  setProgress(progress) {
    set({ progress });
  },
  play() {
    set({ playing: true });
  },
  pause() {
    set({ playing: false });
  },
  setSpeed(speed) {
    set({ speed });
  },
  stop() {
    set({ traceId: null, playing: false, step: 0, progress: 0 });
  },
}));
