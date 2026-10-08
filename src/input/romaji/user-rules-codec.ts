import { defineAssetCodec, isRecord, type AssetCodec } from '../codec/index.ts';
import { decodeUserRomajiRules, type UserRomajiRule } from './rules.ts';

/**
 * 自作のローマ字規則の手持ちのcodec（版1）。規則の形とid重複の扱いは`decodeUserRomajiRules`が決め、
 * ここは版付きの外殻だけを持つ。`rules`が配列でなくても資産全体は失敗にせず空扱いにする
 * （捨てた旨の診断は積む）。
 */
export const USER_ROMAJI_RULES_CODEC: AssetCodec<readonly UserRomajiRule[]> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    return decodeUserRomajiRules(payload.rules, 'rules', diagnostics);
  },
  encodePayload: (value) => ({ rules: value.map((rule) => ({ ...rule, overrides: { ...rule.overrides } })) }),
});
