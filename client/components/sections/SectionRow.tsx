import { mdiPencil } from '@mdi/js';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { Colors } from '@theme/colors';
import { SectionColorPicker } from './SectionColorPicker';

/**
 * One section, in one of two modes.
 *
 * Display is the resting state: swatch, name, and the measures it covers. Editing a
 * section is a deliberate act, so it takes a tap — which also means the list stays
 * readable at a glance when the user only opened the block to check the form.
 *
 * In edit mode the "from" and "to" fields are two views of the same thing. Sections
 * tile the piece, so this row's end is literally the next row's start minus one:
 * editing either moves one junction and both rows visibly change. That is why "to" is
 * absent on the last row and "from" on the first — those are the ends of the piece,
 * not junctions, and there is nothing on the other side of them to move.
 *
 * Split and delete expand inline rather than opening a modal. The piece editor is
 * already a Modal, and this codebase has no nested-Modal precedent.
 */

/**
 * What is open below the fields while editing.
 *
 * Only delete needs a prompt now — splitting acts immediately and puts the user in the
 * new section's "from" field, which is a faster way to say the same thing.
 */
export type RowPrompt = 'none' | 'delete';

const INPUT = 'rounded-lg border bg-ash-grey-50 px-2 py-1.5 text-base text-ash-grey-950';
const BORDER_OK = 'border-ash-grey-500/35';
const BORDER_ERROR = 'border-mauve-shadow-600';
/** Table rows, not cards: a hairline rule between entries, nothing boxed. */
const ROW = 'py-3';
const DIVIDER = 'border-b border-ash-grey-500/20';

function MeasureField({
  label,
  value,
  error,
  editable,
  onChangeText,
  onBlur,
  accessibilityLabel,
  autoFocus,
}: {
  label: string;
  value: string;
  error: boolean;
  editable: boolean;
  onChangeText: (v: string) => void;
  onBlur: () => void;
  accessibilityLabel: string;
  autoFocus?: boolean;
}) {
  return (
    <View className="w-[72px] gap-1">
      <Text className="text-[11px] text-ash-grey-500">{label}</Text>
      {editable ? (
        <TextInput
          className={`${INPUT} ${error ? BORDER_ERROR : BORDER_OK}`}
          value={value}
          onChangeText={onChangeText}
          // Commit on blur, never per keystroke: typing "12" would otherwise land on
          // measure 1 first and drag the neighbouring row with it, twice.
          onBlur={onBlur}
          onSubmitEditing={onBlur}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={5}
          autoFocus={autoFocus}
          accessibilityLabel={accessibilityLabel}
        />
      ) : (
        // Pinned: the first section starts where the piece does and the last ends where
        // it ends. Shown, not editable, so the range still reads as a range. Still
        // labelled — it carries a number a screen reader user needs to hear.
        <View
          className={`${INPUT} ${BORDER_OK} opacity-60`}
          accessible
          accessibilityLabel={accessibilityLabel}
        >
          <Text className="text-base text-ash-grey-950">{value || '—'}</Text>
        </View>
      )}
    </View>
  );
}

