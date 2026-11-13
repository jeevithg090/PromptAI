/**
 * G0 boundaries (docs/blueprint/BLUEPRINT.md §16, docs/gates.md). Run with
 * `pnpm deps`. Only apps/ and packages/ are cruised; the legacy dirs are out
 * of scope.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No import cycles in workspace code.',
      from: { path: '^(apps|packages)/' },
      to: { circular: true },
    },
    {
      name: 'contract-is-a-leaf',
      severity: 'error',
      comment: 'packages/contract is the shared wire contract: it imports no other workspace package or app.',
      from: { path: '^packages/contract/' },
      to: { path: '^(apps|packages)/', pathNot: '^packages/contract/' },
    },
    {
      name: 'core-no-node-builtins',
      severity: 'error',
      comment: 'packages/core does no I/O: no node: or built-in modules (fs, net, http, process, ...). Time arrives through the Clock port.',
      from: { path: '^packages/core/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'core-no-io-packages',
      severity: 'error',
      comment: 'packages/core does no I/O: no network clients, DOM implementations or file-system packages.',
      from: { path: '^packages/core/src/' },
      to: { path: 'node_modules/(undici|node-fetch|cross-fetch|axios|got|ky|ws|jsdom|happy-dom|linkedom|fs-extra|graceful-fs|glob|fast-glob)/' },
    },
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      comment: 'Packages (core included) are imported by apps, never the other way round.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'apps-never-import-each-other',
      severity: 'error',
      comment: 'Apps talk over the contract, not imports. apps/desktop may depend on apps/app, whose build is its renderer.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: ['^apps/$1/', '^apps/app/'] },
    },
    {
      name: 'only-desktop-imports-app',
      severity: 'error',
      comment: 'apps/app is imported only by apps/desktop (its built renderer).',
      from: { path: '^apps/', pathNot: '^apps/(?:app|desktop)/' },
      to: { path: '^apps/app/' },
    },
    {
      name: 'licence',
      severity: 'error',
      comment:
        'Blueprint §13: no AGPL, SSPL, BUSL or GPL (LGPL included) in shipped code. What src/ imports ships (apps/desktop bundles its devDependencies); tests and scripts do not. Transitive production dependencies: packages/gates/src/licences.ts.',
      from: { path: '^(apps|packages)/[^/]+/src/' },
      to: { license: 'GPL|SSPL|BUSL' },
    },
  ],
  options: {
    exclude: { path: '(^|/)(dist|bin|coverage|release|out)/' },
    // npm packages are checked (licence) but not followed: following every
    // shipped package's own imports runs out of memory. The transitive licence
    // check is scripts in packages/gates (`pnpm deps` runs both).
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
