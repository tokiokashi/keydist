import { useEffect, useMemo, useState } from 'react';
import { PhysicalKeyboard, type PhysicalKeyboardKeyView } from '#ui/keyboard/physical-keyboard.tsx';
import {
  addKeyToFinger,
  assignColumnFinger,
  assignHomeKey,
  assignmentProblems,
  nonThumbOwnersOf,
  ownerChangeBlock,
  type OwnerChangeBlock,
  resetToDefaultAssignment,
  setBaseFinger,
  shapeColumns,
  shapeKeyIds,
  toggleKeyOfFinger,
  type AssignmentProblem,
} from '#input/shapes/finger-assignment-edit.ts';
import { FINGER_LABEL, FINGER_SHORT_WITH_HAND } from '#input/shapes/finger-names.ts';
import {
  ALL_FINGERS,
  buildGeometry,
  FINGERS,
  keyOwners,
  makeFingerAssignment,
  type Finger,
  type FingerAssignment,
  type Key,
  type NonThumb,
  type PhysicalShape,
} from '#input/shapes/geometry.ts';
import { keyboardStandardForGeometryId, physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';
import { groupShapes } from '#input/shapes/shape-groups.ts';
import { newId } from '#input/shapes/user-finger-assignments.ts';
import { fingerBands, fingerTone } from './finger-bands.ts';
import { FINGER_ASSIGNMENT_LABEL } from './label.ts';
import './finger-assignment.css';
import { useHistoryShortcuts } from '#ui/primitives/use-history-shortcuts.ts';

/** 新しく作る割り当ての名前。 */
const NEW_ASSIGNMENT_NAME = '新しい指の割り当て';

export interface FingerAssignmentContent {
  readonly baseFinger: FingerAssignment['baseFinger'];
  readonly fingerKeys: FingerAssignment['fingerKeys'];
  readonly homeKey: FingerAssignment['homeKey'];
}

export interface FingerAssignmentEditorProps {
  /** 自作の指の割り当て。 */
  readonly assignments: readonly FingerAssignment[];
  /** 組み込みの指の割り当て。図で見られるが、編集はできない（複製して編集する）。 */
  readonly builtins: readonly FingerAssignment[];
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

/** 担当する指の名前を、読点でつないだ文にする。 */
const fingerNames = (fingers: readonly Finger[]): string => fingers.map((finger) => FINGER_LABEL[finger]).join('、');

/**
 * 選んだ物理配列の上に描くキーと、キーごとの見え方。キー全体を基本の指の色で塗り、追加の担当の指を縁の帯で示す。
 * 指が決まっていないキーは「？」で出す。
 */
function boardOf(
  shape: PhysicalShape,
  assignment: FingerAssignment,
  fallback: FingerAssignment,
): { readonly keys: readonly Key[]; readonly views: ReadonlyMap<string, PhysicalKeyboardKeyView> } {
  // 図の座標を出すためだけの割り当て。決まっていないキーは既定の指で埋め、ホームが物理配列に無い指は既定のホームにする
  const known = new Set(shapeKeyIds(shape));
  const baseFinger = { ...fallback.baseFinger, ...assignment.baseFinger };
  const homeKey = Object.fromEntries(
    FINGERS.map((finger) => [finger, known.has(assignment.homeKey[finger]) ? assignment.homeKey[finger] : fallback.homeKey[finger]]),
  ) as Record<NonThumb, string>;
  // 図の座標を出すためだけなので、ホームキーはその指の担当に含めて、担当の不整合で図が描けなくなるのを避ける
  const homeExtra = Object.fromEntries(FINGERS.map((finger) => [homeKey[finger], [finger]]));
  const drawable = makeFingerAssignment(assignment.id, assignment.name, baseFinger, homeKey, homeExtra);
  const keys = buildGeometry(shape, drawable).grid.flat();
  const homes = new Set<string>(FINGERS.map((finger) => assignment.homeKey[finger]));
  const standard = keyboardStandardForGeometryId(shape.id);
  const views = new Map<string, PhysicalKeyboardKeyView>();
  for (const key of keys) {
    const base = assignment.baseFinger[key.id];
    const owners = keyOwners(assignment, key.id);
    views.set(key.id, {
      legend: base === undefined ? '？' : FINGER_SHORT_WITH_HAND[base],
      secondaryLegend: physicalKeyDisplayLabel(key.id, standard),
      fillTone: base === undefined ? undefined : fingerTone(base),
      bands: base === undefined ? undefined : fingerBands(base, owners),
      description: base !== undefined && owners.length > 1 ? `基本の指は${FINGER_LABEL[base]}。担当する指は${fingerNames(owners)}` : undefined,
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
      return `${FINGER_LABEL[problem.finger]}のホームキー（${label(problem.keyId)}）は、${FINGER_LABEL[problem.finger]}の担当ではありません。ホームキーを、その指が担当するキーにするまで測れません`;
  }
}

/** 担当を足し外しできない理由の、チェックのそばに出す短い文。 */
const BLOCK_HINT: Record<OwnerChangeBlock, string> = {
  'last-non-thumb': '別の指にチェックを入れてから外せます',
  'thumb-needs-base': '親指は、基本の指のあるキーだけを担当できます',
};

function FingerSelect({
  value,
  label,
  onPick,
  placeholder,
  options = FINGERS,
}: {
  readonly value: Finger | undefined;
  readonly options?: readonly NonThumb[];
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
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((finger) => (
        <option key={finger} value={finger}>
          {FINGER_LABEL[finger]}
        </option>
      ))}
    </select>
  );
}

/** 図の色と指の対応。 */
function FingerLegend() {
  return (
    <ul className="finger-assignment-legend" aria-label="指の色">
      {FINGERS.map((finger) => (
        <li key={finger} data-tone={fingerTone(finger)}>
          {FINGER_LABEL[finger]}
        </li>
      ))}
      <li data-tone="muted">親指（下端の帯）</li>
    </ul>
  );
}

/**
 * 組み込みの物理配列の上で、指の割り当てを見る・作る・編集する画面。
 * 組み込みの割り当ては同じ図で見られるが編集できず、複製して自作として編集する。
 * 書き込みは親が渡すコールバックを通す。選んでいる割り当て・物理配列・キーはこの画面の中だけの値で、保存しない。
 */
export function FingerAssignmentEditor({
  assignments,
  builtins,
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
  useHistoryShortcuts({ canUndo, canRedo, undo: onUndo, redo: onRedo });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [shapeId, setShapeId] = useState(shapes[0]?.id ?? '');
  const [selectedKeyId, setSelectedKeyId] = useState<string | undefined>(undefined);
  const [column, setColumn] = useState(0);
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined);
  /** 指を選んで担当するキーを足す・外す操作の、選んでいる指。選んでいない間は、図のキーを押すとキーを選ぶ。 */
  const [editingFinger, setEditingFinger] = useState<Finger | undefined>(undefined);
  /** 指単位で図のキーを押した時に、担当を変えられなかった理由。次の操作か、割り当てが替わると消える。 */
  const [fingerNotice, setFingerNotice] = useState<string | undefined>(undefined);

  const shape = shapes.find((candidate) => candidate.id === shapeId) ?? shapes[0];
  // 選んでいた割り当てが元に戻すなどで無くなった時は、先頭の自作（無ければ先頭の組み込み）に移る
  const assignment =
    assignments.find((candidate) => candidate.id === selectedId) ??
    builtins.find((candidate) => candidate.id === selectedId) ??
    assignments[0] ??
    builtins[0];
  const editable = assignment !== undefined && assignments.some((candidate) => candidate.id === assignment.id);
  const standard = shape === undefined ? undefined : keyboardStandardForGeometryId(shape.id);
  const columns = useMemo(() => (shape === undefined ? [] : shapeColumns(shape)), [shape]);
  const keyIds = useMemo(() => new Set(shape === undefined ? [] : shapeKeyIds(shape)), [shape]);

  // 別の物理配列へ移った時、その物理配列に無いキーを選んだままにしない
  useEffect(() => {
    if (selectedKeyId !== undefined && !keyIds.has(selectedKeyId)) setSelectedKeyId(undefined);
    if (column >= columns.length) setColumn(0);
  }, [keyIds, columns, selectedKeyId, column]);

  useEffect(() => {
    setFingerNotice(undefined);
  }, [assignment, editingFinger]);

  const board = useMemo(
    () => (shape === undefined || assignment === undefined ? undefined : boardOf(shape, assignment, defaultAssignmentOf(shape.id))),
    [shape, assignment, defaultAssignmentOf],
  );
  const problems = useMemo(() => (shape === undefined || assignment === undefined ? [] : assignmentProblems(assignment, shape)), [shape, assignment]);
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
    if (assignment === undefined || !editable || next === assignment) return;
    onUpdate(assignment.id, { baseFinger: next.baseFinger, fingerKeys: next.fingerKeys, homeKey: next.homeKey });
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
    if (editable) onDuplicate(assignment.id, id);
    else onCreate(id, `${assignment.name}のコピー`, assignment);
    setSelectedId(id);
    setNameDraft(undefined);
  };
  const commitName = () => {
    if (assignment === undefined || !editable || nameDraft === undefined) return;
    const name = nameDraft.trim();
    setNameDraft(undefined);
    if (name !== '' && name !== assignment.name) onRename(assignment.id, name);
  };

  const selectedKeyBase = assignment !== undefined && selectedKeyId !== undefined ? assignment.baseFinger[selectedKeyId] : undefined;
  const selectedKeyOwners = assignment !== undefined && selectedKeyId !== undefined ? keyOwners(assignment, selectedKeyId) : [];
  const selectedKeyNonThumbOwners = assignment !== undefined && selectedKeyId !== undefined ? nonThumbOwnersOf(assignment, selectedKeyId) : [];
  const keyLabelOf = (id: string) => physicalKeyDisplayLabel(id, standard);
  const editingFingerKeys =
    assignment !== undefined && editingFinger !== undefined ? assignment.fingerKeys[editingFinger].filter((id) => keyIds.has(id)) : [];

  const blockReason = (block: OwnerChangeBlock, fingerLabel: string) =>
    block === 'last-non-thumb'
      ? `${fingerLabel}は親指以外の最後の担当です。別の指の担当に加えてから外してください`
      : '基本の指が決まっていないので、親指は担当できません。親指以外の指の担当に加えてください';

  const onKeyClick = (key: Key) => {
    if (assignment !== undefined && editable && editingFinger !== undefined) {
      const block = ownerChangeBlock(assignment, key.id, editingFinger);
      if (block !== undefined) {
        setFingerNotice(`${keyLabelOf(key.id)}: ${blockReason(block, FINGER_LABEL[editingFinger])}`);
        return;
      }
      setFingerNotice(undefined);
      commit(toggleKeyOfFinger(assignment, key.id, editingFinger));
      return;
    }
    setSelectedKeyId(key.id === selectedKeyId ? undefined : key.id);
  };

  return (
    <article className="finger-assignment" data-finger-assignment-editor>
      <h1>{FINGER_ASSIGNMENT_LABEL}</h1>
      <p className="finger-assignment-note">
        物理配列の上で、指ごとに担当するキーを決めます。1つのキーを複数の指が担当でき、どの指で打つかは、測る時に先読みの範囲で自動で選ばれます。作った割り当ては、条件の指の割り当てから選べます。ここでの物理配列の選択は、他の画面の条件を変えません。
      </p>
      <div className="finger-assignment-toolbar">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          元に戻す
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>
          やり直す
        </button>
      </div>
      {!ready ? null : (
        <>
          <section className="finger-assignment-section" aria-labelledby="finger-assignment-pick">
            <h2 id="finger-assignment-pick">割り当て</h2>
            <div className="finger-assignment-actions">
              {assignment === undefined ? null : (
                <label>
                  割り当てを選ぶ
                  <select
                    value={assignment.id}
                    onChange={(event) => {
                      setSelectedId(event.currentTarget.value);
                      setNameDraft(undefined);
                      setEditingFinger(undefined);
                    }}
                  >
                    {assignments.length === 0 ? null : (
                      <optgroup label="自作">
                        {assignments.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="組み込み">
                      {builtins.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
              )}
              <button type="button" data-finger-assignment-create onClick={create}>
                新規作成
              </button>
              <button type="button" data-finger-assignment-duplicate disabled={assignment === undefined} onClick={duplicate}>
                複製
              </button>
            </div>
            {shape === undefined ? null : (
              <label className="finger-assignment-shape">
                物理配列
                <select aria-label="物理配列を選ぶ" value={shape.id} onChange={(event) => setShapeId(event.currentTarget.value)}>
                  {groupShapes(shapes).map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      {group.shapes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            {assignment === undefined ? null : editable ? (
              <label className="finger-assignment-name">
                名前
                <input
                  type="text"
                  value={nameDraft ?? assignment.name}
                  onChange={(event) => setNameDraft(event.currentTarget.value)}
                  onBlur={commitName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </label>
            ) : (
              <p className="finger-assignment-note" data-finger-assignment-readonly>
                組み込みの割り当てです。編集はできません。複製すると、自作の割り当てとして編集できます。
              </p>
            )}
            {assignments.length === 0 ? (
              <p className="finger-assignment-note">自作の指の割り当てはありません。新規作成では、選んでいる物理配列の既定の割り当てから作れます。</p>
            ) : null}
          </section>

          {assignment === undefined || shape === undefined || board === undefined || keyViews === undefined ? null : (
            <section className="finger-assignment-section" aria-labelledby="finger-assignment-edit">
              <h2 id="finger-assignment-edit">指の割り当て</h2>
              <p className="finger-assignment-note">
                {editable
                  ? 'キーを選ぶと、そのキーの担当する指を決められます。担当する親指以外の指が複数ある時は、基本の指を選べます。'
                  : 'キーを選ぶと、そのキーの基本の指と担当する指を見られます。'}
                キーの色は基本の指を表します。複数の指が担当するキーは、追加で担当する指を縁の帯で示します。手の並びで基本の指より左の指は左端、右の指は右端、親指は下端です。下線のあるキーが指のホームキーです。
              </p>
              <FingerLegend />
              <PhysicalKeyboard
                keys={board.keys}
                keyViews={keyViews}
                geometryId={shape.id}
                ariaLabel={`${assignment.name}の指の割り当て`}
                unit={46}
                operable
                selectedKeyId={selectedKeyId}
                onKeyClick={onKeyClick}
                onEscape={() => {
                  setSelectedKeyId(undefined);
                  setEditingFinger(undefined);
                }}
              />
              {problems.length === 0 ? null : (
                <ul className="finger-assignment-problems" data-finger-assignment-problems>
                  {problems.map((problem, index) => (
                    <li key={index}>
                      <span>{problemText(problem, standard)}</span>
                      {problem.kind === 'home-other-finger' && editable ? (
                        <button
                          type="button"
                          data-finger-assignment-fix-home={problem.finger}
                          onClick={() => commit(addKeyToFinger(assignment, problem.keyId, problem.finger))}
                        >
                          {`${keyLabelOf(problem.keyId)}を${FINGER_LABEL[problem.finger]}の担当にする`}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <div className="finger-assignment-panels">
                <div className="finger-assignment-panel" data-finger-assignment-key-panel>
                  <h3>キー単位</h3>
                  {selectedKeyId === undefined ? (
                    <p className="finger-assignment-note">図のキーを選びます。</p>
                  ) : !editable ? (
                    <>
                      <p>選んだキー: {keyLabelOf(selectedKeyId)}</p>
                      <p>基本の指: {selectedKeyBase === undefined ? '決まっていません' : FINGER_LABEL[selectedKeyBase]}</p>
                      <p>担当する指: {selectedKeyOwners.length === 0 ? 'なし' : fingerNames(selectedKeyOwners)}</p>
                    </>
                  ) : (
                    <>
                      <p>選んだキー: {keyLabelOf(selectedKeyId)}</p>
                      {selectedKeyNonThumbOwners.length >= 2 ? (
                        <label>
                          基本の指
                          <FingerSelect
                            value={selectedKeyBase}
                            label="選んだキーの基本の指"
                            placeholder="指を選ぶ"
                            options={selectedKeyNonThumbOwners}
                            onPick={(finger) => commit(setBaseFinger(assignment, selectedKeyId, finger))}
                          />
                        </label>
                      ) : selectedKeyNonThumbOwners.length === 1 && selectedKeyBase !== undefined ? (
                        <p data-finger-assignment-base-note>基本の指: {FINGER_LABEL[selectedKeyBase]}（担当する親指以外の指が1本のため）</p>
                      ) : (
                        <label>
                          基本の指
                          <FingerSelect
                            value={selectedKeyBase}
                            label="選んだキーの基本の指"
                            placeholder="指を選ぶ"
                            onPick={(finger) => commit(addKeyToFinger(assignment, selectedKeyId, finger))}
                          />
                        </label>
                      )}
                      <fieldset className="finger-assignment-owners">
                        <legend>担当する指</legend>
                        {ALL_FINGERS.map((finger) => {
                          const block = ownerChangeBlock(assignment, selectedKeyId, finger);
                          return (
                            <span key={finger} className="finger-assignment-owner-row">
                              <label className="finger-assignment-owner">
                                <input
                                  type="checkbox"
                                  checked={selectedKeyOwners.includes(finger)}
                                  disabled={block !== undefined}
                                  aria-describedby={block === undefined ? undefined : `finger-assignment-owner-hint-${finger}`}
                                  onChange={() => commit(toggleKeyOfFinger(assignment, selectedKeyId, finger))}
                                />
                                {FINGER_LABEL[finger]}
                              </label>
                              {block === undefined ? null : (
                                <span id={`finger-assignment-owner-hint-${finger}`} className="finger-assignment-note" data-finger-assignment-owner-hint>
                                  （{BLOCK_HINT[block]}）
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </fieldset>
                      <div className="finger-assignment-actions">
                        {selectedKeyOwners
                          .filter((finger): finger is NonThumb => FINGERS.includes(finger as NonThumb))
                          .map((finger) => (
                            <button
                              key={finger}
                              type="button"
                              data-finger-assignment-home={finger}
                              disabled={assignment.homeKey[finger] === selectedKeyId}
                              onClick={() => commit(assignHomeKey(assignment, finger, selectedKeyId))}
                            >
                              {`${FINGER_LABEL[finger]}のホームキーにする`}
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
                {!editable ? null : (
                  <div className="finger-assignment-panel" data-finger-assignment-finger-panel>
                    <h3>指単位</h3>
                    <label>
                      担当を編集する指
                      <select
                        aria-label="担当を編集する指"
                        value={editingFinger ?? ''}
                        onChange={(event) => {
                          const picked = event.currentTarget.value;
                          setEditingFinger(ALL_FINGERS.includes(picked as Finger) ? (picked as Finger) : undefined);
                        }}
                      >
                        <option value="">選ばない</option>
                        {ALL_FINGERS.map((finger) => (
                          <option key={finger} value={finger}>
                            {FINGER_LABEL[finger]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {editingFinger === undefined ? (
                      <p className="finger-assignment-note">指を選ぶと、図のキーを押して、その指が担当するキーを足す・外せます。</p>
                    ) : (
                      <>
                        <p className="finger-assignment-note">
                          図のキーを押すと、そのキーが{FINGER_LABEL[editingFinger]}
                          の担当に加わります（担当していれば外れます）。基本の指の担当も外せます。親指以外の最後の担当は、別の指の担当に加えてから外してください。
                        </p>
                        {fingerNotice === undefined ? null : (
                          <p role="status" data-finger-assignment-notice>
                            {fingerNotice}
                          </p>
                        )}
                        <p data-finger-assignment-finger-keys>
                          {FINGER_LABEL[editingFinger]}が担当するキー:{' '}
                          {editingFingerKeys.length === 0 ? 'なし' : editingFingerKeys.map(keyLabelOf).join(' ')}
                        </p>
                      </>
                    )}
                  </div>
                )}
                {!editable ? null : (
                  <div className="finger-assignment-panel" data-finger-assignment-column-panel>
                    <h3>列の一括</h3>
                    <label>
                      列
                      <select aria-label="列を選ぶ" value={column} onChange={(event) => setColumn(Number(event.currentTarget.value))}>
                        {columns.map((ids, index) => (
                          <option
                            key={index}
                            value={index}
                          >{`${index + 1}列目（${ids.map((id) => physicalKeyDisplayLabel(id, standard)).join(' ')}）`}</option>
                        ))}
                      </select>
                    </label>
                    <FingerSelect
                      value={undefined}
                      label="列の指"
                      placeholder="指を選んで割り当てる"
                      onPick={(finger) => commit(assignColumnFinger(assignment, shape, column, finger))}
                    />
                    <p className="finger-assignment-note">列のキーは、選んだ指だけが担当するようになります。</p>
                  </div>
                )}
              </div>
              {!editable ? null : (
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
              )}
            </section>
          )}
        </>
      )}
    </article>
  );
}
