import { kunrei } from './kunrei.ts';

/**
 * 大西配列が前提とするローマ字の綴り。
 *
 * 公式のレッスンに「シャ行は SH で打ちます」とあり、じ は `ji`、じゃ行は `j` を使う。
 * S と H、J と I が近い位置に来る配置なので、訓令式の `sya` / `zi` より打ちやすい。
 * 「し」単体は `si` のままで、SH を使うのは拗音のシャ行だけ。
 * https://o24.works/layout/
 *
 * ち・つ・ふ については公式に記述が無いため訓令式のまま（`ti` / `tu` / `hu`）。
 */
export const OONISHI_OVERRIDES: Record<string, string> = {
  // 「し」単体は訓令式のまま `si`。SH を使うのは拗音のシャ行だけ
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  しぇ: 'she',
  じ: 'ji',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  じぇ: 'je',
};

export const oonishiRomaji = (
  overrides: Record<string, string> = {},
  generateSokuon = true,
) => kunrei({ ...OONISHI_OVERRIDES, ...overrides }, generateSokuon);
