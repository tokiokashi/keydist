import {
  useEffect,
  useSyncExternalStore,
} from 'react';
import { ALL_FINGERS, type Finger } from './geometry.ts';
import {
  CALIBRATION_ACTIONS_PER_SECOND_MAX,
  CALIBRATION_ACTIONS_PER_SECOND_MIN,
  CALIBRATION_FINGER_SPEED_MAX,
  CALIBRATION_FINGER_SPEED_MIN,
} from './playback-calibration.ts';
import type {
  AnalyzerCalibrationModel,
  CalibrationDirection,
} from './analyzer-calibration-model.ts';

const FINGER_LABEL: Record<Finger, string> = {
  LP: '左小指',
  LR: '左薬指',
  LM: '左中指',
  LI: '左人差指',
  LT: '左親指',
  RT: '右親指',
  RI: '右人差指',
  RM: '右中指',
  RR: '右薬指',
  RP: '右小指',
};

function sameHandPairLabel(pairKey: string): string {
  const [first, second] = pairKey.split(':') as [Finger, Finger];
  return `${FINGER_LABEL[first] ?? first}・${FINGER_LABEL[second] ?? second}`;
}

function directedPairLabel(pairKey: string): string {
  const [from, to] = pairKey.split('>') as [Finger, Finger];
  return `${FINGER_LABEL[from] ?? from}→${FINGER_LABEL[to] ?? to}`;
}

function Remeasure({
  token,
  focusedToken,
  livePrompt,
  onStart,
}: {
  token: string;
  focusedToken?: string;
  livePrompt?: string;
  onStart(token: string): void;
}) {
  return (
    <>
      <button
        type="button"
        className="ghost calibration-remeasure"
        data-calibration-remeasure={token}
        onClick={() => onStart(token)}
      >
        この項目だけ測り直す
      </button>
      <small className="calibration-live-prompt" data-calibration-live-prompt={token}>
        {focusedToken === token ? livePrompt : ''}
      </small>
    </>
  );
}

