import {useEffect, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Lightweight connectivity checks for the few features that need the network
 * (AI summaries). The app itself is fully offline-first — nothing here gates
 * local functionality.
 */

function toOnline(isConnected: boolean | null, isInternetReachable: boolean | null): boolean {
  if (isConnected !== true) {
    return false;
  }
  // null = reachability unknown; treat as online rather than blocking the user.
  return isInternetReachable !== false;
}

/** One-shot connectivity check. */
export async function checkIsOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return toOnline(state.isConnected, state.isInternetReachable);
}

/**
 * React hook tracking online state live. Starts optimistic (`true`) so
 * offline-first screens don't flash an offline state while NetInfo resolves.
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch()
      .then(state => {
        if (mounted) {
          setOnline(toOnline(state.isConnected, state.isInternetReachable));
        }
      })
      .catch(() => {
        // Keep the optimistic default on failure.
      });
    const unsubscribe = NetInfo.addEventListener(state => {
      setOnline(toOnline(state.isConnected, state.isInternetReachable));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return online;
}
