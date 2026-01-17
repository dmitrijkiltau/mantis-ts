#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use screenshots::image::{DynamicImage, ImageOutputFormat};
use screenshots::Screen;
use serde::Serialize;
use std::env;
use std::ffi::{OsStr, OsString};
use std::io::Cursor;
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
            Component::Prefix(prefix) => {
                components.push(NormalizedPart::Prefix(prefix.as_os_str().to_os_string()))
            }
            Component::RootDir => {
                components.push(NormalizedPart::Root(component.as_os_str().to_os_string()))
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if let Some(last) = components.last() {
                    match last {
                        NormalizedPart::Segment(segment)
                            if segment.as_os_str() != OsStr::new("..") =>
                        {
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
            Component::Normal(segment) => {
                components.push(NormalizedPart::Segment(segment.to_os_string()))
            }
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

/// Captured display metadata + base64 PNG payload.
#[derive(Serialize)]
struct DisplayCapture {
    id: u32,
    name: String,
    width: u32,
    height: u32,
    data: String,
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
        env::current_dir()
            .map_err(|err| format!("Unable to resolve current directory: {err}"))?
            .join(candidate)
    };

    let normalized = simplify_path(&base_path);
    Ok(normalized.to_string_lossy().into_owned())
}

#[tauri::command]
fn detect_platform() -> String {
    env::consts::OS.to_string()
}

#[tauri::command]
fn capture_displays() -> Result<Vec<DisplayCapture>, String> {
    let screens = Screen::all().map_err(|err| format!("Failed to enumerate displays: {err}"))?;
    let mut captures: Vec<DisplayCapture> = Vec::new();

    for (index, screen) in screens.into_iter().enumerate() {
        let image = screen
            .capture()
            .map_err(|err| format!("Failed to capture display: {err}"))?;
        let width = image.width();
        let height = image.height();
        let mut dynamic = DynamicImage::ImageRgba8(image);
        let mut png_bytes = Vec::new();
        let mut cursor = Cursor::new(&mut png_bytes);
        dynamic
            .write_to(&mut cursor, ImageOutputFormat::Png)
            .map_err(|err| format!("Unable to encode PNG: {err}"))?;

        captures.push(DisplayCapture {
            id: index as u32,
            name: format!("Display {}", index + 1),
            width,
            height,
            data: general_purpose::STANDARD.encode(png_bytes),
        });
    }

    Ok(captures)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            normalize_path,
            detect_platform,
            capture_displays
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
