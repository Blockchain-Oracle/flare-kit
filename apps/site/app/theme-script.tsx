/**
 * Runs before first paint. Reads the stored choice, falls back to the system
 * preference, and stamps data-theme on <html>. Inline and blocking on purpose:
 * deferring it produces a flash of the wrong theme, which DESIGN.md forbids.
 *
 * The kit's dark rules key off `[data-theme='dark'] .fk`, so stamping the
 * document element is what re-themes both the page and every kit component.
 */
const SCRIPT = `(function(){try{
var s=localStorage.getItem('fk-theme');
var d=s||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
document.documentElement.setAttribute('data-theme',d);
}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
