import { create } from "zustand";

interface SessionStore {
  sessionId: number | null;
  setSessionId: (id: number | null) => void;
}

export const useSession = create<SessionStore>((set) => ({
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
}));
