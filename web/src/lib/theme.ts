/** localStorage key for the user's explicit theme choice ("light" | "dark"). */
export const THEME_KEY = 'pf-theme';

/** Inline script for <head>: applies a saved choice before first paint so
 *  there is no flash of the wrong theme. Kept tiny and dependency-free. */
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
