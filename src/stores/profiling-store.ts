import { create } from 'zustand';

export interface ProfilingPhase {
  name: string;
  ms: number;
}

export interface BoardProfilingData {
  phases: ProfilingPhase[];
  totalMs: number;
  cardCount: number;
  coverCount: number;
  cachedCovers: number;
  source: 'ssr' | 'client';
  boardName: string;
}

export interface CardProfilingData {
  phases: ProfilingPhase[];
  totalMs: number;
  cardTitle: string;
}

interface ProfilingState {
  boardProfiling: BoardProfilingData | null;
  cardProfiling: CardProfilingData | null;
  showBoardPopup: boolean;
  showCardPopup: boolean;
  enabled: boolean;

  setBoardProfiling: (data: BoardProfilingData) => void;
  setCardProfiling: (data: CardProfilingData) => void;
  dismissBoard: () => void;
  dismissCard: () => void;
  toggleEnabled: () => void;
  setEnabled: (val: boolean) => void;
}

export const useProfilingStore = create<ProfilingState>((set, get) => ({
  boardProfiling: null,
  cardProfiling: null,
  showBoardPopup: false,
  showCardPopup: false,
  enabled: true,

  setBoardProfiling: (data) => set({
    boardProfiling: data,
    showBoardPopup: get().enabled,
  }),

  setCardProfiling: (data) => set({
    cardProfiling: data,
    showCardPopup: get().enabled,
  }),

  dismissBoard: () => set({ showBoardPopup: false }),
  dismissCard: () => set({ showCardPopup: false }),

  toggleEnabled: () => {
    const next = !get().enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('profiling_enabled', String(next));
    }
    set({ enabled: next });
  },

  setEnabled: (val) => set({ enabled: val }),
}));
