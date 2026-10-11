import { useEffect, useMemo, useRef, useState } from 'react';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import type { PlaybackState } from '#interpretation/timing/playback.ts';
import type { SingleBodyProps } from '../pane-parts.tsx';
import type { PlaybackExtracted } from './extract.ts';
import { derivePlaybackFrame } from './frame.ts';
import type { PlaybackOptions } from './options.ts';
import { PlaybackKeyboard, type PlaybackFeedback } from './playback-keyboard.tsx';
import {
  initialPlaybackState,
  pausePlayback,
  playbackScheduleOf,
  seekPlayback,
  startPlayback,
  stepPlaybackBy,
  stopPlayback,
  tickPlayback,
} from './session.ts';
import { playbackTimingConditions } from './timing-conditions.ts';
import './playback-view.css';

/**
 * 打鍵再生の本体。再生位置はこのペインのメモリの上だけに持つ（解析設定にも資産にもURLにも入れない）。
 * ペインを開き直す・複製する・再読み込みすると先頭から始まる。
 * 対象・テキスト・条件が変わって抽出が作り直された時も先頭へ戻す。打鍵の列が変わるので、
 * 前の位置は新しい列の中で同じ場所を指さない。
 * 表示設定（`options`）を変えても抽出は作り直されないので、再生位置は保たれる。
 */

interface Session {
  /** この再生位置が属する抽出の結果。別の結果に替わったら先頭へ戻す */
  readonly source: PlaybackExtracted;
  readonly state: PlaybackState;
  readonly feedback: PlaybackFeedback;
}

const NO_KEYS: ReadonlySet<string> = new Set();

function freshSession(source: PlaybackExtracted, state: PlaybackState): Session {
  return { source, state, feedback: { revision: 0, keys: NO_KEYS } };
}

export function PlaybackBody({ layout, geometry, trace, extracted, options }: SingleBodyProps<PlaybackExtracted, PlaybackOptions>) {
  const timing = useMemo(() => playbackTimingConditions(), []);
  const { analysis, windowSize } = extracted;
  const total = trace.strokes.length;
  const schedule = useMemo(() => playbackScheduleOf(analysis, geometry, timing), [analysis, geometry, timing]);

  const [session, setSession] = useState<Session>(() => freshSession(extracted, initialPlaybackState(timing)));
  if (session.source !== extracted) setSession(freshSession(extracted, initialPlaybackState(timing)));
  const { state } = session;
  const seekWasPlaying = useRef<boolean | undefined>(undefined);

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
        setSession((previous) => previous.source !== extracted
          ? previous
          : withFeedback(previous, tickPlayback(previous.state, elapsed, analysis, schedule)));
      }
      last = timestamp;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // withFeedbackはtraceだけを読む。再生の開始・停止と、読む対象の替わりでだけ張り直す
    // （フレームごとに張り直すと、経過時間が積算されない）
  }, [state.playing, extracted, analysis, schedule, trace]);

  const frame = useMemo(
    () => derivePlaybackFrame({
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

  const update = (change: (previous: PlaybackState) => PlaybackState) =>
    setSession((previous) => withFeedback(previous, change(previous.state)));

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

  return (
    <section className="playback-feature" data-react-feature="playback">
      <div className="playback-controls" role="group" aria-label="打鍵再生の操作">
        <button type="button" data-playback-action="back" disabled={state.playing || state.cursor === 0} onClick={() => update((previous) => stepPlaybackBy(previous, -1, total))}>
          <span aria-hidden="true">◀</span> 1ステップ戻る
        </button>
        <button
          type="button"
          className="playback-primary"
          data-playback-action="toggle"
          disabled={atEnd && !state.playing}
          onClick={() => update((previous) => (previous.playing ? pausePlayback(previous) : startPlayback(previous, total)))}
        >
          <span aria-hidden="true">{state.playing ? '⏸' : '▶'}</span> {state.playing ? '一時停止' : '再生'}
        </button>
        <button type="button" data-playback-action="stop" disabled={state.cursor === 0 && !state.playing} onClick={() => update(stopPlayback)}>
          <span aria-hidden="true">■</span> 停止
        </button>
        <button type="button" data-playback-action="forward" disabled={state.playing || atEnd} onClick={() => update((previous) => stepPlaybackBy(previous, 1, total))}>
          <span aria-hidden="true">▶</span> 1ステップ進む
        </button>
        <span className="playback-position" aria-live="polite" data-playback-position>
          {state.cursor} / {total}ステップ
        </span>
      </div>

      <label className="playback-seek">
        <span>再生位置</span>
        <input
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
      </label>

      <div className="playback-status" aria-live="polite">
        <div className="playback-status-line">
          {frame.isRomaji ? (
            <span className="playback-romaji" data-playback-romaji>
              <span className="playback-current" data-playback-kana>{frame.kanaText}</span>
              <span className="playback-typed">
                打鍵: <code data-playback-typed>{frame.typedText}</code>
                {frame.plannedText === undefined ? null : (
                  <span className="playback-planned" data-playback-planned>予定: {frame.plannedText}</span>
                )}
              </span>
            </span>
          ) : (
            <span className="playback-current" data-playback-current>{frame.currentText}</span>
          )}
          <span className="playback-attribution">帰属: <b data-playback-layer>{frame.layerLabel}</b></span>
          <span className="playback-attribution">構造: <b data-playback-structure>{frame.structureLabel}</b></span>
        </div>
        <div className="playback-history" data-playback-history hidden={frame.inputPreview.length === 0}>
          <span className="playback-history-label">入力:</span>
          <span data-playback-history-text>
            {frame.inputPreview.map((segment, index) => (
              <span
                key={`${segment.kind}-${index}`}
                className={`playback-input-segment playback-input-${segment.kind}`}
                aria-current={segment.kind === 'current' ? 'step' : undefined}
              >
                {segment.text}
              </span>
            ))}
          </span>
        </div>
      </div>

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
    </section>
  );
}
