use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Resultado de cargar un beatmap desde el disco, junto con la ruta de su audio e imagen de fondo.
#[derive(Serialize)]
struct BeatmapLoad {
    content: String,
    audio_path: Option<String>,
    background_path: Option<String>,
}

/// Lee un archivo .osu y resuelve la ruta absoluta del audio referenciado por
/// `AudioFilename` en la seccion [General], y la imagen de fondo en [Events].
#[tauri::command]
fn load_beatmap(path: String) -> Result<BeatmapLoad, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|error| format!("No se pudo leer el archivo: {error}"))?;
    let audio_path = resolve_audio_path(&path, &content);
    let background_path = resolve_background_path(&path, &content);
    Ok(BeatmapLoad {
        content,
        audio_path,
        background_path,
    })
}

/// Busca la linea `AudioFilename` dentro de la seccion [General] y resuelve su
/// ruta absoluta en la carpeta del beatmap. Devuelve None cuando el campo esta
/// ausente o el archivo de audio no existe.
fn resolve_audio_path(osu_path: &str, content: &str) -> Option<String> {
    let audio_filename = find_audio_filename(content)?;
    let audio_path = Path::new(osu_path)
        .parent()
        .unwrap_or(Path::new("."))
        .join(audio_filename);
    if audio_path.exists() {
        Some(audio_path.to_string_lossy().into_owned())
    } else {
        None
    }
}

