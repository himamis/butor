/** Test hooks for Playwright (docs/v2/10-quality.md). Only present in `--mode test` builds. */
export interface ButorTestHooks {
  ready: boolean;
  secureContext: boolean;
}

declare global {
  interface Window {
    __butor?: ButorTestHooks;
  }
}

export function installTestHooks(): void {
  if (!import.meta.env.VITE_TEST_HOOKS) return;
  window.__butor = { ready: true, secureContext: window.isSecureContext };
}
