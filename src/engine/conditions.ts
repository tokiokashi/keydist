import type { GeometryKind } from '#input/shapes/geometry.ts';
import type { ChainInterpretation } from '#interpretation/structure/chain.ts';
import type { ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from '#input/semantics/index.ts';

export interface ConditionDefaults {
  geometry: GeometryKind;
  windowSize: number;
  /** 速度平均の方式。全配列共通。 */
  playbackRateAverage: 'sma' | 'ewma';
  /** SMAで使う直近Stroke数。全配列共通。 */
  playbackRateWindow: number;
  /** EWMAで過去寄与が半分になる時間 [秒]。全配列共通。 */
  playbackRateHalfLifeSeconds: number;
  sfbHomeCost: boolean;
  preferOppositeThumb: boolean;
  chain: ChainInterpretation;
  arpeggioPolicy: ArpeggioInterpretation;
  triggerRealization: TriggerRealizationPolicy;
  actionRealization: ActionRealizationPolicy;
}

export type LayoutConditionOverrides = Partial<Omit<
  ConditionDefaults,
  'playbackRateAverage' | 'playbackRateWindow' | 'playbackRateHalfLifeSeconds'
>> & {
  romajiRule?: string;
};
