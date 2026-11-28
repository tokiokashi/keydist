/**
 * 表を別のファイルとして配る漢直の配列（T-Code・TUT-Code）の置き場。
 *
 * 表はJavaScriptに含めず、配列が計算に使われる時に取得する。取得する前の配列は、名前・別名・使う物理キーだけを宣言から持つ
 * `pendingTable` 付きの配列（表由来の項目は空）で、配列の一覧・検索・選択・物理配列の選択に使える。計算と図の表示は、取得した後の配列で行う。
 * 取得する手段（ブラウザではファイルの取得）は `app` が `configureKanjiDirectLoader` で渡す。この層はブラウザのAPIを知らない。
 * 取得に失敗した配列は、`retryFailedKanjiDirectLayouts` を呼ぶまで取得し直さない。
 */
import { TCODE_DECLARATION } from './tcode.ts';
import { SECCA_DECLARATION } from './secca.ts';
import { TUT_CODE_DECLARATION } from './tut-code.ts';
import type { KanjiDirectDeclaration, Layout } from './types.ts';

export const KANJI_DIRECT_DECLARATIONS: readonly KanjiDirectDeclaration[] = [TCODE_DECLARATION, TUT_CODE_DECLARATION, SECCA_DECLARATION];

const DECLARATION_BY_ID = new Map(KANJI_DIRECT_DECLARATIONS.map((declaration) => [declaration.id, declaration] as const));

/** 表のファイル名から、表（JSON）を取る。 */
export type KanjiDirectTableLoader = (tableFile: string) => Promise<unknown>;

export type KanjiDirectStatus = 'loaded' | 'loading' | 'failed';

/** 表を取得する前の配列。同じidに対して、いつも同じ値を返す。 */
const pendingLayouts = new Map<string, Layout>(
  KANJI_DIRECT_DECLARATIONS.map((declaration) => [
    declaration.id,
    {
      id: declaration.id,
      name: declaration.name,
      aliases: declaration.aliases,
      map: new Map(),
      canonicalInputs: new Map(),
      legends: new Map(),
      pendingTable: { physicalKeys: declaration.physicalKeys },
    },
  ]),
);

const loadedLayouts = new Map<string, Layout>();
const inFlight = new Map<string, Promise<void>>();
const failed = new Set<string>();
const listeners = new Set<() => void>();
let loader: KanjiDirectTableLoader | undefined;
let version = 0;

function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

/**
 * 組み込みの漢直の配列の、今の姿。取得済みなら表から作った配列、まだなら取得する前の配列。
 * 表を別のファイルとして配る配列のidでなければ `undefined`。
 */
export function kanjiDirectLayout(id: string): Layout | undefined {
  return loadedLayouts.get(id) ?? pendingLayouts.get(id);
}

/** 取得する前の配列（一覧・検索・選択の表示に使う）。 */
export function pendingKanjiDirectLayouts(): readonly Layout[] {
  return [...pendingLayouts.values()];
}

export function kanjiDirectStatus(id: string): KanjiDirectStatus {
  if (loadedLayouts.has(id)) return 'loaded';
  return failed.has(id) ? 'failed' : 'loading';
}

/** 取得する手段を渡す。渡すまで、`requestKanjiDirectLayout` は取得を始めない。 */
export function configureKanjiDirectLoader(next: KanjiDirectTableLoader | undefined): void {
  loader = next;
}

/** 取得済みの表（JSON）から配列を作って置く。ブラウザ以外（検査・テスト・スクリプト）が表を直接置く時にも使う。 */
export function registerKanjiDirectTable(id: string, table: unknown): void {
  const declaration = DECLARATION_BY_ID.get(id);
  if (declaration === undefined) throw new Error(`表を別のファイルとして配る配列ではない: ${id}`);
  loadedLayouts.set(id, declaration.layoutFromTable(table));
  failed.delete(id);
  notify();
}

/**
 * 表を取得する。取得済み・取得中の配列と、取得に失敗して試し直していない配列には何もしない。失敗は記録し、例外は投げない。
 * 取得する手段が渡されていない間（事前描画）は何もせず、取得中のままになる。
 */
export function requestKanjiDirectLayout(id: string): Promise<void> {
  const declaration = DECLARATION_BY_ID.get(id);
  if (declaration === undefined || loadedLayouts.has(id) || failed.has(id)) return Promise.resolve();
  const running = inFlight.get(id);
  if (running !== undefined) return running;
  const load = loader;
  if (load === undefined) return Promise.resolve();
  // 取得する手段が同期に例外を投げても、失敗として記録する
  const task = Promise.resolve()
    .then(() => load(declaration.tableFile))
    .then(
      (table) => {
        inFlight.delete(id);
        try {
          loadedLayouts.set(id, declaration.layoutFromTable(table));
        } catch {
          failed.add(id);
        }
        notify();
      },
      () => {
        inFlight.delete(id);
        failed.add(id);
        notify();
      },
    );
  inFlight.set(id, task);
  return task;
}

/** 取得に失敗した配列を、次に使われる時にもう一度取得できる状態に戻す。 */
export function retryFailedKanjiDirectLayouts(): void {
  if (failed.size === 0) return;
  failed.clear();
  notify();
}

/** 表を使えない間に画面へ出す文。`loading` は取得中、`failed` は取得に失敗した状態。 */
export function describeKanjiDirectWait(layoutName: string, status: 'loading' | 'failed'): string {
  return status === 'loading'
    ? `「${layoutName}」の定義を読み込み中…`
    : `「${layoutName}」の定義を読み込めませんでした。配列を選び直すか、ページを開き直してください`;
}

/** 取得の状態が変わるたびに呼ばれる。`useSyncExternalStore` 向け。 */
export function subscribeKanjiDirectLayouts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 取得の状態が変わるたびに増える数。`useSyncExternalStore` の値に使う。 */
export function kanjiDirectLayoutsVersion(): number {
  return version;
}
