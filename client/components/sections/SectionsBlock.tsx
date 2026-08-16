import { mdiArrowULeftTop } from '@mdi/js';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppIcon } from '@components/AppIcon';
import { pieceRepository } from '@data/index';
import type { Piece } from '@domain/piece';
import { printedNumberAt, resolveMeasureInput } from '@domain/measureMap';
import {
  boundaryRange,
  deleteSection,
  normaliseSections,
  recolorSection,
  refreshPrintedNumbers,
  commitName,
  sectionSpans,
  sectionsFromXml,
  renameSection,
  setBoundary,
  splitSection,
} from '@domain/sectionEditing';
import type { Section } from '@domain/sections';
import { Colors, SectionColors } from '@theme/colors';
import { SectionRow, type RowPrompt } from './SectionRow';
import { useMeasureMap } from './useMeasureMap';

/**
 * The collapsible "Sections" block inside the piece edit modal.
 *
 * Owns the draft section list and, separately, the text currently being typed into the
 * measure fields. Keeping those apart is what makes the whole thing safe: the draft is
 * always a valid tiling, and a half-typed or nonsense measure number lives only in
 * `edits` until it resolves. There is no code path that can put the section list into a
 * broken state, so nothing downstream needs to defend against one.
 */

/** `${index}:from` / `${index}:to` — which field holds uncommitted text. */
type EditKey = string;

