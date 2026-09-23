import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ModeId } from './layout-selection.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';

export interface AnalyzerReactShellOptions {
  root: HTMLElement;
  modeSlot: HTMLElement;
  stateOwner: AnalyzerUiStateOwner;
  onModeChange: () => void;
}

export interface AnalyzerReactShellController {
  unmount(): void;
}

function AnalyzerReactShell({
  modeSlot,
  stateOwner,
  onModeChange,
}: Omit<AnalyzerReactShellOptions, 'root'>) {
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const mode = state.ui.input.mode;

  const changeMode = (nextMode: ModeId) => {
    if (nextMode === mode) return;
    stateOwner.update((draft) => {
      draft.ui.input.mode = nextMode;
    });
    onModeChange();
  };

  return createPortal(
    <label className="ctl">
      <span>入力方式</span>
      <select
        id="mode"
        value={mode}
        onChange={(event) => changeMode(event.currentTarget.value as ModeId)}
      >
        <option value="ja">日本語（かな → 訓令式ローマ字）</option>
        <option value="en">英文（英字配列そのまま）</option>
      </select>
    </label>,
    modeSlot,
  );
}

export function mountAnalyzerReactShell(
  options: AnalyzerReactShellOptions,
): AnalyzerReactShellController {
  const root: Root = createRoot(options.root);
  options.root.dataset.analyzerReactShell = 'mounted';
  root.render(
    <AnalyzerReactShell
      modeSlot={options.modeSlot}
      stateOwner={options.stateOwner}
      onModeChange={options.onModeChange}
    />,
  );
  return {
    unmount() {
      delete options.root.dataset.analyzerReactShell;
      root.unmount();
    },
  };
}
