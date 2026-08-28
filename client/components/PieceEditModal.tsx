import { mdiClose, mdiMinus, mdiPlus } from '@mdi/js';
import { useCallback, useMemo, useState } from 'react';
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

import {
  DEFAULT_INSTRUMENT,
  INSTRUMENT_IDS,
  INSTRUMENT_REGISTRY,
  type InstrumentId,
} from '@domain/instrumentRegistry';
import { instrumentFromPartName } from '@domain/instrumentDetect';
import type { PolyphonyReason } from '@domain/musicxml';
import {
  legalInstrumentsForPart,
  partRefusalReason,
  practisedPart,
} from '@domain/partCompatibility';
import type { Piece } from '@domain/piece';
import { normaliseSections, sectionsEqual } from '@domain/sectionEditing';
import type { Section } from '@domain/sections';
import { SectionsBlock } from '@components/sections/SectionsBlock';
import { clampTargetBpm, isValidTargetBpm, MAX_TARGET_BPM, MIN_TARGET_BPM } from '@domain/tempo';
import { AppIcon } from '@components/AppIcon';
import { Colors, SectionColors } from '@theme/colors';
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
  instrument: InstrumentId;
  /** '' means unchosen, which only a multi-part score can be. */
  partId: string;
  targetSpeed: string; // digits only; '' when the piece has no known tempo
  /**
   * The user's own shift only — the reading transposition stays on the piece and is
   * never edited here. The stepper displays the two summed; this is the half that
   * Reset clears. See specs/features/instruments.md § Transposition.
   */
  transposePractice: number;
}

function valuesEqual(a: FormValues, b: FormValues) {
  return (
    a.title === b.title &&
    a.composer === b.composer &&
    a.instrument === b.instrument &&
    a.partId === b.partId &&
    a.targetSpeed === b.targetSpeed &&
    a.transposePractice === b.transposePractice
  );
}

/**
 * How far the stepper travels either side of the reading transposition. An octave is
 * already well past useful on a wind instrument and comfortably past the sample set;
 * the cap exists so the control has ends, not because 12 is musically special.
 */
const TRANSPOSE_LIMIT = 12;

/**
 * The short phrase printed beside an instrument the part rules out — "two staves",
 * "contains chords". A part whose verdict was stored without a reason falls back to
 * the general statement rather than to a cause nobody observed.
 */
function refusalLabelKey(reason: PolyphonyReason | null): string {
  switch (reason) {
    case 'staves':
      return 'pieceEdit.refusalStaves';
    case 'chords':
      return 'pieceEdit.refusalChords';
    case 'voices':
      return 'pieceEdit.refusalVoices';
    default:
      return 'pieceEdit.refusalPolyphonic';
  }
}

