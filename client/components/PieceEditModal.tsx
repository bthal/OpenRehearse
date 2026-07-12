import { mdiClose } from '@mdi/js';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTranslation } from 'react-i18next';

import type { Piece } from '@domain/piece';
import { clampTargetBpm, isValidTargetBpm, MAX_TARGET_BPM, MIN_TARGET_BPM } from '@domain/tempo';
import { AppIcon } from '@components/AppIcon';
import { Colors } from '@theme/colors';
import { usePiecesStore } from '@state/piecesStore';

/**
 * 'edit' — opened from the dashboard; dismissable, button says "Save".
 * 'import' — opened right after an import that is missing required metadata;
 *   titled "Input needed", non-dismissable (no close affordance), button says
 *   "Import". The user must fill every required field before they can proceed.
 */
export type PieceEditMode = 'edit' | 'import';

interface FormValues {
  title: string;
  composer: string;
  targetSpeed: string; // digits only; '' when the piece has no known tempo
}

function valuesEqual(a: FormValues, b: FormValues) {
  return a.title === b.title && a.composer === b.composer && a.targetSpeed === b.targetSpeed;
}

const INPUT_BASE = 'rounded-lg border bg-ash-grey-50 px-3 py-2 text-base text-ash-grey-950';
const BORDER_OK = 'border-ash-grey-500/35';
const BORDER_ERROR = 'border-mauve-shadow-600'; // app's destructive/error token
const FIELD_ERROR_TEXT = 'text-[12px] text-mauve-shadow-600';

