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
import { AppIcon } from '@components/AppIcon';
import { Colors } from '@theme/colors';
import { usePiecesStore } from '@state/piecesStore';

interface FormValues {
  title: string;
  composer: string;
}

function valuesEqual(a: FormValues, b: FormValues) {
  return a.title === b.title && a.composer === b.composer;
}

// Inner form — remounts via key={pieceId} so state initialises from props without an effect.
function PieceEditForm({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const { t } = useTranslation();
  const updatePiece = usePiecesStore((s) => s.updatePiece);

  const initial = useMemo<FormValues>(
    () => ({ title: piece.title, composer: piece.composer ?? '' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentional: capture only at mount; remount via key when piece changes
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isDirty = !valuesEqual(values, initial);
  const busy = saving;

  async function onSave() {
    if (!isDirty) return;
    if (!values.title.trim()) {
      setFormError(t('pieceEdit.titleRequired'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updatePiece(piece.id, {
        title: values.title.trim(),
        composer: values.composer.trim() || null,
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
      {/* Header */}
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="flex-1 text-xl font-bold text-ash-grey-950">{t('pieceEdit.heading')}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <AppIcon path={mdiClose} size={20} color={Colors.tabIconDefault} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="gap-3 pb-2" keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-ash-grey-950">
            {t('pieceEdit.titleLabel')}
          </Text>
          <TextInput
            className="rounded-lg border border-ash-grey-500/35 bg-ash-grey-50 px-3 py-2 text-base text-ash-grey-950"
            value={values.title}
            onChangeText={(v) => setValues((prev) => ({ ...prev, title: v }))}
            placeholder={t('pieceEdit.titlePlaceholder')}
            placeholderTextColor={Colors.tabIconDefault}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {/* Composer */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-ash-grey-950">
            {t('pieceEdit.composerLabel')}
          </Text>
          <TextInput
            className="rounded-lg border border-ash-grey-500/35 bg-ash-grey-50 px-3 py-2 text-base text-ash-grey-950"
            value={values.composer}
            onChangeText={(v) => setValues((prev) => ({ ...prev, composer: v }))}
            placeholder={t('pieceEdit.composerPlaceholder')}
            placeholderTextColor={Colors.tabIconDefault}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {formError ? <Text className="text-sm text-mauve-shadow-800">{formError}</Text> : null}
      </ScrollView>

      {/* Footer */}
      <View className="mt-4">
        <Pressable
          className={`items-center rounded-lg px-5 py-3 ${!isDirty || busy ? 'bg-ash-grey-500/12' : 'bg-seagrass-600'}`}
          onPress={() => void onSave()}
          disabled={!isDirty || busy}
        >
          {saving ? (
            <ActivityIndicator color={Colors.primaryForeground} />
          ) : (
            <Text
              className={`text-base font-semibold ${!isDirty || busy ? 'text-ash-grey-400' : 'text-ash-grey-50'}`}
            >
              {t('common.save')}
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

interface PieceEditModalProps {
  pieceId: string | null;
  onClose: () => void;
}

export function PieceEditModal({ pieceId, onClose }: PieceEditModalProps) {
  const piece = usePiecesStore((s) => (pieceId ? s.piecesById[pieceId] : undefined));

  return (
    <Modal
      visible={pieceId != null}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      supportedOrientations={['landscape']}
    >
      <View className="flex-1 items-center justify-center bg-ash-grey-950/[0.4] p-6">
        {/* Tap-outside to close */}
        <Pressable className="absolute inset-0" onPress={onClose} />

        <View className="max-h-[90%] w-full max-w-[480px] rounded-xl border border-ash-grey-500/35 bg-ash-grey-100 p-5">
          {piece ? (
            <PieceEditForm key={pieceId} piece={piece} onClose={onClose} />
          ) : (
            <ActivityIndicator className="my-6" color={Colors.primary} />
          )}
        </View>
      </View>
    </Modal>
  );
}
