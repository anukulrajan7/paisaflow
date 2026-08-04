import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Archive, ArrowLeft, Pencil} from 'lucide-react-native';

import {
  AmountText,
  AppHeader,
  AppScreen,
  Button,
  Card,
  CategoryIcon,
  Divider,
  ErrorState,
  IconButton,
  LoadingState,
  Modal,
  SectionHeader,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {dayjs} from '../../../utils/date';
import {formatMoney} from '../../../utils/money';
import {ContributionFormSheet} from '../components/ContributionFormSheet';
import {GainLossBadge} from '../components/GainLossBadge';
import {InvestmentFormSheet} from '../components/InvestmentFormSheet';
import {UpdateValueSheet} from '../components/UpdateValueSheet';
import {useInvestmentDetailsData} from '../hooks/useInvestmentDetailsData';
import {getInvestmentsRepository} from '../services/investmentsRepository';
import {
  INVESTMENT_TYPE_COLORS,
  INVESTMENT_TYPE_ICONS,
  INVESTMENT_TYPE_LABELS,
} from '../types/investment';
import {gainLoss, nextContributionDueAt} from '../utils/investmentMath';

type Props = NativeStackScreenProps<SettingsStackParamList, 'InvestmentDetails'>;

/** Single investment: valuation, gain/loss, contribution history, archive. */
export function InvestmentDetailsScreen({navigation, route}: Props) {
  const {investmentId} = route.params;
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const {data, notFound, loading, error, reload} =
    useInvestmentDetailsData(investmentId);

  const [contributionVisible, setContributionVisible] = useState(false);
  const [valueVisible, setValueVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [archiveVisible, setArchiveVisible] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const confirmArchive = useCallback(async () => {
    setArchiveBusy(true);
    try {
      await getInvestmentsRepository().setInvestmentActive(investmentId, false);
      bumpDataVersion();
      showToast('Investment archived', {type: 'success'});
      setArchiveVisible(false);
      navigation.goBack();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not archive the investment',
        {type: 'error'},
      );
    } finally {
      setArchiveBusy(false);
    }
  }, [investmentId, navigation, showToast]);

  const investment = data?.investment;
  const currency = data?.currency ?? 'INR';
  const now = Date.now();

  const result = investment
    ? gainLoss(investment.investedMinor, investment.currentValueMinor)
    : null;
  const nextDue = investment ? nextContributionDueAt(investment, now) : null;

  return (
    <AppScreen>
      <AppHeader
        title={investment?.name ?? 'Investment'}
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          investment ? (
            <View style={styles.headerActions}>
              <IconButton
                icon={Pencil}
                onPress={() => setEditVisible(true)}
                accessibilityLabel="Edit investment"
              />
              <IconButton
                icon={Archive}
                onPress={() => setArchiveVisible(true)}
                accessibilityLabel="Archive investment"
              />
            </View>
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading investment" />
      ) : notFound ? (
        <ErrorState
          message="This investment could not be found."
          onRetry={reload}
        />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && investment && result ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          <Card style={styles.summary}>
            <View style={styles.summaryHeader}>
              <CategoryIcon
                icon={INVESTMENT_TYPE_ICONS[investment.type]}
                color={INVESTMENT_TYPE_COLORS[investment.type]}
                size={44}
              />
              <View style={styles.summaryHeaderText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {INVESTMENT_TYPE_LABELS[investment.type]}
                </Text>
                <Text variant="caption" color="textMuted">
                  Started {dayjs(investment.startedAt).format('D MMM YYYY')}
                </Text>
              </View>
              <GainLossBadge
                investedMinor={investment.investedMinor}
                currentValueMinor={investment.currentValueMinor}
                currency={currency}
                testID="details-gainloss"
              />
            </View>

            <View style={styles.valueRow}>
              <View style={styles.valueCell}>
                <Text
                  variant="label"
                  color="textSecondary"
                  style={styles.valueLabel}>
                  Invested
                </Text>
                <AmountText
                  amountMinor={investment.investedMinor}
                  currency={currency}
                  type="neutral"
                  size="medium"
                  showSign={false}
                  testID="details-invested"
                />
              </View>
              <View style={styles.valueCell}>
                <Text
                  variant="label"
                  color="textSecondary"
                  style={styles.valueLabel}>
                  Current value
                </Text>
                <AmountText
                  amountMinor={investment.currentValueMinor}
                  currency={currency}
                  type="neutral"
                  size="medium"
                  showSign={false}
                  testID="details-current"
                />
              </View>
            </View>

            <Text variant="caption" color="textMuted">
              {result.isGain ? 'Gain' : 'Loss'} of{' '}
              {formatMoney(Math.abs(result.amountMinor), currency)}
              {result.percent !== null
                ? ` (${Math.abs(result.percent).toFixed(1)}%)`
                : ''}{' '}
              since you started. Values are updated manually.
            </Text>

            <View style={styles.actionRow}>
              <Button
                title="Update value"
                variant="secondary"
                onPress={() => setValueVisible(true)}
                testID="details-update-value"
              />
              <Button
                title="Add contribution"
                onPress={() => setContributionVisible(true)}
                testID="details-add-contribution"
              />
            </View>
          </Card>

          {investment.maturityAt !== null || nextDue !== null ? (
            <Card style={styles.schedule}>
              {investment.maturityAt !== null ? (
                <Text variant="body" color="textSecondary">
                  Matures {dayjs(investment.maturityAt).format('D MMM YYYY')}
                </Text>
              ) : null}
              {investment.monthlyContributionMinor !== null ? (
                <Text variant="body" color="textSecondary">
                  Monthly contribution{' '}
                  {formatMoney(investment.monthlyContributionMinor, currency)}
                  {nextDue !== null
                    ? ` · next due ${dayjs(nextDue).format('D MMM')}`
                    : ''}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {investment.notes ? (
            <Card>
              <Text variant="body" color="textSecondary">
                {investment.notes}
              </Text>
            </Card>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title="Contributions" />
            <Card style={styles.historyCard}>
              {data.contributions.length > 0 ? (
                data.contributions.map((contribution, index) => (
                  <View key={contribution.id}>
                    {index > 0 ? <Divider /> : null}
                    <View
                      accessible
                      accessibilityLabel={`${formatMoney(
                        contribution.amountMinor,
                        currency,
                      )} on ${dayjs(contribution.occurredAt).format(
                        'D MMM YYYY',
                      )}`}
                      style={styles.historyRow}>
                      <View style={styles.historyText}>
                        <Text variant="bodyMedium">
                          {dayjs(contribution.occurredAt).format('D MMM YYYY')}
                        </Text>
                        {contribution.note ? (
                          <Text
                            variant="caption"
                            color="textMuted"
                            numberOfLines={1}>
                            {contribution.note}
                          </Text>
                        ) : null}
                      </View>
                      <AmountText
                        amountMinor={contribution.amountMinor}
                        currency={currency}
                        type="neutral"
                        size="body"
                        showSign={false}
                      />
                    </View>
                  </View>
                ))
              ) : (
                <Text variant="body" color="textMuted" style={styles.historyEmpty}>
                  No contributions recorded yet. Contributions move money into
                  this investment — they are not counted as spending.
                </Text>
              )}
            </Card>
          </View>
        </ScrollView>
      ) : null}

      {data && investment ? (
        <>
          <ContributionFormSheet
            visible={contributionVisible}
            onClose={() => setContributionVisible(false)}
            investment={investment}
            paymentAccounts={data.paymentAccounts}
            currency={currency}
          />
          <UpdateValueSheet
            visible={valueVisible}
            onClose={() => setValueVisible(false)}
            investment={investment}
            currency={currency}
          />
          <InvestmentFormSheet
            visible={editVisible}
            onClose={() => setEditVisible(false)}
            editing={investment}
            currency={currency}
          />
        </>
      ) : null}

      <Modal
        visible={archiveVisible}
        onClose={() => setArchiveVisible(false)}
        title="Archive investment?"
        actions={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setArchiveVisible(false)}
            />
            <Button
              title="Archive"
              variant="danger"
              onPress={confirmArchive}
              loading={archiveBusy}
              testID="confirm-archive-investment"
            />
          </>
        }>
        <Text variant="body" color="textSecondary">
          {investment
            ? `${investment.name} will be hidden from your portfolio. Contribution history and the transfers behind it are kept.`
            : ''}
        </Text>
      </Modal>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    summary: {gap: theme.spacing.lg},
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    summaryHeaderText: {flex: 1, gap: theme.spacing.xs},
    valueRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    valueCell: {flex: 1, gap: theme.spacing.xs},
    valueLabel: {textTransform: 'uppercase'},
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
    schedule: {gap: theme.spacing.sm},
    section: {gap: theme.spacing.sm},
    historyCard: {gap: theme.spacing.sm},
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    historyText: {flex: 1, gap: theme.spacing.xs},
    historyEmpty: {paddingVertical: theme.spacing.xs},
  });
