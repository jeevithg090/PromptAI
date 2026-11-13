/**
 * Shared wire contract for the rebuild (docs/blueprint/BLUEPRINT.md §4, §6, §12).
 * Every client and the server import these schemas; nothing else crosses a
 * process boundary untyped.
 */
export * from './forge.ts';
export * from './events.ts';
export * from './native.ts';
