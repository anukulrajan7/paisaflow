import React, {useMemo} from 'react';
import {
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {X} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {IconButton} from './IconButton';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Cap the sheet height at this fraction of the screen (0-1). */
  maxHeightFraction?: number;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Lightweight bottom sheet built on RN Modal (no extra deps). */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeightFraction = 0.75,
  contentStyle,
  testID,
}: BottomSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.root} testID={testID}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          style={[styles.backdrop, {backgroundColor: theme.colors.overlay}]}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingBottom: insets.bottom + theme.spacing.lg,
              maxHeight: `${maxHeightFraction * 100}%`,
            },
            contentStyle,
          ]}>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
              <Text variant="title" style={styles.headerTitle}>
                {title}
              </Text>
              <IconButton
                icon={X}
                onPress={onClose}
                accessibilityLabel="Close"
              />
            </View>
          ) : null}
          <ScrollView bounces={false}>{children}</ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {flex: 1, justifyContent: 'flex-end'},
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    sheet: {
      backgroundColor: theme.colors.surfaceElevated,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.border,
      marginBottom: theme.spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.sm,
    },
    headerTitle: {flex: 1},
  });
