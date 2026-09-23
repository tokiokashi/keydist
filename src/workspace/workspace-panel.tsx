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
import type { PanelId } from './panel-registry.ts';
import type { PanelRect, WorkspacePanelState } from './workspace-state.ts';
import { clampPanelRectToViewport } from './viewport-clamp.ts';
import { useWorkspaceRuntime } from './workspace-runtime.tsx';

interface PointerOperation {
  kind: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  startRect: PanelRect;
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
  renderHeader: (controls: WorkspacePanelControls) => ReactNode;
  renderPlaceholder?: (controls: WorkspacePanelControls) => ReactNode;
  floatOnHeaderClick?: boolean;
  defaultFloatingWidth?: number;
  defaultFloatingHeight?: number;
  minWidth?: number;
  minHeight?: number;
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
  floatOnHeaderClick = false,
  defaultFloatingWidth = 560,
  defaultFloatingHeight = 480,
  minWidth = 320,
  minHeight = 240,
  resizeAriaLabel = 'サイズを変更',
  dockedHeaderAriaLabel,
  floatingHeaderAriaLabel,
}: WorkspacePanelProps) {
  const { state, dispatch } = useWorkspaceRuntime();
  const panel = state.panels[id];
  const panelRef = useRef<HTMLElement>(null);
  const operationRef = useRef<PointerOperation | undefined>(undefined);
  const detachOperationRef = useRef<DetachPointerOperation | undefined>(undefined);
  const detachCleanupRef = useRef<(() => void) | undefined>(undefined);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const clearPointerRefs = () => {
      operationRef.current = undefined;
      detachCleanupRef.current?.();
      detachCleanupRef.current = undefined;
      detachOperationRef.current = undefined;
    };
    const onBlur = () => {
      clearPointerRefs();
      setDragging(false);
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      clearPointerRefs();
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

  const float = (requestedRect?: PanelRect) => {
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
    if (!floatOnHeaderClick || isInteractiveTarget(event.target, event.currentTarget)) return;

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
        dispatch({ type: 'float', id, rect: detachedRect });
        return;
      }

      pointerEvent.preventDefault();
      const next = clamp({
        ...current.dragStartRect,
        x: current.dragStartRect.x + pointerEvent.clientX - current.dragStartX,
        y: current.dragStartRect.y + pointerEvent.clientY - current.dragStartY,
      });
      dispatch({ type: 'move', id, x: next.x, y: next.y });
    };
    const finish = (pointerEvent?: PointerEvent) => {
      const current = detachOperationRef.current;
      if (
        pointerEvent !== undefined
        && current !== undefined
        && current.pointerId !== pointerEvent.pointerId
      ) return;
      if (current?.detached) setDragging(false);
      clearDetachOperation();
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
    operationRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rect,
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
    if (operation.kind === 'move') {
      dispatch({ type: 'move', id, x: next.x, y: next.y });
    } else {
      dispatch({ type: 'resize', id, width: next.width, height: next.height });
      if (next.x !== operation.startRect.x || next.y !== operation.startRect.y) {
        dispatch({ type: 'move', id, x: next.x, y: next.y });
      }
    }
  };
  const endPointerOperation = (event: ReactPointerEvent<HTMLElement>) => {
    if (operationRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    operationRef.current = undefined;
    setDragging(false);
  };
  const losePointerOperation = (event: ReactPointerEvent<HTMLElement>) => {
    if (operationRef.current?.pointerId === event.pointerId) {
      operationRef.current = undefined;
      setDragging(false);
    }
  };
  const onDockedHeaderKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!floatOnHeaderClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    if (isInteractiveTarget(event.target, event.currentTarget)) return;
    event.preventDefault();
    float();
  };
  const onDockedHeaderClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!floatOnHeaderClick || isInteractiveTarget(event.target, event.currentTarget)) return;
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
      layout={dragging ? false : true}
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
          : floatOnHeaderClick
            ? startDockedDetach
            : undefined}
        onPointerMove={mode === 'floating' ? movePointerOperation : undefined}
        onPointerUp={mode === 'floating' ? endPointerOperation : undefined}
        onPointerCancel={mode === 'floating' ? endPointerOperation : undefined}
        onLostPointerCapture={mode === 'floating' ? losePointerOperation : undefined}
        data-detachable={mode === 'docked' && floatOnHeaderClick || undefined}
        role={mode === 'docked' && floatOnHeaderClick ? 'button' : undefined}
        tabIndex={mode === 'docked' && floatOnHeaderClick ? 0 : undefined}
      >
        {renderHeader(controls)}
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
