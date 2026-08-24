use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Metadatos básicos de una skin encontrada en la carpeta Skins.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkinMetadata {
    pub name: String,
    pub author: Option<String>,
    pub folder_name: String,
    pub folder_path: String,
}

/// Configuración de osu!mania para un key count específico (ej. 7K o 4K)
/// con todas las rutas absolutas de sus imágenes resueltas para toAssetUrl().
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SkinManiaConfig {
    pub keys: u8,
    pub column_start: Option<f32>,
    pub column_width: Vec<f32>,
    pub column_spacing: Vec<f32>,
    pub hit_position: Option<f32>,
    pub light_position: Option<f32>,
    pub score_position: Option<f32>,
    pub combo_position: Option<f32>,
    pub judgement_line: Option<bool>,
    pub upside_down: Option<bool>,
    pub barline_height: Option<f32>,

    // Texturas de receptores por carril (0..keys-1)
    pub key_images: Vec<Option<String>>,
    pub key_images_d: Vec<Option<String>>,

    // Texturas de notas normales por carril
    pub note_images: Vec<Option<String>>,
    // Texturas de cabeza de LN por carril
    pub note_images_h: Vec<Option<String>>,
    // Texturas de cuerpo de LN por carril
    pub note_images_l: Vec<Option<String>>,
    // Texturas de cola/cap de LN por carril
    pub note_images_t: Vec<Option<String>>,

    // Sprites de Juicios
    pub hit_0: Option<String>,
    pub hit_50: Option<String>,
    pub hit_100: Option<String>,
    pub hit_200: Option<String>,
    pub hit_300: Option<String>,
    pub hit_300g: Option<String>,

    // Luces / Efectos de golpe
    pub stage_hint: Option<String>,
    pub lighting_n: Option<String>,
    pub lighting_l: Option<String>,
}

/// Obtiene la ruta predeterminada de la carpeta Skins de osu! en Windows.
pub fn get_default_skins_dir() -> Option<PathBuf> {
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let path = PathBuf::from(local_app_data).join("osu!").join("Skins");
        if path.exists() && path.is_dir() {
            return Some(path);
        }
    }
    None
}

/// Lista todas las skins disponibles en la carpeta Skins de osu!.
pub fn list_skins(custom_dir: &Option<String>) -> Vec<SkinMetadata> {
    let skins_dir = match custom_dir {
        Some(dir) => PathBuf::from(dir),
        None => match get_default_skins_dir() {
            Some(dir) => dir,
            None => return Vec::new(),
        },
    };

    let entries = match fs::read_dir(&skins_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut result = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().into_owned();
        let skin_ini_path = path.join("skin.ini");

        let mut name = folder_name.clone();
        let mut author = None;

        // Intentar leer [General] Name y Author de skin.ini
        if skin_ini_path.exists() {
            if let Ok(content) = fs::read_to_string(&skin_ini_path) {
                let (ini_name, ini_author) = parse_skin_general(&content);
                if let Some(n) = ini_name {
                    if !n.trim().is_empty() {
                        name = n;
                    }
                }
                author = ini_author;
            }
        }

        result.push(SkinMetadata {
            name,
            author,
            folder_name,
            folder_path: path.to_string_lossy().into_owned(),
        });
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    result
}

/// Parsea el nombre y autor desde la sección [General] de skin.ini.
fn parse_skin_general(content: &str) -> (Option<String>, Option<String>) {
    let mut in_general = false;
    let mut name = None;
    let mut author = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_general = trimmed.eq_ignore_ascii_case("[General]");
            continue;
        }

        if in_general {
            if let Some((k, v)) = trimmed.split_once(':') {
                let key = k.trim().to_lowercase();
                let val = v.trim();
                if key == "name" {
                    name = Some(val.to_string());
                } else if key == "author" {
                    author = Some(val.to_string());
                }
            }
        }
    }

    (name, author)
}

