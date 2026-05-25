export default function ThemeInitScript() {
  const code = `(function(){try{var k="theme";var t=localStorage.getItem(k);t=(t==="light"||t==="dark")?t:null;if(!t){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

