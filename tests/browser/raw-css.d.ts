/** Vite raw CSS imports used only by browser theme fixtures. */
declare module '*.css?raw' {
  const css: string
  export default css
}
