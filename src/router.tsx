import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

function routerBasePath(): string {
  const base = import.meta.env.BASE_URL;
  return base === '/' ? '/' : base.replace(/\/$/, '');
}

/**
 * クエリは文字列のまま読む。繰り返しのキーは文字列の配列にする。
 * 既定の読み書きは、繰り返しのキーをJSONの1つの値に書き直し、数字だけの文字列を数値にするので、
 * 共有リンクの `targets` の繰り返しが、routerが書き直したURLで読み取れなくなる。
 */
function parseSearch(searchStr: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = Object.create(null);
  for (const [key, value] of new URLSearchParams(searchStr)) {
    const previous = result[key];
    if (previous === undefined) result[key] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else result[key] = [previous, value];
  }
  return result;
}

function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
    else params.append(key, String(value));
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: routerBasePath(),
    parseSearch,
    stringifySearch,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