// Inner form — remounts via key={pieceId} so state initialises from props without an effect.
function PieceEditForm({
  piece,
  mode,
  onCancelImport,
  onClose,
}: {
  piece: Piece;
  mode: PieceEditMode;
  onCancelImport?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const updatePiece = usePiecesStore((s) => s.updatePiece);

  // Prefill the target speed with the user's override, else the imported tempo,
  // clamped into the valid range so a known starting value always passes validation.
  const defaultTargetBpm = piece.targetBpm ?? piece.importedBpm;
  const initial = useMemo<FormValues>(
    () => ({
      title: piece.title,
      composer: piece.composer ?? '',
      targetSpeed: defaultTargetBpm != null ? String(clampTargetBpm(defaultTargetBpm)) : '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentional: capture only at mount; remount via key when piece changes
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Live per-field validation drives both the red markers and the submit gate.
  const titleError = values.title.trim() === '';
  const composerError = values.composer.trim() === '';
  const speedRaw = values.targetSpeed.trim();
  const speedError = speedRaw === '' || !isValidTargetBpm(Number(speedRaw));

  const isComplete = !titleError && !composerError && !speedError;
  const isDirty = !valuesEqual(values, initial);
  // Import must be completed regardless of "dirtiness"; edit only saves real changes.
  const canSubmit = isComplete && !saving && (mode === 'import' || isDirty);

  async function onSave() {
    if (!canSubmit) return;
    setSaving(true);
    setFormError(null);
    try {
      await updatePiece(piece.id, {
        title: values.title.trim(),
        composer: values.composer.trim(),
        targetBpm: Number(speedRaw),
      });
      onClose();
    } catch {
      setFormError(t('pieceEdit.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Header — close affordance only in edit mode */}
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="flex-1 text-xl font-bold text-ash-grey-950">
          {mode === 'import' ? t('pieceEdit.inputNeededHeading') : t('pieceEdit.heading')}
        </Text>
        {mode === 'edit' ? (
          <Pressable onPress={onClose} hitSlop={12}>
            <AppIcon path={mdiClose} size={20} color={Colors.tabIconDefault} />
          </Pressable>
        ) : null}
      </View>
      {mode === 'import' ? (
        <Text className="mb-3 text-[13px] text-ash-grey-500">
          {t('pieceEdit.inputNeededSubtitle')}
        </Text>
      ) : (
        <View className="mb-3" />
      )}

      <ScrollView contentContainerClassName="gap-3 pb-2" keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-ash-grey-950">
            {t('pieceEdit.titleLabel')}
          </Text>
          <TextInput
            className={`${INPUT_BASE} ${titleError ? BORDER_ERROR : BORDER_OK}`}
            value={values.title}
            onChangeText={(v) => setValues((prev) => ({ ...prev, title: v }))}
            placeholder={t('pieceEdit.titlePlaceholder')}
            placeholderTextColor={Colors.tabIconDefault}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {titleError ? (
            <Text className={FIELD_ERROR_TEXT}>{t('pieceEdit.titleRequired')}</Text>
          ) : null}
        </View>

        {/* Composer */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-ash-grey-950">
            {t('pieceEdit.composerLabel')}
          </Text>
          <TextInput
            className={`${INPUT_BASE} ${composerError ? BORDER_ERROR : BORDER_OK}`}
            value={values.composer}
            onChangeText={(v) => setValues((prev) => ({ ...prev, composer: v }))}
            placeholder={t('pieceEdit.composerPlaceholder')}
            placeholderTextColor={Colors.tabIconDefault}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {composerError ? (
            <Text className={FIELD_ERROR_TEXT}>{t('pieceEdit.composerRequired')}</Text>
          ) : null}
        </View>

        {/* Target speed — the 100% reference the PlayView speed selector scales */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-ash-grey-950">
            {t('pieceEdit.targetSpeedLabel')}
          </Text>
          <TextInput
            className={`${INPUT_BASE} ${speedError ? BORDER_ERROR : BORDER_OK}`}
            value={values.targetSpeed}
            onChangeText={(v) =>
              // Digits only, capped at 3 → structurally rules out nonsense like 1000 BPM.
              setValues((prev) => ({ ...prev, targetSpeed: v.replace(/[^0-9]/g, '').slice(0, 3) }))
            }
            placeholder={t('pieceEdit.targetSpeedPlaceholder')}
            placeholderTextColor={Colors.tabIconDefault}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={3}
          />
          {speedError ? (
            <Text className={FIELD_ERROR_TEXT}>
              {t('pieceEdit.targetSpeedInvalid', { min: MIN_TARGET_BPM, max: MAX_TARGET_BPM })}
            </Text>
          ) : piece.importedBpm != null ? (
            <Text className="text-[12px] text-ash-grey-500">
              {t('pieceEdit.targetSpeedImported', { bpm: piece.importedBpm })}
            </Text>
          ) : null}
        </View>

        {formError ? <Text className="text-sm text-mauve-shadow-800">{formError}</Text> : null}
      </ScrollView>

      {/* Footer — import mode offers a Cancel that discards the in-progress piece */}
      <View className="mt-4 flex-row gap-3">
        {mode === 'import' && onCancelImport ? (
          <Pressable
            className="items-center justify-center rounded-lg border border-ash-grey-500/50 px-5 py-3"
            onPress={onCancelImport}
            disabled={saving}
          >
            <Text className="text-base font-semibold text-ash-grey-600">{t('common.cancel')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          className={`flex-1 items-center rounded-lg px-5 py-3 ${!canSubmit ? 'bg-ash-grey-500/12' : 'bg-seagrass-600'}`}
          onPress={() => void onSave()}
          disabled={!canSubmit}
        >
          {saving ? (
            <ActivityIndicator color={Colors.primaryForeground} />
          ) : (
            <Text
              className={`text-base font-semibold ${!canSubmit ? 'text-ash-grey-400' : 'text-ash-grey-50'}`}
            >
              {mode === 'import' ? t('pieceEdit.import') : t('common.save')}
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

interface PieceEditModalProps {
  pieceId: string | null;
  /** Defaults to 'edit'. 'import' makes the modal a non-dismissable "Input needed" gate. */
  mode?: PieceEditMode;
  onClose: () => void;
  /** Only used in 'import' mode: discards the in-progress imported piece and closes. */
  onCancelImport?: () => void;
}

export function PieceEditModal({
  pieceId,
  mode = 'edit',
  onClose,
  onCancelImport,
}: PieceEditModalProps) {
  const piece = usePiecesStore((s) => (pieceId ? s.piecesById[pieceId] : undefined));
  const dismissable = mode === 'edit';

  return (
    <Modal
      visible={pieceId != null}
      animationType="fade"
      transparent
      onRequestClose={dismissable ? onClose : () => {}}
      supportedOrientations={['landscape']}
    >
      <View className="flex-1 items-center justify-center bg-ash-grey-950/[0.4] p-6">
        {/* Tap-outside to close — only when dismissable */}
        {dismissable ? <Pressable className="absolute inset-0" onPress={onClose} /> : null}

        <View className="max-h-[90%] w-full max-w-[480px] rounded-xl border border-ash-grey-500/35 bg-ash-grey-100 p-5">
          {piece ? (
            <PieceEditForm
              key={pieceId}
              piece={piece}
              mode={mode}
              onCancelImport={onCancelImport}
              onClose={onClose}
            />
          ) : (
            <ActivityIndicator className="my-6" color={Colors.primary} />
          )}
        </View>
      </View>
    </Modal>
  );
}
