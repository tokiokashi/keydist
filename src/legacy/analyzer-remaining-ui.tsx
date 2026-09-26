import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import type { AnalyzerControlsModel } from './analyzer-controls-model.ts';
import type {
  AnalyzerConditionsActions,
  AnalyzerConditionsModel,
} from './analyzer-conditions-model.ts';
import { AnalyzerConditionsContent } from './analyzer-conditions-content.tsx';
import type { GeometryKind } from '#input/shapes/geometry.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { gapFigure } from './gap-figure.ts';
import {
  getAppearanceSnapshot,
  getServerAppearanceSnapshot,
  setAppearanceTheme,
  subscribeAppearance,
} from '../appearance.ts';

export interface AnalyzerSidebarControlsProps {
  stateOwner: AnalyzerUiStateOwner;
  model: AnalyzerControlsModel;
  onToggleLayout(layoutId: string, enabled: boolean): void;
  onRemoveLayout(layoutId: string): void;
  onDetailLayoutChange(layoutId: string): void;
  onDetailGeometryChange(layoutId: string, geometry: GeometryKind): void;
  onWindowSizeChange(value: number): void;
  onSfbHomeChange(value: boolean): void;
  onPreferOppositeThumbChange(value: boolean): void;
  onOpenConditions(): void;
  onOpenRomaji(): void;
}

