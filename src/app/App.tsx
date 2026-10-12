import { Canvas } from '@react-three/fiber';
import { ErrorBoundary } from './ErrorBoundary';
import { installTestHooks } from './testHooks';

installTestHooks();

/** Application shell. Panels and tools arrive in later milestones (docs/v2/11-roadmap.md). */
export function App() {
  return (
    <div className="shell" data-testid="app-shell">
      <header className="toolbar" role="toolbar" aria-label="Main toolbar">
        <span className="title">Butor</span>
      </header>
      <main className="viewport" data-testid="viewport">
        <ErrorBoundary area="3D view">
          <Canvas frameloop="demand" camera={{ position: [3000, 2500, 5000], near: 10, far: 200000, fov: 45 }}>
            <color attach="background" args={['#f4f3ef']} />
            <hemisphereLight args={['#ffffff', '#c9c2b5', 1]} />
          </Canvas>
        </ErrorBoundary>
      </main>
    </div>
  );
}
