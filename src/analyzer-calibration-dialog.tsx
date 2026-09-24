import { useLayoutEffect } from 'react';

export interface AnalyzerCalibrationDialogProps {
  onMount(): void;
}

export function AnalyzerCalibrationDialog({ onMount }: AnalyzerCalibrationDialogProps) {
  useLayoutEffect(() => {
    onMount();
  }, [onMount]);

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
        <p id="playback-calibration-instruction">
          通常速度・同手別指・指移動を測り、必要なら方向別Transition Calibrationを追加で測定します。
        </p>
        <output
          className="calibration-progress"
          id="playback-calibration-progress"
          aria-live="polite"
        />
        <p className="error" id="playback-calibration-error" hidden />
      </div>

      <div id="playback-calibration-result" hidden>
        <hr />
        <h3>保存値</h3>
        <label className="ctl">
          <span>通常速度（手変更を含む） <small>アクション/秒</small></span>
          <input type="number" id="playback-calibration-actions" min="0.1" max="40" step="0.01" />
          <button
            type="button"
            className="ghost calibration-remeasure"
            data-calibration-remeasure="actions"
          >
            この項目だけ測り直す
          </button>
          <small className="calibration-live-prompt" data-calibration-live-prompt="actions" />
        </label>
        <div className="calibration-subsection">
          <h4>異手・方向別Transition速度</h4>
          <div id="playback-calibration-directions" />
        </div>
        <label className="ctl">
          <span>同手・別指速度 <small>アクション/秒</small></span>
          <input
            type="number"
            id="playback-calibration-same-hand"
            min="0.1"
            max="40"
            step="0.01"
          />
          <small>個別の組は下のボタンから測り直せます</small>
        </label>
        <details className="calibration-finger-details">
          <summary>同手・別指の組ごとの測定値（再生に使用）</summary>
          <div id="playback-calibration-same-hand-pairs" />
        </details>
        <details className="calibration-finger-details">
          <summary>同手・別指の有向Transition速度</summary>
          <div id="playback-calibration-directed-pairs" />
        </details>
        <label className="ctl">
          <span>指移動の代表速度 <small>u/秒（未測定指のフォールバック）</small></span>
          <input
            type="number"
            id="playback-calibration-finger-speed"
            min="0.1"
            max="100"
            step="0.01"
          />
        </label>
        <details className="calibration-finger-details">
          <summary>指ごとの速度を編集（u/秒）</summary>
          <div id="playback-calibration-finger-inputs" />
        </details>
      </div>

      <div id="playback-calibration-footer" className="dialog-actions calibration-modal-footer">
        <button type="button" className="ghost" id="playback-calibration-discard">
          保存値をすべて破棄
        </button>
        <span className="spacer" />
        <button type="button" className="secondary" id="playback-calibration-start">
          測定を開始
        </button>
        <button type="button" id="playback-calibration-arpeggio-start">
          方向別Transitionを測定
        </button>
        <button type="button" id="playback-calibration-save" hidden>
          この値を保存
        </button>
      </div>
    </form>
  );
}
