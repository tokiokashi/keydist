import type { GeometryKind } from '../geometry.ts';
import type { ChainPolicy } from '../analysis-chain.ts';
import type { ArpeggioPolicy } from '../analysis-arpeggio.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from '../core/semantic-input/index.ts';

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
  chain: ChainPolicy;
  arpeggioPolicy: ArpeggioPolicy;
  triggerRealization: TriggerRealizationPolicy;
  actionRealization: ActionRealizationPolicy;
}

export type LayoutConditionOverrides = Partial<Omit<
  ConditionDefaults,
  'playbackRateAverage' | 'playbackRateWindow' | 'playbackRateHalfLifeSeconds'
>> & {
  romajiRule?: string;
};
