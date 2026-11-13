/** esbuild's text loader (scripts/build.mjs) bundles .yaml files as strings. */
declare module '*.yaml' {
  const text: string;
  export default text;
}
