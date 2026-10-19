import React, {useMemo} from 'react';
import {Modal as RNModal, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {SHEET_MAX_WIDTH} from '../layout';
import {Text} from './Text';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Footer actions (e.g. Buttons). */
  actions?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Centered dialog built on RN Modal. */
export function Modal({
  visible,
  onClose,
  title,
  children,
  actions,
  contentStyle,
  testID,
}: ModalProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View
        style={[styles.backdrop, {backgroundColor: theme.colors.overlay}]}
        testID={testID}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            {borderRadius: theme.radius.xl},
            contentStyle,
          ]}>
          {title ? (
            <Text variant="title" style={styles.title}>
              {title}
            </Text>
          ) : null}
          <View>{children}</View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </View>
    </RNModal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xxl,
    },
    card: {
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: SHEET_MAX_WIDTH,
      marginHorizontal: 'auto',
      backgroundColor: theme.colors.surfaceElevated,
      padding: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    title: {marginBottom: theme.spacing.xs},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
  });