export function AnalyzerCalibrationDialog({
  dialog,
  model,
}: {
  dialog: HTMLDialogElement;
  model: AnalyzerCalibrationModel;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const values = snapshot.values;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => model.handleKeyDown(event);
    const onClose = () => model.close();
    document.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('close', onClose);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      dialog.removeEventListener('close', onClose);
    };
  }, [dialog, model]);

  const remeasure = (token: string) => model.startFocused(token);

  return (
    <form method="dialog" id="playback-calibration-form" data-react-feature="calibration">
      <div id="playback-calibration-header" className="calibration-modal-header">
        <div className="dialog-head">
          <h2>打鍵速度のキャリブレーション</h2>
          <button type="submit" value="cancel" className="ghost close">閉じる</button>
        </div>
        <p className="note">
          通常測定では通常速度・同手別指・指移動を測り、方向別Transition測定では異手と同手別指の有向Transition速度を測ります。選択中の配列で文字または句読点が刻印されたキーだけを使います。指移動はホーム段と下段の組で揃え、候補のない指は測定から除外します。測定中はこの画面で指定されたキーだけを押してください。
        </p>
        <p id="playback-calibration-instruction">{snapshot.instruction}</p>
        <output
          className="calibration-progress"
          id="playback-calibration-progress"
          aria-live="polite"
        >
          {snapshot.progress}
        </output>
        <p
          className="error"
          id="playback-calibration-error"
          hidden={!snapshot.error}
        >
          {snapshot.error}
        </p>
      </div>

      <div id="playback-calibration-result" hidden={!snapshot.showingResult}>
        <hr />
        <h3>保存値</h3>
        <label className="ctl">
          <span>通常速度（手変更を含む） <small>アクション/秒</small></span>
          <input
            type="number"
            id="playback-calibration-actions"
            min={CALIBRATION_ACTIONS_PER_SECOND_MIN}
            max={CALIBRATION_ACTIONS_PER_SECOND_MAX}
            step="0.01"
            value={values.actions}
            onChange={(event) => model.setBaseValue('actions', event.currentTarget.value)}
          />
          <Remeasure
            token="actions"
            focusedToken={snapshot.focusedToken}
            livePrompt={snapshot.livePrompt}
            onStart={remeasure}
          />
        </label>

        <div className="calibration-subsection">
          <h4>異手・方向別Transition速度</h4>
          <div id="playback-calibration-directions">
            {(['L→R', 'R→L'] as CalibrationDirection[]).map((direction) => (
              <label className="ctl calibration-finger-speed" key={direction}>
                <span>{direction}（アクション/秒）</span>
                <input
                  type="number"
                  min={CALIBRATION_ACTIONS_PER_SECOND_MIN}
                  max={CALIBRATION_ACTIONS_PER_SECOND_MAX}
                  step="0.01"
                  data-calibration-direction={direction}
                  value={values.directions[direction]}
                  onChange={(event) => model.setDirection(
                    direction,
                    event.currentTarget.value,
                  )}
                />
                <Remeasure
                  token={`direction:${direction}`}
                  focusedToken={snapshot.focusedToken}
                  livePrompt={snapshot.livePrompt}
                  onStart={remeasure}
                />
              </label>
            ))}
          </div>
        </div>

        <label className="ctl">
          <span>同手・別指速度 <small>アクション/秒</small></span>
          <input
            type="number"
            id="playback-calibration-same-hand"
            min={CALIBRATION_ACTIONS_PER_SECOND_MIN}
            max={CALIBRATION_ACTIONS_PER_SECOND_MAX}
            step="0.01"
            value={values.sameHand}
            onChange={(event) => model.setBaseValue('sameHand', event.currentTarget.value)}
          />
          <small>個別の組は下のボタンから測り直せます</small>
        </label>

        <details className="calibration-finger-details">
          <summary>同手・別指の組ごとの測定値（再生に使用）</summary>
          <div id="playback-calibration-same-hand-pairs">
            {Object.entries(values.sameHandPairs).map(([pairKey, value]) => (
              <label className="ctl calibration-finger-speed" key={pairKey}>
                <span>{sameHandPairLabel(pairKey)}（アクション/秒）</span>
                <input
                  type="number"
                  min={CALIBRATION_ACTIONS_PER_SECOND_MIN}
                  max={CALIBRATION_ACTIONS_PER_SECOND_MAX}
                  step="0.01"
                  data-calibration-same-hand-pair={pairKey}
                  aria-label={`${sameHandPairLabel(pairKey)}のアクション速度`}
                  value={value}
                  onChange={(event) => model.setSameHandPair(
                    pairKey,
                    event.currentTarget.value,
                  )}
                />
                <Remeasure
                  token={`same-hand-pair:${pairKey}`}
                  focusedToken={snapshot.focusedToken}
                  livePrompt={snapshot.livePrompt}
                  onStart={remeasure}
                />
              </label>
            ))}
          </div>
        </details>

        <details className="calibration-finger-details">
          <summary>同手・別指の有向Transition速度</summary>
          <div id="playback-calibration-directed-pairs">
            {Object.entries(values.directedPairs).map(([pairKey, value]) => (
              <label className="ctl calibration-finger-speed" key={pairKey}>
                <span>{directedPairLabel(pairKey)}（アクション/秒）</span>
                <input
                  type="number"
                  min={CALIBRATION_ACTIONS_PER_SECOND_MIN}
                  max={CALIBRATION_ACTIONS_PER_SECOND_MAX}
                  step="0.01"
                  data-calibration-directed-pair={pairKey}
                  value={value}
                  onChange={(event) => model.setDirectedPair(
                    pairKey,
                    event.currentTarget.value,
                  )}
                />
                <Remeasure
                  token={`directed-pair:${pairKey}`}
                  focusedToken={snapshot.focusedToken}
                  livePrompt={snapshot.livePrompt}
                  onStart={remeasure}
                />
              </label>
            ))}
          </div>
        </details>

        <label className="ctl">
          <span>指移動の代表速度 <small>u/秒（未測定指のフォールバック）</small></span>
          <input
            type="number"
            id="playback-calibration-finger-speed"
            min={CALIBRATION_FINGER_SPEED_MIN}
            max={CALIBRATION_FINGER_SPEED_MAX}
            step="0.01"
            value={values.fingerSpeed}
            onChange={(event) => model.setBaseValue('fingerSpeed', event.currentTarget.value)}
          />
        </label>

        <details className="calibration-finger-details">
          <summary>指ごとの速度を編集（u/秒）</summary>
          <div id="playback-calibration-finger-inputs">
            {ALL_FINGERS.map((finger) => (
              <label className="ctl calibration-finger-speed" key={finger}>
                <span>{FINGER_LABEL[finger]}（u/秒）</span>
                <input
                  type="number"
                  min={CALIBRATION_FINGER_SPEED_MIN}
                  max={CALIBRATION_FINGER_SPEED_MAX}
                  step="0.01"
                  data-calibration-finger={finger}
                  aria-label={`${FINGER_LABEL[finger]}の指移動速度（u/秒）`}
                  value={values.fingers[finger]}
                  onChange={(event) => model.setFinger(
                    finger,
                    event.currentTarget.value,
                  )}
                />
                <Remeasure
                  token={`finger:${finger}`}
                  focusedToken={snapshot.focusedToken}
                  livePrompt={snapshot.livePrompt}
                  onStart={remeasure}
                />
              </label>
            ))}
          </div>
        </details>
      </div>

      <div
        id="playback-calibration-footer"
        className="dialog-actions calibration-modal-footer"
      >
        <button
          type="button"
          className="ghost"
          id="playback-calibration-discard"
          onClick={() => {
            if (window.confirm('保存したキャリブレーションの値をすべて破棄しますか？')) {
              model.discard();
            }
          }}
        >
          保存値をすべて破棄
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="secondary"
          id="playback-calibration-start"
          disabled={snapshot.startDisabled}
          onClick={() => model.beginNormal()}
        >
          {snapshot.startLabel}
        </button>
        <button
          type="button"
          id="playback-calibration-arpeggio-start"
          disabled={snapshot.arpeggioDisabled}
          onClick={() => model.beginArpeggio()}
        >
          方向別Transitionを測定
        </button>
        <button
          type="button"
          id="playback-calibration-save"
          hidden={!snapshot.showingResult}
          onClick={() => {
            if (model.save()) dialog.close('saved');
          }}
        >
          この値を保存
        </button>
      </div>
    </form>
  );
}
