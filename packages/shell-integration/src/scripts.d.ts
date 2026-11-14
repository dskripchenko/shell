// The scripts, bundled as text (esbuild's `text` loader; a plugin in the tests).
declare module '*.zsh' {
  const text: string
  export default text
}
declare module '*.bash' {
  const text: string
  export default text
}
declare module '*.ps1' {
  const text: string
  export default text
}
