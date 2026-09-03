import {
  mdiArrowLeft,
  mdiDelete,
  mdiMetronome,
  mdiMetronomeTick,
  mdiPlus,
  mdiSwapVertical,
} from '@mdi/js';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import {
  PAUSE_MEASURES,
  type ExerciseBlock,
  type PauseBlock,
  type PauseMeasures,
  type RoutineBlock,
  validateRoutine,
} from '@domain/routine';
import {
  DEFAULT_PEAK_REPEATS,
  WARMUP_BPMS,
  WARMUP_KEYS,
  WARMUP_OCTAVES,
  WARMUP_PEAK_REPEATS,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpOctaves,
  type WarmUpPeakRepeats,
} from '@domain/warmup';
import {
  DEFAULT_EXERCISE_PARAMS,
  HANON_EXERCISE_COUNT,
  WARM_UP_REGISTRY,
  WARM_UP_TYPES,
  hasParam,
  keyLabel as keyName,
  type WarmUpType,
} from '@domain/warmupRegistry';
import { Colors } from '@theme/colors';
import { useRoutinesStore } from '@state/routinesStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockWithKey = RoutineBlock & { _key: string };

type PickerType =
  | 'exercise'
  | 'key'
  | 'bpm'
  | 'hand'
  | 'octaves'
  | 'peakRepeats'
  | 'measures'
  | 'addType'
  | 'addMeasures';

interface PickerState {
  blockKey?: string;
  atIndex?: number;
  type: PickerType;
  options: { label: string; value: string | number }[];
  currentValue: string | number;
}

// Omit 'type' from each member before intersecting so the patch is not `never`
type BlockPatch = Partial<Omit<ExerciseBlock, 'type'> & Omit<PauseBlock, 'type'>>;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

// ─── Constants (defined outside component) ────────────────────────────────────

const HAND_OPTIONS: { tKey: string; value: WarmUpHand }[] = [
  { tKey: 'routineEdit.handBoth', value: 'both' },
  { tKey: 'routineEdit.handRight', value: 'right' },
  { tKey: 'routineEdit.handLeft', value: 'left' },
];

// Exercise types offered in the "Add Exercise" picker, in registry display order.
const EXERCISE_TYPES: WarmUpType[] = WARM_UP_TYPES;

function exerciseLabelKey(type: WarmUpType): string {
  return WARM_UP_REGISTRY[type].shortLabelKey;
}

function defaultExerciseBlock(type: WarmUpType): ExerciseBlock {
  const { pitchClass, mode, hand, bpm, octaves } = DEFAULT_EXERCISE_PARAMS;
  return {
    type,
    pitchClass,
    mode,
    hand,
    bpm,
    octaves,
    ...(hasParam(type, 'exercise') ? { exercise: DEFAULT_EXERCISE_PARAMS.exercise } : {}),
    ...(hasParam(type, 'peakRepeats') ? { peakRepeats: DEFAULT_PEAK_REPEATS } : {}),
  };
}

function keyLabel(pitchClass: number, mode: 'major' | 'minor', t: TFn): string {
  const label = keyName(pitchClass, mode);
  return (
    label.replace(/m$/, '') +
    ' ' +
    t(mode === 'major' ? 'routineEdit.modeMajor' : 'routineEdit.modeMinor')
  );
}

function exerciseLabel(exercise: number | undefined, t: TFn): string {
  return t('routineEdit.exerciseNo', { number: exercise ?? DEFAULT_EXERCISE_PARAMS.exercise });
}

function octavesLabel(octaves: WarmUpOctaves, t: TFn): string {
  return t('routineEdit.octave', { count: octaves });
}

function peakRepeatsLabel(peakRepeats: WarmUpPeakRepeats | undefined, t: TFn): string {
  return t('routineEdit.peakRepeats', { times: peakRepeats ?? DEFAULT_PEAK_REPEATS });
}

// ─── Small presentational components (defined outside to satisfy lint) ─────────

interface AddButtonProps {
  atIndex: number;
  onPress: (atIndex: number) => void;
  label: string;
}

function AddButton({ atIndex, onPress, label }: AddButtonProps) {
  return (
    <Pressable
      onPress={() => onPress(atIndex)}
      className="my-2 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 active:bg-slate-500/10"
    >
      <AppIcon path={mdiPlus} size={20} color={Colors.primary} />
      <Text className="text-base font-semibold text-navy-600">{label}</Text>
    </Pressable>
  );
}

interface SwapButtonProps {
  onPress: () => void;
  label: string;
}

function SwapButton({ onPress, label }: SwapButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className="my-2 flex-row items-center gap-1.5 rounded-xl px-3 py-3.5 active:bg-slate-500/10"
    >
      <AppIcon path={mdiSwapVertical} size={20} color={Colors.icon} />
      <Text className="text-sm font-semibold text-slate-950">{label}</Text>
    </Pressable>
  );
}

