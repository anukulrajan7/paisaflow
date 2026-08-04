import {useAppLockStore} from '../../../store/appLockStore';

function reset() {
  useAppLockStore.setState({
    enabled: null,
    locked: false,
    unlockedThisSession: false,
  });
}

beforeEach(reset);

describe('useAppLockStore', () => {
  it('starts unknown, unlocked and never-unlocked', () => {
    const state = useAppLockStore.getState();
    expect(state.enabled).toBeNull();
    expect(state.locked).toBe(false);
    expect(state.unlockedThisSession).toBe(false);
  });

  it('lock() locks without touching unlockedThisSession', () => {
    useAppLockStore.getState().lock();
    expect(useAppLockStore.getState().locked).toBe(true);
    expect(useAppLockStore.getState().unlockedThisSession).toBe(false);
  });

  it('unlock() unlocks and marks the session as unlocked', () => {
    useAppLockStore.getState().lock();
    useAppLockStore.getState().unlock();
    const state = useAppLockStore.getState();
    expect(state.locked).toBe(false);
    expect(state.unlockedThisSession).toBe(true);
  });

  it('a background re-lock keeps unlockedThisSession true', () => {
    useAppLockStore.getState().lock();
    useAppLockStore.getState().unlock();
    useAppLockStore.getState().lock();
    const state = useAppLockStore.getState();
    expect(state.locked).toBe(true);
    expect(state.unlockedThisSession).toBe(true);
  });

  it('setEnabled() records the persisted flag', () => {
    useAppLockStore.getState().setEnabled(true);
    expect(useAppLockStore.getState().enabled).toBe(true);
    useAppLockStore.getState().setEnabled(false);
    expect(useAppLockStore.getState().enabled).toBe(false);
  });
});
