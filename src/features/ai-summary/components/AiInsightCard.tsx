/**
 * Home-screen card showing the AI (or local fallback) spending insight.
 * AI is optional: with no key, no connectivity, or a failed provider call the
 * card degrades to a friendly message and never blocks the app.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  WifiOff,
  X,
} from 'lucide-react-native';

import {
  Button,
  Card,
  Divider,
  IconButton,
  Skeleton,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {dayjs} from '../../../utils/date';
import {useAiInsight} from '../hooks/useAiInsight';
import type {SummaryContent} from '../services/summarySchema';

function BulletList({items}: {items: string[]}) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.bulletList}>
      {items.map((item, index) => (
        <View key={index} style={styles.bulletRow}>
          <Text variant="body" color="textSecondary">
            {'•'}
          </Text>
          <Text variant="body" color="textSecondary" style={styles.bulletText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SummaryBody({
  content,
  warningsAlwaysVisible,
}: {
  content: SummaryContent;
  warningsAlwaysVisible: boolean;
}) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);
  const hasExtra =
    content.highlights.length > 0 || content.suggestions.length > 0;
  const showWarnings = warningsAlwaysVisible || expanded;

  return (
    <View style={styles.summaryBody}>
      <Text variant="bodyMedium">{content.headline}</Text>
      <Text variant="body" color="textSecondary">
        {content.overview}
      </Text>

      {content.warnings.length > 0 && showWarnings ? (
        <View style={styles.warningsBox}>
          <TriangleAlert size={18} color={theme.colors.warning} />
          <View style={styles.warningsList}>
            {content.warnings.map((warning, index) => (
              <Text key={index} variant="body" color="textPrimary">
                {warning}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {hasExtra ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? 'Hide highlights and tips' : 'Show highlights and tips'
          }
          onPress={() => setExpanded(v => !v)}
          hitSlop={8}
          style={({pressed}) => [
            styles.expandToggle,
            pressed && styles.pressed,
          ]}>
          {expanded ? (
            <ChevronUp size={18} color={theme.colors.primary} />
          ) : (
            <ChevronDown size={18} color={theme.colors.primary} />
          )}
          <Text variant="bodyMedium" color="primary">
            {expanded ? 'Hide highlights & tips' : 'Show highlights & tips'}
          </Text>
        </Pressable>
      ) : null}

      {expanded ? (
        <View style={styles.summaryBody}>
          {content.highlights.length > 0 ? (
            <BulletList items={content.highlights} />
          ) : null}
          {content.suggestions.length > 0 ? (
            <View style={styles.bulletList}>
              <Text variant="label" color="textSecondary">
                Tips
              </Text>
              <BulletList items={content.suggestions} />
            </View>
          ) : null}
          {content.comparison ? (
            <Text variant="caption" color="textMuted">
              {content.comparison}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function AiInsightCard(): React.JSX.Element {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    insight,
    loadingCached,
    generating,
    errorMessage,
    isOnline,
    refresh,
    cancel,
  } = useAiInsight();

  const refreshDisabled = generating || !isOnline;

  return (
    <Card>
      <View style={styles.header}>
        <Sparkles size={18} color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles.headerTitle}>
          AI insight
        </Text>
        {generating ? (
          <IconButton
            icon={X}
            accessibilityLabel="Cancel generation"
            onPress={cancel}
          />
        ) : (
          <IconButton
            icon={RefreshCw}
            accessibilityLabel={
              isOnline
                ? 'Refresh AI summary'
                : 'Refresh AI summary, unavailable while offline'
            }
            onPress={refresh}
            disabled={refreshDisabled}
          />
        )}
      </View>

      {insight ? (
        <Text variant="caption" color="textMuted" style={styles.timestamp}>
          Updated {dayjs(insight.createdAt).format('D MMM, h:mm A')}
          {insight.usedFallback ? ' · on-device summary' : ''}
          {insight.fromCache && !insight.usedFallback ? ' · cached' : ''}
        </Text>
      ) : null}

      <View style={styles.body}>
        {loadingCached && !insight ? (
          <View style={styles.bulletList}>
            <Skeleton height={16} />
            <Skeleton height={16} width="80%" />
          </View>
        ) : generating && !insight ? (
          <Text variant="body" color="textSecondary">
            Generating your insight…
          </Text>
        ) : insight ? (
          <SummaryBody content={insight.content} warningsAlwaysVisible />
        ) : (
          <View style={styles.summaryBody}>
            <Text variant="body" color="textSecondary">
              Get a friendly summary of this month&apos;s spending.
            </Text>
            <Button
              title="Generate insight"
              onPress={refresh}
              disabled={refreshDisabled}
              size="sm"
              style={styles.generateButton}
            />
          </View>
        )}

        {!isOnline ? (
          <View style={styles.noticeRow}>
            <WifiOff size={16} color={theme.colors.textMuted} />
            <Text variant="caption" color="textMuted" style={styles.noticeText}>
              You are offline — refresh is unavailable until you reconnect.
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.noticeRow}>
            <TriangleAlert size={16} color={theme.colors.danger} />
            <Text variant="caption" color="danger" style={styles.noticeText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </View>

      <Divider style={styles.footerDivider} />
      <Text variant="caption" color="textMuted">
        AI is optional — everything works without it.
      </Text>
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    headerTitle: {flex: 1},
    timestamp: {marginTop: theme.spacing.xs},
    body: {marginTop: theme.spacing.md, gap: theme.spacing.md},
    summaryBody: {gap: theme.spacing.md},
    bulletList: {gap: theme.spacing.xs},
    bulletRow: {flexDirection: 'row', gap: theme.spacing.sm},
    bulletText: {flex: 1},
    warningsBox: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.warningSoft,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
    },
    warningsList: {flex: 1, gap: theme.spacing.xs},
    expandToggle: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    pressed: {opacity: 0.7},
    generateButton: {alignSelf: 'flex-start'},
    noticeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
    },
    noticeText: {flex: 1},
    footerDivider: {marginVertical: theme.spacing.md},
  });
