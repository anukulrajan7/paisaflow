import React, {useMemo} from 'react';
import {Linking, Pressable, StyleSheet, View} from 'react-native';
import {MessageCircle, Phone} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {BottomSheet, Text, useToast} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {phoneDigits} from '../utils/ledgerDisplay';

export interface ContactActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  personName: string;
  /** Raw phone as stored; null/empty hides the sheet. */
  phone: string | null;
}

interface ContactAction {
  key: 'call' | 'sms' | 'whatsapp';
  label: string;
  hint: string;
  icon: LucideIcon;
  url: (phone: string) => string;
}

const ACTIONS: ReadonlyArray<ContactAction> = [
  {
    key: 'call',
    label: 'Call',
    hint: 'Opens the dialler',
    icon: Phone,
    url: phone => `tel:${phone}`,
  },
  {
    key: 'sms',
    label: 'Message',
    hint: 'Opens your SMS app',
    icon: MessageCircle,
    url: phone => `sms:${phone}`,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    hint: 'Opens a WhatsApp chat',
    icon: MessageCircle,
    url: phone => `https://wa.me/${phoneDigits(phone)}`,
  },
];

/**
 * Contact confirmation sheet. Nothing is sent or dialled until the user
 * explicitly picks an action here — every option then opens the matching
 * app via Linking (the OS confirms calls; messages open as drafts).
 */
export function ContactActionsSheet({
  visible,
  onClose,
  personName,
  phone,
}: ContactActionsSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();

  if (!phone) {
    return null;
  }

  const open = async (action: ContactAction) => {
    const url = action.url(phone);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showToast(`No app available for ${action.label}`, {type: 'error'});
        return;
      }
      await Linking.openURL(url);
      onClose();
    } catch {
      showToast(`Could not open ${action.label}`, {type: 'error'});
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Contact ${personName}`}>
      <View style={styles.body}>
        <Text variant="body" color="textSecondary">
          {phone}
        </Text>
        {ACTIONS.map(action => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={`${action.label} ${personName}`}
            accessibilityHint={action.hint}
            onPress={() => open(action)}
            testID={`contact-${action.key}`}
            style={({pressed}) => [
              styles.row,
              {borderRadius: theme.radius.md},
              pressed && styles.pressed,
            ]}>
            <View
              style={[
                styles.iconWrap,
                {borderRadius: theme.radius.pill},
              ]}>
              <action.icon size={18} color={theme.colors.primary} />
            </View>
            <View style={styles.rowTexts}>
              <Text variant="bodyMedium">{action.label}</Text>
              <Text variant="caption" color="textMuted">
                {action.hint}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    body: {gap: theme.spacing.sm, paddingBottom: theme.spacing.lg},
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
    },
    iconWrap: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    rowTexts: {flex: 1, gap: 2},
    pressed: {backgroundColor: theme.colors.primarySoft},
  });
