import { Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { reconcilePlaybackStateAfterAnalysisRefresh, type PlaybackState, type PlaybackTimingStep } from '#interpretation/timing/playback.ts';
import { useFigureSettings } from '#ui/primitives/figure-settings.tsx';
import { OptionGroup } from '#ui/primitives/option-fields.tsx';
import { PersonalSpeedLink } from '#ui/primitives/personal-speed-link.tsx';
import type { SingleBodyProps } from '../pane-parts.tsx';
import type { PlaybackExtracted } from './extract.ts';
import { derivePlaybackFrame } from './frame.ts';
import { playbackCalculationNotes } from './calculation-notes.ts';
import { usePlaybackFields } from './option-fields.tsx';
import type { PlaybackOptions } from './options.ts';
import { PlaybackKeyboard, type PlaybackFeedback } from './playback-keyboard.tsx';
import { usePlaybackAvailability, usePlaybackBroadcastStore, usePlaybackCommand } from './playback-broadcast.tsx';
import {
  applyPlaybackAction,
  initialPlaybackState,
  pausePlayback,
  playbackPaneReport,
  playbackPaneStatus,
  playbackToggleAction,
  seekPlayback,
  startPlayback,
  stepPlaybackBy,
  stopPlayback,
  tickPlayback,
} from './session.ts';
import { PLAYBACK_FIGURE_GROUPS } from './settings-sections.ts';
import { rateChartAxisInsets } from './rate-chart-model.ts';
import { PlaybackRateChart } from './rate-chart.tsx';
import './playback-view.css';

/**
 * 打鍵再生の本体。再生位置はこのペインのメモリの上だけに持つ（解析設定にも資産にもURLにも入れない）。
 * ペインを開き直す・複製する・再読み込みすると先頭から始まる。
 * 対象・テキスト・構造の条件が変わった時は先頭へ戻す。打鍵の列と構造が変わるので、
 * 前の位置は新しい列の中で同じ場所を指さない。
 * 配列図の表示の小窓で変える表示設定や、解析設定の小窓で変える再生の時間・速度の平均の設定（`options`）を変えた時は、打鍵の列も構造も同じなので、
 * 再生位置を保つ。時間と速度の平均の設定は抽出を作り直すが、同じ入力から作った結果は同じ`basisId`を持つ。
 * 時間の設定を変えた時は、カーソルと再生中かどうかを保ち、今のステップの中の経過時間を、
 * 変える前の進捗率のまま新しい時間表へ写す（`spec/playback-timing.md` §4.0）。
 */

interface Session {
  /** この再生位置が属する打鍵の列と構造の入力（`PlaybackExtracted.basisId`）。別の入力に替わったら先頭へ戻す */
  readonly basisId: string;
  /** この再生位置の経過時間が基づく時間表。別の時間表に替わったら、進捗率を保って写す */
  readonly schedule: readonly PlaybackTimingStep[];
  readonly state: PlaybackState;
  readonly feedback: PlaybackFeedback;
}

const NO_KEYS: ReadonlySet<string> = new Set();
const axisInsets = rateChartAxisInsets();

/** 時間を秒で、小数1桁まで出す。 */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}秒`;
}

function freshSession(basisId: string, schedule: readonly PlaybackTimingStep[], state: PlaybackState): Session {
  return { basisId, schedule, state, feedback: { revision: 0, keys: NO_KEYS } };
}

/** 配列図の見出しのボタンから開く小窓の中身。表示だけが変わる項目を、解析設定の小窓と同じ形のグループで並べる。 */
function PlaybackFigureSettings({
  options,
  onOptionsChange,
}: {
  readonly options: PlaybackOptions;
  readonly onOptionsChange: (next: PlaybackOptions) => void;
}) {
  const fields = usePlaybackFields(options, onOptionsChange);
  return (
    <>
      {PLAYBACK_FIGURE_GROUPS.map((group) => (
        <OptionGroup key={group.id} title={group.title}>
          {group.keys.map((key) => (
            <Fragment key={key}>{fields[key]}</Fragment>
          ))}
        </OptionGroup>
      ))}
    </>
  );
}

export function PlaybackBody({ layout, geometry, trace, extracted, options, onOptionsChange }: SingleBodyProps<PlaybackExtracted, PlaybackOptions>) {
  const { analysis, windowSize, timing, savedCalibration, overheadUse, personalSpeedUse, schedule, rateChart, basisId, timeTotals, waitUse } = extracted;
  const total = trace.strokes.length;
  const calculation = playbackCalculationNotes(options, personalSpeedUse, timing.calibration, savedCalibration, overheadUse, waitUse);
  const figureSettings = useFigureSettings('配列図');

  const [session, setSession] = useState<Session>(() => freshSession(basisId, schedule, initialPlaybackState(timing)));
  if (session.basisId !== basisId) {
    setSession(freshSession(basisId, schedule, initialPlaybackState(timing)));
  } else if (session.schedule !== schedule) {
    // 構造は同じで時間だけが変わった。位置と再生中かどうかを保ち、経過時間を新しい時間表へ写す
    setSession({
      ...session,
      schedule,
      state: reconcilePlaybackStateAfterAnalysisRefresh(
        session.state,
        initialPlaybackState(timing),
        analysis,
        analysis,
        session.state.cursor,
        session.schedule,
        schedule,
      ),
    });
  }
  const { state } = session;

  // Workspaceでは、再生・一時停止・停止を全部の打鍵再生のペインへ伝える。伝えられた操作は購読で同じ描画の確定の中に届き、
  // ここで再生位置へ当てる（副作用で遅れて当てると、ペインどうしの開始が1フレーム以上ずれる）。
  // 個別画面は伝える相手が無く、自分だけを動かす。
  const broadcast = usePlaybackBroadcastStore();
  const command = usePlaybackCommand(broadcast);
  const availability = usePlaybackAvailability(broadcast);
  const [appliedRevision, setAppliedRevision] = useState(command.revision);
  if (appliedRevision !== command.revision) {
    const { action } = command;
    setAppliedRevision(command.revision);
    if (action !== undefined) {
      setSession((previous) => withFeedback(previous, applyPlaybackAction(previous.state, action, total)));
    }
  }
  // 押せる条件に使う状態を報告する。本体を描いている間だけ加わり、打鍵の無いペインは加わらない
  const reportOwner = useId();
  const status = playbackPaneStatus(state, total);
  const reported = playbackPaneReport(state, total);
  const reportedAtStart = reported?.atStart;
  const reportedPlaying = reported?.playing;
  const reportedAtEnd = reported?.atEnd;
  useEffect(() => {
    if (broadcast === undefined) return;
    broadcast.report(
      reportOwner,
      reportedAtStart === undefined || reportedPlaying === undefined || reportedAtEnd === undefined
        ? undefined
        : { atStart: reportedAtStart, playing: reportedPlaying, atEnd: reportedAtEnd },
    );
  }, [broadcast, reportOwner, reportedAtStart, reportedPlaying, reportedAtEnd]);
  useEffect(() => {
    if (broadcast === undefined) return undefined;
    return () => broadcast.report(reportOwner, undefined);
  }, [broadcast, reportOwner]);

  const seekWasPlaying = useRef<boolean | undefined>(undefined);
  const seekId = useId();

  // 押した直後の合図。進む向きに動いた時だけ、そのステップで押したキーを光らせる
  const withFeedback = (previous: Session, next: PlaybackState): Session => {
    if (next.cursor <= previous.state.cursor) return { ...previous, state: next };
    const stroke = trace.strokes[next.cursor - 1];
    const keys = new Set(stroke?.presses.flatMap((press) => press.keys.map((key) => key.id)) ?? []);
    return { ...previous, state: next, feedback: { revision: previous.feedback.revision + 1, keys } };
  };

  // 再生中は描画フレームごとに時間を進める
  useEffect(() => {
    if (!state.playing) return undefined;
    let frame = 0;
    let last: number | undefined;
    const tick = (timestamp: number) => {
      if (last !== undefined) {
        const elapsed = timestamp - last;
        setSession((previous) =>
          previous.basisId !== basisId ? previous : withFeedback(previous, tickPlayback(previous.state, elapsed, analysis, schedule)),
        );
      }
      last = timestamp;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // withFeedbackはtraceだけを読む。再生の開始・停止と、読む対象の替わりでだけ張り直す
    // （フレームごとに張り直すと、経過時間が積算されない）
  }, [state.playing, basisId, analysis, schedule, trace]);

  const frame = useMemo(
    () =>
      derivePlaybackFrame({
        layout,
        geometry,
        trace,
        analysis,
        windowSize,
        schedule,
        timing,
        options,
        cursor: state.cursor,
        elapsedMs: state.elapsedMs,
      }),
    [layout, geometry, trace, analysis, windowSize, schedule, timing, options, state.cursor, state.elapsedMs],
  );

  if (total === 0) {
    return (
      <section className="playback-feature" data-react-feature="playback">
        <p className="playback-empty">打鍵するデータがありません。</p>
      </section>
    );
  }

  const update = (change: (previous: PlaybackState) => PlaybackState) => setSession((previous) => withFeedback(previous, change(previous.state)));

  const beginSeek = () => {
    if (seekWasPlaying.current !== undefined) return;
    seekWasPlaying.current = state.playing;
    if (state.playing) update(pausePlayback);
  };
  const finishSeek = () => {
    const resume = seekWasPlaying.current;
    seekWasPlaying.current = undefined;
    if (resume) update((previous) => startPlayback(previous, total));
  };

  const atEnd = state.cursor >= total;
  // 全部のペインに伝える時は、押したペインだけでなく全部のペインの状態で押せるかを決める（自分の状態は報告より新しい）
  const canPlay = !atEnd || (broadcast !== undefined && availability.canPlay);
  const canStop = !status.atStart || state.playing || (broadcast !== undefined && availability.canStop);
  const toggle = () => {
    if (broadcast === undefined) update((previous) => (previous.playing ? pausePlayback(previous) : startPlayback(previous, total)));
    else broadcast.dispatch(playbackToggleAction(state));
  };
  const stop = () => {
    if (broadcast === undefined) update(stopPlayback);
    else broadcast.dispatch('stop');
  };

  return (
    <section className="playback-feature" data-react-feature="playback">
      {personalSpeedUse === 'missing' ? (
        <p className="playback-notice" data-playback-personal-speed="missing">
          測定した個人速度がありません。個人速度を使わない時間で再生しています。
          <PersonalSpeedLink className="playback-notice-link">個人速度の画面を開く</PersonalSpeedLink>
        </p>
      ) : null}
      {calculation.personalSpeedInUse || calculation.changes.length > 0 ? (
        <p className="playback-notice" data-playback-calculation>
          {calculation.personalSpeedInUse ? <span data-playback-calculation-personal-speed>個人速度で計算しています。</span> : null}
          {calculation.keystrokeOverheadInUse ? (
            <span data-playback-calculation-overhead> 個人速度のうち、文章を打つ速さで測った打鍵の上乗せ（ミリ秒）を足しています。</span>
          ) : null}
          {calculation.simultaneousOverheadInUse ? (
            <span data-playback-calculation-simultaneous> 個人速度のうち、同時押しの上乗せ（ミリ秒）を足しています。</span>
          ) : null}
          {calculation.changes.length > 0 ? (
            <span data-playback-calculation-changes>
              {calculation.personalSpeedInUse ? ' ' : ''}既定と違う設定で計算しています。{calculation.changes.join('、')}
            </span>
          ) : null}
        </p>
      ) : null}
      <fieldset className="plain-group playback-controls" aria-label="打鍵再生の操作">
        <button
          type="button"
          data-playback-action="back"
          disabled={state.playing || state.cursor === 0}
          onClick={() => update((previous) => stepPlaybackBy(previous, -1, total))}
        >
          <span aria-hidden="true">◀</span> 1ステップ戻る
        </button>
        <button type="button" className="playback-primary" data-playback-action="toggle" disabled={!state.playing && !canPlay} onClick={toggle}>
          <span aria-hidden="true">{state.playing ? '⏸' : '▶'}</span> {state.playing ? '一時停止' : '再生'}
        </button>
        <button type="button" data-playback-action="stop" disabled={!canStop} onClick={stop}>
          <span aria-hidden="true">■</span> 停止
        </button>
        <button
          type="button"
          data-playback-action="forward"
          disabled={state.playing || atEnd}
          onClick={() => update((previous) => stepPlaybackBy(previous, 1, total))}
        >
          <span aria-hidden="true">▶</span> 1ステップ進む
        </button>
      </fieldset>

      <div className="playback-seek" style={{ '--seek-axis-left': axisInsets.left, '--seek-axis-right': axisInsets.right } as CSSProperties}>
        {/* 数はラベルの横に置き、ラベルとスライダーの名前は「再生位置」のまま保つ（数を名前に入れると、数が変わるたびに読み上げ名が変わる） */}
        <div className="playback-seek-head">
          <label className="playback-seek-label" htmlFor={seekId}>
            再生位置
          </label>
          <span className="playback-position" aria-live="polite" data-playback-position>
            {state.cursor} / {total}ステップ
          </span>
          <span className="playback-position" data-playback-times>
            打鍵時間 <span data-playback-typing-time>{formatSeconds(timeTotals.typingMs)}</span>
            {' / '}総時間 <span data-playback-total-time>{formatSeconds(timeTotals.totalMs)}</span>
          </span>
        </div>
        <input
          id={seekId}
          type="range"
          data-playback-seek
          min={0}
          max={total}
          step={1}
          value={state.cursor}
          onPointerDown={beginSeek}
          onChange={(event) => {
            // 更新関数はイベントの処理が終わってから呼ばれるので、値は先に読む
            const cursor = Number(event.currentTarget.value);
            update((previous) => seekPlayback(previous, cursor, total));
          }}
          onPointerUp={finishSeek}
          onPointerCancel={finishSeek}
        />
      </div>

      <div className="playback-status" aria-live="polite">
        <div className="playback-status-line">
          {frame.isRomaji ? (
            <span className="playback-romaji" data-playback-romaji>
              <span className="playback-current" data-playback-kana>
                {frame.kanaText}
              </span>
              {frame.romajiInputPreview !== undefined ? null : (
                <span className="playback-typed">
                  打鍵: <code data-playback-typed>{frame.typedText}</code>
                  {frame.plannedText === undefined ? null : (
                    <span className="playback-planned" data-playback-planned>
                      予定: {frame.plannedText}
                    </span>
                  )}
                </span>
              )}
            </span>
          ) : (
            <span className="playback-current" data-playback-current>
              {frame.currentText}
            </span>
          )}
          <span className="playback-attribution">
            帰属: <b data-playback-layer>{frame.layerLabel}</b>
          </span>
          <span className="playback-attribution">
            構造: <b data-playback-structure>{frame.structureLabel}</b>
          </span>
          <span className="playback-attribution">
            指:{' '}
            <b data-playback-fingers>{frame.pressedFingers.length === 0 ? '—' : frame.pressedFingers.map((finger) => FINGER_LABEL[finger]).join('、')}</b>
          </span>
        </div>
        <div className="playback-history" data-playback-history hidden={frame.inputPreview.length === 0}>
          <span className="playback-history-label">入力:</span>
          <span className="playback-history-done" data-playback-history-done>
            {frame.inputPreview.map(
              (segment, index) =>
                segment.kind === 'completed' && (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 入力の単位の位置が識別で、並びは先頭から順に進むだけ
                  <span key={`${segment.kind}-${index}`} className={`playback-input-segment playback-input-${segment.kind}`}>
                    {segment.text}
                  </span>
                ),
            )}
          </span>
          {frame.romajiInputPreview === undefined ? (
            <span className="playback-history-rest" data-playback-history-text>
              {frame.inputPreview.map(
                (segment, index) =>
                  segment.kind !== 'completed' && (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: 入力の単位の位置が識別で、並びは先頭から順に進むだけ
                      key={`${segment.kind}-${index}`}
                      className={`playback-input-segment playback-input-${segment.kind}`}
                      aria-current={segment.kind === 'current' ? 'step' : undefined}
                    >
                      {segment.text}
                    </span>
                  ),
              )}
            </span>
          ) : (
            <span className="playback-history-rest playback-history-rest-romaji" data-playback-history-text>
              {frame.romajiInputPreview.map(
                (segment, index) =>
                  segment.kind === 'current' && (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 入力の単位の位置が識別で、並びは先頭から順に進むだけ
                    <span key={`${segment.kind}-${index}`} className="playback-input-segment playback-input-current" aria-current="step">
                      {segment.romaji === undefined ? (
                        segment.kana
                      ) : (
                        <>
                          <span className="playback-input-typed">{segment.romaji.typed}</span>
                          {segment.romaji.remaining}
                        </>
                      )}
                    </span>
                  ),
              )}
              <span className="playback-history-ahead">
                {frame.romajiInputPreview.map(
                  (segment, index) =>
                    segment.kind === 'planned' && (
                      // biome-ignore lint/suspicious/noArrayIndexKey: 入力の単位の位置が識別で、並びは先頭から順に進むだけ
                      <span key={`${segment.kind}-${index}`} className="playback-input-segment playback-input-planned">
                        {segment.romaji?.remaining ?? segment.kana}
                      </span>
                    ),
                )}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="playback-figure-heading">
        <h3 className="playback-figure-title">配列図</h3>
        {figureSettings.toggle}
      </div>
      {figureSettings.renderWindow(<PlaybackFigureSettings options={options} onOptionsChange={onOptionsChange} />)}
      <div className="playback-figure">
        <PlaybackKeyboard
          layout={layout}
          geometry={geometry}
          standard={keyboardStandardForGeometryId(geometry.id)}
          frame={frame}
          feedback={session.feedback}
          feedbackStyle={options.keyFeedbackStyle}
          scale={options.scale}
        />
      </div>

      <div className="playback-rate-panel">
        <h3 className="playback-rate-heading">かな/秒・アクション/秒の平均推移</h3>
        <PlaybackRateChart
          points={rateChart}
          cursor={state.cursor}
          showChain={options.showChain}
          showArpeggio={options.showArpeggio}
          onSeek={(position) => update((previous) => seekPlayback(previous, position, total))}
        />
      </div>
    </section>
  );
}
