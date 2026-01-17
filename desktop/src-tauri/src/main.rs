#![cfg_attr(
    not(debug_assertions),
    windows_subsystem = "windows"
)]

use std::env;
use std::ffi::{OsStr, OsString};
use std::path::{Component, Path, PathBuf};

enum NormalizedPart {
    Prefix(OsString),
    Root(OsString),
    Segment(OsString),
}

fn simplify_path(path: &Path) -> PathBuf {
    let is_absolute = path.is_absolute();
    let mut components: Vec<NormalizedPart> = Vec::new();

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => components.push(NormalizedPart::Prefix(prefix.as_os_str().to_os_string())),
            Component::RootDir => components.push(NormalizedPart::Root(component.as_os_str().to_os_string())),
            Component::CurDir => {}
            Component::ParentDir => {
                if let Some(last) = components.last() {
                    match last {
                        NormalizedPart::Segment(segment) if segment.as_os_str() != OsStr::new("..") => {
                            components.pop();
                            continue;
                        }
                        NormalizedPart::Segment(_) => {
                            if !is_absolute {
                                components.push(NormalizedPart::Segment(OsString::from("..")));
                            }
                            continue;
                        }
                        NormalizedPart::Root(_) | NormalizedPart::Prefix(_) => {
                            if !is_absolute {
                                components.push(NormalizedPart::Segment(OsString::from("..")));
                            }
                            continue;
                        }
                    }
                }
                if !is_absolute {
                    components.push(NormalizedPart::Segment(OsString::from("..")));
                }
            }
            Component::Normal(segment) => components.push(NormalizedPart::Segment(segment.to_os_string())),
        }
    }

    let mut normalized = PathBuf::new();
    for part in components {
        match part {
            NormalizedPart::Prefix(value) => normalized.push(value),
            NormalizedPart::Root(value) => normalized.push(value),
            NormalizedPart::Segment(value) => normalized.push(value),
        }
    }

    normalized
}

#[tauri::command]
fn normalize_path(raw_path: String) -> Result<String, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Path is required".into());
    }

    let candidate = PathBuf::from(trimmed);
    let base_path = if candidate.is_absolute() {
        candidate
    } else {
        env::current_dir().map_err(|err| format!("Unable to resolve current directory: {err}"))?.join(candidate)
    };

    let normalized = simplify_path(&base_path);
    Ok(normalized.to_string_lossy().into_owned())
}

#[tauri::command]
fn detect_platform() -> String {
    env::consts::OS.to_string()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![normalize_path, detect_platform])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
