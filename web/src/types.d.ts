// Asset URL imports (V1.4) — Next/Turbopack resolves `?url` to the emitted asset path.
declare module '*?url' {
  const url: string;
  export default url;
}
