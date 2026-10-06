import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

function routerBasePath(): string {
  const base = import.meta.env.BASE_URL;
  return base === '/' ? '/' : base.replace(/\/$/, '');
}

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: routerBasePath(),
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
