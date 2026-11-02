import { create } from 'zustand';

/** The open CCNA book lesson, shared by the reader and the toolbar topic picker. */
export const useBookLesson = create<{ lessonId: string; open: (id: string) => void }>((set) => ({
  lessonId: '',
  open: (lessonId) => set({ lessonId }),
}));
