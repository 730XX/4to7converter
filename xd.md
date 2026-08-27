Saltar al campo de entrada del chat

Beatmap Weaver

Vista previa
Archivos
Código
Más




Code

Read only





















Search code
src/routes/index.tsx
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
    ],
  }),
  component: Home,
});

function Home() {
  const [toast, setToast] = useState<string | null>(null);
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ name: string; progress: number } | null>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const startLoad = (name: string) => {
    setLoading({ name, progress: 8 });
  };

  useEffect(() => {
    if (!loading) return;
    if (loading.progress >= 100) {
      const done = window.setTimeout(() => {
        setLoading(null);
        notify(`${loading.name} listo para convertir a 7K`);
      }, 500);
      return () => window.clearTimeout(done);
    }
    const t = window.setTimeout(
      () => setLoading((l) => (l ? { ...l, progress: Math.min(100, l.progress + 11) } : l)),
      110,
    );
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let id: string | null = null;
      if (e.ctrlKey && e.key.toLowerCase() === "p") id = "Ctrl+P";
      else if (e.ctrlKey && e.key === "Tab") id = "Ctrl+Tab";
      else if (e.ctrlKey && e.key.toLowerCase() === "b") id = "Ctrl+B";
      else if (!e.ctrlKey && !e.altKey && e.key === "Tab") id = "Tab";
      if (!id) return;
      e.preventDefault();
      setActiveShortcut(id);
      window.setTimeout(() => setActiveShortcut(null), 600);
      notify(
        {
          "Ctrl+P": "Búsqueda instantánea",
          "Ctrl+Tab": "Selector de dificultades",
          "Ctrl+B": "Dividir sección",
          Tab: "Modo Play / Autoplay",
        }[id]!,
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadMap = (map: Beatmap) => startLoad(`${map.artist} — ${map.title}`);

  return (
    <main className="min-h-screen pb-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
        <BrandHeader onSettings={() => notify("Ajustes (Ctrl + O)")} />
        <OsuProcessCard onLoad={loadMap} />
        <DropZone onFile={startLoad} />

        {loading && (
          <div className="glass-panel rounded-xl px-4 py-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">Cargando {loading.name}…</span>
              <span className="font-mono">{Math.round(loading.progress)}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-neon-gradient transition-all duration-150"
                style={{ width: `${loading.progress}%` }}
              />
            </div>
          </div>
        )}

        <RecentBeatmaps maps={recentBeatmaps} onSelect={loadMap} />
      </div>

      {toast && (
        <div className="glass-panel fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2 text-xs text-foreground shadow-neon animate-fade-in">
          <CheckCircle2 className="size-4 text-accent-cyan" />
          {toast}
        </div>
      )}

      <ShortcutBar active={activeShortcut} />
    </main>
  );
}

DR4OP ZONE:::

import { useRef, useState } from "react";
import { FileMusic, UploadCloud, Sparkles } from "lucide-react";

export function DropZone({ onFile }: { onFile: (name: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        onFile(file ? file.name : "beatmap.osu");
      }}
      className={`glass-panel relative overflow-hidden rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300 ${
        dragging
          ? "scale-[1.01] border-primary bg-primary/5 shadow-neon"
          : "border-border/70 hover:border-primary/50"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-neon-gradient transition-opacity duration-500 ${
          dragging ? "opacity-15" : "opacity-[0.06]"
        }`}
      />
      <div className="relative flex flex-col items-center">
        <div className="mb-5 flex items-end gap-3">
          <Sparkles className="size-5 text-accent-violet" />
          <span
            className={`grid size-16 place-items-center rounded-2xl bg-neon-gradient text-background transition-transform duration-300 ${
              dragging ? "scale-110" : ""
            }`}
          >
            {dragging ? (
              <UploadCloud className="size-8" />
            ) : (
              <FileMusic className="size-8" />
            )}
          </span>
          <Sparkles className="size-5 text-accent-cyan" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Arrastra tu archivo .osu aquí
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Convierte beatmaps de 4K a 7K con matrices de mapeo personalizadas, hitsounds y
          autoplay en vivo.
        </p>

        <button
          onClick={() => inputRef.current?.click()}
          className="mt-6 rounded-xl border border-primary/50 bg-primary/10 px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-primary/20 hover:shadow-neon"
        >
          Explorar archivos (.osu)
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".osu"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file.name);
          }}
        />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Chip keys="Ctrl + P" label="Búsqueda rápida de canciones" />
          <Chip keys="Ctrl + O" label="Ajustes" />
        </div>
      </div>
    </section>
  );
}

