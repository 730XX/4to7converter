
export interface RecentBeatmapItem {
  id: string;
  path: string;
  title: string;
  artist: string;
  difficulty: string;
  keys: number;
  bpm: number;
  cover?: string;
  backgroundPath?: string | null;
  timestamp: number;
}

const STORAGE_KEY = "4to7_recent_beatmaps_v1";
const MAX_RECENTS = 6;

export function loadRecentBeatmaps(): RecentBeatmapItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultRecentBeatmaps();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as RecentBeatmapItem[];
    }
    return getDefaultRecentBeatmaps();
  } catch {
    return getDefaultRecentBeatmaps();
  }
}

export function saveRecentBeatmap(item: Omit<RecentBeatmapItem, "id" | "timestamp">): void {
  try {
    const current = loadRecentBeatmaps().filter((b) => !b.id.startsWith("mock-"));
    const newItem: RecentBeatmapItem = {
      ...item,
      id: `${item.path}_${Date.now()}`,
      timestamp: Date.now(),
    };
    const updated = [newItem, ...current.filter((b) => b.path !== item.path)].slice(0, MAX_RECENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Error al guardar mapa reciente:", err);
  }
}

function getDefaultRecentBeatmaps(): RecentBeatmapItem[] {
  return [
    {
      id: "mock-1",
      path: "",
      title: "Freedom Dive",
      artist: "xi",
      difficulty: "Endeavor",
      keys: 4,
      bpm: 222,
      cover: "linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%)",
      timestamp: Date.now() - 12 * 60 * 1000,
    },
    {
      id: "mock-2",
      path: "",
      title: "Yomi yori Kikoyu",
      artist: "Imperial Circus",
      difficulty: "Hyper",
      keys: 4,
      bpm: 174,
      cover: "linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)",
      timestamp: Date.now() - 60 * 60 * 1000,
    },
    {
      id: "mock-3",
      path: "",
      title: "Ghost",
      artist: "Camellia",
      difficulty: "Insane",
      keys: 4,
      bpm: 190,
      cover: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
      timestamp: Date.now() - 3 * 3600 * 1000,
    },
    {
      id: "mock-4",
      path: "",
      title: "Sidetracked Day",
      artist: "VINXIS",
      difficulty: "Lunatic",
      keys: 4,
      bpm: 160,
      cover: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
      timestamp: Date.now() - 24 * 3600 * 1000,
    },
    {
      id: "mock-5",
      path: "",
      title: "Hidamari no Uta",
      artist: "sana",
      difficulty: "Another",
      keys: 4,
      bpm: 165,
      cover: "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
      timestamp: Date.now() - 28 * 3600 * 1000,
    },
    {
      id: "mock-6",
      path: "",
      title: "Aleph-0",
      artist: "Sakuraburst",
      difficulty: "Zenith",
      keys: 4,
      bpm: 186,
      cover: "linear-gradient(135deg, #ec4899 0%, #3b82f6 100%)",
      timestamp: Date.now() - 48 * 3600 * 1000,
    },
  ];
}

export function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}