export function AnalyzerSidebarControls({
  stateOwner,
  model,
  onToggleLayout,
  onRemoveLayout,
  onDetailLayoutChange,
  onDetailGeometryChange,
  onWindowSizeChange,
  onSfbHomeChange,
  onPreferOppositeThumbChange,
  onOpenConditions,
  onOpenRomaji,
}: AnalyzerSidebarControlsProps) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const catalog = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const [filters, setFilters] = useState({ romaji: true, kana: true });
  const mode = state.ui.input.mode;
  const layouts = catalog.layoutsByMode[mode];
  const selected = new Set(state.ui.layouts.selectedByMode[mode]);
  const activeLayouts = layouts.filter((layout) => selected.has(layout.id));
  const requestedDetail = state.ui.layouts.detailByMode[mode];
  const detailLayoutId = requestedDetail && activeLayouts.some((layout) => layout.id === requestedDetail)
    ? requestedDetail
    : activeLayouts[0]?.id ?? '';
  const detailGeometry = detailLayoutId
    ? state.conditions.perLayout[detailLayoutId]?.geometry ?? state.conditions.defaults.geometry
    : state.conditions.defaults.geometry;

  const visibleLayouts = layouts.filter((layout) => {
    if (mode !== 'ja') return true;
    return layout.isRomaji ? filters.romaji : filters.kana;
  });

  return (
    <div data-react-feature="sidebar-controls">
      <label className="ctl">
        <span>配列</span>
        <select
          id="detail-layout"
          value={detailLayoutId}
          disabled={activeLayouts.length === 0}
          onChange={(event) => onDetailLayoutChange(event.currentTarget.value)}
        >
          {activeLayouts.map((layout) => (
            <option key={layout.id} value={layout.id}>{layout.name}</option>
          ))}
        </select>
      </label>

      <label className="ctl">
        <span>この配列の物理形状</span>
        <select
          id="detail-geometry"
          value={detailGeometry}
          disabled={!detailLayoutId}
          onChange={(event) => {
            if (!detailLayoutId) return;
            onDetailGeometryChange(detailLayoutId, event.currentTarget.value as GeometryKind);
          }}
        >
          {catalog.geometryOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="ctl">
        <span>先読みN <small>指を残す判断をする入力単位数</small></span>
        <span className="range-row">
          <input
            type="range"
            id="window"
            min="0"
            max="12"
            step="1"
            value={state.conditions.perLayout[detailLayoutId]?.windowSize
              ?? state.conditions.defaults.windowSize}
            onChange={(event) => onWindowSizeChange(Number(event.currentTarget.value))}
          />
          <output id="window-out">
            {state.conditions.perLayout[detailLayoutId]?.windowSize
              ?? state.conditions.defaults.windowSize}
          </output>
        </span>
      </label>

      <label className="ctl checkbox">
        <input
          type="checkbox"
          id="sfb-home"
          checked={state.conditions.perLayout[detailLayoutId]?.sfbHomeCost
            ?? state.conditions.defaults.sfbHomeCost}
          onChange={(event) => onSfbHomeChange(event.currentTarget.checked)}
        />
        <span>同指連続でホームキーを打つ時も移動を加算する</span>
      </label>

      <label className="ctl checkbox">
        <input
          type="checkbox"
          id="prefer-opposite-thumb"
          checked={state.conditions.perLayout[detailLayoutId]?.preferOppositeThumb
            ?? state.conditions.defaults.preferOppositeThumb}
          onChange={(event) => onPreferOppositeThumbChange(event.currentTarget.checked)}
        />
        <span>スペースによるシフトで逆側の親指を優先<small>左手のキーは右親指、右手のキーは左親指</small></span>
      </label>

      <div className="ctl">
        <span>比べる配列</span>
        <div className="picker" id="layout-picker">
          {mode === 'ja' ? (
            <div className="picker-filters" role="group" aria-label="配列の種類で絞り込む">
              <span>表示: </span>
              <button
                type="button"
                className="ghost"
                aria-pressed={filters.romaji}
                onClick={() => setFilters((current) => ({ ...current, romaji: !current.romaji }))}
              >
                ローマ字配列
              </button>
              <button
                type="button"
                className="ghost"
                aria-pressed={filters.kana}
                onClick={() => setFilters((current) => ({ ...current, kana: !current.kana }))}
              >
                かな・直接入力
              </button>
            </div>
          ) : null}
          {visibleLayouts.map((layout) => {
            const enabled = selected.has(layout.id);
            return (
              <label className={enabled ? '' : 'off'} key={layout.id}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => onToggleLayout(layout.id, event.currentTarget.checked)}
                />
                <span
                  className="swatch"
                  style={{ background: `var(--series-${(layout.slot % 8) + 1})` }}
                />
                {layout.name}
                {layout.isUser ? (
                  <button
                    type="button"
                    className="ghost remove"
                    title={`${layout.name} を削除する`}
                    onClick={(event) => {
                      event.preventDefault();
                      onRemoveLayout(layout.id);
                    }}
                  >
                    削除
                  </button>
                ) : null}
              </label>
            );
          })}
          {visibleLayouts.length === 0 ? (
            <p className="note picker-empty">表示する配列がありません。上の絞り込みをオンにしてください。</p>
          ) : null}
        </div>
        <button type="button" className="secondary" id="conditions-open-sidebar" onClick={onOpenConditions}>
          配列ごとの条件を設定
        </button>
        <button type="button" className="secondary" id="romaji-settings" onClick={onOpenRomaji}>
          ローマ字の綴りを設定
        </button>
      </div>
    </div>
  );
}

export interface AnalyzerGeometryControlsProps {
  stateOwner: AnalyzerUiStateOwner;
  model: AnalyzerControlsModel;
  onGeometryChange(geometry: GeometryKind): void;
  onEdit(): void;
  onExport(): void;
  onImport(file: File): void | Promise<void>;
}

