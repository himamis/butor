import { useState } from 'react';
import { ChecksPanel } from './ChecksPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { MaterialsPanel } from './MaterialsPanel';
import { OutputsPanel } from './OutputsPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { useApp } from './store';

type Tab = 'properties' | 'materials' | 'checks' | 'outputs';

/** The right-hand panel: properties, materials and checks, each in its own error boundary. */
export function SidePanel() {
  const [tab, setTab] = useState<Tab>('properties');
  const problems = useApp((s) => s.checks.filter((c) => c.severity === 'error').length);
  const warnings = useApp((s) => s.checks.length) - problems;
  const tabs: [Tab, string][] = [
    ['properties', 'Properties'],
    ['materials', 'Materials'],
    ['checks', 'Checks'],
    ['outputs', 'Lists'],
  ];
  return (
    <aside className="side-panel" aria-label="Side panel">
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            {id === 'checks' && problems + warnings > 0 && (
              <span
                className={`badge ${problems ? 'error' : 'warning'}`}
                aria-label={`${problems} problems, ${warnings} warnings`}
              >
                {problems + warnings}
              </span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tabs.find((t) => t[0] === tab)![1]} className="tab-body">
        <ErrorBoundary area={tab}>
          {tab === 'properties' && <PropertiesPanel />}
          {tab === 'materials' && <MaterialsPanel />}
          {tab === 'checks' && <ChecksPanel />}
          {tab === 'outputs' && <OutputsPanel />}
        </ErrorBoundary>
      </div>
    </aside>
  );
}
