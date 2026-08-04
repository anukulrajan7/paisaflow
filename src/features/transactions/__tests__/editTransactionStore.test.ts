import {useEditTransactionStore} from '../store/editTransactionStore';

describe('editTransactionStore', () => {
  beforeEach(() => {
    useEditTransactionStore.getState().clearEditing();
  });

  it('starts in add mode', () => {
    expect(useEditTransactionStore.getState().editingId).toBeNull();
  });

  it('startEditing sets the transaction id', () => {
    useEditTransactionStore.getState().startEditing('tx-1');
    expect(useEditTransactionStore.getState().editingId).toBe('tx-1');
  });

  it('startEditing replaces a previous id', () => {
    useEditTransactionStore.getState().startEditing('tx-1');
    useEditTransactionStore.getState().startEditing('tx-2');
    expect(useEditTransactionStore.getState().editingId).toBe('tx-2');
  });

  it('clearEditing returns to add mode', () => {
    useEditTransactionStore.getState().startEditing('tx-1');
    useEditTransactionStore.getState().clearEditing();
    expect(useEditTransactionStore.getState().editingId).toBeNull();
  });

  it('supports the full edit handoff flow: set → read → save → clear', () => {
    // Details screen sets the id before switching to the Add tab.
    useEditTransactionStore.getState().startEditing('tx-42');
    // Form screen reads it on focus.
    const pendingId = useEditTransactionStore.getState().editingId;
    expect(pendingId).toBe('tx-42');
    // After a successful save the store is cleared → next open is add mode.
    useEditTransactionStore.getState().clearEditing();
    expect(useEditTransactionStore.getState().editingId).toBeNull();
  });

  it('notifies subscribers when the editing id changes', () => {
    const seen: Array<string | null> = [];
    const unsubscribe = useEditTransactionStore.subscribe(state =>
      seen.push(state.editingId),
    );
    useEditTransactionStore.getState().startEditing('tx-7');
    useEditTransactionStore.getState().clearEditing();
    unsubscribe();
    expect(seen).toEqual(['tx-7', null]);
  });
});
