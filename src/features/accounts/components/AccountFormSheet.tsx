import React, {useEffect, useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  Input,
  MoneyInput,
  SelectField,
} from '../../../design-system/components';
import type {SelectOption} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account, AccountType} from '../../../database/types';
import type {AccountFormValues} from '../schemas/accountFormSchema';
import {ACCOUNT_TYPES, accountFormSchema} from '../schemas/accountFormSchema';
import {ACCOUNT_TYPE_META} from './accountTypeMeta';

export type AccountFormMode = {kind: 'add'} | {kind: 'edit'; account: Account};

export interface AccountFormSheetProps {
  visible: boolean;
  mode: AccountFormMode;
  currency: string;
  onClose: () => void;
  /**
   * Runs the mutation. Throw (or reject) to keep the sheet open;
   * the parent is responsible for surfacing the error.
   */
  onSubmit: (values: AccountFormValues) => Promise<void>;
}

const TYPE_OPTIONS: ReadonlyArray<SelectOption<AccountType>> = (
  Object.keys(ACCOUNT_TYPE_META) as AccountType[]
).map(value => ({value, label: ACCOUNT_TYPE_META[value].label}));

const ADD_DEFAULTS: AccountFormValues = {
  name: '',
  type: 'cash',
  openingBalanceMinor: null,
};

/** Add/edit account form in a bottom sheet (React Hook Form + Zod). */
export function AccountFormSheet({
  visible,
  mode,
  currency,
  onClose,
  onSubmit,
}: AccountFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isEdit = mode.kind === 'edit';

  const {
    control,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: ADD_DEFAULTS,
  });

  useEffect(() => {
    if (visible) {
      reset(
        mode.kind === 'edit'
          ? {
              name: mode.account.name,
              // Virtual account types (investment/person) are managed by
              // their own features; fall back for the form's union.
              type: (ACCOUNT_TYPES as readonly string[]).includes(
                mode.account.type,
              )
                ? (mode.account.type as AccountFormValues['type'])
                : 'cash',
              openingBalanceMinor: mode.account.openingBalanceMinor,
            }
          : ADD_DEFAULTS,
      );
    }
  }, [visible, mode, reset]);

  const submit = handleSubmit(async values => {
    try {
      await onSubmit(values);
      onClose();
    } catch {
      // Parent surfaces the error; keep the sheet open for correction.
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? 'Edit account' : 'Add account'}>
      <View style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({field: {value, onChange, onBlur}}) => (
            <Input
              label="Name"
              placeholder="e.g. HDFC Savings"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name?.message}
              autoFocus={!isEdit}
              maxLength={60}
              returnKeyType="done"
            />
          )}
        />
        <Controller
          control={control}
          name="type"
          render={({field: {value, onChange}}) => (
            <SelectField<AccountType>
              label="Type"
              value={value}
              options={TYPE_OPTIONS}
              onSelect={onChange}
              error={errors.type?.message}
            />
          )}
        />
        {!isEdit ? (
          <Controller
            control={control}
            name="openingBalanceMinor"
            render={({field: {value, onChange}}) => (
              <MoneyInput
                label="Opening balance"
                valueMinor={value}
                onChangeMinor={onChange}
                currency={currency}
                error={errors.openingBalanceMinor?.message}
                hint="Current balance of this account right now."
              />
            )}
          />
        ) : null}
        <View style={styles.actions}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            disabled={isSubmitting}
            style={styles.actionButton}
          />
          <Button
            title={isEdit ? 'Save changes' : 'Add account'}
            onPress={submit}
            loading={isSubmitting}
            style={styles.actionButton}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {gap: theme.spacing.lg, paddingBottom: theme.spacing.lg},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    actionButton: {flex: 1},
  });
