import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
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

export interface WorkspacePanelControls {
  mode: WorkspacePanelState['mode'];
  float: () => void;
  dock: () => void;
  activate: () => void;
}

export interface WorkspacePanelProps {
  id: PanelId;
  ariaLabel: string;
  className?: string;
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

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && target.closest('button, input, select, textarea, a, [role="button"]') !== null;
}

export function WorkspacePanel({
  id,
  ariaLabel,
  className,
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
  if (panel === undefined || !panel.visible) return null;

  const mode = panel.mode;
  const zIndex = Math.max(0, state.zOrder.indexOf(id));
  const activate = () => dispatch({ type: 'activate', id });
  const clamp = (rect: PanelRect) => clampPanelRectToViewport(
    rect,
    {
      width: typeof window === 'undefined' ? rect.width : window.innerWidth,
      height: typeof window === 'undefined' ? rect.height : window.innerHeight,
    },
    { minWidth, minHeight },
  );

  const float = () => {
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

  const dock = () => {
    operationRef.current = undefined;
    dispatch({ type: 'dock', id });
  };

  const controls: WorkspacePanelControls = { mode, float, dock, activate };
  const startPointerOperation = (
    kind: PointerOperation['kind'],
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (kind === 'move' && isInteractiveTarget(event.target)) return;
    const rect = panel.rect;
    if (rect === undefined) return;
    activate();
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
  };
  const onDockedHeaderKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!floatOnHeaderClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    float();
  };
  const onDockedHeaderClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!floatOnHeaderClick || isInteractiveTarget(event.target)) return;
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
    <section
      aria-label={ariaLabel}
      className={shellClassName}
      data-floating={mode === 'floating' || undefined}
      ref={panelRef}
      style={shellStyle}
      onClickCapture={mode === 'floating' ? activate : undefined}
      onFocusCapture={mode === 'floating' ? activate : undefined}
      onPointerDownCapture={mode === 'floating' ? activate : undefined}
    >
      <header
        aria-label={mode === 'floating' ? floatingHeaderAriaLabel : dockedHeaderAriaLabel}
        className="workspace-panel-header"
        data-floating={mode === 'floating' || undefined}
        onClick={mode === 'docked' ? onDockedHeaderClick : undefined}
        onKeyDown={mode === 'docked' ? onDockedHeaderKeyDown : undefined}
        onPointerDown={mode === 'floating'
          ? (event) => startPointerOperation('move', event)
          : undefined}
        onPointerMove={mode === 'floating' ? movePointerOperation : undefined}
        onPointerUp={mode === 'floating' ? endPointerOperation : undefined}
        onPointerCancel={mode === 'floating' ? endPointerOperation : undefined}
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
          role="separator"
        />
      ) : null}
    </section>
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
