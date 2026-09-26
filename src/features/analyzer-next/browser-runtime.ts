import {
  createBrowserAnalysisRuntime,
  type AnalysisRuntime,
} from './runtime.ts';

let sharedRuntime: AnalysisRuntime | undefined;

/**
 * Browser-side Analyzer Next composition root shared by standalone Views and the future Workspace.
 *
 * The runtime is created lazily after mount. URL/search state may select a View binding, but it
 * never creates a second AnalysisSession authority.
 */
export function getBrowserAnalysisRuntime(): AnalysisRuntime {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserAnalysisRuntime must run in a browser');
  }
  sharedRuntime ??= createBrowserAnalysisRuntime();
  return sharedRuntime;
}
