import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  AppHeader,
  AppScreen,
  Button,
  Chip,
  DateTimeField,
  ErrorState,
  Input,
  LoadingState,
  MoneyInput,
  SegmentedControl,
  SelectField,
  Text,
  useToast,
  Switch,
} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {
  getSettingsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import type {TransactionType} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import type {AddStackParamList, RootTabParamList} from '../../../app/navigation/types';
import {
  defaultTransactionFormValues,
  isPaymentMethod,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  transactionFormSchema,
} from '../schemas/transactionFormSchema';
import type {TransactionFormValues} from '../schemas/transactionFormSchema';
import {useEditTransactionStore} from '../store/editTransactionStore';
import {
  getTagsForTransaction,
  parseTagsInput,
  setTagsForTransaction,
} from '../services/tagsService';
import {
  orderCategoriesByUsage,
  useTransactionFormOptions,
} from '../hooks/useTransactionFormOptions';

type Props = NativeStackScreenProps<AddStackParamList, 'AddTransaction'>;

const LAST_USED_ACCOUNT_KEY = 'lastUsedAccountId';

const TYPE_OPTIONS: ReadonlyArray<{value: TransactionType; label: string}> = [
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
  {value: 'transfer', label: 'Transfer'},
];

export function AddTransactionScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const options = useTransactionFormOptions();
  const {accounts, categories, currency, mostUsedIds} = options;
  const clearEditing = useEditTransactionStore(state => state.clearEditing);

  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** MoneyInput keeps its own text state; bumping the key remounts it on reset. */
  const [formSession, setFormSession] = useState(0);
  const savingRef = useRef(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: {errors},
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: defaultTransactionFormValues(),
    mode: 'onTouched',
  });

  const type = watch('type');
  const accountIdValue = watch('accountId');
  const isTransfer = type === 'transfer';
  const isEditing = editId !== null;

  const resetForm = useCallback(
    (values: TransactionFormValues) => {
      reset(values);
      setFormSession(session => session + 1);
    },
    [reset],
  );

  const goToTransactions = useCallback(() => {
    navigation
      .getParent<BottomTabNavigationProp<RootTabParamList>>()
      ?.navigate('TransactionsTab', {screen: 'Transactions'});
  }, [navigation]);

  const loadForEdit = useCallback(
    async (id: string) => {
      try {
        const [tx, tags] = await Promise.all([
          getTransactionsRepository().getTransactionById(id),
          getTagsForTransaction(id),
        ]);
        if (!tx || tx.deletedAt !== null) {
          clearEditing();
          showToast('Transaction is no longer available', {type: 'error'});
          return;
        }
        resetForm({
          type: tx.type,
          amountMinor: tx.amountMinor,
          accountId: tx.accountId,
          destinationAccountId: tx.destinationAccountId,
          categoryId: tx.categoryId,
          occurredAt: tx.occurredAt,
          merchant: tx.merchant ?? '',
          note: tx.note ?? '',
          paymentMethod: isPaymentMethod(tx.paymentMethod)
            ? tx.paymentMethod
            : null,
          tagsText: tags.join(', '),
        });
        setEditId(id);
      } catch {
        clearEditing();
        showToast('Could not load transaction', {type: 'error'});
      }
    },
    [clearEditing, resetForm, showToast],
  );

  // Edit handoff: another screen sets the id in the edit store and switches
  // to this tab — pick it up on focus. Cleared store = back to add mode.
  useFocusEffect(
    useCallback(() => {
      const pendingId = useEditTransactionStore.getState().editingId;
      if (pendingId) {
        if (pendingId !== editId) {
          loadForEdit(pendingId);
        }
      } else if (editId) {
        setEditId(null);
        resetForm(defaultTransactionFormValues());
      }
    }, [editId, loadForEdit, resetForm]),
  );

  // Default the account to the last-used one (fall back to the default
  // account) — add mode only, never override an explicit choice.
  useEffect(() => {
    if (isEditing || accounts.length === 0 || getValues('accountId')) {
      return;
    }
    let cancelled = false;
    (async () => {
      const lastUsed = await getSettingsRepository().getValue(
        LAST_USED_ACCOUNT_KEY,
      );
      if (cancelled) {
        return;
      }
      const candidate =
        accounts.find(account => account.id === lastUsed) ??
        accounts.find(account => account.isDefault) ??
        accounts[0];
      if (candidate && !getValues('accountId')) {
        setValue('accountId', candidate.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, isEditing, getValues, setValue]);

  const performSave = useCallback(
    async (values: TransactionFormValues): Promise<boolean> => {
      if (savingRef.current) {
        return false;
      }
      savingRef.current = true;
      setSaving(true);
      try {
        const repository = getTransactionsRepository();
        const merchant = values.merchant.trim();
        const note = values.note.trim();
        const input = {
          type: values.type,
          amountMinor: values.amountMinor ?? 0,
          currency,
          accountId: values.accountId,
          destinationAccountId: isTransfer ? values.destinationAccountId : null,
          categoryId: isTransfer ? null : values.categoryId,
          merchant: merchant === '' ? null : merchant,
          note: note === '' ? null : note,
          paymentMethod: values.paymentMethod,
          occurredAt: values.occurredAt,
        };
        let id = editId;
        if (id) {
          await repository.updateTransaction(id, input);
        } else {
          const created = await repository.createTransaction(input);
          id = created.id;
        }
        await setTagsForTransaction(id, parseTagsInput(values.tagsText));
        await getSettingsRepository().setValue(
          LAST_USED_ACCOUNT_KEY,
          values.accountId,
        );
        bumpDataVersion();
        showToast(isEditing ? 'Transaction updated' : 'Transaction saved', {
          type: 'success',
        });
        return true;
      } catch {
        showToast('Could not save transaction', {type: 'error'});
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [currency, editId, isEditing, isTransfer, showToast],
  );

  const submit = useMemo(
    () =>
      handleSubmit(async values => {
        const saved = await performSave(values);
        if (!saved) {
          return;
        }
        if (isEditing) {
          clearEditing();
          setEditId(null);
        }
        resetForm(defaultTransactionFormValues());
        goToTransactions();
      }),
    [
      handleSubmit,
      performSave,
      isEditing,
      clearEditing,
      resetForm,
      goToTransactions,
    ],
  );

  const submitAndAddAnother = useMemo(
    () =>
      handleSubmit(async values => {
        const saved = await performSave(values);
        if (!saved) {
          return;
        }
        resetForm({
          ...defaultTransactionFormValues(),
          type: values.type,
          accountId: values.accountId,
          paymentMethod: values.paymentMethod,
        });
      }),
    [handleSubmit, performSave, resetForm],
  );

  const accountOptions = useMemo(
    () => accounts.map(account => ({value: account.id, label: account.name})),
    [accounts],
  );

  const destinationOptions = useMemo(
    () => accountOptions.filter(option => option.value !== accountIdValue),
    [accountOptions, accountIdValue],
  );

  const visibleCategories = useMemo(
    () =>
      orderCategoriesByUsage(
        categories,
        type === 'income' ? 'income' : 'expense',
        mostUsedIds[type === 'income' ? 'income' : 'expense'],
      ),
    [categories, type, mostUsedIds],
  );

  if (options.loading) {
    return (
      <AppScreen padded>
        <AppHeader title="Add transaction" />
        <LoadingState message="Loading" />
      </AppScreen>
    );
  }

  if (options.error) {
    return (
      <AppScreen padded>
        <AppHeader title="Add transaction" />
        <ErrorState
          message="Could not load accounts and categories."
          onRetry={options.reload}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen padded avoidKeyboard>
      <AppHeader title={isEditing ? 'Edit transaction' : 'Add transaction'} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.form}>
        <Controller
          control={control}
          name="type"
          render={({field}) => (
            <SegmentedControl<TransactionType>
              options={TYPE_OPTIONS}
              value={field.value}
              onChange={next => {
                field.onChange(next);
                if (next === 'transfer') {
                  setValue('categoryId', null);
                } else {
                  setValue('destinationAccountId', null);
                }
              }}
              accessibilityLabel="Transaction type"
            />
          )}
        />

        <Controller
          control={control}
          name="amountMinor"
          render={({field}) => (
            <MoneyInput
              key={`amount-${formSession}`}
              label="Amount"
              valueMinor={field.value}
              onChangeMinor={field.onChange}
              currency={currency}
              autoFocus={!isEditing}
              error={errors.amountMinor?.message}
            />
          )}
        />

        {!isTransfer ? (
          <View style={styles.field}>
            <Text
              variant="label"
              color="textSecondary"
              style={styles.fieldLabel}>
              CATEGORY
            </Text>
            <Controller
              control={control}
              name="categoryId"
              render={({field}) => (
                <View style={styles.chipsWrap}>
                  {visibleCategories.map(category => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      icon={getCategoryIcon(category.icon)}
                      selected={field.value === category.id}
                      onPress={() =>
                        field.onChange(
                          field.value === category.id ? null : category.id,
                        )
                      }
                    />
                  ))}
                </View>
              )}
            />
          </View>
        ) : null}

        <Controller
          control={control}
          name="accountId"
          render={({field}) => (
            <SelectField
              label={isTransfer ? 'From account' : 'Account'}
              placeholder="Choose an account"
              value={field.value || null}
              options={accountOptions}
              onSelect={field.onChange}
              error={errors.accountId?.message}
            />
          )}
        />

        {isTransfer ? (
          <Controller
            control={control}
            name="destinationAccountId"
            render={({field}) => (
              <SelectField
                label="To account"
                placeholder="Choose a destination"
                value={field.value}
                options={destinationOptions}
                onSelect={field.onChange}
                error={errors.destinationAccountId?.message}
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="occurredAt"
          render={({field}) => (
            <DateTimeField
              label="Date"
              value={field.value}
              onChange={field.onChange}
              error={errors.occurredAt?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="merchant"
          render={({field}) => (
            <Input
              label={type === 'income' ? 'Source' : 'Merchant'}
              placeholder={
                type === 'income' ? 'e.g. Employer, client' : 'e.g. Swiggy, DMart'
              }
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.merchant?.message}
              autoCapitalize="words"
              returnKeyType="next"
            />
          )}
        />

        <Controller
          control={control}
          name="note"
          render={({field}) => (
            <Input
              label="Note"
              placeholder="Optional note"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.note?.message}
              returnKeyType="next"
            />
          )}
        />

        <View style={styles.field}>
          <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
            PAYMENT METHOD
          </Text>
          <Controller
            control={control}
            name="paymentMethod"
            render={({field}) => (
              <View style={styles.chipsWrap}>
                {PAYMENT_METHODS.map(method => (
                  <Chip
                    key={method}
                    label={PAYMENT_METHOD_LABELS[method]}
                    selected={field.value === method}
                    onPress={() =>
                      field.onChange(field.value === method ? null : method)
                    }
                  />
                ))}
              </View>
            )}
          />
        </View>

        <Controller
          control={control}
          name="tagsText"
          render={({field}) => (
            <Input
              label="Tags"
              placeholder="e.g. work, trip, family"
              hint="Comma-separated"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.tagsText?.message}
              autoCapitalize="none"
              returnKeyType="done"
            />
          )}
        />

        <View style={styles.recurringRow}>
          <View style={styles.recurringTexts}>
            <Text variant="bodyMedium">Recurring</Text>
            <Text variant="caption" color="textMuted">
              Coming soon
            </Text>
          </View>
          <Switch
            value={false}
            disabled
            accessibilityLabel="Recurring (coming soon)"
          />
        </View>

        <View style={styles.actions}>
          <Button
            title={isEditing ? 'Save changes' : 'Save'}
            onPress={submit}
            loading={saving}
            disabled={saving}
            fullWidth
          />
          {!isEditing ? (
            <Button
              title="Save and add another"
              variant="secondary"
              onPress={submitAndAddAnother}
              disabled={saving}
              fullWidth
            />
          ) : null}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {
      gap: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxxl,
    },
    field: {gap: theme.spacing.xs},
    fieldLabel: {textTransform: 'uppercase'},
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    recurringRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
      opacity: 0.6,
    },
    recurringTexts: {flex: 1, gap: theme.spacing.xs},
    actions: {gap: theme.spacing.md},
  });
