import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {ReactNode} from 'react';
import {Animated, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Check, CircleAlert, Info} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme, ColorTokens} from '../tokens';
import {Text} from './Text';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  type?: ToastType;
  /** ms before auto-dismiss. */
  duration?: number;
}

interface ToastState extends Required<ToastOptions> {
  id: number;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3000;

const ICONS: Record<ToastType, LucideIcon> = {
  success: Check,
  error: CircleAlert,
  info: Info,
};

function accentColor(type: ToastType, colors: ColorTokens): string {
  if (type === 'success') {
    return colors.success;
  }
  if (type === 'error') {
    return colors.danger;
  }
  return colors.primary;
}

export function ToastProvider({children}: {children: ReactNode}) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const translateY = useRef(new Animated.Value(100)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 100,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [translateY]);

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      const next: ToastState = {
        id: nextId.current++,
        message,
        type: options?.type ?? 'info',
        duration: options?.duration ?? DEFAULT_DURATION,
      };
      setToast(next);
      translateY.setValue(100);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      timerRef.current = setTimeout(dismiss, next.duration);
    },
    [dismiss, translateY],
  );

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const value = useMemo(() => ({showToast}), [showToast]);

  const Icon = toast ? ICONS[toast.type] : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && Icon ? (
        <Animated.View
          key={toast.id}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.toast,
            {
              bottom: insets.bottom + theme.spacing.xl,
              borderRadius: theme.radius.md,
              borderLeftColor: accentColor(toast.type, theme.colors),
              transform: [{translateY}],
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            onPress={dismiss}
            style={styles.toastInner}>
            <Icon size={18} color={accentColor(toast.type, theme.colors)} />
            <Text variant="bodyMedium" style={styles.toastText}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      backgroundColor: theme.colors.surfaceElevated,
      borderLeftWidth: 4,
      shadowColor: theme.colors.textPrimary,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: theme.dark ? 0.4 : 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    toastInner: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
    },
    toastText: {flex: 1},
  });
