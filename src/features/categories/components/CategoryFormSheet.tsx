import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  Input,
  SegmentedControl,
  Text,
  useToast,
} from '../../../design-system/components';
import type {SegmentedOption} from '../../../design-system/components';
import {CATEGORY_ICON_CHOICES} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {CATEGORY_COLORS} from '../../../design-system/tokens';
import {getCategoriesRepository} from '../../../database/repositories';
import type {Category, CategoryType} from '../../../database/types';
import {useCategoryMutations} from '../hooks/useCategories';
import {categoryFormSchema} from '../schemas/categoryFormSchema';
import type {CategoryFormValues} from '../schemas/categoryFormSchema';
import {ColorPickerField} from './ColorPickerField';
import {IconPickerField} from './IconPickerField';

const TYPE_OPTIONS: ReadonlyArray<SegmentedOption<CategoryType>> = [
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
];

export interface CategoryFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Custom category being edited; null creates a new one. */
  editing: Category | null;
  /** Type preselected when creating (mirrors the screen's segmented control). */
  initialType: CategoryType;
}

/** Add/edit category form in a bottom sheet (RHF + Zod). */
export function CategoryFormSheet({
  visible,
  onClose,
  editing,
  initialType,
}: CategoryFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const {createCategory, updateCategory} = useCategoryMutations();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [siblingNames, setSiblingNames] = useState<ReadonlyArray<string>>([]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: {errors, isSubmitting},
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      type: initialType,
      icon: CATEGORY_ICON_CHOICES[0],
      color: CATEGORY_COLORS[0],
    },
  });

  const watchedType = watch('type');
  const watchedColor = watch('color');

  useEffect(() => {
    if (visible) {
      setSubmitError(null);
      reset(
        editing
          ? {
              name: editing.name,
              type: editing.type,
              icon: editing.icon,
              color: editing.color,
            }
          : {
              name: '',
              type: initialType,
              icon: CATEGORY_ICON_CHOICES[0],
              color: CATEGORY_COLORS[0],
            },
      );
    }
  }, [visible, editing, initialType, reset]);

  // Names of OTHER categories of the form's type, for the duplicate guard.
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    getCategoriesRepository()
      .listCategories({type: watchedType, includeArchived: true})
      .then(rows => {
        if (!cancelled) {
          setSiblingNames(
            rows
              .filter(row => row.id !== editing?.id)
              .map(row => row.name.trim().toLowerCase()),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSiblingNames([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, watchedType, editing]);

  const onSubmit = handleSubmit(async values => {
    if (siblingNames.includes(values.name.toLowerCase())) {
      setError('name', {
        message: 'A category with this name already exists',
      });
      return;
    }
    try {
      if (editing) {
        await updateCategory(editing.id, {
          name: values.name,
          icon: values.icon,
          color: values.color,
        });
        showToast('Category updated', {type: 'success'});
      } else {
        await createCategory({
          name: values.name,
          type: values.type,
          icon: values.icon,
          color: values.color,
        });
        showToast(`${values.name} added`, {type: 'success'});
      }
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save the category',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit category' : 'New category'}
      maxHeightFraction={0.9}>
      <View style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({field: {value, onChange, onBlur}}) => (
            <Input
              label="Name"
              placeholder="e.g. Pets"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name?.message}
              maxLength={60}
              autoCapitalize="words"
              returnKeyType="done"
              testID="category-form-name"
            />
          )}
        />
        {editing ? null : (
          <Controller
            control={control}
            name="type"
            render={({field: {value, onChange}}) => (
              <View style={styles.typeField}>
                <Text
                  variant="label"
                  color="textSecondary"
                  style={styles.typeLabel}>
                  Type
                </Text>
                <SegmentedControl
                  options={TYPE_OPTIONS}
                  value={value}
                  onChange={onChange}
                  accessibilityLabel="Category type"
                  testID="category-form-type"
                />
              </View>
            )}
          />
        )}
        <Controller
          control={control}
          name="icon"
          render={({field: {value, onChange}}) => (
            <IconPickerField
              value={value}
              onChange={onChange}
              previewColor={watchedColor}
              error={errors.icon?.message}
              testID="category-form-icon"
            />
          )}
        />
        <Controller
          control={control}
          name="color"
          render={({field: {value, onChange}}) => (
            <ColorPickerField
              value={value}
              onChange={onChange}
              error={errors.color?.message}
              testID="category-form-color"
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
            title={editing ? 'Save changes' : 'Add category'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="category-form-submit"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {gap: theme.spacing.lg, paddingBottom: theme.spacing.lg},
    typeField: {gap: theme.spacing.xs},
    typeLabel: {textTransform: 'uppercase'},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
  });
