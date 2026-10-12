/** Module boundaries from docs/v2/02-architecture.md. A violation fails `npm run lint` (and CI). */
// Tests may import test tooling (vitest, fast-check); boundaries apply to production code.
const TESTS = '\\.(test|prop\\.test)\\.ts$';

const only = (from, allowed, comment) => ({
  name: `${from}-boundary`,
  comment,
  severity: 'error',
  from: { path: `^src/${from}/`, pathNot: TESTS },
  to: {
    pathNot: [`^src/${from}/`, ...allowed.map((a) => `^src/${a}/`), '^node_modules/zod/'],
    dependencyTypesNot: ['type-only'],
  },
});

module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment: 'core may import only zod (no DOM, three, React, or other app modules)',
      severity: 'error',
      from: { path: '^src/core/', pathNot: TESTS },
      to: { pathNot: ['^src/core/', '^node_modules/zod/'] },
    },
    only('catalog', ['core'], 'catalog builds on core only'),
    {
      name: 'render-boundary',
      severity: 'error',
      from: { path: '^src/render/', pathNot: TESTS },
      to: { path: '^src/(app|viewer|interaction|persistence|ai)/' },
    },
    {
      name: 'interaction-boundary',
      severity: 'error',
      from: { path: '^src/interaction/', pathNot: TESTS },
      to: { path: '^src/(app|viewer|persistence|ai|catalog)/' },
    },
    only('persistence', ['core'], 'persistence builds on core only'),
    {
      name: 'server-boundary',
      comment: 'server may use core and catalog, never browser code',
      severity: 'error',
      from: { path: '^server/', pathNot: TESTS },
      to: { path: '^src/(app|viewer|render|interaction|persistence|ai)/' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