export function SectionsBlock({
  piece,
  sections,
  onChange,
  onValidityChange,
}: {
  piece: Piece;
  sections: Section[];
  onChange: (next: Section[]) => void;
  /** Reports uncommitted, unresolvable text so the modal can gate Save. */
  onValidityChange: (hasPendingInvalid: boolean) => void;
}) {
  const { t } = useTranslation();
  const [edits, setEdits] = useState<Record<EditKey, string>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // The whole list, snapshotted when a row opens. Cancel restores it wholesale rather
  // than restoring one section, because moving a junction changes two of them.
  const [snapshot, setSnapshot] = useState<Section[] | null>(null);
  const [prompt, setPrompt] = useState<RowPrompt>('none');
  /** Row whose "from" field should take focus — the section a split just created. */
  const [focusFrom, setFocusFrom] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);

  // Always on: the block is not collapsible, so the score is read when the modal opens.
  const mapState = useMeasureMap(piece, true);
  const map = mapState.status === 'ready' ? mapState.map : null;

  // Two repairs that can only be made once the score has been read. Printed numbers
  // cached on a section can be stale from an older export, and the section that
  // normalisation synthesizes has none at all; separately, a stored boundary can sit
  // past the end of the score — which yields a backwards span — and only the measure
  // count can catch that.
  useEffect(() => {
    if (!map) return;
    const repaired = refreshPrintedNumbers(
      normaliseSections(sections, SectionColors, map.count),
      (i) => printedNumberAt(map, i),
    );
    const changed =
      repaired.length !== sections.length || repaired.some((s, i) => s !== sections[i]);
    if (changed) onChange(repaired);
    // Only when the map arrives; re-running on every section change would fight editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    onValidityChange(Object.keys(messages).length > 0);
  }, [messages, onValidityChange]);

  const canEditBounds = map !== null;
  // Without a readable score the count is unknown; the last start + 1 is the only floor
  // that keeps the derived spans sane, and bounds editing is disabled anyway.
  const measureCount = map?.count ?? (sections[sections.length - 1]?.startMeasureIndex ?? 0) + 1;
  const spans = sectionSpans(sections, measureCount);

  const display = useCallback(
    (index: number) => (map ? (printedNumberAt(map, index) ?? '') : ''),
    [map],
  );

  /** "Measures 5–8", or "Measure 5" when the section is a single bar. */
  const rangeLabel = useCallback(
    (span: { startIndex: number; endIndex: number; measureCount: number }) => {
      const from = display(span.startIndex);
      const to = display(span.endIndex);
      if (from === '' && to === '') return '';
      return span.measureCount === 1
        ? t('pieceEdit.sections.rangeSingle', { from })
        : t('pieceEdit.sections.range', { from, to });
    },
    [display, t],
  );

  const nameOf = useCallback(
    (index: number) => sections[index]?.name ?? t('pieceEdit.sections.unnamed', { n: index + 1 }),
    [sections, t],
  );

  const clearMessage = (index: number) =>
    setMessages((prev) => {
      if (!(index in prev)) return prev;
      const { [index]: _gone, ...rest } = prev;
      return rest;
    });

  /** Applies a committed junction move, or records why it could not be applied. */
  function commitJunction(rowIndex: number, junction: number, text: string, isEnd: boolean) {
    if (!map) return;
    const range = boundaryRange(sections, junction, measureCount);
    if (!range) return;
    // An end field names the measure before the junction, so its legal range is the
    // junction's shifted down by one. Same primitive either way.
    const target = isEnd ? { min: range.min - 1, max: range.max - 1 } : range;

    const resolution = resolveMeasureInput(map, text, target);
    if (!resolution.ok) {
      setMessages((prev) => ({
        ...prev,
        [rowIndex]:
          resolution.reason === 'outOfRange'
            ? t('pieceEdit.sections.measureOutOfRange', {
                min: display(target.min),
                max: display(target.max),
              })
            : t('pieceEdit.sections.measureUnknown', { number: text.trim() }),
      }));
      return;
    }

    clearMessage(rowIndex);
    // Clear every field, not just this one: a junction move changes the neighbouring
    // row's displayed number too, and the user may have half-typed both sides.
    setEdits({});
    onChange(
      setBoundary(
        sections,
        junction,
        isEnd ? resolution.index + 1 : resolution.index,
        measureCount,
        (i) => printedNumberAt(map, i),
      ),
    );
  }

  function commitEmpty(rowIndex: number, key: EditKey) {
    // Reverting to the canonical number is friendlier than an error for the very common
    // "cleared the field and tapped away" case.
    setEdits((prev) => {
      const { [key]: _gone, ...rest } = prev;
      return rest;
    });
    clearMessage(rowIndex);
  }

  function beginEdit(index: number) {
    setSnapshot(sections);
    setEditingIndex(index);
    setPrompt('none');
    setFocusFrom(null);
    setEdits({});
    setMessages({});
  }

  function endEdit() {
    setEditingIndex(null);
    setSnapshot(null);
    setPrompt('none');
    setFocusFrom(null);
    setEdits({});
    setMessages({});
  }

  function cancelEdit() {
    if (snapshot) onChange(snapshot);
    endEdit();
  }

  /**
   * Deleting has to hand the measures somewhere, but at the ends of the piece there is
   * only one place they can go — so asking would be a question with one answer.
   */
  function requestDelete(index: number) {
    if (sections.length <= 1) return;
    if (index === 0) return remove(index, 'next');
    if (index === sections.length - 1) return remove(index, 'previous');
    setPrompt((prev) => (prev === 'delete' ? 'none' : 'delete'));
  }

  /**
   * Splits off the mother section's last measure and drops the user straight into the
   * new section's "from" field, cleared.
   *
   * Asking "where?" first and then creating was a question posed before the user could
   * see what they were answering about. Creating immediately makes the split visible
   * and turns the same decision into an edit of a real row — and because the field
   * starts empty, leaving it alone simply keeps the one-measure section.
   */
  function doSplit(index: number) {
    if (!map) return;
    const span = spans[index]!;
    if (span.measureCount < 2) return;

    onChange(
      splitSection(sections, index, span.endIndex, measureCount, SectionColors, (i) =>
        printedNumberAt(map, i),
      ),
    );
    const created = index + 1;
    setEditingIndex(created);
    setEdits({ [`${created}:from`]: '' });
    setMessages({});
    setPrompt('none');
    setFocusFrom(created);
  }

  function remove(index: number, absorb: 'previous' | 'next') {
    onChange(deleteSection(sections, index, absorb));
    endEdit();
  }

  async function onReset() {
    setResetting(true);
    try {
      const detected = sectionsFromXml(await pieceRepository.readXml(piece), SectionColors);
      Alert.alert(
        t('pieceEdit.sections.resetTitle'),
        // The count goes in the message because detection can decline entirely, and
        // "this will leave you with one section" is the part worth knowing beforehand.
        t('pieceEdit.sections.resetMessage', { count: detected.length }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('pieceEdit.sections.resetConfirm'),
            style: 'destructive',
            onPress: () => {
              endEdit();
              onChange(detected);
            },
          },
        ],
      );
    } catch {
      // Unreadable file: nothing to reset to, and the block already explains why.
    } finally {
      setResetting(false);
    }
  }

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-[13px] font-semibold text-slate-950 opacity-[0.85]">
            {t('pieceEdit.sections.heading')}
          </Text>
          {/* One string, not three children: split text nodes are read out in
              fragments by a screen reader and cannot be matched as a phrase. */}
          <Text className="text-[13px] text-slate-500">
            {`• ${t('pieceEdit.sections.count', { count: sections.length })}`}
          </Text>
        </View>

        {canEditBounds ? (
          <Pressable
            onPress={() => void onReset()}
            disabled={resetting}
            accessibilityRole="button"
            accessibilityLabel={t('pieceEdit.sections.reset')}
            className="flex-row items-center gap-1 rounded-lg border border-slate-500/50 bg-slate-50 px-3 py-1.5"
          >
            <AppIcon path={mdiArrowULeftTop} size={15} color={Colors.text} />
            <Text className="text-[12px] font-semibold text-slate-950">
              {t('pieceEdit.sections.reset')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View>
        {mapState.status === 'loading' ? (
          <View className="flex-row items-center gap-2 py-3">
            <ActivityIndicator color={Colors.primary} />
            <Text className="text-[12px] text-slate-500">{t('pieceEdit.sections.loading')}</Text>
          </View>
        ) : null}

        {mapState.status === 'unavailable' ? (
          <Text className="py-2 text-[12px] text-slate-500">
            {t('pieceEdit.sections.unreadable')}
          </Text>
        ) : null}

        <View className="gap-2 pb-1">
          {sections.map((section, index) => {
            const span = spans[index]!;
            const isFirst = index === 0;
            const isLast = index === sections.length - 1;
            return (
              <SectionRow
                key={`${index}:${section.startMeasureIndex}`}
                index={index}
                name={section.name}
                color={section.color ?? SectionColors[0]!}
                fromValue={edits[`${index}:from`] ?? display(span.startIndex)}
                toValue={edits[`${index}:to`] ?? display(span.endIndex)}
                fromError={messages[index] !== undefined && edits[`${index}:from`] !== undefined}
                toError={messages[index] !== undefined && edits[`${index}:to`] !== undefined}
                message={messages[index] ?? null}
                canEditFrom={canEditBounds && !isFirst}
                canEditTo={canEditBounds && !isLast}
                canSplit={canEditBounds && span.measureCount > 1}
                canDelete={sections.length > 1}
                editing={editingIndex === index}
                prompt={editingIndex === index ? prompt : 'none'}
                previousName={isFirst ? null : nameOf(index - 1)}
                nextName={isLast ? null : nameOf(index + 1)}
                focusFrom={focusFrom === index}
                showDivider={!isLast}
                rangeLabel={rangeLabel(span)}
                onEdit={() => beginEdit(index)}
                onCancel={cancelEdit}
                onSave={endEdit}
                onChangeName={(v) => onChange(renameSection(sections, index, v))}
                onCommitName={() => onChange(commitName(sections, index))}
                onChangeFrom={(v) => setEdits((p) => ({ ...p, [`${index}:from`]: v }))}
                onChangeTo={(v) => setEdits((p) => ({ ...p, [`${index}:to`]: v }))}
                onCommitFrom={() => {
                  const text = edits[`${index}:from`];
                  if (text === undefined) return;
                  if (text.trim() === '') return commitEmpty(index, `${index}:from`);
                  commitJunction(index, index, text, false);
                }}
                onCommitTo={() => {
                  const text = edits[`${index}:to`];
                  if (text === undefined) return;
                  if (text.trim() === '') return commitEmpty(index, `${index}:to`);
                  commitJunction(index, index + 1, text, true);
                }}
                onPickColor={(hex) => onChange(recolorSection(sections, index, hex))}
                onSplit={() => doSplit(index)}
                onRequestDelete={() => requestDelete(index)}
                onDelete={(absorb) => remove(index, absorb)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}