/** Equal-width action button; four of these fill the row. */
function ActionButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  tone,
}: {
  /** Button text. Kept short — four of these share the row width. */
  label: string;
  /** Spoken label, which can afford to say what the short text elides. */
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  tone: 'plain' | 'destructive' | 'primary';
}) {
  const surface =
    tone === 'primary' ? 'bg-seagrass-600' : 'border border-ash-grey-500/50 bg-ash-grey-50';
  const text =
    tone === 'primary'
      ? 'text-ash-grey-50'
      : tone === 'destructive'
        ? 'text-mauve-shadow-600'
        : 'text-ash-grey-950';
  return (
    <Pressable
      className={`flex-1 items-center rounded-lg px-2 py-2 ${surface}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{ opacity: disabled ? 0.3 : 1 }}
    >
      <Text className={`text-[13px] font-semibold ${text}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface SectionRowProps {
  index: number;
  name: string | null;
  color: string;
  editing: boolean;
  /** "Measures 5–8", precomputed by the block, which owns the measure map. */
  rangeLabel: string;
  fromValue: string;
  toValue: string;
  fromError: boolean;
  toError: boolean;
  message: string | null;
  /** False on the pinned first boundary, and everywhere when the score is unreadable. */
  canEditFrom: boolean;
  canEditTo: boolean;
  canSplit: boolean;
  canDelete: boolean;
  prompt: RowPrompt;
  previousName: string | null;
  nextName: string | null;
  /** Focus the "from" field on mount — set for a section just created by a split. */
  focusFrom: boolean;
  showDivider: boolean;
  onEdit: () => void;
  onChangeName: (v: string) => void;
  onCommitName: () => void;
  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
  onCommitFrom: () => void;
  onCommitTo: () => void;
  onPickColor: (hex: string) => void;
  onSplit: () => void;
  onRequestDelete: () => void;
  onDelete: (absorb: 'previous' | 'next') => void;
  onCancel: () => void;
  onSave: () => void;
}

export function SectionRow(props: SectionRowProps) {
  const { t } = useTranslation();
  const { index, name, color, editing, prompt, previousName, nextName, canDelete, canSplit } =
    props;

  const displayName = name ?? t('pieceEdit.sections.unnamed', { n: index + 1 });

  if (!editing) {
    return (
      <View className={`${ROW} ${props.showDivider ? DIVIDER : ''} flex-row items-center gap-3`}>
        {/* Inert here: color is chosen in edit mode, where the picker is always open. */}
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color }} />
        <View className="flex-1">
          <Text className="text-base text-ash-grey-950">{displayName}</Text>
          <Text className="text-[12px] text-ash-grey-500">{props.rangeLabel}</Text>
        </View>
        <Pressable
          onPress={props.onEdit}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('pieceEdit.sections.editSection', { name: displayName })}
        >
          <AppIcon path={mdiPencil} size={20} color={Colors.text} />
        </Pressable>
      </View>
    );
  }

  return (
    <View className={`${ROW} ${props.showDivider ? DIVIDER : ''} gap-3`}>
      <View className="flex-row items-end gap-2">
        <View className="flex-1 gap-1">
          <Text className="text-[11px] text-ash-grey-500">{t('pieceEdit.sections.nameLabel')}</Text>
          <TextInput
            className={`${INPUT} ${BORDER_OK}`}
            value={name ?? ''}
            onChangeText={props.onChangeName}
            // Color matching runs here, not per keystroke — typing "Intro" passes
            // through "I", "In", "Int"… and a transient match would repaint mid-word.
            onBlur={props.onCommitName}
            onSubmitEditing={props.onCommitName}
            placeholder={t('pieceEdit.sections.namePlaceholder', { n: index + 1 })}
            placeholderTextColor={Colors.tabIconDefault}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel={t('pieceEdit.sections.nameLabel')}
          />
        </View>

        <MeasureField
          label={t('pieceEdit.sections.fromLabel')}
          value={props.fromValue}
          error={props.fromError}
          editable={props.canEditFrom}
          onChangeText={props.onChangeFrom}
          onBlur={props.onCommitFrom}
          autoFocus={props.focusFrom}
          accessibilityLabel={`${t('pieceEdit.sections.fromLabel')} ${displayName}`}
        />
        <MeasureField
          label={t('pieceEdit.sections.toLabel')}
          value={props.toValue}
          error={props.toError}
          editable={props.canEditTo}
          onChangeText={props.onChangeTo}
          onBlur={props.onCommitTo}
          accessibilityLabel={`${t('pieceEdit.sections.toLabel')} ${displayName}`}
        />
      </View>

      {props.message ? (
        <Text className="text-[12px] text-mauve-shadow-600">{props.message}</Text>
      ) : null}

      <SectionColorPicker color={color} onPick={props.onPickColor} />

      {prompt === 'delete' ? (
        <View className="gap-2">
          <Text className="text-[12px] text-ash-grey-500">
            {t('pieceEdit.sections.deletePrompt', { range: props.rangeLabel })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {/* Only one neighbour exists at the ends of the piece, so there is nothing
                to choose and the single button deletes straight away. */}
            {previousName !== null ? (
              <Pressable
                className="rounded-lg border border-ash-grey-500/50 px-3 py-2"
                onPress={() => props.onDelete('previous')}
                accessibilityRole="button"
              >
                <Text className="text-ash-grey-950">
                  {t('pieceEdit.sections.deleteToPrevious', { name: previousName })}
                </Text>
              </Pressable>
            ) : null}
            {nextName !== null ? (
              <Pressable
                className="rounded-lg border border-ash-grey-500/50 px-3 py-2"
                onPress={() => props.onDelete('next')}
                accessibilityRole="button"
              >
                <Text className="text-ash-grey-950">
                  {t('pieceEdit.sections.deleteToNext', { name: nextName })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <ActionButton
          label={t('pieceEdit.sections.split')}
          accessibilityLabel={t('pieceEdit.sections.splitAction')}
          onPress={props.onSplit}
          disabled={!canSplit}
          tone="plain"
        />
        <ActionButton
          label={t('pieceEdit.sections.delete')}
          accessibilityLabel={t('pieceEdit.sections.deleteAction')}
          onPress={props.onRequestDelete}
          disabled={!canDelete}
          tone="destructive"
        />
        <ActionButton label={t('common.cancel')} onPress={props.onCancel} tone="plain" />
        {/* "Done", not "Save": this only closes the row editor. The modal's Save is the
            one button that writes, and two of them saying "Save" is how someone closes
            the modal believing their sections were persisted. */}
        <ActionButton label={t('common.done')} onPress={props.onSave} tone="primary" />
      </View>
    </View>
  );
}