/// Busca la imagen de fondo en la seccion [Events] y resuelve su ruta absoluta de forma ultra-tolerante.
fn resolve_background_path(osu_path: &str, content: &str) -> Option<String> {
    let parent = Path::new(osu_path).parent().unwrap_or(Path::new("."));

    // 1. Intentar resolver desde [Events]
    if let Some(bg_filename) = find_background_filename(content) {
        let clean_name = bg_filename.replace('\\', "/");
        let direct_path = parent.join(&clean_name);
        if direct_path.exists() && direct_path.is_file() {
            return Some(direct_path.to_string_lossy().into_owned());
        }

        // Búsqueda insensible a mayúsculas/minúsculas en el directorio
        let target_filename = Path::new(&clean_name)
            .file_name()
            .map(|s| s.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        if !target_filename.is_empty() {
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        if let Some(fname) = p.file_name() {
                            if fname.to_string_lossy().to_lowercase() == target_filename {
                                return Some(p.to_string_lossy().into_owned());
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback: Buscar cualquier imagen válida (.jpg, .jpeg, .png, .webp) en la carpeta del beatmap
    if let Ok(entries) = std::fs::read_dir(parent) {
        let mut candidates: Vec<(std::path::PathBuf, u64, bool)> = Vec::new();
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if ext_str == "jpg" || ext_str == "jpeg" || ext_str == "png" || ext_str == "webp" {
                        let fname_lower = p.file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
                        let is_named_bg = fname_lower.contains("bg") || fname_lower.contains("background");
                        let size = entry.metadata().ok().map(|m| m.len()).unwrap_or(0);
                        candidates.push((p, size, is_named_bg));
                    }
                }
            }
        }

        // Prioridad: 1) Archivos con 'bg' o 'background' en el nombre, 2) Archivos de mayor tamaño (fondo de alta resolución)
        if !candidates.is_empty() {
            candidates.sort_by(|a, b| {
                if a.2 != b.2 {
                    b.2.cmp(&a.2) // Priorizar nombres con "bg"
                } else {
                    b.1.cmp(&a.1) // Luego por tamaño mayor
                }
            });
            return Some(candidates[0].0.to_string_lossy().into_owned());
        }
    }

    None
}

/// Extrae el valor de `AudioFilename` de la seccion [General], quitando las
/// comillas dobles si las tiene. Devuelve None si la seccion o la clave no
/// existen.
fn find_audio_filename(content: &str) -> Option<String> {
    let mut in_general = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_general = trimmed.eq_ignore_ascii_case("[General]");
            continue;
        }
        if !in_general {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("AudioFilename:") {
            let filename = rest.trim().trim_matches('"');
            return if filename.is_empty() {
                None
            } else {
                Some(filename.to_string())
            };
        }
    }
    None
}

/// Extrae el nombre del archivo de fondo de la seccion [Events].
fn find_background_filename(content: &str) -> Option<String> {
    let mut in_events = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_events = trimmed.eq_ignore_ascii_case("[Events]");
            continue;
        }
        if !in_events {
            continue;
        }
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        // Formato estándar de osu!: 0,0,"nombre.jpg",0,0 o 0,0,nombre.png
        let parts: Vec<&str> = trimmed.split(',').collect();
        for part in &parts {
            let candidate = part.trim().trim_matches('"').trim_matches('\'').trim();
            let lower = candidate.to_lowercase();
            if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") || lower.ends_with(".webp") || lower.ends_with(".bmp") {
                return Some(candidate.to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn splash_screen(app: AppHandle) -> Result<(), String> {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
    } else {
        return Err("main window not found".into());
    }
    Ok(())
}

mod osu_memory;

#[cfg(target_os = "windows")]
use osu_memory::windows_scanner::{detect_current_osu_beatmap, OsuDetectResponse};

#[tauri::command]
fn save_beatmap(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|error| format!("No se pudo guardar el archivo: {error}"))
}

#[tauri::command]
async fn detect_osu_map() -> Result<OsuDetectResponse, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(detect_current_osu_beatmap())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(OsuDetectResponse {
            map: None,
            logs: vec!["[AVISO] Plataforma no es Windows".into()],
        })
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct BeatmapDiffItem {
    pub path: String,
    pub file_name: String,
    pub version: String,
    pub mode: u8,
    pub key_count: u8,
}

fn find_metadata_field(content: &str, field: &str) -> Option<String> {
    let mut in_metadata = false;
    let prefix = format!("{}:", field);
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_metadata = trimmed.eq_ignore_ascii_case("[Metadata]");
            continue;
        }
        if !in_metadata {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix(&prefix) {
            let val = rest.trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn find_general_field(content: &str, field: &str) -> Option<String> {
    let mut in_general = false;
    let prefix = format!("{}:", field);
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_general = trimmed.eq_ignore_ascii_case("[General]");
            continue;
        }
        if !in_general {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix(&prefix) {
            let val = rest.trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn find_difficulty_field(content: &str, field: &str) -> Option<String> {
    let mut in_difficulty = false;
    let prefix = format!("{}:", field);
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_difficulty = trimmed.eq_ignore_ascii_case("[Difficulty]");
            continue;
        }
        if !in_difficulty {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix(&prefix) {
            let val = rest.trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn list_beatmap_difficulties(path: String) -> Result<Vec<BeatmapDiffItem>, String> {
    let p = Path::new(&path);
    let parent = p.parent().ok_or_else(|| "No se pudo obtener el directorio del archivo".to_string())?;
    let mut diffs = Vec::new();

    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(ext) = entry_path.extension() {
                    if ext.eq_ignore_ascii_case("osu") {
                        if let Ok(content) = std::fs::read_to_string(&entry_path) {
                            let version = find_metadata_field(&content, "Version")
                                .unwrap_or_else(|| {
                                    entry_path.file_stem()
                                        .map(|s| s.to_string_lossy().into_owned())
                                        .unwrap_or_else(|| "Unknown".to_string())
                                });
                            let mode_str = find_general_field(&content, "Mode").unwrap_or_default();
                            let mode: u8 = mode_str.parse().unwrap_or(0);
                            let cs_str = find_difficulty_field(&content, "CircleSize").unwrap_or_default();
                            let key_count: u8 = cs_str.parse().unwrap_or(4);

                            diffs.push(BeatmapDiffItem {
                                path: entry_path.to_string_lossy().into_owned(),
                                file_name: entry.file_name().to_string_lossy().into_owned(),
                                version,
                                mode,
                                key_count,
                            });
                        }
                    }
                }
            }
        }
    }

    diffs.sort_by(|a, b| a.version.to_lowercase().cmp(&b.version.to_lowercase()));
    Ok(diffs)
}

#[derive(Serialize, Clone, Debug)]
pub struct BeatmapSearchItem {
    pub path: String,
    pub title: String,
    pub artist: String,
    pub creator: String,
    pub folder_name: String,
    pub diff_count: usize,
    pub key_modes: Vec<String>,
    pub preview_version: String,
}

// ---------------------------------------------------------------------------
// Índice de búsqueda en memoria — construido una sola vez, consultado en <5ms
// ---------------------------------------------------------------------------

/// Entrada del índice de búsqueda precalculado para un mapset completo.
#[derive(Clone, Debug)]
struct IndexedMapset {
    path: String,
    title: String,
    artist: String,
    creator: String,
    folder_name: String,
    diff_count: usize,
    key_modes: Vec<String>,
    preview_version: String,
    /// Texto precalculado en lowercase para búsqueda instantánea sin allocations.
    search_text: String,
}

/// Caché global del índice de búsqueda. Se construye lazy en la primera búsqueda.
static SEARCH_INDEX: Mutex<Option<Vec<IndexedMapset>>> = Mutex::new(None);

/// Resuelve la ruta raíz de la carpeta Songs de osu! a partir de la ruta del beatmap actual.
fn resolve_songs_dir(base_path: &Option<String>) -> Option<std::path::PathBuf> {
    if let Some(ref bp) = base_path {
        let p = Path::new(bp);
        if let Some(parent) = p.parent() {
            if let Some(grandparent) = parent.parent() {
                if grandparent.exists() {
                    return Some(grandparent.to_path_buf());
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let default_songs = Path::new(&local_app_data).join("osu!").join("Songs");
            if default_songs.exists() {
                return Some(default_songs);
            }
        }
    }

    None
}

/// Extrae solo `Mode:` y `CircleSize:` de las primeras ~40 líneas de un .osu.
/// Ultra-rápido: no parsea metadatos completos, solo identifica el modo de juego.
fn parse_osu_mode_only(path: &Path) -> Option<(u8, u8)> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::with_capacity(2048, file);
    let mut mode: u8 = 0;
    let mut key_count: u8 = 4;
    let mut lines_read: u32 = 0;

    for line_res in reader.lines() {
        lines_read += 1;
        if lines_read > 50 { break; }
        let line = match line_res {
            Ok(l) => l,
            Err(_) => break,
        };
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("Mode:") {
            mode = val.trim().parse().unwrap_or(0);
        } else if let Some(val) = trimmed.strip_prefix("CircleSize:") {
            key_count = val.trim().parse().unwrap_or(4);
        }
        // Si ya encontramos ambos campos, salir inmediatamente
        if trimmed.starts_with("[TimingPoints]") || trimmed.starts_with("[HitObjects]") || trimmed.starts_with("[Events]") {
            break;
        }
    }
    Some((mode, key_count))
}

/// Construye el índice completo escaneando la carpeta Songs una sola vez.
/// Lee un solo .osu por carpeta para metadatos, y un scan rápido del resto
/// para key_modes/diff_count.
fn build_search_index(songs_dir: &Path) -> Vec<IndexedMapset> {
    let mut index = Vec::with_capacity(1024);

    let entries = match std::fs::read_dir(songs_dir) {
        Ok(e) => e,
        Err(_) => return index,
    };

    for entry in entries.flatten() {
        let folder_path = entry.path();
        if !folder_path.is_dir() {
            continue;
        }

        let folder_name = folder_path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();

        // Listar archivos .osu de la carpeta
        let mut osu_files: Vec<std::path::PathBuf> = Vec::new();
        if let Ok(osu_entries) = std::fs::read_dir(&folder_path) {
            for osu_entry in osu_entries.flatten() {
                let p = osu_entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension() {
                        if ext.eq_ignore_ascii_case("osu") {
                            osu_files.push(p);
                        }
                    }
                }
            }
        }

        if osu_files.is_empty() {
            continue;
        }

        let diff_count = osu_files.len();

        // Leer metadatos completos del PRIMER .osu solamente
        let first_meta = match parse_osu_quick_meta(&osu_files[0]) {
            Some(m) => m,
            None => continue,
        };

        // Scan rápido de los demás para key_modes (solo Mode: y CircleSize:)
        let mut key_modes_set = std::collections::BTreeSet::new();
        let first_mode_label = if first_meta.mode == 3 {
            format!("{}K", first_meta.key_count)
        } else {
            "STD".to_string()
        };
        key_modes_set.insert(first_mode_label);

        for osu_file in osu_files.iter().skip(1) {
            if let Some((mode, kc)) = parse_osu_mode_only(osu_file) {
                let label = if mode == 3 {
                    format!("{}K", kc)
                } else {
                    "STD".to_string()
                };
                key_modes_set.insert(label);
            }
        }

        // Precalcular search_text en lowercase para búsquedas O(1) de string matching
        let search_text = format!(
            "{} {} {} {}",
            folder_name.to_lowercase(),
            first_meta.title.to_lowercase(),
            first_meta.artist.to_lowercase(),
            first_meta.creator.to_lowercase(),
        );

        index.push(IndexedMapset {
            path: osu_files[0].to_string_lossy().into_owned(),
            title: first_meta.title,
            artist: first_meta.artist,
            creator: first_meta.creator,
            folder_name,
            diff_count,
            key_modes: key_modes_set.into_iter().collect(),
            preview_version: first_meta.version,
            search_text,
        });
    }

    index
}

#[tauri::command]
async fn search_beatmaps(
    query: String,
    base_path: Option<String>,
) -> Result<Vec<BeatmapSearchItem>, String> {
    let clean_query = query.trim().to_lowercase();
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let query_words: Vec<&str> = clean_query.split_whitespace().collect();

        // Lazy-build: construir el índice solo la primera vez
        let mut guard = SEARCH_INDEX.lock().unwrap();
        if guard.is_none() {
            if let Some(songs_dir) = resolve_songs_dir(&base_path) {
                *guard = Some(build_search_index(&songs_dir));
            } else {
                return Ok(Vec::new());
            }
        }

        let index = match guard.as_ref() {
            Some(idx) => idx,
            None => return Ok(Vec::new()),
        };

        // Búsqueda en RAM puro: filtrar el índice precalculado
        let max_results = 30;
        let results: Vec<BeatmapSearchItem> = index
            .iter()
            .filter(|m| query_words.iter().all(|&w| m.search_text.contains(w)))
            .take(max_results)
            .map(|m| BeatmapSearchItem {
                path: m.path.clone(),
                title: m.title.clone(),
                artist: m.artist.clone(),
                creator: m.creator.clone(),
                folder_name: m.folder_name.clone(),
                diff_count: m.diff_count,
                key_modes: m.key_modes.clone(),
                preview_version: m.preview_version.clone(),
            })
            .collect();

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Invalida el caché del índice de búsqueda para forzar un rebuild en la próxima consulta.
#[tauri::command]
fn invalidate_search_index() {
    if let Ok(mut guard) = SEARCH_INDEX.lock() {
        *guard = None;
    }
}

struct QuickMeta {
    title: String,
    artist: String,
    creator: String,
    version: String,
    mode: u8,
    key_count: u8,
}

fn parse_osu_quick_meta(path: &Path) -> Option<QuickMeta> {
    let file = std::fs::File::open(path).ok()?;
    use std::io::{BufRead, BufReader};
    let reader = BufReader::new(file);

    let mut title = String::new();
    let mut artist = String::new();
    let mut creator = String::new();
    let mut version = String::new();
    let mut mode: u8 = 0;
    let mut key_count: u8 = 4;
    let mut in_section = String::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => break,
        };
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed.to_ascii_lowercase();
            // Detener lectura antes de TimingPoints y HitObjects
            if in_section == "[timingpoints]" || in_section == "[hitobjects]" {
                break;
            }
            continue;
        }

        if in_section == "[metadata]" {
            if let Some(val) = trimmed.strip_prefix("Title:") {
                title = val.trim().to_string();
            } else if let Some(val) = trimmed.strip_prefix("Artist:") {
                artist = val.trim().to_string();
            } else if let Some(val) = trimmed.strip_prefix("Creator:") {
                creator = val.trim().to_string();
            } else if let Some(val) = trimmed.strip_prefix("Version:") {
                version = val.trim().to_string();
            }
        } else if in_section == "[general]" {
            if let Some(val) = trimmed.strip_prefix("Mode:") {
                mode = val.trim().parse().unwrap_or(0);
            }
        } else if in_section == "[difficulty]" {
            if let Some(val) = trimmed.strip_prefix("CircleSize:") {
                key_count = val.trim().parse().unwrap_or(4);
            }
        }
    }

    Some(QuickMeta {
        title,
        artist,
        creator,
        version,
        mode,
        key_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1600));
                if let Some(splash) = handle.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
                if let Some(main) = handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            });

            // Calentar e indexar canciones de osu! en segundo plano silenciosamente
            std::thread::spawn(|| {
                if let Some(songs_dir) = resolve_songs_dir(&None) {
                    let new_index = build_search_index(&songs_dir);
                    if let Ok(mut guard) = SEARCH_INDEX.lock() {
                        if guard.is_none() {
                            *guard = Some(new_index);
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            splash_screen,
            load_beatmap,
            detect_osu_map,
            save_beatmap,
            list_beatmap_difficulties,
            search_beatmaps,
            invalidate_search_index
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}