export function AnalyzerGeometryControls({
  stateOwner,
  model,
  onGeometryChange,
  onEdit,
  onExport,
  onImport,
}: AnalyzerGeometryControlsProps) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const catalog = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );

  const mode = state.ui.input.mode;
  const selected = new Set(state.ui.layouts.selectedByMode[mode]);
  const activeLayouts = catalog.layoutsByMode[mode].filter((layout) => selected.has(layout.id));
  const requestedDetail = state.ui.layouts.detailByMode[mode];
  const detailLayoutId = requestedDetail && activeLayouts.some((layout) => layout.id === requestedDetail)
    ? requestedDetail
    : activeLayouts[0]?.id;
  const effectiveGeometry = detailLayoutId
    ? state.conditions.perLayout[detailLayoutId]?.geometry ?? state.conditions.defaults.geometry
    : state.conditions.defaults.geometry;

  return (
    <div data-react-feature="geometry-controls">
      <p className="note">
        形状と運指は設定モーダルで編集できます。ホームキーは配列ごとに指定し、未指定なら物理形状の既定値を使います。
        形状と運指を変えると距離の絶対値と同指連続数が変わるため、結果には設定名を併記します。
      </p>
      <label className="ctl">
        <span>物理形状</span>
        <select
          id="geometry"
          value={effectiveGeometry}
          onChange={(event) => onGeometryChange(event.currentTarget.value as GeometryKind)}
        >
          {catalog.geometryOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="note" id="geometry-current">{catalog.geometrySummary}</p>
      <button type="button" className="secondary" id="geometry-edit" onClick={onEdit}>
        形状と運指を編集
      </button>
      <div className="geometry-file-actions">
        <button type="button" className="secondary" id="geometry-export" onClick={onExport}>
          設定を書き出す
        </button>
        <label className="secondary file-button">
          設定を読み込む
          <input
            type="file"
            id="geometry-import"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void onImport(file);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      <p className="note" id="geometry-status" hidden={!catalog.geometryStatus}>
        {catalog.geometryStatus}
      </p>
    </div>
  );
}

function useDialogBackdropClose(dialog: HTMLDialogElement) {
  useLayoutEffect(() => {
    const closeOnBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener('click', closeOnBackdrop);
    return () => dialog.removeEventListener('click', closeOnBackdrop);
  }, [dialog]);
}

export function AnalyzerDialogActions({
  onOpenHow,
  onOpenConditions,
}: {
  onOpenHow(): void;
  onOpenConditions(): void;
}) {
  return (
    <>
      {' '}
      <button type="button" className="how-open" id="how-open" onClick={onOpenHow}>計算方法</button>
      {' '}
      <button type="button" className="how-open" id="conditions-open" onClick={onOpenConditions}>
        シミュレーション条件
      </button>
    </>
  );
}

export function AnalyzerHowDialog({ dialog }: { dialog: HTMLDialogElement }) {
  useDialogBackdropClose(dialog);
  return (
    <div className="dialog-body" data-react-feature="how-dialog">
      <div className="dialog-head">
        <h2>移動距離の計算方法</h2>
        <button type="button" className="ghost close" id="how-close" onClick={() => dialog.close()}>
          閉じる
        </button>
      </div>
      <p className="note">
        keydist が出した数値と、改変版や他のツールが出した数値は、そのまま比較できるものではありません。<br />
        ここで出る数値は、選択した条件のもとでの結果にすぎません。<br />
        他の方が作った配列やツールについて論じる際は、条件も一緒に示してください。<br />
        こちらから提示するのは数値だけで、配列の優劣は判定しません。<br />
        数値からどういった結論に至るかはご自身の判断であり、それを誘導することもしません。
      </p>
      <div
        id="gap-figure"
        dangerouslySetInnerHTML={{ __html: gapFigure(buildGeometry('row-staggered')) }}
      />
      <details className="calculation-limits">
        <summary>落とした次元を見る</summary>
        <ul>
          <li>出てきた数字を絶対値として評価することは難しいと考えています。現在自分が使っている配列の数字と相対比較して他の配列の特性をイメージするといった用途に向いていると考えています。</li>
          <li>タイピングという2次元的な動きを距離という1次元に圧縮しています。</li>
          <li>全ての計算は指がホームポジションにあるのが良いということを前提としています。配列追加時にホームキーを指定でき、未指定なら物理形状の既定値を使います。</li>
          <li>指の長さや手の動きなどの個人差のある部分は意図的にモデルから排除しています。あくまで配列の押すキーの解析情報と捉えてください。</li>
          <li>同じ理由で「指の疲れ」等を導出することはありません。指の特性や係数など全ての項目をフィッティングすることは困難と考えるためです。疲労を考えたい人は移動距離や指間距離などの数値の傾向から相対的に判断してください。</li>
          <li>任意の指を自動探索する運指最適化はありません。キーと指の対応は設定モーダルから明示的に指定します。</li>
          <li>連続打鍵以外のホームへ戻る移動は距離に含んでいません。指が自然にホームに戻っていることを期待しているからです。</li>
          <li>物理配列と論理配列は結びついているので、物理配列を入れ替えてみて同数字が動くのかを考えてみてください。</li>
        </ul>
      </details>
      <hr />
      <p className="note">
        以上が距離計算のルールです。細かい定義を参照したい方は下記リンクよりリポジトリ内のドキュメントを参照ください。
      </p>
      <p>
        <a
          href="https://github.com/tokiokashi/keydist/blob/main/spec/distance-model.md"
          target="_blank"
          rel="noopener"
        >
          仕様の全文を読む
        </a>
      </p>
    </div>
  );
}

