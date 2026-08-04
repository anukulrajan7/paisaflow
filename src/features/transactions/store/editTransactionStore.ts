import {create} from 'zustand';

interface EditTransactionState {
  /** Id of the transaction being edited; null = add mode. */
  editingId: string | null;
  startEditing: (id: string) => void;
  clearEditing: () => void;
}

/**
 * Feature-local handoff channel for "edit this transaction".
 * Details/list screens set the id and switch to the Add tab; the form screen
 * reads it on focus and clears it after a successful save. UI/session state
 * only — SQLite stays the source of truth.
 */
export const useEditTransactionStore = create<EditTransactionState>(set => ({
  editingId: null,
  startEditing: id => set({editingId: id}),
  clearEditing: () => set({editingId: null}),
}));