function Chip({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
      <kbd className="font-mono text-[10px] text-foreground">{keys}</kbd>
      {label}
    </span>
  );
}



--------OSU PROCESS CARDDD---------------

import { useState } from "react";
import { RefreshCw, Radar, Gamepad2, Download } from "lucide-react";
import { activeOsuBeatmap, type Beatmap } from "@/lib/mock-beatmaps";

type Status = "scanning" | "offline" | "detected";

export function OsuProcessCard({ onLoad }: { onLoad: (map: Beatmap) => void }) {
  const [status, setStatus] = useState<Status>("detected");
  const [spinning, setSpinning] = useState(false);

  const rescan = () => {
    setSpinning(true);
    setStatus("scanning");
    window.setTimeout(() => {
      setSpinning(false);
      setStatus((s) => (s === "detected" ? "offline" : "detected"));
    }, 1200);
  };

  return (
    <section className="glass-panel relative overflow-hidden rounded-2xl p-4">
      {status === "detected" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20 blur-2xl"
          style={{ backgroundImage: activeOsuBeatmap.cover }}
        />
      )}
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-xl border border-border/70 ${
              status === "detected" ? "bg-osu/15 text-osu" : "bg-muted/30 text-muted-foreground"
            }`}
          >
            {status === "scanning" ? (
              <Radar className="size-5 animate-spin" />
            ) : (
              <Gamepad2 className="size-5" />
            )}
          </span>

          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {status === "scanning"
                ? "Escaneando procesos…"
                : status === "detected"
                  ? "osu! detectado en segundo plano"
                  : "osu! no está en ejecución"}
            </div>
            {status === "detected" ? (
              <>
                <div className="truncate text-sm font-semibold text-foreground">
                  {activeOsuBeatmap.artist} — {activeOsuBeatmap.title}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  [{activeOsuBeatmap.difficulty}] • {activeOsuBeatmap.keys}K •{" "}
                  {activeOsuBeatmap.bpm} BPM
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Abre osu! y vuelve a escanear para cargar el mapa activo.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "detected" && (
            <button
              onClick={() => onLoad(activeOsuBeatmap)}
              className="relative rounded-xl bg-osu-gradient px-4 py-2.5 text-sm font-semibold text-foreground shadow-osu transition-transform duration-200 hover:scale-[1.03] active:scale-95"
            >
              <span className="absolute inset-0 animate-pulse rounded-xl bg-osu/25 blur-md" />
              <span className="relative flex items-center gap-2">
                <Download className="size-4" />
                Cargar mapa activo de osu!
              </span>
            </button>
          )}
          <button
            onClick={rescan}
            title="Volver a escanear"
            className="grid size-10 place-items-center rounded-xl border border-border/70 bg-muted/30 text-muted-foreground transition-colors hover:text-foreground hover:shadow-neon"
          >
            <RefreshCw className={`size-4 ${spinning ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </section>
  );
}



----------------BRAND HEADER----------------------

import { Settings2, Layers3 } from "lucide-react";

