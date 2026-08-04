import {useCallback, useEffect, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';

import {getDb} from '../../../database/connection/connection';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getMoneyHubBadges, NO_BADGES} from '../utils/moneyHubBadges';
import type {MoneyHubBadges} from '../utils/moneyHubBadges';

/**
 * Badge counts for the Home money-hub tiles. Refetches on every
 * `dataVersion` change and every screen focus, like the rest of Home.
 * Read-only and opportunistic: a query failure just hides the badges.
 */
export function useMoneyHubBadges(): MoneyHubBadges {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [badges, setBadges] = useState<MoneyHubBadges>(NO_BADGES);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMoneyHubBadges(getDb(), Date.now())
      .then(next => {
        if (!cancelled) {
          setBadges(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBadges(NO_BADGES);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dataVersion, reloadToken]);

  useFocusEffect(
    useCallback(() => {
      setReloadToken(t => t + 1);
    }, []),
  );

  return badges;
}
