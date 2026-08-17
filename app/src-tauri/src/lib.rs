use serde::Serialize;
use std::path::Path;
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

/// Busca la imagen de fondo en la seccion [Events] y resuelve su ruta absoluta.
fn resolve_background_path(osu_path: &str, content: &str) -> Option<String> {
    let bg_filename = find_background_filename(content)?;
    let bg_path = Path::new(osu_path)
        .parent()
        .unwrap_or(Path::new("."))
        .join(bg_filename);
    if bg_path.exists() {
        Some(bg_path.to_string_lossy().into_owned())
    } else {
        None
    }
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
/// Ejemplo: 0,0,"bg.png",0,0 o 0,0,bg.png,0,0
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
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() >= 3 && (parts[0].trim() == "0" || parts[0].trim().eq_ignore_ascii_case("Video")) {
            let candidate = parts[2].trim().trim_matches('"');
            let lower = candidate.to_lowercase();
            if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".webp") || lower.ends_with(".bmp") {
                return Some(candidate.to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn splash_screen(app: AppHandle) -> Result<(), String> {

  // Close splash if it exists
  if let Some(splash) = app.get_webview_window("splashscreen") {
    let _ = splash.close();
  } else {
    eprintln!("splashscreen window not found");
  }

  // Show main if it exists
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
            logs: vec!["⚠️ Plataforma no es Windows".into()],
        })
    }
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![splash_screen, load_beatmap, detect_osu_map, save_beatmap])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}