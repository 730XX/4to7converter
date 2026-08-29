import packageJson from "../../../package.json";

interface ShortcutItem {
  keys: string[];
  label: string;
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: ["Ctrl", "P"], label: "Búsqueda de mapas" },
  { keys: ["Ctrl", "Tab"], label: "Selector de dificultades" },
  { keys: ["Ctrl", "B"], label: "Dividir sección" },
  { keys: ["Tab"], label: "mostrar 4-7k / Autoplay" },
];

export function ShortcutBar() {
  return (
    <footer className="home-shortcut-bar">
      {/* Versión leída directamente de package.json */}
      <span className="home-footer-version mono">730XX - v{packageJson.version}</span>

      <div className="home-shortcut-bar-inner">
        {SHORTCUTS.map((s) => (
          <div key={s.keys.join("+")} className="home-shortcut-item">
            <span className="home-shortcut-keys">
              {s.keys.map((k) => (
                <kbd key={k} className="mono">
                  {k}
                </kbd>
              ))}
            </span>
            <span className="home-shortcut-label">{s.label}</span>
          </div>
        ))}
      </div>
    </footer>
  );
}
