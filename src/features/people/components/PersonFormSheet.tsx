import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  Input,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  defaultPersonFormValues,
  personFormSchema,
} from '../schemas/personFormSchema';
import type {PersonFormValues} from '../schemas/personFormSchema';
import {getPeopleRepository} from '../services/peopleRepository';
import type {Person} from '../types/person';

export interface PersonFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Person being edited; null creates a new one. */
  editing: Person | null;
}

/** Add/edit person form in a bottom sheet (RHF + Zod). Manual entry only. */
export function PersonFormSheet({
  visible,
  onClose,
  editing,
}: PersonFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: defaultPersonFormValues(),
  });

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset(
      editing
        ? {
            name: editing.name,
            phone: editing.phone ?? '',
            notes: editing.notes ?? '',
          }
        : defaultPersonFormValues(),
    );
  }, [visible, editing, reset]);

  const onSubmit = handleSubmit(async values => {
    try {
      const repo = getPeopleRepository();
      if (editing) {
        await repo.updatePerson(editing.id, {
          name: values.name,
          phone: values.phone || null,
          notes: values.notes || null,
        });
        showToast('Person updated', {type: 'success'});
      } else {
        await repo.createPerson({
          name: values.name,
          phone: values.phone || null,
          notes: values.notes || null,
        });
        showToast('Person added', {type: 'success'});
      }
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save the person',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit person' : 'Add person'}>
      <View style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({field}) => (
            <Input
              label="Name"
              placeholder="e.g. Ravi, Amma"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.name?.message}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Person name"
              testID="person-form-name"
            />
          )}
        />

        <Controller
          control={control}
          name="phone"
          render={({field}) => (
            <Input
              label="Phone"
              placeholder="Optional, with country code"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.phone?.message}
              hint="Used for call, SMS and WhatsApp actions"
              keyboardType="phone-pad"
              returnKeyType="next"
              accessibilityLabel="Phone number"
              testID="person-form-phone"
            />
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({field}) => (
            <Input
              label="Notes"
              placeholder="Optional note"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.notes?.message}
              returnKeyType="done"
              accessibilityLabel="Notes"
              testID="person-form-notes"
            />
          )}
        />

        {submitError ? (
          <Text variant="caption" color="danger">
            {submitError}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title={editing ? 'Save changes' : 'Add person'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="person-form-submit"
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
    },
  });
