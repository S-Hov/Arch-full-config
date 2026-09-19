use zed_extension_api::{self as zed, Result};

struct OllamaHoverTranslate;

impl zed::Extension for OllamaHoverTranslate {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let node = worktree
            .which("node")
            .unwrap_or_else(|| "/usr/bin/node".to_string());

        let env = worktree.shell_env();
        let home = env
            .iter()
            .find_map(|(key, value)| (key == "HOME").then_some(value.as_str()))
            .ok_or("HOME is not available in the Zed worktree environment")?;
        let data_home = env
            .iter()
            .find_map(|(key, value)| (key == "XDG_DATA_HOME").then_some(value.to_string()))
            .unwrap_or_else(|| format!("{home}/.local/share"));
        let extension_dir = format!(
            "{data_home}/zed/extensions/installed/ollama-hover-translate"
        );

        let script = if language_server_id.as_ref() == "ollama-biome-translate" {
            format!("{extension_dir}/biome-server.mjs")
        } else {
            format!("{extension_dir}/server.mjs")
        };

        Ok(zed::Command {
            command: node,
            args: vec![script],
            env,
        })
    }
}

zed::register_extension!(OllamaHoverTranslate);
