import {createNavigationContainerRef} from '@react-navigation/native';

import type {RootStackParamList} from './types';

/**
 * Process-wide navigation ref, used by code outside the React tree (e.g.
 * notification tap handling) to navigate once the container is ready.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
