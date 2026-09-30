import { createContext } from 'react';

/**
 * プリセットのファイルの入口（保存とファイルの読み取り）。hostsは`platform/`を直接importできないので、
 * `app`がブラウザ実装を`PresetFileIoContext`で渡す（他の注入物と同じ向き）。
 * 渡されなければ（テスト等）、プリセットの節は書き出し・読み込みのボタンを出さない。
 */
export interface PresetFileIo {
  /** `format`の印を付けたJSONファイルとして保存する。 */
  readonly saveJson: (filename: string, format: string, body: Readonly<Record<string, unknown>>) => void;
  /** ファイルを文字列で読む。`maxBytes`を超えるものは読まずに断る。 */
  readonly readText: (
    file: Blob,
    maxBytes: number,
  ) => Promise<
    | { readonly kind: 'ok'; readonly text: string }
    | { readonly kind: 'too-large' }
    | { readonly kind: 'unreadable' }
  >;
}

export const PresetFileIoContext = createContext<PresetFileIo | undefined>(undefined);
