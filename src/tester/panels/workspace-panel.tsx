import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { resolvePanelLayout, type PanelId } from './panel-registry.ts';
import type { PanelRect, WorkspacePanelState } from './workspace-state.ts';
import { clampPanelRectToViewport } from './viewport-clamp.ts';
import { useWorkspaceRuntime } from './workspace-runtime.tsx';

interface PointerOperation {
  kind: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  startRect: PanelRect;
  latestRect: PanelRect;
}

interface DetachPointerOperation {
  pointerId: number;
  startX: number;
  startY: number;
  sourceRect: PanelRect;
  detached: boolean;
  dragStartX: number;
  dragStartY: number;
  dragStartRect: PanelRect;
  latestRect: PanelRect;
}

export const WORKSPACE_DETACH_THRESHOLD_PX = 8;

export interface WorkspacePanelControls {
  mode: WorkspacePanelState['mode'];
  float: (rect?: PanelRect) => void;
  dock: () => void;
  activate: () => void;
}

export interface WorkspacePanelProps {
  id: PanelId;
  ariaLabel: string;
  className?: string;
  headerClassName?: string;
  children: ReactNode;
  /**
   * title + feature固有control専用。mode分岐（floatingなら戻すbutton、等）はここに書かない
   * （#413 Panel model: float/dockの操作UIはWorkspacePanel側の責務）。
   */
  renderHeader: (controls: WorkspacePanelControls) => ReactNode;
  renderPlaceholder?: (controls: WorkspacePanelControls) => ReactNode;
  /**
   * docked時だけheaderへ追加するfeature固有control（例: 個別カンペの明示float button）。
   * WorkspacePanel側がmodeを見て呼ぶかどうかを決めるので、feature側はmodeを読まずに済む。
   */
  renderDockedActions?: (controls: WorkspacePanelControls) => ReactNode;
  /** floating時にWorkspacePanelが描く「戻す」buttonのaria-label。省略時は `${ariaLabel}を元に戻す` */
  dockAriaLabel?: string;
  /** floating時にWorkspacePanelが描く「戻す」buttonへ足すclassName（既存の見た目維持用） */
  dockClassName?: string;
  resizeAriaLabel?: string;
  dockedHeaderAriaLabel?: string;
  floatingHeaderAriaLabel?: string;
}

function floatingRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById('workspace-floating-root');
  if (root !== null) return root;
  root = document.createElement('div');
  root.id = 'workspace-floating-root';
  root.setAttribute('aria-label', '小窓表示領域');
  document.body.append(root);
  return root;
}

function isInteractiveTarget(
  target: EventTarget | null,
  surface: HTMLElement,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const interactive = target.closest<HTMLElement>(
    'button, input, select, textarea, a, [role="button"]',
  );
  return interactive !== null && interactive !== surface;
}

