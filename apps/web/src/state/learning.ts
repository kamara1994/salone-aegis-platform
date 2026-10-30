'use client';

import { useSyncExternalStore } from 'react';
import { loadProgress, updateProgress } from '@/content/progress';
import type { ExamDifficulty, TeachLevel } from '@/content/topics';

export interface LearningPreferences {
  teach: TeachLevel;
  examDifficulty: ExamDifficulty;
}

const DEFAULTS: LearningPreferences = { teach: 'simple', examDifficulty: 'intermediate' };
const EVENT = 'aegis:learn-progress';
let snapshot = DEFAULTS;
let signature = '';

function getSnapshot(): LearningPreferences {
  const saved = loadProgress();
  const next: LearningPreferences = {
    teach: saved.teach === 'technical' ? 'technical' : 'simple',
    examDifficulty: saved.examDifficulty ?? 'intermediate',
  };
  const nextSignature = `${next.teach}:${next.examDifficulty}`;
  if (signature !== nextSignature) {
    signature = nextSignature;
    snapshot = next;
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === 'aegis.learn.progress.v1' || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, listener);
  };
}

export function useLearningPreferences(): LearningPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);
}

export function setTeachingLevel(teach: TeachLevel) {
  updateProgress((progress) => {
    progress.teach = teach;
  });
}

export function setExamDifficulty(examDifficulty: ExamDifficulty) {
  updateProgress((progress) => {
    progress.examDifficulty = examDifficulty;
  });
}

