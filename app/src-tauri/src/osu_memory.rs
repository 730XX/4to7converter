#[cfg(target_os = "windows")]
pub mod windows_scanner {
    use serde::Serialize;
    use std::path::PathBuf;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM, MAX_PATH};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::ProcessStatus::GetModuleFileNameExW;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    #[derive(Debug, Clone, Serialize)]
        pub struct OsuDetectedBeatmap {
        pub path: String,
        pub folder_name: String,
        pub file_name: String,
        pub title: Option<String>,
        pub artist: Option<String>,
        pub version: Option<String>,
    }

    #[derive(Debug, Clone, Serialize)]
    pub struct OsuDetectResponse {
        pub map: Option<OsuDetectedBeatmap>,
        pub logs: Vec<String>,
    }

    /// Encuentra el PID del proceso osu!.exe
    pub fn find_osu_pid(logs: &mut Vec<String>) -> Option<u32> {
        unsafe {
            let snapshot: HANDLE = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == 0 as HANDLE || snapshot == -1isize as HANDLE {
                logs.push("[AVISO] [Rust] CreateToolhelp32Snapshot falló".into());
                return None;
            }

            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let exe_name = String::from_utf16_lossy(&entry.szExeFile[..len]);

                    if exe_name.eq_ignore_ascii_case("osu!.exe") {
                        let pid = entry.th32ProcessID;
                        CloseHandle(snapshot);
                        logs.push(format!("[OK] [Rust] Proceso osu!.exe detectado (PID: {})", pid));
                        return Some(pid);
                    }

                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }

            CloseHandle(snapshot);
            logs.push("[ERROR] [Rust] Proceso osu!.exe no encontrado en ejecución".into());
            None
        }
    }

    /// Obtiene la ruta real de instalación de osu! desde el proceso activo
    pub fn get_osu_install_dir(pid: u32) -> Option<PathBuf> {
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
            if process == 0 as HANDLE {
                return None;
            }

            let mut buffer = [0u16; MAX_PATH as usize * 2];
            let len = GetModuleFileNameExW(
                process,
                0 as _,
                buffer.as_mut_ptr(),
                buffer.len() as u32,
            );
            CloseHandle(process);

            if len > 0 {
                let exe_path_str = String::from_utf16_lossy(&buffer[..len as usize]);
                let exe_path = PathBuf::from(exe_path_str);
                return exe_path.parent().map(|p| p.to_path_buf());
            }
            None
        }
    }

    /// Resuelve la carpeta Songs exacta de osu! (leyendo osu!.<user>.cfg si existe)
    pub fn resolve_songs_dir(pid: u32, logs: &mut Vec<String>) -> Option<PathBuf> {
        // 1. Obtener carpeta desde el ejecutable real de osu!.exe
        let base_dir = if let Some(dir) = get_osu_install_dir(pid) {
            logs.push(format!("[CARPETA] [Rust] Ruta de osu!.exe detectada: {:?}", dir));
            dir
        } else if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            PathBuf::from(local_app_data).join("osu!")
        } else {
            PathBuf::from(r"C:\Program Files\osu!")
        };

        // 2. Verificar si en osu!.<usuario>.cfg se configuró un BeatmapDirectory personalizado
        if let Ok(entries) = std::fs::read_dir(&base_dir) {
            for entry in entries.flatten() {
                let fname = entry.file_name().to_string_lossy().to_string();
                if fname.starts_with("osu!.") && fname.ends_with(".cfg") && !fname.contains("auth") {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        for line in content.lines() {
                            let trimmed = line.trim();
                            if let Some(val) = trimmed.strip_prefix("BeatmapDirectory") {
                                let custom_path = val.trim_start_matches('=').trim().trim_matches('"');
                                if !custom_path.is_empty() {
                                    let pb = PathBuf::from(custom_path);
                                    let full = if pb.is_absolute() { pb } else { base_dir.join(pb) };
                                    if full.exists() {
                                        logs.push(format!("[CARPETA] [Rust] Carpeta Songs personalizada encontrada en cfg: {:?}", full));
                                        return Some(full);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Comprobar Songs estándar en la carpeta base de osu!
        let default_songs = base_dir.join("Songs");
        if default_songs.exists() {
            logs.push(format!("[CARPETA] [Rust] Carpeta Songs estándar encontrada: {:?}", default_songs));
            return Some(default_songs);
        }

        // 4. Intentar rutas comunes de fallback
        let fallback_candidates = [
            PathBuf::from(r"C:\osu!\Songs"),
            PathBuf::from(r"D:\osu!\Songs"),
            PathBuf::from(r"E:\osu!\Songs"),
            PathBuf::from(r"C:\Games\osu!\Songs"),
            PathBuf::from(r"D:\Games\osu!\Songs"),
            PathBuf::from(r"E:\Games\osu!\Songs"),
        ];

        for cand in fallback_candidates {
            if cand.exists() {
                logs.push(format!("[CARPETA] [Rust] Carpeta Songs encontrada en fallback: {:?}", cand));
                return Some(cand);
            }
        }

        logs.push(format!("[ERROR] [Rust] No se encontró la carpeta Songs en {:?}", default_songs));
        None
    }

    /// Detección ultra-rápida (0.1ms, 0 RAM) por Título de Ventana en Song Select y Juego
    pub fn scan_window_title_beatmap(pid: u32, logs: &mut Vec<String>) -> Option<OsuDetectedBeatmap> {
        unsafe {
            struct WindowSearch {
                target_pid: u32,
                title: String,
                all_titles: Vec<String>,
            }

            unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> i32 {
                let search = &mut *(lparam as *mut WindowSearch);
                let mut window_pid = 0;
                GetWindowThreadProcessId(hwnd, &mut window_pid);

                if window_pid == search.target_pid && IsWindowVisible(hwnd) != 0 {
                    let len = GetWindowTextLengthW(hwnd);
                    if len > 0 {
                        let mut title_buf = vec![0u16; (len + 1) as usize];
                        GetWindowTextW(hwnd, title_buf.as_mut_ptr(), len + 1);
                        let title = String::from_utf16_lossy(&title_buf[..len as usize]);
                        search.all_titles.push(title.clone());

                        if title.starts_with("osu!") {
                            search.title = title;
                            return 0; // Detener en ventana de osu!
                        }
                    }
                }
                1
            }

            let mut search_data = WindowSearch {
                target_pid: pid,
                title: String::new(),
                all_titles: Vec::new(),
            };

            EnumWindows(
                Some(enum_windows_callback),
                &mut search_data as *mut _ as LPARAM,
            );

            if search_data.title.is_empty() {
                logs.push(format!("[AVISO] [Rust] Ventanas detectadas: {:?}", search_data.all_titles));
                return None;
            }

            let win_title = search_data.title;
            logs.push(format!("[VENTANA] [Rust] Título capturado: '{}'", win_title));

            if win_title.trim() == "osu!" {
                logs.push("[INFO] [Rust] Título es solo 'osu!' (En menú principal o cargando)".into());
                return None;
            }

            let raw = win_title.trim_start_matches("osu!").trim();
            let raw = raw.trim_start_matches('-').trim();

            // Extraer dificultad si está entre corchetes [Diff]
            let (artist, title, difficulty) = if let (Some(d_start), Some(d_end)) = (raw.rfind('['), raw.rfind(']')) {
                if d_start < d_end {
                    let diff = &raw[d_start + 1..d_end];
                    let at = raw[..d_start].trim();
                    let mut parts = at.splitn(2, " - ");
                    let art = parts.next().unwrap_or("").trim();
                    let tit = parts.next().unwrap_or(art).trim();
                    (art, tit, diff)
                } else {
                    ("", "", "")
                }
            } else {
                let mut parts = raw.splitn(2, " - ");
                let art = parts.next().unwrap_or("").trim();
                let tit = parts.next().unwrap_or(art).trim();
                (art, tit, "")
            };

            if artist.is_empty() && title.is_empty() {
                logs.push(format!("[AVISO] [Rust] No se pudo parsear artista/canción de: '{}'", raw));
                return None;
            }

            logs.push(format!(
                "[MUSICA] [Rust] Parseado: Artista='{}', Título='{}', Dificultad='{}'",
                artist, title, difficulty
            ));

            let songs_dir = resolve_songs_dir(pid, logs)?;

            // Búsqueda inteligente en la carpeta Songs
            if let Ok(entries) = std::fs::read_dir(&songs_dir) {
                let lower_title = title.to_lowercase();
                let lower_artist = artist.to_lowercase();
                let lower_diff = difficulty.to_lowercase();

                let mut best_candidate: Option<OsuDetectedBeatmap> = None;

                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let folder_name = match path.file_name() {
                            Some(name) => name.to_string_lossy().to_string(),
                            None => continue,
                        };

                        let lower_folder = folder_name.to_lowercase();
                        // Coincidencia con el título o artista en el nombre de la carpeta
                        if lower_folder.contains(&lower_title) || lower_folder.contains(&lower_artist) {
                            if let Ok(files) = std::fs::read_dir(&path) {
                                for file in files.flatten() {
                                    let fpath = file.path();
                                    if fpath.extension().and_then(|e| e.to_str()) == Some("osu") {
                                        let file_name = match fpath.file_name() {
                                            Some(name) => name.to_string_lossy().to_string(),
                                            None => continue,
                                        };
                                        let lower_fname = file_name.to_lowercase();

                                        // 1. Si la dificultad coincide exactamente, retornar inmediatamente
                                        if !lower_diff.is_empty()
                                            && (lower_fname.contains(&format!("[{}]", lower_diff))
                                                || lower_fname.contains(&lower_diff))
                                        {
                                            logs.push(format!("[OK] [Rust] ¡Match exacto con dificultad!: {:?}", fpath));
                                            return Some(OsuDetectedBeatmap {
                                                path: fpath.to_string_lossy().to_string(),
                                                folder_name,
                                                file_name,
                                                title: Some(title.to_string()),
                                                artist: Some(artist.to_string()),
                                                version: Some(difficulty.to_string()),
                                            });
                                        }

                                        // 2. Si estamos en Song Select sin dificultad en el título, guardar como candidato
                                        if best_candidate.is_none() {
                                            best_candidate = Some(OsuDetectedBeatmap {
                                                path: fpath.to_string_lossy().to_string(),
                                                folder_name: folder_name.clone(),
                                                file_name,
                                                title: Some(title.to_string()),
                                                artist: Some(artist.to_string()),
                                                version: if lower_diff.is_empty() { None } else { Some(difficulty.to_string()) },
                                            });
                                        }
                                    }
                                }

                                if let Some(cand) = best_candidate.clone() {
                                    if lower_diff.is_empty() {
                                        logs.push(format!("[OK] [Rust] ¡Match en menú Song Select!: {:?}", cand.path));
                                        return Some(cand);
                                    }
                                }
                            }
                        }
                    }
                }

                if let Some(cand) = best_candidate {
                    logs.push(format!("[OK] [Rust] ¡Match por carpeta Songs!: {:?}", cand.path));
                    return Some(cand);
                }
            }

            logs.push("[AVISO] [Rust] No se encontró carpeta coincidente en Songs".into());
            None
        }
    }

    /// Usa el helper compilado en C# que contiene OsuMemoryDataProvider
    pub fn scan_osu_memory(pid: u32, logs: &mut Vec<String>) -> Option<OsuDetectedBeatmap> {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        
        let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        
        // Dependiendo de si se lanza en dev ("app" o "app/src-tauri") o producción instalada
        let mut exe_path = current.join("src-tauri").join("osu-detector").join("bin").join("Release").join("net9.0").join("win-x86").join("osu-detector.exe");
        if !exe_path.exists() {
            exe_path = current.join("osu-detector").join("bin").join("Release").join("net9.0").join("win-x86").join("osu-detector.exe");
        }
        if !exe_path.exists() {
            if let Ok(curr_exe) = std::env::current_exe() {
                if let Some(parent) = curr_exe.parent() {
                    let p1 = parent.join("osu-detector.exe");
                    let p2 = parent.join("resources").join("osu-detector.exe");
                    let p3 = parent.join("_up_").join("osu-detector").join("bin").join("Release").join("net9.0").join("win-x86").join("osu-detector.exe");
                    if p1.exists() {
                        exe_path = p1;
                    } else if p2.exists() {
                        exe_path = p2;
                    } else if p3.exists() {
                        exe_path = p3;
                    }
                }
            }
        }

        if !exe_path.exists() {
            logs.push(format!("[AVISO] [Rust/C#] Helper osu-detector no encontrado en {:?}", current));
            return None;
        }

        let output = Command::new(&exe_path)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    if let Some(err) = json.get("error") {
                        logs.push(format!("[AVISO] [Rust/C#] El helper reportó error: {}", err));
                        return None;
                    }

                    if let (Some(folder), Some(file)) = (json.get("folder_name"), json.get("file_name")) {
                        let folder = folder.as_str().unwrap_or("").to_string();
                        let file = file.as_str().unwrap_or("").to_string();

                        if !folder.is_empty() && file.ends_with(".osu") {
                            let songs_dir = resolve_songs_dir(pid, &mut Vec::new()).unwrap_or_else(|| {
                                PathBuf::from(r"C:\Program Files\osu!\Songs")
                            });
                            
                            let full_path = songs_dir.join(&folder).join(&file);
                            if full_path.exists() {
                                logs.push(format!("[OK] [Rust/C#] ¡Mapa activo extraído con Helper!: {} / {}", folder, file));
                                return Some(OsuDetectedBeatmap {
                                    path: full_path.to_string_lossy().to_string(),
                                    folder_name: folder,
                                    file_name: file,
                                    title: None,
                                    artist: None,
                                    version: None,
                                });
                            } else {
                                logs.push(format!("[AVISO] [Rust/C#] El helper encontró el mapa pero no existe en disco: {:?}", full_path));
                            }
                        }
                    }
                } else {
                    logs.push(format!("[AVISO] [Rust/C#] No se pudo parsear el JSON del helper: {}", stdout));
                }
            },
            Err(e) => {
                logs.push(format!("[AVISO] [Rust/C#] Falló la ejecución de osu-detector.exe: {}", e));
            }
        }
        None
    }

    /// Detector final: Intenta por Ventana, luego usa escáner asíncrono en Memoria
    pub fn detect_current_osu_beatmap() -> OsuDetectResponse {
        let mut logs = Vec::new();
        logs.push("[BUSQUEDA] [Rust] Escaneando estado de osu!...".into());

        let pid = match find_osu_pid(&mut logs) {
            Some(pid) => pid,
            None => {
                return OsuDetectResponse {
                    map: None,
                    logs,
                }
            }
        };

        if let Some(map) = scan_window_title_beatmap(pid, &mut logs) {
            return OsuDetectResponse { map: Some(map), logs };
        }

        logs.push("[BUSQUEDA] [Rust] Ventana no sirvió, iniciando lector de memoria (RAM)...".into());
        let map = scan_osu_memory(pid, &mut logs);
        
        OsuDetectResponse { map, logs }
    }
}
