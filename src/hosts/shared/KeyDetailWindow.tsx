import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  distanceRows,
  faceRows,
  keyName,
  keyPatternGroups,
  originRows,
  rankedCounts,
  roleSetLabel,
  shareText,
} from '#analyzers/key-detail-view.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import type { KeyDetail, KeyDetails } from '#interpretation/key-detail.ts';
import type { Trace } from '#trace/generate.ts';
import { FloatingWindow } from './FloatingWindow.tsx';
import './key-detail-window.css';

/**
 * 図のキーを押した時に開く、キーの詳細の小窓（docs/architecture.md「キーの詳細は、図のキーで見せる」）。
 *
 * 面をまたいだ合算を出し、レイヤー・コンボごとの内訳を開いて読める。回数は集計
 * （`interpretation/key-detail.ts`）の値をそのまま出し、割合だけをここで求めて元の回数を添える。
 * 入力方法とトリガーのガイドは、集計ではなく配列の定義から出す。
 */
export interface KeyDetailWindowProps {
  readonly keyId: string;
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly trace: Trace;
  readonly keyDetails: KeyDetails;
  readonly paneName?: string;
  /** 小窓を寄せる基準（押したキーの要素） */
  readonly anchor: Element | null;
  /** 選択を外し、同じ対象の小窓を閉じる */
  readonly onClose: () => void;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="key-detail-section">
      <h5>{title}</h5>
      {children}
    </section>
  );
}

function CountTable({
  head,
  rows,
}: {
  readonly head: readonly string[];
  readonly rows: ReadonlyArray<{ readonly key: string; readonly cells: readonly (string | number)[] }>;
}) {
  return (
    <table className="key-detail-table">
      <thead>
        <tr>{head.map((label, index) => <th key={label} scope="col" data-numeric={index > 0 || undefined}>{label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) => (index === 0
              ? <th key={index} scope="row">{cell}</th>
              : <td key={index} data-numeric>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 1つの対象（合算、または1つの面）の詳細を、量ごとの表にする。 */
function DetailTables({ detail, standard }: { readonly detail: KeyDetail; readonly standard: ReturnType<typeof keyboardStandardForGeometryId> }) {
  const { presses } = detail;
  const previous = rankedCounts(detail.previousChars);
  return (
    <>
      <Section title="押し方">
        <CountTable
          head={['押し方', '打数', '割合']}
          rows={rankedCounts(detail.roles).map(([role, count]) => ({
            key: role,
            cells: [roleSetLabel(role), count, shareText(count, presses)],
          }))}
        />
      </Section>
      <Section title="前の文字">
        <CountTable
          head={['前の文字', '打数', '割合']}
          rows={[
            ...previous.map(([char, count]) => ({ key: `c:${char}`, cells: [char, count, shareText(count, presses)] })),
            ...(detail.noPreviousChar > 0
              ? [{ key: 'none', cells: ['文頭（前の文字なし）', detail.noPreviousChar, shareText(detail.noPreviousChar, presses)] }]
              : []),
          ]}
        />
      </Section>
      <Section title="移動の起点">
        <CountTable
          head={['起点', '直前の位置から', 'ホームから']}
          rows={originRows(detail.origins, standard).map((row) => ({
            key: row.label,
            cells: [row.label, row.fromPrevious, row.fromHome],
          }))}
        />
      </Section>
      <Section title="距離の分布">
        <CountTable
          head={['距離', '打数', '割合']}
          rows={distanceRows(detail.distances).map((row) => ({
            key: String(row.distance),
            cells: [`${row.distance}u`, row.count, shareText(row.count, presses)],
          }))}
        />
      </Section>
    </>
  );
}

export function KeyDetailWindow({ keyId, layout, geometry, trace, keyDetails, paneName, anchor, onClose }: KeyDetailWindowProps) {
  const standard = keyboardStandardForGeometryId(geometry.id);
  const labelOf = useMemo(() => {
    const labels = new Map(trace.layerDefinitions.map((definition) => [definition.id, definition.label]));
    return (faceId: string) => labels.get(faceId) ?? faceId;
  }, [trace]);
  const merged = keyDetails.merged.get(keyId);
  const faces = useMemo(() => faceRows(keyDetails, keyId, labelOf), [keyDetails, keyId, labelOf]);
  const patterns = useMemo(() => keyPatternGroups(layout, keyId, labelOf, standard), [layout, keyId, labelOf, standard]);
  const name = keyName(keyId, layout.legends.get(keyId), standard);

  // 開く前にフォーカスがあった要素（押したキー）へ、閉じた時にフォーカスを戻す
  const returnFocusRef = useRef<Element | null>(null);
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    return () => {
      const target = returnFocusRef.current;
      // 押したキーはSVGの要素なので、HTMLElementに限らずfocusを持つものへ戻す
      if ((target instanceof HTMLElement || target instanceof SVGElement) && target.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  return (
    <FloatingWindow
      open
      kind="key-detail"
      title="キーの詳細"
      closeLabel="キーの詳細を閉じる"
      anchor={anchor}
      placement="edge"
      onClose={onClose}
      {...(paneName === undefined ? {} : { paneName })}
    >
      <div className="key-detail" data-key-detail={keyId}>
        <h4 className="key-detail-name">{name}</h4>
        {merged === undefined || merged.presses === 0 ? (
          <p className="key-detail-empty">このテキストでは、このキーを打ちません。</p>
        ) : (
          <>
            <p className="key-detail-presses" data-key-detail-presses>{merged.presses}打</p>
            {faces.length > 1 ? (
              <Section title="レイヤー・コンボ別">
                <p className="key-detail-note">押下数の内訳です。名前を押すと、そのレイヤーやコンボだけの詳細を読めます。</p>
                <ul className="key-detail-faces">
                  {faces.map((face) => (
                    <li key={face.faceId}>
                      <details>
                        <summary>
                          <span className="key-detail-face-name">{face.label}</span>
                          <span className="key-detail-face-count">{face.detail.presses}打 {shareText(face.detail.presses, merged.presses)}</span>
                        </summary>
                        <DetailTables detail={face.detail} standard={standard} />
                      </details>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            <DetailTables detail={merged} standard={standard} />
          </>
        )}
        <Section title="入力方法">
          {patterns.length === 0 ? (
            <p className="key-detail-empty">このキーを使う入力方法はありません。</p>
          ) : patterns.map((group) => (
            <div key={group.faceId} className="key-detail-pattern-group" data-pattern-face={group.faceId}>
              <h6>{group.label}</h6>
              {group.triggers.length === 0 ? null : (
                <p className="key-detail-triggers">
                  トリガー: {group.triggers.map((trigger) => `${trigger.keyNames.join('+')}${trigger.held ? '（押したまま）' : ''}`).join(' / ')}
                  {group.selfTrigger ? '。このキーはトリガーに使われます' : ''}
                </p>
              )}
              <ul className="key-detail-patterns">
                {group.rows.map((row, index) => (
                  <li key={index}>
                    <span className="key-detail-pattern-keys">{row.keyNames.join(' + ')}</span>
                    <span aria-hidden="true">→</span>
                    <span className="key-detail-pattern-output">{row.output}</span>
                    {row.group === undefined ? null : <span className="key-detail-pattern-note">{row.group}</span>}
                    {row.ordered ? <span className="key-detail-pattern-note">押す順あり</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      </div>
    </FloatingWindow>
  );
}
