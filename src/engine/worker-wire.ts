import type { Layout } from '#input/layouts/types.ts';
import { layoutFromTableSource } from '#input/layouts/kanji-direct-tables.ts';
import { tableSourceOf } from '#input/layouts/table-identity.ts';
import type { EngineSetMemberInput } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';
import type { WireLayout, WireResolvedInput, WireSetMember } from './worker-protocol.ts';

/**
 * メインスレッドとWorkerの間の、配列の運び方。
 *
 * 識別子を持つ配列（`input/layouts/table-identity.ts`）は、配列そのものを送らず、配列を作った表をWorkerごとに1度だけ送る。
 * Workerは表から配列を作って識別子ごとに持つ。送り手は、すでに送った識別子を`sent`に覚え、2度目からは識別子だけを送る。
 * Workerを作り直したら、`sent`も空にする。
 */

/** 解決済み入力のうち配列だけを、送る形にする。 */
export function toWireInput(input: ResolvedInput, sent: Set<string>): WireResolvedInput {
  const { layout, ...rest } = input;
  const source = tableSourceOf(layout);
  let wireLayout: WireLayout;
  if (source === undefined) wireLayout = { layout };
  else if (sent.has(source.identity)) wireLayout = { ref: source.identity };
  else {
    sent.add(source.identity);
    wireLayout = { table: { layoutId: layout.id, identity: source.identity, source: source.table } };
  }
  return { ...rest, wireLayout };
}

export function toWireMember(member: EngineSetMemberInput, sent: Set<string>): WireSetMember {
  const { resolution } = member;
  return resolution.ok
    ? { target: member.target, resolution: { ok: true, input: toWireInput(resolution.input, sent) } }
    : { target: member.target, resolution };
}

/** Workerが、識別子ごとに1度だけ作った配列を持つ入れ物。 */
export type WireLayoutStore = Map<string, Layout>;

/** 送られた形から、解決済み入力に戻す。表で届いた配列は、表から作って覚える。 */
export function fromWireInput(wire: WireResolvedInput, store: WireLayoutStore): ResolvedInput {
  const { wireLayout, ...rest } = wire;
  let layout: Layout;
  if ('ref' in wireLayout) {
    const known = store.get(wireLayout.ref);
    if (known === undefined) throw new Error(`Workerが受け取っていない配列を参照している: ${wireLayout.ref}`);
    layout = known;
  } else if ('table' in wireLayout) {
    const { layoutId, identity, source } = wireLayout.table;
    layout = layoutFromTableSource(layoutId, source, identity);
    store.set(identity, layout);
  } else {
    layout = wireLayout.layout;
  }
  return { ...rest, layout };
}

export function fromWireMember(member: WireSetMember, store: WireLayoutStore): EngineSetMemberInput {
  const { resolution } = member;
  return resolution.ok
    ? { target: member.target, resolution: { ok: true, input: fromWireInput(resolution.input, store) } }
    : { target: member.target, resolution };
}
