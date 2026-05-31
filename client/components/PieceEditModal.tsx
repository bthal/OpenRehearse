import { mdiClose } from '@mdi/js';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

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
  const updatePiece = usePiecesStore((s) => s.updatePiece);
  const deletePiece = usePiecesStore((s) => s.deletePiece);

  const initial = useMemo<FormValues>(
    () => ({ title: piece.title, composer: piece.composer ?? '' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentional: capture only at mount; remount via key when piece changes
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isDirty = !valuesEqual(values, initial);
  const busy = saving || deleting;

  async function onSave() {
    if (!isDirty) return;
    if (!values.title.trim()) {
      setFormError('Title is required.');
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
      setFormError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (busy) return;
    Alert.alert(
      'Delete piece?',
      `Remove "${piece.title}" from your library? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deletePiece(piece.id);
              onClose();
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      {/* Header */}
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="flex-1 text-xl font-bold text-ash-grey-950">Edit piece</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <AppIcon path={mdiClose} size={20} color={Colors.tabIconDefault} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="gap-3 pb-2" keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-ash-grey-950">
            Title *
          </Text>
          <TextInput
            className="rounded-lg border border-ash-grey-500/35 bg-ash-grey-50 px-3 py-2 text-base text-ash-grey-950"
            value={values.title}
            onChangeText={(t) => setValues((v) => ({ ...v, title: t }))}
            placeholder="Title"
            placeholderTextColor={Colors.tabIconDefault}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {/* Composer */}
        <View className="gap-1">
          <Text className="text-[13px] font-semibold opacity-[0.85] text-ash-grey-950">
            Composer
          </Text>
          <TextInput
            className="rounded-lg border border-ash-grey-500/35 bg-ash-grey-50 px-3 py-2 text-base text-ash-grey-950"
            value={values.composer}
            onChangeText={(t) => setValues((v) => ({ ...v, composer: t }))}
            placeholder="Composer"
            placeholderTextColor={Colors.tabIconDefault}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {formError ? <Text className="text-sm text-mauve-shadow-800">{formError}</Text> : null}
      </ScrollView>

      {/* Footer */}
      <View className="mt-4 flex-row items-center justify-between gap-4">
        <Pressable className="items-center py-3" onPress={confirmDelete} disabled={busy}>
          {deleting ? (
            <ActivityIndicator color={Colors.error} />
          ) : (
            <Text className="text-[15px] font-semibold text-mauve-shadow-800">Delete piece</Text>
          )}
        </Pressable>

        <Pressable
          className={`min-w-[120px] flex-grow items-center rounded-lg px-5 py-3 ${!isDirty || busy ? 'bg-ash-grey-500/12' : 'bg-seagrass-600'}`}
          onPress={() => void onSave()}
          disabled={!isDirty || busy}
        >
          {saving ? (
            <ActivityIndicator color={Colors.primaryForeground} />
          ) : (
            <Text
              className={`text-base font-semibold ${!isDirty || busy ? 'text-ash-grey-400' : 'text-ash-grey-50'}`}
            >
              Save
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