const INPUT_BASE = 'rounded-lg border bg-slate-50 px-3 py-2 text-base text-slate-950';
const BORDER_OK = 'border-slate-500/35';
const BORDER_ERROR = 'border-error-600'; // app's destructive/error token
const FIELD_ERROR_TEXT = 'text-[12px] text-error-600';

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
  const setInstrumentAndPart = usePiecesStore((s) => s.setInstrumentAndPart);

  // Prefill the target speed with the user's override, else the imported tempo,
  // clamped into the valid range so a known starting value always passes validation.
  const defaultTargetBpm = piece.targetBpm ?? piece.importedBpm;
  const initial = useMemo<FormValues>(
    () => ({
      title: piece.title,
      composer: piece.composer ?? '',
      instrument: piece.instrument,
      partId: piece.partId ?? '',
      transposePractice: piece.transposePracticeSemitones ?? 0,
      targetSpeed: defaultTargetBpm != null ? String(clampTargetBpm(defaultTargetBpm)) : '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentional: capture only at mount; remount via key when piece changes
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sections live beside FormValues rather than inside it: they are a list with their
  // own equality, and the text fields above compare as plain strings.
  const initialSections = useMemo<Section[]>(
    // Normalised, not `?? []`: every invariant in sectionEditing assumes at least one
    // section, and a bare fallback is the one place that assumption could be bypassed.
    () => normaliseSections(piece.sections, SectionColors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentional: capture only at mount, like `initial`
  );
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [sectionsPendingInvalid, setSectionsPendingInvalid] = useState(false);
  const sectionsDirty = !sectionsEqual(sections, initialSections);

  // Live per-field validation drives both the red markers and the submit gate.
  const titleError = values.title.trim() === '';
  const composerError = values.composer.trim() === '';
  const speedRaw = values.targetSpeed.trim();
  const speedError = speedRaw === '' || !isValidTargetBpm(Number(speedRaw));

  // A multi-part score cannot be practised until the user says which line is theirs;
  // there is no defensible default, so this gates submit exactly like a blank composer.
  const parts = piece.parts ?? [];
  const partError = parts.length > 1 && values.partId === '';

  // Which line is being practised decides which instruments are possible, so the whole
  // instrument block is derived from the part rather than held in state.
  const selectedPart = practisedPart(parts, values.partId === '' ? undefined : values.partId);
  const legalInstruments = legalInstrumentsForPart(selectedPart);
  const askInstrument = legalInstruments.length > 1;
  // Why there was nothing to ask — printed under the settled instrument during import
  // so a one-option answer still explains itself.
  const soleReason = askInstrument
    ? null
    : (INSTRUMENT_IDS.map((id) => partRefusalReason(id, selectedPart)).find((r) => r !== null) ??
      null);
  const partIndex = parts.findIndex((p) => p.id === (piece.partId ?? values.partId));
  const partLabel =
    (partIndex >= 0 ? parts[partIndex]?.name : null) ??
    t('pieceEdit.partFallback', { number: Math.max(partIndex, 0) + 1 });

  /**
   * Choosing a part re-derives the instrument: its name is the best pre-selection
   * available without reopening the score, and an instrument the new part cannot play
   * has to give way rather than sit there selected and illegal.
   */
  function choosePart(id: string) {
    setValues((prev) => {
      const part = parts.find((p) => p.id === id);
      const legal = legalInstrumentsForPart(part);
      const preferred = instrumentFromPartName(part?.name) ?? prev.instrument;
      const instrument = legal.includes(preferred) ? preferred : (legal[0] ?? DEFAULT_INSTRUMENT);
      return { ...prev, partId: id, instrument };
    });
  }
  const isComplete = !titleError && !composerError && !speedError && !partError;
  const isDirty = !valuesEqual(values, initial) || sectionsDirty;
  // Import must be completed regardless of "dirtiness"; edit only saves real changes.
  // `sectionsPendingInvalid` matters because tapping Save does not reliably blur a
  // TextInput on React Native, so without it a measure field could still hold
  // unresolvable text at the moment the piece is written.
  const canSubmit =
    isComplete && !sectionsPendingInvalid && !saving && (mode === 'import' || isDirty);

  const transposeBase = piece.transposeBaseSemitones ?? 0;
  const transposeTotal = transposeBase + values.transposePractice;

  // i18next pluralises on |count| while the sign is interpolated separately: a bare
  // `count: -2` lands in the 'other' bucket correctly but leaves the minus unprinted,
  // and 0 wants words rather than "0 semitones".
  const semitoneLabel = (semitones: number) =>
    semitones === 0
      ? t('pieceEdit.transposeNone')
      : t('pieceEdit.transposeSemitones', {
          count: Math.abs(semitones),
          signed: `${semitones > 0 ? '+' : '−'}${Math.abs(semitones)}`,
        });

  const onSectionsValidityChange = useCallback(
    (pending: boolean) => setSectionsPendingInvalid(pending),
    [],
  );

  async function onSave() {
    if (!canSubmit) return;
    setSaving(true);
    setFormError(null);
    try {
      await updatePiece(piece.id, {
        title: values.title.trim(),
        composer: values.composer.trim(),
        targetBpm: Number(speedRaw),
        transposePracticeSemitones: values.transposePractice,
        // Omitted unless touched, so an unrelated title edit never rewrites sections.
        ...(sectionsDirty ? { sections } : {}),
      });
      // Second write, deliberately: settling these re-reads the score to derive the
      // reading transposition, which the metadata edit above has no business doing.
      // Import only — after that the instrument and the part are what the piece is,
      // not settings on it, so there is nothing here to write again.
      if (mode === 'import') {
        await setInstrumentAndPart(
          piece.id,
          values.instrument,
          values.partId === '' ? undefined : values.partId,
        );
      }
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
        <Text className="flex-1 text-xl font-bold text-slate-950">
          {mode === 'import' ? t('pieceEdit.inputNeededHeading') : t('pieceEdit.heading')}
        </Text>
        {mode === 'edit' ? (
          <Pressable onPress={onClose} hitSlop={12}>
            <AppIcon path={mdiClose} size={20} color={Colors.tabIconDefault} />
          </Pressable>
        ) : null}
      </View>
      {mode === 'import' ? (
        <Text className="mb-3 text-[13px] text-slate-500">
          {t('pieceEdit.inputNeededSubtitle')}
        </Text>
      ) : (
        <View className="mb-3" />
      )}

      <ScrollView contentContainerClassName="gap-3 pb-2" keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
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
          <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
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
          <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
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
            <Text className="text-[12px] text-slate-500">
              {t('pieceEdit.targetSpeedImported', { bpm: piece.importedBpm })}
            </Text>
          ) : null}
        </View>

        {/* Part, then instrument — in that order, because which line you practise is
          what decides which instruments are even possible. Reversing them would let
          the user answer the second question before the first had constrained it. */}
        {mode === 'import' && parts.length > 1 ? (
          <View className="gap-1">
            <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
              {t('pieceEdit.partLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {parts.map((part, index) => {
                const selected = values.partId === part.id;
                return (
                  <Pressable
                    key={part.id}
                    className={`rounded-lg border px-3 py-2 ${
                      selected ? 'border-slate-950 bg-slate-950' : 'border-slate-500/35 bg-slate-50'
                    }`}
                    onPress={() => choosePart(part.id)}
                  >
                    <Text className={`text-[13px] ${selected ? 'text-white' : 'text-slate-950'}`}>
                      {part.name ?? t('pieceEdit.partFallback', { number: index + 1 })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {partError ? (
              <Text className={FIELD_ERROR_TEXT}>{t('pieceEdit.partRequired')}</Text>
            ) : (
              <Text className="text-[12px] text-slate-500">{t('pieceEdit.partHint')}</Text>
            )}
          </View>
        ) : null}

        {/* Instrument — asked only when the selection leaves a genuine choice. A part
          the clarinet cannot play has exactly one legal answer, so the modal states it
          instead of putting a question with one option. Illegal instruments are shown
          disabled with what rules them out, never hidden: a clarinettist looking for
          their instrument has to find out that the score is the problem. */}
        {mode === 'import' && askInstrument ? (
          <View className="gap-1">
            <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
              {t('pieceEdit.instrumentLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {INSTRUMENT_IDS.map((id) => {
                const selected = values.instrument === id;
                const refusal = partRefusalReason(id, selectedPart);
                const disabled = refusal !== null || !legalInstruments.includes(id);
                return (
                  <Pressable
                    key={id}
                    disabled={disabled}
                    className={`rounded-lg border px-3 py-2 ${
                      disabled
                        ? 'border-slate-500/20 bg-slate-500/12'
                        : selected
                          ? 'border-slate-950 bg-slate-950'
                          : 'border-slate-500/35 bg-slate-50'
                    }`}
                    onPress={() => setValues((prev) => ({ ...prev, instrument: id }))}
                  >
                    <Text
                      className={`text-[13px] ${
                        disabled ? 'text-slate-400' : selected ? 'text-white' : 'text-slate-950'
                      }`}
                    >
                      {t(INSTRUMENT_REGISTRY[id].labelKey)}
                    </Text>
                    {disabled ? (
                      <Text className="text-[11px] text-slate-400">
                        {t(refusalLabelKey(refusal))}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-[12px] text-slate-500">
              {piece.instrumentConfirmed === false
                ? t('pieceEdit.instrumentUnknown')
                : t('pieceEdit.instrumentFixedNote')}
            </Text>
          </View>
        ) : (
          /* Read-only: the instrument is settled at import and never changes, so a
            piece can never become one its own score cannot support. The part is named
            too when there was something to choose. */
          <View className="gap-1">
            <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
              {t('pieceEdit.instrumentLabel')}
            </Text>
            <Text className="text-[13px] text-slate-950">
              {parts.length > 1
                ? t('pieceEdit.instrumentFixedWithPart', {
                    instrument: t(INSTRUMENT_REGISTRY[values.instrument].labelKey),
                    part: partLabel,
                  })
                : t('pieceEdit.instrumentFixed', {
                    instrument: t(INSTRUMENT_REGISTRY[values.instrument].labelKey),
                  })}
            </Text>
            <Text className="text-[12px] text-slate-500">
              {mode === 'import' && soleReason !== null
                ? t('pieceEdit.instrumentOnlyOption', { reason: t(refusalLabelKey(soleReason)) })
                : t('pieceEdit.instrumentFixedNote')}
            </Text>
          </View>
        )}

        {/* Transposition — one stepper showing base + practice, because two rows doing
          the same arithmetic would only invite the question of which is which. Reset
          clears the user's half and leaves the reading transposition alone. */}
        {mode === 'edit' ? (
          <View className="gap-1">
            <Text className="text-[13px] font-semibold opacity-[0.85] text-slate-950">
              {t('pieceEdit.transposeLabel')}
            </Text>
            <View className="flex-row items-center gap-3">
              <Pressable
                className="h-10 w-10 items-center justify-center rounded-lg border border-slate-500/35 bg-slate-50"
                disabled={values.transposePractice <= -TRANSPOSE_LIMIT}
                onPress={() =>
                  setValues((prev) => ({
                    ...prev,
                    transposePractice: Math.max(-TRANSPOSE_LIMIT, prev.transposePractice - 1),
                  }))
                }
                accessibilityLabel={t('pieceEdit.transposeDown')}
              >
                <AppIcon path={mdiMinus} size={20} color={Colors.text} />
              </Pressable>
              <Text className="min-w-[64px] text-center text-base font-semibold text-slate-950">
                {semitoneLabel(transposeTotal)}
              </Text>
              <Pressable
                className="h-10 w-10 items-center justify-center rounded-lg border border-slate-500/35 bg-slate-50"
                disabled={values.transposePractice >= TRANSPOSE_LIMIT}
                onPress={() =>
                  setValues((prev) => ({
                    ...prev,
                    transposePractice: Math.min(TRANSPOSE_LIMIT, prev.transposePractice + 1),
                  }))
                }
                accessibilityLabel={t('pieceEdit.transposeUp')}
              >
                <AppIcon path={mdiPlus} size={20} color={Colors.text} />
              </Pressable>
              {values.transposePractice !== 0 ? (
                <Pressable
                  className="ml-auto rounded-lg border border-slate-500/35 px-3 py-2"
                  onPress={() => setValues((prev) => ({ ...prev, transposePractice: 0 }))}
                >
                  <Text className="text-[13px] text-slate-950">
                    {t('pieceEdit.transposeReset')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {transposeBase !== 0 ? (
              <Text className="text-[12px] text-slate-500">
                {t('pieceEdit.transposeReading', { value: semitoneLabel(transposeBase) })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Sections — collapsed by default; the common edit here is the title. */}
        {mode === 'edit' ? (
          <SectionsBlock
            piece={piece}
            sections={sections}
            onChange={setSections}
            onValidityChange={onSectionsValidityChange}
          />
        ) : null}

        {formError ? <Text className="text-sm text-error-800">{formError}</Text> : null}
      </ScrollView>

      {/* Footer — import mode offers a Cancel that discards the in-progress piece */}
      <View className="mt-4 flex-row gap-3">
        {mode === 'import' && onCancelImport ? (
          <Pressable
            className="items-center justify-center rounded-lg border border-slate-500/50 px-5 py-3"
            onPress={onCancelImport}
            disabled={saving}
          >
            <Text className="text-base font-semibold text-slate-600">{t('common.cancel')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          className={`flex-1 items-center rounded-lg px-5 py-3 ${!canSubmit ? 'bg-slate-500/12' : 'bg-navy-600'}`}
          onPress={() => void onSave()}
          disabled={!canSubmit}
        >
          {saving ? (
            <ActivityIndicator color={Colors.primaryForeground} />
          ) : (
            <Text
              className={`text-base font-semibold ${!canSubmit ? 'text-slate-400' : 'text-slate-50'}`}
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
      <View className="flex-1 items-center justify-center bg-slate-950/[0.4] p-6">
        {/* Tap-outside to close — only when dismissable */}
        {dismissable ? <Pressable className="absolute inset-0" onPress={onClose} /> : null}

        <View className="max-h-[90%] w-full max-w-[480px] rounded-xl border border-slate-500/35 bg-slate-100 p-5">
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