export function BrandHeader({ onSettings }: { onSettings: () => void }) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="glass-panel flex items-center gap-3 rounded-xl px-3 py-2">
        <span className="grid size-9 place-items-center rounded-lg bg-neon-gradient text-background shadow-neon">
          <Layers3 className="size-5" strokeWidth={2.4} />
        </span>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              4to7 Mania Converter
            </span>
            <span className="rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              v0.4.0
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            Motor listo • 7K Engine
          </div>
        </div>
      </div>

      <button
        onClick={onSettings}
        title="Ajustes (Ctrl + O)"
        className="group glass-panel flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-muted-foreground transition-all hover:text-foreground hover:shadow-neon"
      >
        <Settings2 className="size-4 transition-transform duration-500 group-hover:rotate-90" />
        <span className="hidden font-mono sm:inline">Ctrl + O</span>
      </button>
    </header>
  );
}







------------------RECENT BEATMAPS------------------------


import { Clock3, Play } from "lucide-react";
import type { Beatmap } from "@/lib/mock-beatmaps";

export function RecentBeatmaps({
  maps,
  onSelect,
}: {
  maps: Beatmap[];
  onSelect: (map: Beatmap) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Clock3 className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Mapas recientes
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">{maps.length}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {maps.map((map) => (
          <button
            key={map.id}
            onClick={() => onSelect(map)}
            className="group glass-panel relative overflow-hidden rounded-xl p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-neon"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-25 blur-xl transition-opacity duration-300 group-hover:opacity-45"
              style={{ backgroundImage: map.cover }}
            />
            <span className="relative flex items-center gap-3">
              <span
                className="size-11 shrink-0 rounded-lg shadow-inner"
                style={{ backgroundImage: map.cover }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {map.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {map.artist} • {map.difficulty}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="rounded border border-accent-cyan/40 bg-accent-cyan/10 px-1.5 py-0.5 font-mono text-[10px] text-accent-cyan">
                    {map.keys}K
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {map.bpm} BPM • {map.when}
                  </span>
                </span>
              </span>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-muted/30 text-muted-foreground opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:text-foreground">
                <Play className="size-3.5" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}






------------------ SHORT CUT BAR ---------------------


const SHORTCUTS = [
  { keys: ["Ctrl", "P"], label: "Búsqueda instantánea" },
  { keys: ["Ctrl", "Tab"], label: "Selector de dificultades" },
  { keys: ["Ctrl", "B"], label: "Dividir sección" },
  { keys: ["Tab"], label: "Modo Play / Autoplay" },
];

export function ShortcutBar({ active }: { active: string | null }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-2.5">
        {SHORTCUTS.map((s) => {
          const id = s.keys.join("+");
          const isActive = active === id;
          return (
            <div
              key={id}
              className={`flex items-center gap-2 text-[11px] transition-all duration-200 ${
                isActive ? "scale-105 text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                      isActive
                        ? "border-primary/60 bg-primary/20 text-foreground shadow-neon"
                        : "border-border/70 bg-muted/40"
                    }`}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}




@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/*
 * Design system definition.
 *
 * The @theme inline block maps CSS custom properties to Tailwind utility
 * classes (e.g. --color-primary -> bg-primary, text-primary).
 *
 * The :root and .dark blocks define the actual color values using oklch.
 * All colors MUST use oklch format.
 *
 * To add a new semantic color:
 * 1. Add the variable to :root (light value) and .dark (dark value)
 * 2. Register it in @theme inline as --color-<name>: var(--<name>)
 */

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-ring-offset-background: var(--background);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-accent-cyan: var(--accent-cyan);
  --color-accent-violet: var(--accent-violet);
  --color-osu: var(--osu);
  --font-sans: "Outfit", "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}


:root {
  --radius: 0.75rem;
  --background: oklch(0.16 0.015 260);
  --foreground: oklch(0.96 0.005 250);
  --card: oklch(0.2 0.017 260);
  --card-foreground: oklch(0.96 0.005 250);
  --popover: oklch(0.2 0.017 260);
  --popover-foreground: oklch(0.96 0.005 250);
  --primary: oklch(0.75 0.14 232);
  --primary-foreground: oklch(0.16 0.015 260);
  --secondary: oklch(0.25 0.02 262);
  --secondary-foreground: oklch(0.96 0.005 250);
  --muted: oklch(0.25 0.02 262);
  --muted-foreground: oklch(0.7 0.02 258);
  --accent: oklch(0.63 0.23 304);
  --accent-foreground: oklch(0.96 0.005 250);
  --destructive: oklch(0.66 0.22 18);
  --destructive-foreground: oklch(0.98 0.005 250);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.75 0.14 232);

  --accent-cyan: oklch(0.75 0.14 232);
  --accent-violet: oklch(0.63 0.23 304);
  --osu: oklch(0.7 0.19 12);

  --gradient-neon: linear-gradient(
    135deg,
    oklch(0.75 0.14 232),
    oklch(0.63 0.23 304) 55%,
    oklch(0.7 0.19 12)
  );
  --gradient-osu: linear-gradient(135deg, oklch(0.7 0.19 12), oklch(0.62 0.22 12));
  --shadow-neon: 0 0 0 1px color-mix(in oklab, var(--accent-cyan) 25%, transparent),
    0 12px 40px -16px color-mix(in oklab, var(--accent-violet) 60%, transparent);
  --shadow-osu: 0 10px 30px -10px color-mix(in oklab, var(--osu) 70%, transparent);

  --chart-1: oklch(0.75 0.14 232);
  --chart-2: oklch(0.63 0.23 304);
  --chart-3: oklch(0.7 0.19 12);
  --chart-4: oklch(0.8 0.15 85);
  --chart-5: oklch(0.7 0.15 160);
  --sidebar: oklch(0.19 0.017 260);
  --sidebar-foreground: oklch(0.96 0.005 250);
  --sidebar-primary: oklch(0.75 0.14 232);
  --sidebar-primary-foreground: oklch(0.16 0.015 260);
  --sidebar-accent: oklch(0.25 0.02 262);
  --sidebar-accent-foreground: oklch(0.96 0.005 250);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.75 0.14 232);
}


.dark {
  --background: oklch(0.129 0.042 264.695);
  --foreground: oklch(0.984 0.003 247.858);
  --card: oklch(0.208 0.042 265.755);
  --card-foreground: oklch(0.984 0.003 247.858);
  --popover: oklch(0.208 0.042 265.755);
  --popover-foreground: oklch(0.984 0.003 247.858);
  --primary: oklch(0.929 0.013 255.508);
  --primary-foreground: oklch(0.208 0.042 265.755);
  --secondary: oklch(0.279 0.041 260.031);
  --secondary-foreground: oklch(0.984 0.003 247.858);
  --muted: oklch(0.279 0.041 260.031);
  --muted-foreground: oklch(0.704 0.04 256.788);
  --accent: oklch(0.279 0.041 260.031);
  --accent-foreground: oklch(0.984 0.003 247.858);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.984 0.003 247.858);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.551 0.027 264.364);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.208 0.042 265.755);
  --sidebar-foreground: oklch(0.984 0.003 247.858);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.984 0.003 247.858);
  --sidebar-accent: oklch(0.279 0.041 260.031);
  --sidebar-accent-foreground: oklch(0.984 0.003 247.858);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.551 0.027 264.364);
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
}

@utility glass-panel {
  background: color-mix(in oklab, var(--card) 55%, transparent);
  border: 1px solid var(--color-border);
  backdrop-filter: blur(18px) saturate(140%);
}

@utility bg-neon-gradient {
  background-image: var(--gradient-neon);
}

@utility bg-osu-gradient {
  background-image: var(--gradient-osu);
}

@utility shadow-neon {
  box-shadow: var(--shadow-neon);
}

@utility shadow-osu {
  box-shadow: var(--shadow-osu);
}

@layer base {
  body {
    font-family: var(--font-sans);
    background-image:
      radial-gradient(60rem 40rem at 15% -10%, color-mix(in oklab, var(--accent-cyan) 12%, transparent), transparent),
      radial-gradient(50rem 35rem at 90% 0%, color-mix(in oklab, var(--osu) 12%, transparent), transparent);
    background-attachment: fixed;
  }
}