export function AnalyzerConditionsDialog({
  dialog,
  stateOwner,
  model,
  actions,
}: {
  dialog: HTMLDialogElement;
  stateOwner: AnalyzerUiStateOwner;
  model: AnalyzerConditionsModel;
  actions: AnalyzerConditionsActions;
}) {
  useDialogBackdropClose(dialog);
  return (
    <div className="dialog-body" data-react-feature="conditions-dialog">
      <div className="dialog-head">
        <h2>シミュレーション条件</h2>
        <button
          type="button"
          className="ghost close"
          id="conditions-close"
          onClick={() => dialog.close()}
        >
          閉じる
        </button>
      </div>
      <p className="note">
        既定値の行を変えると全配列へ反映します。配列の個別設定をオンにすると、その配列だけ好きな条件を持てます。
      </p>
      <AnalyzerConditionsContent
        dialog={dialog}
        stateOwner={stateOwner}
        model={model}
        actions={actions}
      />
      <hr />
      <p className="note">条件の定義は仕様書を参照してください。</p>
      <p>
        <a
          href="https://github.com/tokiokashi/keydist/blob/main/spec/playback-timing.md"
          target="_blank"
          rel="noopener"
        >
          打鍵再生時間モデルの仕様
        </a>
        <br />
        <a
          href="https://github.com/tokiokashi/keydist/blob/main/spec/distance-model.md"
          target="_blank"
          rel="noopener"
        >
          移動距離モデルの仕様
        </a>
        <br />
        <a
          href="https://github.com/tokiokashi/keydist/blob/main/docs/analysis-model.md"
          target="_blank"
          rel="noopener"
        >
          構造解析モデルと用語
        </a>
      </p>
    </div>
  );
}

type AnalyzerStatefulPanelKey = 'addLayout' | 'text' | 'sensitivity';

export function AnalyzerStatefulPanel({
  stateOwner,
  panel,
  id,
  className,
  summaryClassName,
  summary,
  children,
  onOpenChange,
}: {
  stateOwner: AnalyzerUiStateOwner;
  panel: AnalyzerStatefulPanelKey;
  id: string;
  className: string;
  summaryClassName?: string;
  summary: ReactNode;
  children: ReactNode;
  onOpenChange?(open: boolean): void;
}) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const open = state.ui.panels[panel];

  return (
    <details
      id={id}
      className={className}
      open={open}
      data-react-feature={`panel-${panel === 'addLayout' ? 'add-layout' : panel}`}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        if (stateOwner.getSnapshot().ui.panels[panel] === nextOpen) return;
        stateOwner.update((draft) => {
          draft.ui.panels[panel] = nextOpen;
        });
        onOpenChange?.(nextOpen);
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  );
}

export function AnalyzerThemeControls() {
  // localStateへ一度読み込んでから反映すると、初期値('system')が一瞬押下表示されてから
  // 実際の保存値に切り替わるflickerが起きる。useSyncExternalStoreで外部storeへ直接購読する。
  const choice = useSyncExternalStore(
    subscribeAppearance,
    getAppearanceSnapshot,
    getServerAppearanceSnapshot,
  );

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="表示テーマ"
      data-react-feature="theme-controls"
    >
      {([
        ['light', 'ライト'],
        ['system', '自動'],
        ['dark', 'ダーク'],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          data-theme-set={value}
          aria-pressed={choice === value}
          onClick={() => setAppearanceTheme(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