interface PillProps {
  label: string;
  onPress: () => void;
  active?: boolean;
}

function Pill({ label, onPress, active }: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg border px-4 py-2 active:bg-slate-100 ${active ? 'border-navy-600 bg-navy-50' : 'border-slate-500/35 bg-white'}`}
    >
      <Text className={`text-base font-semibold ${active ? 'text-navy-600' : 'text-slate-950'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoutineEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const saveRoutine = useRoutinesStore((s) => s.saveRoutine);
  const existingRoutine = useRoutinesStore((s) => s.routines.find((r) => r.id === id));

  // Lazy initializers so we don't need a setState-in-effect pattern
  const [title, setTitle] = useState(() => existingRoutine?.title ?? '');
  const [blocks, setBlocks] = useState<BlockWithKey[]>(
    () => existingRoutine?.blocks.map((b) => ({ ...b, _key: Crypto.randomUUID() })) ?? [],
  );
  const [metronome, setMetronome] = useState(() => existingRoutine?.metronome ?? false);
  const [isDirty, setIsDirty] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);

  const isEditing = Boolean(id && existingRoutine);
  const validationError = validateRoutine(blocks);
  const canSave = title.trim().length > 0 && validationError === null;

  // ─── Navigation guard ──────────────────────────────────────────────────────

  function handleBack() {
    if (!isDirty) {
      router.back();
      return;
    }
    Alert.alert(t('routineEdit.unsavedTitle'), t('routineEdit.unsavedMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('routineEdit.unsavedDiscard'), style: 'destructive', onPress: () => router.back() },
    ]);
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!canSave) return;
    const cleanBlocks: RoutineBlock[] = blocks.map((b) => {
      const copy = { ...(b as object) } as Record<string, unknown>;
      delete copy['_key'];
      return copy as unknown as RoutineBlock;
    });
    await saveRoutine({
      id: existingRoutine?.id ?? Crypto.randomUUID(),
      title: title.trim(),
      blocks: cleanBlocks,
      metronome,
      createdAt: existingRoutine?.createdAt ?? new Date().toISOString(),
    });
    router.back();
  }

  // ─── Block mutations ───────────────────────────────────────────────────────

  // The metronome belongs to the routine as a whole, so it toggles straight from the
  // header rather than going through the per-block picker.
  function toggleMetronome() {
    setMetronome((prev) => !prev);
    setIsDirty(true);
  }

  function insertBlock(atIndex: number, block: RoutineBlock) {
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(atIndex, 0, { ...block, _key: Crypto.randomUUID() });
      return next;
    });
    setIsDirty(true);
  }

  function deleteBlock(blockKey: string) {
    Alert.alert(t('routineEdit.removeBlockTitle'), t('routineEdit.removeBlockConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => {
          setBlocks((prev) => prev.filter((b) => b._key !== blockKey));
          setIsDirty(true);
        },
      },
    ]);
  }

  function patchBlock(blockKey: string, patch: BlockPatch) {
    setBlocks((prev) =>
      prev.map((b) => (b._key === blockKey ? ({ ...b, ...patch } as BlockWithKey) : b)),
    );
    setIsDirty(true);
  }

  function swapBlocks(index: number) {
    setBlocks((prev) => {
      if (index <= 0 || index >= prev.length) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      return next;
    });
    setIsDirty(true);
  }

  // ─── "Add Exercise" picker ─────────────────────────────────────────────────

  function openAddPicker(atIndex: number) {
    setPicker({
      atIndex,
      type: 'addType',
      options: [
        ...EXERCISE_TYPES.map((exType) => ({
          label: t(exerciseLabelKey(exType)),
          value: exType,
        })),
        { label: t('routineEdit.addExercisePause'), value: 'pause' },
      ],
      currentValue: '',
    });
  }

  // ─── Parameter picker ──────────────────────────────────────────────────────

  function openPicker(blockKey: string, type: PickerType, block: BlockWithKey) {
    let options: { label: string; value: string | number }[] = [];
    let currentValue: string | number = '';

    if (type === 'key' && block.type !== 'pause') {
      options = WARMUP_KEYS.map((k) => ({ label: k.label, value: `${k.pitchClass}:${k.mode}` }));
      currentValue = `${block.pitchClass}:${block.mode}`;
    } else if (type === 'exercise' && block.type !== 'pause') {
      options = Array.from({ length: HANON_EXERCISE_COUNT }, (_, i) => ({
        label: exerciseLabel(i + 1, t),
        value: i + 1,
      }));
      currentValue = block.exercise ?? DEFAULT_EXERCISE_PARAMS.exercise;
    } else if (type === 'bpm' && block.type !== 'pause') {
      options = WARMUP_BPMS.map((b) => ({ label: String(b), value: b }));
      currentValue = block.bpm;
    } else if (type === 'hand' && block.type !== 'pause') {
      options = HAND_OPTIONS.map((h) => ({ label: t(h.tKey), value: h.value }));
      currentValue = block.hand;
    } else if (type === 'octaves' && block.type !== 'pause') {
      options = WARMUP_OCTAVES.map((o) => ({ label: octavesLabel(o, t), value: o }));
      currentValue = block.octaves;
    } else if (type === 'peakRepeats' && block.type !== 'pause') {
      options = WARMUP_PEAK_REPEATS.map((p) => ({ label: peakRepeatsLabel(p, t), value: p }));
      currentValue = block.peakRepeats ?? DEFAULT_PEAK_REPEATS;
    }

    setPicker({ blockKey, type, options, currentValue });
  }

  function openMeasuresPicker(block: BlockWithKey) {
    if (block.type !== 'pause') return;
    setPicker({
      blockKey: block._key,
      type: 'measures',
      options: PAUSE_MEASURES.map((m) => ({
        label: t('routineEdit.measure', { count: m }),
        value: m,
      })),
      currentValue: block.measures,
    });
  }

  function applyPicker(value: string | number) {
    if (!picker) return;
    const { blockKey, atIndex, type } = picker;
    if (type === 'addType') {
      if (value !== 'pause') {
        insertBlock(atIndex!, defaultExerciseBlock(value as ExerciseBlock['type']));
      } else {
        setPicker({
          atIndex,
          type: 'addMeasures',
          options: PAUSE_MEASURES.map((m) => ({
            label: t('routineEdit.measure', { count: m }),
            value: m,
          })),
          currentValue: 1,
        });
        return;
      }
    } else if (type === 'addMeasures') {
      insertBlock(atIndex!, { type: 'pause', measures: value as PauseMeasures });
    } else if (type === 'measures') {
      patchBlock(blockKey!, { measures: value as PauseMeasures });
    } else if (type === 'key') {
      const [pc, mode] = String(value).split(':');
      patchBlock(blockKey!, { pitchClass: Number(pc), mode: mode as 'major' | 'minor' });
    } else if (type === 'exercise') {
      patchBlock(blockKey!, { exercise: value as number });
    } else if (type === 'bpm') {
      patchBlock(blockKey!, { bpm: value as WarmUpBpm });
    } else if (type === 'hand') {
      patchBlock(blockKey!, { hand: value as WarmUpHand });
    } else if (type === 'octaves') {
      patchBlock(blockKey!, { octaves: value as WarmUpOctaves });
    } else if (type === 'peakRepeats') {
      patchBlock(blockKey!, { peakRepeats: value as WarmUpPeakRepeats });
    }
    setPicker(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ orientation: 'portrait', headerShown: false }} />
      <SafeAreaView className="flex-1 bg-slate-50">
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-500/35 px-4 py-5">
          <Pressable onPress={handleBack} hitSlop={12} className="mr-3">
            <AppIcon path={mdiArrowLeft} size={24} color={Colors.icon} />
          </Pressable>
          <Text className="flex-1 text-lg font-semibold text-slate-950">
            {isEditing ? t('routineEdit.editTitle') : t('routineEdit.newTitle')}
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            className={`rounded-lg px-4 py-2 ${canSave ? 'bg-navy-600' : 'bg-slate-500/12'}`}
          >
            <Text className={`font-semibold ${canSave ? 'text-white' : 'text-slate-400'}`}>
              {t('common.save')}
            </Text>
          </Pressable>
        </View>

        {/* Body */}
        <FlatList
          data={blocks}
          keyExtractor={(item) => item._key}
          renderItem={({ item: block, index }) => (
            <View key={block._key}>
              {index === 0 ? (
                <View className="items-end">
                  <AddButton
                    atIndex={index}
                    onPress={openAddPicker}
                    label={t('routineEdit.addExercise')}
                  />
                </View>
              ) : (
                <View className="flex-row items-center justify-between">
                  <SwapButton
                    onPress={() => swapBlocks(index)}
                    label={t('routineEdit.swapExercises')}
                  />
                  <AddButton
                    atIndex={index}
                    onPress={openAddPicker}
                    label={t('routineEdit.addExercise')}
                  />
                </View>
              )}
              <View className="mb-1 rounded-xl border border-slate-500/35 bg-white p-4">
                <View className="flex-row items-stretch">
                  {/* Left: delete button centered vertically */}
                  <View className="mr-4 items-center justify-center border-r border-slate-500/20 pr-4">
                    <Pressable onPress={() => deleteBlock(block._key)} hitSlop={8} className="p-1">
                      <AppIcon path={mdiDelete} size={20} color={Colors.destructive} />
                    </Pressable>
                  </View>

                  {/* Right: title (centered) + parameter pills */}
                  <View className="flex-1">
                    <Text className="text-center text-lg font-semibold text-slate-950">
                      {block.type === 'pause'
                        ? t('routineEdit.addExercisePause')
                        : t(exerciseLabelKey(block.type))}
                    </Text>

                    {/* Parameter pills */}
                    {block.type !== 'pause' ? (
                      <View className="mt-2 flex-row flex-wrap gap-2">
                        {hasParam(block.type, 'exercise') && (
                          <Pill
                            label={exerciseLabel(block.exercise, t)}
                            onPress={() => openPicker(block._key, 'exercise', block)}
                          />
                        )}
                        {hasParam(block.type, 'key') && (
                          <Pill
                            label={keyLabel(block.pitchClass, block.mode, t)}
                            onPress={() => openPicker(block._key, 'key', block)}
                          />
                        )}
                        <Pill
                          label={`${block.bpm} BPM`}
                          onPress={() => openPicker(block._key, 'bpm', block)}
                        />
                        <Pill
                          label={t(
                            HAND_OPTIONS.find((h) => h.value === block.hand)?.tKey ??
                              'routineEdit.handBoth',
                          )}
                          onPress={() => openPicker(block._key, 'hand', block)}
                        />
                        {hasParam(block.type, 'octaves') && (
                          <Pill
                            label={octavesLabel(block.octaves, t)}
                            onPress={() => openPicker(block._key, 'octaves', block)}
                          />
                        )}
                        {hasParam(block.type, 'peakRepeats') && (
                          <Pill
                            label={peakRepeatsLabel(block.peakRepeats, t)}
                            onPress={() => openPicker(block._key, 'peakRepeats', block)}
                          />
                        )}
                      </View>
                    ) : (
                      <View className="mt-2 flex-row">
                        <Pill
                          label={t('routineEdit.measure', { count: block.measures })}
                          onPress={() => openMeasuresPicker(block)}
                        />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}
          ListHeaderComponent={
            <View className="pb-2 pt-4">
              <View className="mx-6 mb-4 flex-row items-center gap-3">
                {/* The name field keeps its own stacking context so the centred
                    placeholder overlays the input alone, not the toggle beside it. */}
                <View className="flex-1">
                  <TextInput
                    value={title}
                    onChangeText={(v) => {
                      setTitle(v);
                      setIsDirty(true);
                    }}
                    placeholder=""
                    className="rounded-lg border border-slate-500/35 bg-slate-50 px-4 py-3 text-xl text-slate-950"
                    style={{ textAlign: 'center' }}
                  />
                  {!title && (
                    <View
                      pointerEvents="none"
                      className="absolute inset-0 items-center justify-center"
                    >
                      <Text className="text-xl text-slate-400">
                        {t('routineEdit.namePlaceholder')}
                      </Text>
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={toggleMetronome}
                  hitSlop={8}
                  className="p-1.5"
                  accessibilityRole="button"
                  accessibilityLabel={t('routineEdit.metronome')}
                  accessibilityState={{ selected: metronome }}
                >
                  <AppIcon
                    path={metronome ? mdiMetronome : mdiMetronomeTick}
                    size={26}
                    color={metronome ? Colors.primary : Colors.icon}
                  />
                </Pressable>
              </View>
            </View>
          }
          ListFooterComponent={
            <View className="pb-8">
              <View className="items-end">
                <AddButton
                  atIndex={blocks.length}
                  onPress={openAddPicker}
                  label={t('routineEdit.addExercise')}
                />
              </View>
              {validationError && blocks.length > 0 ? (
                <Text className="mt-2 text-xs text-error-800">
                  {validationError === 'pauseAtEnd'
                    ? t('routineEdit.validationNoPause')
                    : t('routineEdit.validationNoBlocks')}
                </Text>
              ) : null}
            </View>
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            flexGrow: 1,
          }}
        />

        {/* Parameter picker modal */}
        <Modal
          visible={picker !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPicker(null)}
        >
          <Pressable
            className="absolute inset-0 bg-slate-950/[0.4]"
            onPress={() => setPicker(null)}
          />
          <View className="m-auto max-h-[60%] w-[280px] overflow-hidden rounded-xl border border-slate-500/35 bg-slate-100">
            <ScrollView>
              {picker?.options.map((opt) => (
                <Pressable
                  key={String(opt.value)}
                  onPress={() => applyPicker(opt.value)}
                  className={`border-b border-slate-500/20 px-5 py-3 active:bg-slate-200 ${opt.value === picker.currentValue ? 'bg-navy-50' : ''}`}
                >
                  <Text
                    className={`text-base ${opt.value === picker.currentValue ? 'font-semibold text-navy-600' : 'text-slate-950'}`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}