export function WorkspacePanel({
  id,
  ariaLabel,
  className,
  headerClassName,
  children,
  renderHeader,
  renderPlaceholder,
  renderDockedActions,
  dockAriaLabel,
  dockClassName,
  resizeAriaLabel = 'サイズを変更',
  dockedHeaderAriaLabel,
  floatingHeaderAriaLabel,
}: WorkspacePanelProps) {
  const { state, dispatch, restoring, registry } = useWorkspaceRuntime();
  const panel = state.panels[id];
  // registryをcapability / min size / floating既定サイズのauthorityにする（#413 Panel model）。
  // consumer側propsで同じ値を重複指定しない。
  const {
    canFloat,
    minWidth,
    minHeight,
    defaultFloatingWidth,
    defaultFloatingHeight,
  } = resolvePanelLayout(registry.get(id));
  const panelRef = useRef<HTMLElement>(null);
  const operationRef = useRef<PointerOperation | undefined>(undefined);
  // setPointerCaptureを呼んだ要素そのもの（header or resize handle）。
  // blur/unmount commit時にreleasePointerCaptureへ渡すため、event.currentTargetを控えておく。
  const captureElementRef = useRef<HTMLElement | undefined>(undefined);
  const detachOperationRef = useRef<DetachPointerOperation | undefined>(undefined);
  const detachCleanupRef = useRef<(() => void) | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  // blur/unmount時にin-flightのpointer操作をcommitする処理は、commitPointerOperation等
  // render本体側の関数を使うためrenderのたびに更新する。useEffectの依存配列を空にしたまま
  // 常に最新のcommit処理を呼べるよう、refへ差し替える形にしている。
  const commitInFlightRef = useRef<() => void>(() => {});

  useEffect(() => {
    const onBlur = () => {
      commitInFlightRef.current();
      setDragging(false);
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      commitInFlightRef.current();
    };
  }, []);

  if (panel === undefined || !panel.visible) return null;

  const mode = panel.mode;
  const zIndex = Math.max(0, state.zOrder.indexOf(id));
  const active = state.zOrder.at(-1) === id;
  const activate = () => dispatch({ type: 'activate', id });
  // Portal events propagate through the React tree; ignore those from nested floating panels.
  const activateFromOwnTree = (event: { currentTarget: Element; target: EventTarget }) => {
    if (event.target instanceof Node && event.currentTarget.contains(event.target)) activate();
  };
  const clamp = (rect: PanelRect) => clampPanelRectToViewport(
    rect,
    {
      width: typeof window === 'undefined' ? rect.width : window.innerWidth,
      height: typeof window === 'undefined' ? rect.height : window.innerHeight,
    },
    { minWidth, minHeight },
  );

  // pointermoveのhot pathではWorkspace stateを更新しない。
  // fixed panelのstyleへ直接反映し、pointer終了時だけstateへcommitすることで、
  // Context consumer全体の再renderとMotion layout measurementを毎event発生させない。
  const applyTransientRect = (rect: PanelRect): boolean => {
    const element = panelRef.current;
    if (element === null) return false;
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    return true;
  };

  const float = (requestedRect?: PanelRect) => {
    // canFloat: false は呼び出し元（header click/drag/keyboard、feature側の明示button）
    // を問わずここで一括して無効化する（#413 Panel model: registryがcapabilityのauthority）。
    if (!canFloat) return;
    if (requestedRect !== undefined) {
      dispatch({
        type: 'float',
        id,
        rect: clamp(requestedRect),
      });
      return;
    }

    const bounds = panelRef.current?.getBoundingClientRect();
    const width = Math.max(minWidth, bounds?.width ?? defaultFloatingWidth);
    const height = Math.max(minHeight, bounds?.height ?? defaultFloatingHeight);
    dispatch({
      type: 'float',
      id,
      rect: clamp({
        x: bounds?.left ?? 12,
        y: bounds?.top ?? 12,
        width,
        height,
      }),
    });
  };

  const clearDetachOperation = () => {
    detachCleanupRef.current?.();
    detachCleanupRef.current = undefined;
    detachOperationRef.current = undefined;
  };

  const dock = () => {
    operationRef.current = undefined;
    clearDetachOperation();
    setDragging(false);
    dispatch({ type: 'dock', id });
  };


  const controls: WorkspacePanelControls = { mode, float, dock, activate };
  const startDockedDetach = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canFloat || isInteractiveTarget(event.target, event.currentTarget)) return;

    const bounds = panelRef.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    const sourceRect = clamp({
      x: bounds.left,
      y: bounds.top,
      width: Math.max(minWidth, bounds.width || defaultFloatingWidth),
      height: Math.max(minHeight, bounds.height || defaultFloatingHeight),
    });
    const operation: DetachPointerOperation = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourceRect,
      detached: false,
      dragStartX: event.clientX,
      dragStartY: event.clientY,
      dragStartRect: sourceRect,
      latestRect: sourceRect,
    };
    detachOperationRef.current = operation;

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const current = detachOperationRef.current;
      if (current?.pointerId !== pointerEvent.pointerId) return;

      const dx = pointerEvent.clientX - current.startX;
      const dy = pointerEvent.clientY - current.startY;
      if (!current.detached) {
        if (Math.hypot(dx, dy) < WORKSPACE_DETACH_THRESHOLD_PX) return;
        pointerEvent.preventDefault();
        const detachedRect = clamp({
          ...current.sourceRect,
          x: current.sourceRect.x + dx,
          y: current.sourceRect.y + dy,
        });
        current.detached = true;
        setDragging(true);
        current.dragStartX = pointerEvent.clientX;
        current.dragStartY = pointerEvent.clientY;
        current.dragStartRect = detachedRect;
        current.latestRect = detachedRect;
        dispatch({ type: 'float', id, rect: detachedRect });
        return;
      }

      pointerEvent.preventDefault();
      const next = clamp({
        ...current.dragStartRect,
        x: current.dragStartRect.x + pointerEvent.clientX - current.dragStartX,
        y: current.dragStartRect.y + pointerEvent.clientY - current.dragStartY,
      });
      current.latestRect = next;
      // detach直後のReact commit前だけrefがまだdocked要素を指す可能性があるため、
      // その場合は次のpointermoveまで待つ。最終rectはfinishで必ずcommitする。
      if (current.detached) applyTransientRect(next);
    };
    const finish = (pointerEvent?: PointerEvent) => {
      const current = detachOperationRef.current;
      if (
        pointerEvent !== undefined
        && current !== undefined
        && current.pointerId !== pointerEvent.pointerId
      ) return;
      const finalRect = current?.detached ? current.latestRect : undefined;
      if (current?.detached) setDragging(false);
      clearDetachOperation();
      if (finalRect !== undefined) {
        dispatch({ type: 'move', id, x: finalRect.x, y: finalRect.y });
      }
    };
    const onPointerUp = (pointerEvent: PointerEvent) => finish(pointerEvent);
    const onPointerCancel = (pointerEvent: PointerEvent) => finish(pointerEvent);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    detachCleanupRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  };

  const startPointerOperation = (
    kind: PointerOperation['kind'],
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (kind === 'move' && isInteractiveTarget(event.target, event.currentTarget)) return;
    const rect = panel.rect;
    if (rect === undefined) return;
    activate();
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    captureElementRef.current = event.currentTarget;
    operationRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rect,
      latestRect: rect,
    };
  };
  const movePointerOperation = (event: ReactPointerEvent<HTMLElement>) => {
    const operation = operationRef.current;
    if (operation?.pointerId !== event.pointerId) return;
    const dx = event.clientX - operation.startX;
    const dy = event.clientY - operation.startY;
    const next = clamp(operation.kind === 'move'
      ? {
          ...operation.startRect,
          x: operation.startRect.x + dx,
          y: operation.startRect.y + dy,
        }
      : {
          ...operation.startRect,
          width: operation.startRect.width + dx,
          height: operation.startRect.height + dy,
        });
    operation.latestRect = next;
    applyTransientRect(next);
  };
  const commitPointerOperation = (operation: PointerOperation) => {
    const finalRect = operation.latestRect;
    if (operation.kind === 'move') {
      dispatch({ type: 'move', id, x: finalRect.x, y: finalRect.y });
      return;
    }
    dispatch({ type: 'resize', id, width: finalRect.width, height: finalRect.height });
    if (finalRect.x !== operation.startRect.x || finalRect.y !== operation.startRect.y) {
      dispatch({ type: 'move', id, x: finalRect.x, y: finalRect.y });
    }
  };
  // blur/unmount時、pointercancelと同じ経路でin-flightの操作をstateへcommitする。
  // 未commitのままrefだけ消すと、transient styleで見えている位置とstate/localStorageの
  // rectが食い違い、次のdragが古いrectから再開して見た目が飛ぶ（drag中のblur・unmount共通）。
  commitInFlightRef.current = () => {
    const operation = operationRef.current;
    if (operation !== undefined) {
      operationRef.current = undefined;
      // pointerupを経ずに終わる経路（blur/unmount）では、setPointerCaptureした要素に
      // 捕捉が残ったままになる。他要素がpointer eventを受け取れなくなるのを防ぐため、
      // pointerupと同じくここで明示的に解放する。
      const captureElement = captureElementRef.current;
      if (captureElement?.hasPointerCapture(operation.pointerId) === true) {
        captureElement.releasePointerCapture(operation.pointerId);
      }
      captureElementRef.current = undefined;
      commitPointerOperation(operation);
    }
    const detachOperation = detachOperationRef.current;
    if (detachOperation?.detached) {
      dispatch({ type: 'move', id, x: detachOperation.latestRect.x, y: detachOperation.latestRect.y });
    }
    clearDetachOperation();
  };
  const endPointerOperation = (event: ReactPointerEvent<HTMLElement>) => {
    const operation = operationRef.current;
    if (operation?.pointerId !== event.pointerId) return;
    operationRef.current = undefined;
    captureElementRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    commitPointerOperation(operation);
  };
  const losePointerOperation = (event: ReactPointerEvent<HTMLElement>) => {
    const operation = operationRef.current;
    if (operation?.pointerId === event.pointerId) {
      operationRef.current = undefined;
      captureElementRef.current = undefined;
      setDragging(false);
      commitPointerOperation(operation);
    }
  };
  const onDockedHeaderKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!canFloat || (event.key !== 'Enter' && event.key !== ' ')) return;
    if (isInteractiveTarget(event.target, event.currentTarget)) return;
    event.preventDefault();
    float();
  };
  const onDockedHeaderClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!canFloat || isInteractiveTarget(event.target, event.currentTarget)) return;
    float();
  };

  const shellClassName = ['workspace-panel', className].filter(Boolean).join(' ');
  const shellStyle: CSSProperties | undefined = mode === 'floating' && panel.rect !== undefined
    ? {
        left: panel.rect.x,
        top: panel.rect.y,
        width: panel.rect.width,
        height: panel.rect.height,
        zIndex,
      }
    : undefined;

  const content = (
    <motion.section
      aria-label={ariaLabel}
      animate={{ scale: mode === 'floating' && dragging ? 1.012 : 1 }}
      className={shellClassName}
      data-active={mode === 'floating' && active || undefined}
      data-dragging={dragging || undefined}
      data-floating={mode === 'floating' || undefined}
      data-restoring={restoring || undefined}
      layout={dragging || restoring ? false : true}
      // Motionは既定ではReact renderごとにlayoutを計測する。
      // dock/floating切替だけを依存値にして、typing等のcontent renderでは計測しない。
      layoutDependency={mode}
      layoutId={`workspace-panel:${id}`}
      layoutRoot={mode === 'floating'}
      ref={panelRef}
      style={shellStyle}
      transition={{
        layout: {
          type: 'spring',
          stiffness: 520,
          damping: 42,
          mass: 0.7,
        },
        scale: {
          type: 'spring',
          stiffness: 620,
          damping: 38,
          mass: 0.55,
        },
      }}
      onClickCapture={mode === 'floating' ? activateFromOwnTree : undefined}
      onFocusCapture={mode === 'floating' ? activateFromOwnTree : undefined}
      onPointerDownCapture={mode === 'floating' ? activateFromOwnTree : undefined}
    >
      <header
        aria-label={mode === 'floating' ? floatingHeaderAriaLabel : dockedHeaderAriaLabel}
        className={['workspace-panel-header', headerClassName].filter(Boolean).join(' ')}
        data-floating={mode === 'floating' || undefined}
        onClick={mode === 'docked' ? onDockedHeaderClick : undefined}
        onKeyDown={mode === 'docked' ? onDockedHeaderKeyDown : undefined}
        onPointerDown={mode === 'floating'
          ? (event) => startPointerOperation('move', event)
          : canFloat
            ? startDockedDetach
            : undefined}
        onPointerMove={mode === 'floating' ? movePointerOperation : undefined}
        onPointerUp={mode === 'floating' ? endPointerOperation : undefined}
        onPointerCancel={mode === 'floating' ? endPointerOperation : undefined}
        onLostPointerCapture={mode === 'floating' ? losePointerOperation : undefined}
        data-detachable={mode === 'docked' && canFloat || undefined}
        role={mode === 'docked' && canFloat ? 'button' : undefined}
        tabIndex={mode === 'docked' && canFloat ? 0 : undefined}
      >
        {renderHeader(controls)}
        {mode === 'docked' ? renderDockedActions?.(controls) : null}
        {mode === 'floating' ? (
          <button
            aria-label={dockAriaLabel ?? `${ariaLabel}を元に戻す`}
            className={dockClassName}
            onClick={dock}
            type="button"
          >
            戻す
          </button>
        ) : null}
      </header>
      {children}
      {mode === 'floating' ? (
        <div
          aria-label={resizeAriaLabel}
          className="workspace-panel-resize"
          onPointerDown={(event) => startPointerOperation('resize', event)}
          onPointerMove={movePointerOperation}
          onPointerUp={endPointerOperation}
          onPointerCancel={endPointerOperation}
          onLostPointerCapture={losePointerOperation}
          role="separator"
        />
      ) : null}
    </motion.section>
  );

  if (mode === 'docked') return content;
  const root = floatingRoot();
  if (root === null) return content;
  return (
    <>
      {renderPlaceholder?.(controls)}
      {createPortal(content, root)}
    </>
  );
}
