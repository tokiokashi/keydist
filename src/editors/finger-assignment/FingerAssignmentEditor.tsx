import { useEffect, useMemo, useState } from 'react';
import { PhysicalKeyboard, type PhysicalKeyboardKeyView } from '#ui/keyboard/physical-keyboard.tsx';
import {
  assignColumnFinger,
  assignHomeKey,
  assignKeyFinger,
  assignmentProblems,
  resetToDefaultAssignment,
  shapeColumns,
  shapeKeyIds,
  type AssignmentProblem,
} from '#input/shapes/finger-assignment-edit.ts';
import { FINGER_LABEL, FINGER_SHORT_WITH_HAND } from '#input/shapes/finger-names.ts';
import { buildGeometry, FINGERS, type Finger, type FingerAssignment, type Key, type NonThumb, type PhysicalShape } from '#input/shapes/geometry.ts';
import { keyboardStandardForGeometryId, physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';
import { groupShapes } from '#input/shapes/shape-groups.ts';
import { newId } from '#input/shapes/user-finger-assignments.ts';
import { FINGER_ASSIGNMENT_LABEL } from './label.ts';
import './finger-assignment.css';

/** 新しく作る割り当ての名前。 */
const NEW_ASSIGNMENT_NAME = '新しい指の割り当て';

export interface FingerAssignmentContent {
  readonly keyFinger: FingerAssignment['keyFinger'];
  readonly homeKey: FingerAssignment['homeKey'];
}

export interface FingerAssignmentEditorProps {
  /** 自作の指の割り当て。 */
  readonly assignments: readonly FingerAssignment[];
  /** 保存の読み込みが済むまでは、割り当てが無いように見せない。 */
  readonly ready: boolean;
  /** キーを描く土台にする組み込みの物理配列。 */
  readonly shapes: readonly PhysicalShape[];
  /** 物理配列の規格の既定の指の割り当て。新規作成の元と、既定へ戻す操作の置き換え先になる。 */
  readonly defaultAssignmentOf: (shapeId: string) => FingerAssignment;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCreate: (id: string, name: string, base: FingerAssignment) => void;
  readonly onDuplicate: (sourceId: string, id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onUpdate: (id: string, content: FingerAssignmentContent) => void;
}

/** 選んだ物理配列の上に描くキーと、キーごとの見え方。指が決まっていないキーは「？」で出す。 */
function boardOf(
  shape: PhysicalShape,
  assignment: FingerAssignment,
  fallback: FingerAssignment,
): { readonly keys: readonly Key[]; readonly views: ReadonlyMap<string, PhysicalKeyboardKeyView> } {
  // 図の座標を出すためだけの割り当て。決まっていないキーは既定の指で埋め、ホームが物理配列に無い指は既定のホームにする
  const known = new Set(shapeKeyIds(shape));
  const drawable: FingerAssignment = {
    ...assignment,
    keyFinger: { ...fallback.keyFinger, ...assignment.keyFinger },
    homeKey: Object.fromEntries(
      FINGERS.map((finger) => [finger, known.has(assignment.homeKey[finger]) ? assignment.homeKey[finger] : fallback.homeKey[finger]]),
    ) as Record<NonThumb, string>,
  };
  const keys = buildGeometry(shape, drawable).grid.flat();
  const homes = new Set<string>(FINGERS.map((finger) => assignment.homeKey[finger]));
  const standard = keyboardStandardForGeometryId(shape.id);
  const views = new Map<string, PhysicalKeyboardKeyView>();
  for (const key of keys) {
    const finger = assignment.keyFinger[key.id];
    views.set(key.id, {
      legend: finger === undefined ? '？' : FINGER_SHORT_WITH_HAND[finger],
      secondaryLegend: physicalKeyDisplayLabel(key.id, standard),
      accentSlot: finger === undefined || finger === 'LT' || finger === 'RT' ? undefined : FINGERS.indexOf(finger) + 1,
      home: homes.has(key.id),
      selected: false,
    });
  }
  return { keys, views };
}

/** 測れなくなる・意図と違う可能性のある点の文。 */
function problemText(problem: AssignmentProblem, standard: ReturnType<typeof keyboardStandardForGeometryId>): string {
  const label = (id: string) => physicalKeyDisplayLabel(id, standard);
  switch (problem.kind) {
    case 'unassigned':
      return `指が決まっていないキーがあります（${problem.keyIds.map(label).join('、')}）。この物理配列では、全てのキーに指を決めるまで測れません`;
    case 'home-missing':
      return `${FINGER_LABEL[problem.finger]}のホームキー（${label(problem.keyId)}）が、この物理配列にありません`;
    case 'home-other-finger':
      return `${FINGER_LABEL[problem.finger]}のホームキー（${label(problem.keyId)}）は、${FINGER_LABEL[problem.keyFinger]}のキーです`;
  }
}

function FingerSelect({ value, label, onPick, placeholder }: {
  readonly value: Finger | undefined;
  readonly label: string;
  readonly onPick: (finger: NonThumb) => void;
  readonly placeholder: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => {
        const picked = event.currentTarget.value;
        if (FINGERS.includes(picked as NonThumb)) onPick(picked as NonThumb);
      }}
    >
      <option value="" disabled>{placeholder}</option>
      {FINGERS.map((finger) => <option key={finger} value={finger}>{FINGER_LABEL[finger]}</option>)}
    </select>
  );
}

/**
 * 組み込みの物理配列の上で、自作の指の割り当てを作る・編集する画面。
 * 書き込みは親が渡すコールバックを通す。選んでいる割り当て・物理配列・キーはこの画面の中だけの値で、保存しない。
 */
export function FingerAssignmentEditor({
  assignments,
  ready,
  shapes,
  defaultAssignmentOf,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCreate,
  onDuplicate,
  onRename,
  onUpdate,
}: FingerAssignmentEditorProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [shapeId, setShapeId] = useState(shapes[0]?.id ?? '');
  const [selectedKeyId, setSelectedKeyId] = useState<string | undefined>(undefined);
  const [column, setColumn] = useState(0);
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined);

  const shape = shapes.find((candidate) => candidate.id === shapeId) ?? shapes[0];
  // 選んでいた割り当てが元に戻すなどで無くなった時は、先頭の割り当てに移る
  const assignment = assignments.find((candidate) => candidate.id === selectedId) ?? assignments[0];
  const standard = shape === undefined ? undefined : keyboardStandardForGeometryId(shape.id);
  const columns = useMemo(() => (shape === undefined ? [] : shapeColumns(shape)), [shape]);
  const keyIds = useMemo(() => new Set(shape === undefined ? [] : shapeKeyIds(shape)), [shape]);

  // 別の物理配列へ移った時、その物理配列に無いキーを選んだままにしない
  useEffect(() => {
    if (selectedKeyId !== undefined && !keyIds.has(selectedKeyId)) setSelectedKeyId(undefined);
    if (column >= columns.length) setColumn(0);
  }, [keyIds, columns, selectedKeyId, column]);

  const board = useMemo(
    () => (shape === undefined || assignment === undefined ? undefined : boardOf(shape, assignment, defaultAssignmentOf(shape.id))),
    [shape, assignment, defaultAssignmentOf],
  );
  const problems = useMemo(
    () => (shape === undefined || assignment === undefined ? [] : assignmentProblems(assignment, shape)),
    [shape, assignment],
  );
  const keyViews = useMemo(() => {
    if (board === undefined) return undefined;
    const views = new Map(board.views);
    if (selectedKeyId !== undefined) {
      const view = views.get(selectedKeyId);
      if (view !== undefined) views.set(selectedKeyId, { ...view, selected: true });
    }
    return views;
  }, [board, selectedKeyId]);

  const commit = (next: FingerAssignment) => {
    if (assignment === undefined || next === assignment) return;
    onUpdate(assignment.id, { keyFinger: next.keyFinger, homeKey: next.homeKey });
  };

  const create = () => {
    if (shape === undefined) return;
    const id = newId();
    onCreate(id, NEW_ASSIGNMENT_NAME, defaultAssignmentOf(shape.id));
    setSelectedId(id);
    setNameDraft(undefined);
  };
  const duplicate = () => {
    if (assignment === undefined) return;
    const id = newId();
    onDuplicate(assignment.id, id);
    setSelectedId(id);
    setNameDraft(undefined);
  };
  const commitName = () => {
    if (assignment === undefined || nameDraft === undefined) return;
    const name = nameDraft.trim();
    setNameDraft(undefined);
    if (name !== '' && name !== assignment.name) onRename(assignment.id, name);
  };

  const selectedKeyFinger = assignment !== undefined && selectedKeyId !== undefined ? assignment.keyFinger[selectedKeyId] : undefined;
  const selectedKeyHomeOf = assignment !== undefined && selectedKeyId !== undefined
    ? FINGERS.filter((finger) => assignment.homeKey[finger] === selectedKeyId)
    : [];
  const homeCandidate = selectedKeyFinger !== undefined && selectedKeyFinger !== 'LT' && selectedKeyFinger !== 'RT' ? selectedKeyFinger : undefined;

  return (
    <article className="finger-assignment" data-finger-assignment-editor>
      <h1>{FINGER_ASSIGNMENT_LABEL}</h1>
      <p className="finger-assignment-note">
        物理配列の上で、各キーを担当する指を決めます。作った割り当ては、条件の指の割り当てから選べます。ここでの物理配列の選択は、他の画面の条件を変えません。
      </p>
      <div className="finger-assignment-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>元に戻す</button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>やり直す</button>
      </div>
      {!ready ? null : (
        <>
          <section className="finger-assignment-section" aria-labelledby="finger-assignment-pick">
            <h2 id="finger-assignment-pick">割り当て</h2>
            <div className="finger-assignment-actions">
              {assignment === undefined ? null : (
                <label>
                  編集する割り当て
                  <select value={assignment.id} onChange={(event) => { setSelectedId(event.currentTarget.value); setNameDraft(undefined); }}>
                    {assignments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              )}
              <button type="button" data-finger-assignment-create onClick={create}>新規作成</button>
              <button type="button" data-finger-assignment-duplicate disabled={assignment === undefined} onClick={duplicate}>複製</button>
            </div>
            {shape === undefined ? null : (
              <label className="finger-assignment-shape">
                物理配列
                <select aria-label="物理配列を選ぶ" value={shape.id} onChange={(event) => setShapeId(event.currentTarget.value)}>
                  {groupShapes(shapes).map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      {group.shapes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            {assignment === undefined ? (
              <p className="finger-assignment-note">自作の指の割り当てはありません。選んでいる物理配列の既定の割り当てから作れます。</p>
            ) : (
              <label className="finger-assignment-name">
                名前
                <input
                  type="text"
                  value={nameDraft ?? assignment.name}
                  onChange={(event) => setNameDraft(event.currentTarget.value)}
                  onBlur={commitName}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                />
              </label>
            )}
          </section>

          {assignment === undefined || shape === undefined || board === undefined || keyViews === undefined ? null : (
            <section className="finger-assignment-section" aria-labelledby="finger-assignment-edit">
              <h2 id="finger-assignment-edit">指の割り当て</h2>
              <p className="finger-assignment-note">キーを選ぶと、そのキーの指を決められます。線の色は指を表し、下線のあるキーが指のホームキーです。</p>
              <PhysicalKeyboard
                keys={board.keys}
                keyViews={keyViews}
                geometryId={shape.id}
                ariaLabel={`${assignment.name}の指の割り当て`}
                unit={46}
                operable
                selectedKeyId={selectedKeyId}
                onKeyClick={(key) => setSelectedKeyId(key.id === selectedKeyId ? undefined : key.id)}
                onEscape={() => setSelectedKeyId(undefined)}
              />
              {problems.length === 0 ? null : (
                <ul className="finger-assignment-problems" data-finger-assignment-problems>
                  {problems.map((problem, index) => <li key={index}>{problemText(problem, standard)}</li>)}
                </ul>
              )}

              <div className="finger-assignment-panels">
                <div className="finger-assignment-panel" data-finger-assignment-key-panel>
                  <h3>キー単位</h3>
                  {selectedKeyId === undefined ? (
                    <p className="finger-assignment-note">図のキーを選びます。</p>
                  ) : (
                    <>
                      <p>選んだキー: {physicalKeyDisplayLabel(selectedKeyId, standard)}</p>
                      <FingerSelect
                        value={selectedKeyFinger}
                        label="選んだキーの指"
                        placeholder="指を選ぶ"
                        onPick={(finger) => commit(assignKeyFinger(assignment, selectedKeyId, finger))}
                      />
                      <button
                        type="button"
                        data-finger-assignment-home
                        disabled={homeCandidate === undefined || selectedKeyHomeOf.includes(homeCandidate)}
                        onClick={() => { if (homeCandidate !== undefined) commit(assignHomeKey(assignment, homeCandidate, selectedKeyId)); }}
                      >
                        {homeCandidate === undefined ? 'ホームキーにする' : `${FINGER_LABEL[homeCandidate]}のホームキーにする`}
                      </button>
                    </>
                  )}
                </div>
                <div className="finger-assignment-panel" data-finger-assignment-column-panel>
                  <h3>列の一括</h3>
                  <label>
                    列
                    <select aria-label="列を選ぶ" value={column} onChange={(event) => setColumn(Number(event.currentTarget.value))}>
                      {columns.map((ids, index) => (
                        <option key={index} value={index}>{`${index + 1}列目（${ids.map((id) => physicalKeyDisplayLabel(id, standard)).join(' ')}）`}</option>
                      ))}
                    </select>
                  </label>
                  <FingerSelect
                    value={undefined}
                    label="列の指"
                    placeholder="指を選んで割り当てる"
                    onPick={(finger) => commit(assignColumnFinger(assignment, shape, column, finger))}
                  />
                </div>
              </div>
              <div className="finger-assignment-actions">
                <button
                  type="button"
                  data-finger-assignment-reset
                  onClick={() => commit(resetToDefaultAssignment(assignment, defaultAssignmentOf(shape.id)))}
                >
                  既定へ戻す
                </button>
                <span className="finger-assignment-note">
                  選んでいる物理配列の規格の既定の割り当てに、全てのキーとホームキーを置き換えます。この物理配列に無いキーの割り当ても消えます。
                </span>
              </div>
            </section>
          )}
        </>
      )}
    </article>
  );
}
