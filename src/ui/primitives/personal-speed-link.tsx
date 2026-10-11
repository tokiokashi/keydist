import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/**
 * 個人速度の画面へのリンク。ルーターを使えるのは`app`だけなので、`app`が実体を`PersonalSpeedLinkContext`で渡し、
 * 条件のモーダルと再生のペインが同じリンクを出す（他の注入物と同じ向き）。
 * 渡されなければ（テスト等）、リンクは出さない。
 */
export interface PersonalSpeedLinkProps {
  readonly className?: string;
  readonly children: ReactNode;
}

export const PersonalSpeedLinkContext = createContext<ComponentType<PersonalSpeedLinkProps> | undefined>(undefined);

export function PersonalSpeedLink({ className, children }: PersonalSpeedLinkProps) {
  const Link = useContext(PersonalSpeedLinkContext);
  if (Link === undefined) return null;
  return <Link className={className}>{children}</Link>;
}