/// Carga la configuración de mania para una skin y número de teclas dado.
pub fn load_mania_skin(skin_folder_path: &str, target_keys: u8) -> SkinManiaConfig {
    let folder = Path::new(skin_folder_path);
    let skin_ini_path = folder.join("skin.ini");

    let mut config = SkinManiaConfig {
        keys: target_keys,
        key_images: vec![None; target_keys as usize],
        key_images_d: vec![None; target_keys as usize],
        note_images: vec![None; target_keys as usize],
        note_images_h: vec![None; target_keys as usize],
        note_images_l: vec![None; target_keys as usize],
        note_images_t: vec![None; target_keys as usize],
        ..Default::default()
    };

    if !skin_ini_path.exists() {
        return config;
    }

    let content = match fs::read_to_string(&skin_ini_path) {
        Ok(c) => c,
        Err(_) => return config,
    };

    // skin.ini puede tener múltiples secciones [Mania], buscar la que coincida con Keys: target_keys
    let sections = parse_mania_sections(&content);
    let target_section = sections.iter().find(|s| s.keys == target_keys);

    if let Some(sec) = target_section {
        // Parsear métricas
        config.column_start = sec.get_f32("ColumnStart");
        config.hit_position = sec.get_f32("HitPosition");
        config.light_position = sec.get_f32("LightPosition");
        config.score_position = sec.get_f32("ScorePosition");
        config.combo_position = sec.get_f32("ComboPosition");
        config.barline_height = sec.get_f32("BarlineHeight");
        config.judgement_line = sec.get_bool("JudgementLine");
        config.upside_down = sec.get_bool("UpsideDown");

        if let Some(widths_str) = sec.get_str("ColumnWidth") {
            config.column_width = parse_float_array(widths_str);
        }
        if let Some(spacing_str) = sec.get_str("ColumnSpacing") {
            config.column_spacing = parse_float_array(spacing_str);
        }

        // Parsear texturas de carriles
        for i in 0..target_keys {
            let key_img_key = format!("KeyImage{i}");
            let key_img_d_key = format!("KeyImage{i}D");
            let note_img_key = format!("NoteImage{i}");
            let note_img_h_key = format!("NoteImage{i}H");
            let note_img_l_key = format!("NoteImage{i}L");
            let note_img_t_key = format!("NoteImage{i}T");

            config.key_images[i as usize] = sec.get_str(&key_img_key)
                .and_then(|val| resolve_texture_path(folder, val));

            config.key_images_d[i as usize] = sec.get_str(&key_img_d_key)
                .and_then(|val| resolve_texture_path(folder, val));

            config.note_images[i as usize] = sec.get_str(&note_img_key)
                .and_then(|val| resolve_texture_path(folder, val));

            config.note_images_h[i as usize] = sec.get_str(&note_img_h_key)
                .and_then(|val| resolve_texture_path(folder, val));

            config.note_images_l[i as usize] = sec.get_str(&note_img_l_key)
                .and_then(|val| resolve_texture_path(folder, val));

            config.note_images_t[i as usize] = sec.get_str(&note_img_t_key)
                .and_then(|val| resolve_texture_path(folder, val));
        }

        // Sprites de Juicio
        config.hit_0 = sec.get_str("Hit0").and_then(|v| resolve_texture_path(folder, v));
        config.hit_50 = sec.get_str("Hit50").and_then(|v| resolve_texture_path(folder, v));
        config.hit_100 = sec.get_str("Hit100").and_then(|v| resolve_texture_path(folder, v));
        config.hit_200 = sec.get_str("Hit200").and_then(|v| resolve_texture_path(folder, v));
        config.hit_300 = sec.get_str("Hit300").and_then(|v| resolve_texture_path(folder, v));
        config.hit_300g = sec.get_str("Hit300g").and_then(|v| resolve_texture_path(folder, v));

        // Luces y StageHint
        config.stage_hint = sec.get_str("StageHint").and_then(|v| resolve_texture_path(folder, v));
        config.lighting_n = sec.get_str("LightingN").and_then(|v| resolve_texture_path(folder, v));
        config.lighting_l = sec.get_str("LightingL").and_then(|v| resolve_texture_path(folder, v));
    }

    config
}

