interface ShortcutItem {
  keys: string[];
  label: string;
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: ["Ctrl", "P"], label: "Búsqueda instantánea" },
  { keys: ["Ctrl", "Tab"], label: "Selector de dificultades" },
  { keys: ["Ctrl", "B"], label: "Dividir sección" },
  { keys: ["Tab"], label: "Modo Play / Autoplay" },
];

export function ShortcutBar() {
  return (
    <footer className="home-shortcut-bar">
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
