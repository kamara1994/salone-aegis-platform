import { create } from 'zustand';

/** The open CCNA book lesson, shared by the reader and the dashboard toolbar picker. `picked` turns on reading focus. */
export const useBookLesson = create<{ lessonId: string; picked: boolean; open: (id: string, picked?: boolean) => void }>((set) => ({
  lessonId: '',
  picked: false,
  open: (lessonId, picked = true) => set((s) => ({ lessonId, picked: picked || s.picked })),
}));