/// Resuelve la ruta absoluta de un archivo de textura dentro de la carpeta de la skin,
/// soportando rutas relativas, mayúsculas/minúsculas y sufijos @2x/.png omitidos.
fn resolve_texture_path(skin_folder: &Path, raw_val: &str) -> Option<String> {
    let clean = raw_val.trim();
    if clean.is_empty() || clean.eq_ignore_ascii_case("_blank") {
        return None;
    }

    let normalized = clean.replace('\\', "/");
    let mut candidates = Vec::new();

    // 1. Con extensión exacta
    candidates.push(normalized.clone());
    // 2. Con .png
    if !normalized.ends_with(".png") && !normalized.ends_with(".jpg") && !normalized.ends_with(".jpeg") {
        candidates.push(format!("{normalized}@2x.png"));
        candidates.push(format!("{normalized}.png"));
        candidates.push(format!("{normalized}@2x.jpg"));
        candidates.push(format!("{normalized}.jpg"));
    }

    for candidate in candidates {
        let direct_path = skin_folder.join(&candidate);
        if direct_path.exists() && direct_path.is_file() {
            return Some(direct_path.to_string_lossy().into_owned());
        }
    }

    // Búsqueda insensible a mayúsculas/minúsculas
    let target_subpath = Path::new(&normalized);
    let target_filename = target_subpath
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let search_dir = match target_subpath.parent() {
        Some(p) if p != Path::new("") => skin_folder.join(p),
        _ => skin_folder.to_path_buf(),
    };

    if let Ok(entries) = fs::read_dir(&search_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(fname) = p.file_name() {
                    let fname_lower = fname.to_string_lossy().to_lowercase();
                    if fname_lower == target_filename
                        || fname_lower == format!("{target_filename}.png")
                        || fname_lower == format!("{target_filename}@2x.png")
                    {
                        return Some(p.to_string_lossy().into_owned());
                    }
                }
            }
        }
    }

    None
}

/// Parsea un string separado por comas a un vector de f32.
fn parse_float_array(val: &str) -> Vec<f32> {
    val.split(',')
        .filter_map(|part| part.trim().parse::<f32>().ok())
        .collect()
}

struct RawManiaSection {
    keys: u8,
    props: HashMap<String, String>,
}

impl RawManiaSection {
    fn get_str(&self, key: &str) -> Option<&str> {
        self.props.get(&key.to_lowercase()).map(|s| s.as_str())
    }

    fn get_f32(&self, key: &str) -> Option<f32> {
        self.get_str(key).and_then(|s| s.parse::<f32>().ok())
    }

    fn get_bool(&self, key: &str) -> Option<bool> {
        self.get_str(key).map(|s| s == "1" || s.eq_ignore_ascii_case("true"))
    }
}

/// Parsea todas las secciones [Mania] de un skin.ini en bloques estructurados.
fn parse_mania_sections(content: &str) -> Vec<RawManiaSection> {
    let mut sections = Vec::new();
    let mut in_mania = false;
    let mut current_props = HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if in_mania && !current_props.is_empty() {
                let keys = current_props
                    .get("keys")
                    .and_then(|k: &String| k.parse::<u8>().ok())
                    .unwrap_or(0);
                if keys > 0 {
                    sections.push(RawManiaSection {
                        keys,
                        props: current_props.clone(),
                    });
                }
                current_props.clear();
            }

            in_mania = trimmed.eq_ignore_ascii_case("[Mania]");
            continue;
        }

        if in_mania {
            if let Some((k, v)) = trimmed.split_once(':') {
                let key = k.trim().to_lowercase();
                // Eliminar comentarios en línea después del valor
                let val_part = if let Some((clean_val, _)) = v.split_once("//") {
                    clean_val.trim()
                } else {
                    v.trim()
                };
                current_props.insert(key, val_part.to_string());
            }
        }
    }

    if in_mania && !current_props.is_empty() {
        let keys = current_props
            .get("keys")
            .and_then(|k: &String| k.parse::<u8>().ok())
            .unwrap_or(0);
        if keys > 0 {
            sections.push(RawManiaSection {
                keys,
                props: current_props,
            });
        }
    }

    sections
}
