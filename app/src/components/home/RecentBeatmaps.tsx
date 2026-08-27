import { Clock3, Play } from "lucide-react";
import { formatTimeAgo, type RecentBeatmapItem } from "../../lib/recent-beatmaps";

interface RecentBeatmapsProps {
  maps: readonly RecentBeatmapItem[];
  onSelectMap: (path: string) => void;
  onFallbackBrowse: () => void;
}

export function RecentBeatmaps({
  maps,
  onSelectMap,
  onFallbackBrowse,
}: RecentBeatmapsProps) {
  if (maps.length === 0) return null;

  return (
    <section className="home-recents-section">
      <div className="home-recents-header">
        <Clock3 size={15} className="text-muted" />
        <h2 className="home-recents-title">Mapas recientes</h2>
        <span className="home-recents-count mono">{maps.length}</span>
      </div>

      <div className="home-recents-grid">
        {maps.map((map) => (
          <button
            key={map.id}
            type="button"
            onClick={() => {
              if (map.path) {
                onSelectMap(map.path);
              } else {
                onFallbackBrowse();
              }
            }}
            className="glass-panel home-recent-card"
          >
            <span
              aria-hidden
              className="home-recent-glow"
              style={{
                backgroundImage:
                  map.cover ?? "linear-gradient(135deg, #0ea5e9, #8b5cf6)",
              }}
            />
            <div className="home-recent-content">
              <span
                className="home-recent-thumbnail"
                style={{
                  backgroundImage:
                    map.cover ?? "linear-gradient(135deg, #0ea5e9, #8b5cf6)",
                }}
              />
              <div className="home-recent-meta">
                <span className="home-recent-song-title">{map.title}</span>
                <span className="home-recent-song-artist">
                  {map.artist} • {map.difficulty}
                </span>
                <div className="home-recent-tags">
                  <span className="home-recent-key-badge mono">{map.keys}K</span>
                  <span className="home-recent-time mono">
                    {map.bpm} BPM • {formatTimeAgo(map.timestamp)}
                  </span>
                </div>
              </div>
              <span className="home-recent-play-icon">
                <Play size={13} fill="currentColor" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
