import {useDataVersionStore} from '../../store/dataVersionStore';

const RESYNC_DEBOUNCE_MS = 2000;

/**
 * Builds the "re-run reminder sync whenever financial data changes"
 * subscription (debounced) for a given sync function. Shared by the native
 * (notifee) and web (Notification API) reminder implementations so both
 * expose identical subscribe/unsubscribe semantics.
 */
export function createReminderResync(sync: () => Promise<void>): {
  subscribe: () => void;
  unsubscribe: () => void;
} {
  let dataSyncUnsubscribe: (() => void) | null = null;
  let resyncTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    subscribe() {
      if (dataSyncUnsubscribe) {
        return;
      }
      dataSyncUnsubscribe = useDataVersionStore.subscribe(() => {
        if (resyncTimer) {
          clearTimeout(resyncTimer);
        }
        resyncTimer = setTimeout(() => {
          resyncTimer = null;
          sync().catch(() => {
            // Best-effort — a failed resync leaves the previous schedule intact.
          });
        }, RESYNC_DEBOUNCE_MS);
      });
    },
    unsubscribe() {
      if (resyncTimer) {
        clearTimeout(resyncTimer);
        resyncTimer = null;
      }
      if (dataSyncUnsubscribe) {
        dataSyncUnsubscribe();
        dataSyncUnsubscribe = null;
      }
    },
  };
}
