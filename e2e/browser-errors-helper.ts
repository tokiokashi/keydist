import type { Page } from '@playwright/test';

/**
 * ブラウザが出すエラー・警告を、届く経路を問わず集める道具。
 *
 * `page.on('console')` と `page.on('pageerror')` だけでは、次のものが届かず、検査が何も捕まえない。
 * 製品を一時的に壊して、どの経路で届くかを測った（Chromium）。
 * - ResizeObserverの「loop completed with undelivered notifications」は、`window` の `error` イベントにだけ届く。
 *   consoleにもpageerrorにも出ない
 * - ReactのHydrationの不一致は、pageerrorと `window` の `error` イベントに届く。consoleにはerrorで出ない
 * そこで、`window` の `error`・`unhandledrejection`・pageerror・consoleのerror/warningの4経路を全部集める。
 * ブラウザのエラーを確かめるe2eは、`page.on(...)` を直接書かず、この道具を使う。
 *
 * エラーの文は、開発用と本番用のbuildで違う（CIは本番用のbuildで回す）。
 * 開発用は "Hydration failed because ..." と全文が出るが、本番用のReactは
 * "Minified React error #418; visit https://react.dev/errors/418?..." と番号だけが出る。
 * 文で判定する検査は、両方のbuildで製品を壊して落ちることを確かめる。
 */

export type BrowserErrorChannel = 'window-error' | 'unhandledrejection' | 'pageerror' | 'console';

export interface BrowserError {
  readonly channel: BrowserErrorChannel;
  readonly message: string;
}

export interface BrowserErrors {
  /** 集めたものの全部（同じ出来事が複数の経路に届くと、経路ごとに1件ずつ入る）。 */
  all(): readonly BrowserError[];
  /** 正規表現に当たるメッセージ（省略すると全部）。同じ文は1件にまとめる。経路で文が違うもの（`Uncaught ` の有無など）は別に数える。 */
  messages(pattern?: RegExp): string[];
  /** ここまでに集めたものを捨てる（再読み込みより後だけを見たい時）。 */
  clear(): void;
  /** ResizeObserverの警告（`window` の `error` にだけ届く）。 */
  resizeObserver(): string[];
  /** Hydrationの不一致（pageerrorと `window` の `error` に届く）。開発用と本番用の両方の文を拾う。 */
  hydration(): string[];
}

const BINDING_NAME = '__keydistReportBrowserError';

/**
 * 本番用のReactがHydrationの不一致を報じる時の番号（React 19.3.0のエラーコード表で、hydrationの失敗を指すもの）。
 * 418: 描画した内容の不一致 / 421: 描画の前の更新でSuspenseがclient描画へ切り替わった / 422: 最寄りのSuspenseからclient描画へ戻った /
 * 423: 根全体がclient描画へ戻った / 424: 描画の前の更新で根全体がclient描画へ切り替わった / 425: 文字列の不一致
 */
const HYDRATION_ERROR_CODES = /Minified React error #(418|421|422|423|424|425)\b/;

/**
 * 開発サーバーのfavicon等、検査の対象と無関係な404のconsoleは除く。
 * この文は `window` の `error` には届かず、consoleのerrorだけに出る。
 */
const RESOURCE_LOAD_NOISE = /^Failed to load resource/;

/** ページの読み込み前に呼ぶ。以後、ページ（再読み込みを含む）が出したものを集める。 */
export async function collectBrowserErrors(page: Page): Promise<BrowserErrors> {
  const collected: BrowserError[] = [];
  await page.exposeFunction(BINDING_NAME, (channel: BrowserErrorChannel, message: string) => {
    collected.push({ channel, message });
  });
  await page.addInitScript((name) => {
    const report = (window as unknown as Record<string, (channel: string, message: string) => void>)[name]!;
    window.addEventListener('error', (event) => report('window-error', event.message));
    window.addEventListener('unhandledrejection', (event) => {
      const reason: unknown = event.reason;
      report('unhandledrejection', reason instanceof Error ? reason.message : String(reason));
    });
  }, BINDING_NAME);
  page.on('pageerror', (error) => collected.push({ channel: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (RESOURCE_LOAD_NOISE.test(message.text())) return;
    collected.push({ channel: 'console', message: message.text() });
  });

  const messages = (pattern?: RegExp): string[] => {
    const hits = collected.filter((entry) => pattern === undefined || pattern.test(entry.message));
    return [...new Set(hits.map((entry) => entry.message))];
  };
  return {
    all: () => collected,
    clear: () => {
      collected.length = 0;
    },
    messages,
    resizeObserver: () => messages(/ResizeObserver/),
    hydration: () => [...new Set([...messages(/hydrat/i), ...messages(HYDRATION_ERROR_CODES)])],
  };
}
