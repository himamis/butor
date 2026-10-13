import { lazy, Suspense, useEffect } from 'react';
import { EditorRoute } from './EditorRoute';
import { ErrorBoundary } from './ErrorBoundary';
import { getRepository } from './repo';
import { navigate, usePath } from './router';
import { StartScreen } from './StartScreen';
import { newDesign, useApp } from './store';
import { installTestHooks } from './testHooks';

installTestHooks();

const Viewer = lazy(() => import('../viewer/Viewer').then((m) => ({ default: m.Viewer })));
const HelpPage = lazy(() => import('./HelpPage').then((m) => ({ default: m.HelpPage })));
const PrintSheet = lazy(() => import('./print/PrintSheet').then((m) => ({ default: m.PrintSheet })));

/** Creates a design and opens it. */
function NewDesign() {
  useEffect(() => {
    let done = false;
    void (async () => {
      const d = newDesign();
      await (await getRepository()).save(d);
      if (done) return;
      useApp.getState().load(d);
      navigate(`/design/${d.id}`, true);
    })();
    return () => {
      done = true;
    };
  }, []);
  return <p className="loading">Creating a design…</p>;
}

export function Root() {
  const path = usePath();
  const design = /^\/design\/([\w-]{1,64})$/.exec(path)?.[1];
  const print = /^\/print\/([\w-]{1,64})$/.exec(path)?.[1];
  let page;
  if (path === '/') page = <StartScreen />;
  else if (path === '/new') page = <NewDesign />;
  else if (design) page = <EditorRoute key={design} id={design} />;
  else if (path === '/view') page = <Viewer />;
  else if (path === '/help') page = <HelpPage />;
  else if (print) page = <PrintSheet id={print} />;
  else
    page = (
      <main className="start">
        <p>This page does not exist.</p>
        <button type="button" onClick={() => navigate('/')}>
          All designs
        </button>
      </main>
    );
  return (
    <ErrorBoundary area="app">
      <Suspense fallback={<p className="loading">Loading…</p>}>{page}</Suspense>
    </ErrorBoundary>
  );
}
