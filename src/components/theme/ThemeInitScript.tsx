export default function ThemeInitScript() {
  const code = `(function(){try{var k="theme";var t=localStorage.getItem(k);t=(t==="light"||t==="dark")?t:"light";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme="light";document.documentElement.style.colorScheme="light"}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
