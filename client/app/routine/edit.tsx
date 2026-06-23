import { mdiArrowLeft, mdiDelete, mdiPlus, mdiSwapVertical } from '@mdi/js';
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
  DEFAULT_WARMUP_BPM,
  WARMUP_BPMS,
  WARMUP_KEYS,
  WARMUP_OCTAVES,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpOctaves,
} from '@domain/warmup';
import { Colors } from '@theme/colors';
import { useRoutinesStore } from '@state/routinesStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockWithKey = RoutineBlock & { _key: string };

type PickerType = 'key' | 'bpm' | 'hand' | 'octaves' | 'measures' | 'addType' | 'addMeasures';

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

function defaultExerciseBlock(type: 'hanon' | 'scales' | 'drill45'): ExerciseBlock {
  return {
    type,
    pitchClass: 0,
    mode: 'major',
    hand: 'both',
    bpm: DEFAULT_WARMUP_BPM,
    octaves: 1,
  };
}

function keyLabel(pitchClass: number, mode: 'major' | 'minor', t: TFn): string {
  const label =
    WARMUP_KEYS.find((k) => k.pitchClass === pitchClass && k.mode === mode)?.label ?? 'C';
  return (
    label.replace(/m$/, '') +
    ' ' +
    t(mode === 'major' ? 'routineEdit.modeMajor' : 'routineEdit.modeMinor')
  );
}

function octavesLabel(octaves: WarmUpOctaves, t: TFn): string {
  return t('routineEdit.octave', { count: octaves });
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
      className="my-2 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 active:bg-ash-grey-500/10"
    >
      <AppIcon path={mdiPlus} size={20} color={Colors.primary} />
      <Text className="text-base font-semibold text-seagrass-600">{label}</Text>
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
      className="my-2 flex-row items-center gap-1.5 rounded-xl px-3 py-3.5 active:bg-ash-grey-500/10"
    >
      <AppIcon path={mdiSwapVertical} size={20} color="#111827" />
      <Text className="text-sm font-semibold text-ash-grey-950">{label}</Text>
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
      className={`rounded-lg border px-4 py-2 active:bg-ash-grey-100 ${active ? 'border-seagrass-600 bg-seagrass-50' : 'border-ash-grey-500/35 bg-white'}`}
    >
      <Text
        className={`text-base font-semibold ${active ? 'text-seagrass-600' : 'text-ash-grey-950'}`}
      >
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
      createdAt: existingRoutine?.createdAt ?? new Date().toISOString(),
    });
    router.back();
  }

  // ─── Block mutations ───────────────────────────────────────────────────────

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
        { label: t('routineEdit.addExerciseHanon'), value: 'hanon' },
        { label: t('routineEdit.addExerciseScales'), value: 'scales' },
        { label: t('routineEdit.addExerciseDrill45'), value: 'drill45' },
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
    } else if (type === 'bpm' && block.type !== 'pause') {
      options = WARMUP_BPMS.map((b) => ({ label: String(b), value: b }));
      currentValue = block.bpm;
    } else if (type === 'hand' && block.type !== 'pause') {
      options = HAND_OPTIONS.map((h) => ({ label: t(h.tKey), value: h.value }));
      currentValue = block.hand;
    } else if (type === 'octaves' && block.type !== 'pause') {
      options = WARMUP_OCTAVES.map((o) => ({ label: octavesLabel(o, t), value: o }));
      currentValue = block.octaves;
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
      if (value === 'hanon' || value === 'scales' || value === 'drill45') {
        insertBlock(atIndex!, defaultExerciseBlock(value));
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
    } else if (type === 'bpm') {
      patchBlock(blockKey!, { bpm: value as WarmUpBpm });
    } else if (type === 'hand') {
      patchBlock(blockKey!, { hand: value as WarmUpHand });
    } else if (type === 'octaves') {
      patchBlock(blockKey!, { octaves: value as WarmUpOctaves });
    }
    setPicker(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ orientation: 'portrait', headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ash-grey-50">
        {/* Header */}
        <View className="flex-row items-center border-b border-ash-grey-500/35 px-4 py-5">
          <Pressable onPress={handleBack} hitSlop={12} className="mr-3">
            <AppIcon path={mdiArrowLeft} size={24} color="#374151" />
          </Pressable>
          <Text className="flex-1 text-lg font-semibold text-ash-grey-950">
            {isEditing ? t('routineEdit.editTitle') : t('routineEdit.newTitle')}
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            className={`rounded-lg px-4 py-2 ${canSave ? 'bg-seagrass-600' : 'bg-ash-grey-500/12'}`}
          >
            <Text className={`font-semibold ${canSave ? 'text-white' : 'text-ash-grey-400'}`}>
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
              <View className="mb-1 rounded-xl border border-ash-grey-500/35 bg-white p-4">
                <View className="flex-row items-stretch">
                  {/* Left: delete button centered vertically */}
                  <View className="mr-4 items-center justify-center border-r border-ash-grey-500/20 pr-4">
                    <Pressable onPress={() => deleteBlock(block._key)} hitSlop={8} className="p-1">
                      <AppIcon path={mdiDelete} size={20} color={Colors.destructive} />
                    </Pressable>
                  </View>

                  {/* Right: title (centered) + parameter pills */}
                  <View className="flex-1">
                    <Text className="text-center text-lg font-semibold text-ash-grey-950">
                      {block.type === 'hanon'
                        ? t('routineEdit.addExerciseHanon')
                        : block.type === 'scales'
                          ? t('routineEdit.addExerciseScales')
                          : block.type === 'drill45'
                            ? t('routineEdit.addExerciseDrill45')
                            : t('routineEdit.addExercisePause')}
                    </Text>

                    {/* Parameter pills */}
                    {block.type !== 'pause' ? (
                      <View className="mt-2 flex-row flex-wrap gap-2">
                        {block.type !== 'drill45' && (
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
                        {block.type !== 'drill45' && (
                          <Pill
                            label={octavesLabel(block.octaves, t)}
                            onPress={() => openPicker(block._key, 'octaves', block)}
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
              <View className="mb-4 mx-6">
                <TextInput
                  value={title}
                  onChangeText={(v) => {
                    setTitle(v);
                    setIsDirty(true);
                  }}
                  placeholder=""
                  className="rounded-lg border border-ash-grey-500/35 bg-ash-grey-50 px-4 py-3 text-xl text-ash-grey-950"
                  style={{ textAlign: 'center' }}
                />
                {!title && (
                  <View
                    pointerEvents="none"
                    className="absolute inset-0 items-center justify-center"
                  >
                    <Text className="text-xl text-ash-grey-400">
                      {t('routineEdit.namePlaceholder')}
                    </Text>
                  </View>
                )}
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
                <Text className="mt-2 text-xs text-mauve-shadow-800">
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
            className="absolute inset-0 bg-ash-grey-950/[0.4]"
            onPress={() => setPicker(null)}
          />
          <View className="m-auto max-h-[60%] w-[280px] overflow-hidden rounded-xl border border-ash-grey-500/35 bg-ash-grey-100">
            <ScrollView>
              {picker?.options.map((opt) => (
                <Pressable
                  key={String(opt.value)}
                  onPress={() => applyPicker(opt.value)}
                  className={`border-b border-ash-grey-500/20 px-5 py-3 active:bg-ash-grey-200 ${opt.value === picker.currentValue ? 'bg-seagrass-50' : ''}`}
                >
                  <Text
                    className={`text-base ${opt.value === picker.currentValue ? 'font-semibold text-seagrass-600' : 'text-ash-grey-950'}`}
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
