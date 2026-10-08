// サブエージェントのtranscript（JSONL）から、入力側の使用量と金額を集計する純粋な関数。
// ファイルの読み込みは agent-usage.ts が受け持つ。

/** 100万tokensあたりの米ドル。 */
export interface Price {
  input: number;
  cacheRead: number;
  /** 1リクエストのプロンプト（入力+書き込み+読み出し）がこの値を超えたら、そのリクエストの単価を全部 multiplier 倍にする。 */
  longPrompt?: { threshold: number; multiplier: number };
}

/** 公式の価格表の値。キャッシュ書き込みは入力単価から導く（5分が1.25倍、1時間が2倍）。 */
export const PRICES: Readonly<Record<string, Price>> = {
  // 読み出し・書き込みにも倍率が掛かるのは仮定（公式に明記されているのは入力と出力）
  'claude-haiku-5-5': { input: 0.1, cacheRead: 0.01, longPrompt: { threshold: 100_000, multiplier: 5 } },
  'claude-sonnet-5-5': { input: 2, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, cacheRead: 0.2 },
};

export const CACHE_WRITE_5M_RATIO = 1.25;
export const CACHE_WRITE_1H_RATIO = 2;

export interface RequestUsage {
  model: string;
  input: number;
  write5m: number;
  write1h: number;
  read: number;
}

/**
 * JSONLの本文から、リクエストごとのusageを取り出す。
 * 同じリクエストが複数行に分かれて記録されるので、(message.id, requestId) の組ごとに最後の行を使う。
 */
export function extractRequests(jsonl: string): RequestUsage[] {
  const byKey = new Map<string, RequestUsage>();
  let anonymous = 0;
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue;
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row?.type !== 'assistant') continue;
    const usage = row.message?.usage;
    if (usage === undefined || usage === null) continue;
    const creation: number = usage.cache_creation_input_tokens ?? 0;
    const split = usage.cache_creation;
    const write5m: number = split ? (split.ephemeral_5m_input_tokens ?? 0) : creation;
    const write1h: number = split ? (split.ephemeral_1h_input_tokens ?? 0) : 0;
    const key =
      row.message?.id !== undefined && row.requestId !== undefined
        ? `${row.message.id}\u0000${row.requestId}`
        : `anonymous-${anonymous++}`;
    // 同じ組が後から来たら置き換える。Mapは最初の挿入位置を保つので、順序は初出のまま
    byKey.set(key, {
      model: String(row.message?.model ?? ''),
      input: usage.input_tokens ?? 0,
      write5m,
      write1h,
      read: usage.cache_read_input_tokens ?? 0,
    });
  }
  return [...byKey.values()];
}

export interface Summary {
  /** リクエストに現れたモデル。通常は1つ。 */
  models: string[];
  requests: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  /** 単価が表にあるモデルのリクエストだけの合計。1件も無ければnull。 */
  costUsd: number | null;
  /** プロンプトが閾値を超えて倍率が掛かったリクエスト数（倍率を持つモデルのみ）。 */
  longPromptRequests: number;
  unpricedModels: string[];
}

export function requestCostUsd(
  r: RequestUsage,
  prices: Readonly<Record<string, Price>> = PRICES,
): { cost: number; long: boolean } | null {
  const price = prices[r.model];
  if (price === undefined) return null;
  const prompt = r.input + r.write5m + r.write1h + r.read;
  const rule = price.longPrompt;
  const long = rule !== undefined && prompt > rule.threshold;
  const multiplier = long ? rule.multiplier : 1;
  const base =
    (r.input * price.input +
      r.write5m * price.input * CACHE_WRITE_5M_RATIO +
      r.write1h * price.input * CACHE_WRITE_1H_RATIO +
      r.read * price.cacheRead) /
    1_000_000;
  return { cost: base * multiplier, long };
}

export function summarize(
  requests: readonly RequestUsage[],
  prices: Readonly<Record<string, Price>> = PRICES,
): Summary {
  const models: string[] = [];
  const unpriced: string[] = [];
  let cost = 0;
  let priced = 0;
  let long = 0;
  let input = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  for (const r of requests) {
    if (!models.includes(r.model)) models.push(r.model);
    input += r.input;
    cacheWrite += r.write5m + r.write1h;
    cacheRead += r.read;
    const c = requestCostUsd(r, prices);
    if (c === null) {
      if (!unpriced.includes(r.model)) unpriced.push(r.model);
      continue;
    }
    priced++;
    cost += c.cost;
    if (c.long) long++;
  }
  return {
    models,
    requests: requests.length,
    input,
    cacheWrite,
    cacheRead,
    costUsd: priced > 0 ? cost : null,
    longPromptRequests: long,
    unpricedModels: unpriced,
  };
}

/** 1000以上は 78K / 2.63M の形。1000未満はそのまま。 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function formatSummary(s: Summary, prices: Readonly<Record<string, Price>> = PRICES): string {
  const parts = [
    `model: ${s.models.join(', ') || '(なし)'}`,
    `requests: ${s.requests}`,
    `cache write: ${formatTokens(s.cacheWrite)}`,
    `cache read: ${formatTokens(s.cacheRead)}`,
  ];
  if (s.unpricedModels.length > 0) {
    parts.push(`input-side cost: 単価未登録（${s.unpricedModels.join(', ')}）`);
    if (s.costUsd !== null) parts.push(`単価登録済みのモデルだけの金額: $${s.costUsd.toFixed(2)}`);
  } else {
    parts.push(`input-side cost: $${(s.costUsd ?? 0).toFixed(2)}`);
  }
  const thresholds = s.models
    .map((m) => prices[m]?.longPrompt?.threshold)
    .filter((t): t is number => t !== undefined);
  if (thresholds.length > 0) {
    parts.push(
      `プロンプト${formatTokens(thresholds[0]!)}超え: ${s.longPromptRequests}件（倍率を読み出し・書き込みにも掛けた仮定）`,
    );
  }
  return `${parts.join(' / ')}（出力tokensは含まない）`;
}
