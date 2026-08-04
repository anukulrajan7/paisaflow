import {create} from 'zustand';

export type BootstrapStatus = 'loading' | 'ready' | 'error';

interface BootstrapState {
  status: BootstrapStatus;
  /** Human-readable failure detail for the error screen. */
  errorMessage: string | null;
  begin: () => void;
  succeed: () => void;
  fail: (message: string) => void;
}

/** UI/session-only store tracking database bootstrap progress. */
export const useBootstrapStore = create<BootstrapState>(set => ({
  status: 'loading',
  errorMessage: null,
  begin: () => set({status: 'loading', errorMessage: null}),
  succeed: () => set({status: 'ready', errorMessage: null}),
  fail: message => set({status: 'error', errorMessage: message}),
}));
