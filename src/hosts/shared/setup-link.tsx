import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/**
 * Setupの編集画面（`/setup`）へのリンク。ルーターを使えるのは`app`だけなので、`app`が実体を
 * `SetupLinkContext`で渡し、条件のモーダルが同じリンクを出す（他の注入物と同じ向き）。
 * 渡されなければ（テスト等）、リンクは出さない。
 */
export interface SetupLinkProps {
  /** 開くSetupのid。 */
  readonly setupId: string;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

export const SetupLinkContext = createContext<ComponentType<SetupLinkProps> | undefined>(undefined);

export function SetupLink({ setupId, className, children }: SetupLinkProps) {
  const Link = useContext(SetupLinkContext);
  if (Link === undefined) return null;
  return (
    <Link setupId={setupId} className={className}>
      {children}
    </Link>
  );
}
