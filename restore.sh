#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
backup_root="$HOME/.local/state/arch-full-config-backups/$(date +%Y%m%d-%H%M%S)"

restore_config_dir() {
    local name="$1"
    local source="$repo_dir/$name"
    local target="$config_home/$name"

    [ -d "$source" ] || return 0
    if [ -e "$target" ]; then
        mkdir -p "$backup_root"
        cp -a "$target" "$backup_root/"
    fi
    mkdir -p "$target"
    cp -a "$source/." "$target/"
}

for name in niri fish kitty noctalia gtk-3.0 gtk-4.0 btop helix yazi \
    qt5ct qt6ct micro telegram-desktop; do
    restore_config_dir "$name"
done

mkdir -p "$data_home/color-schemes"
cp -a "$repo_dir/color-schemes/." "$data_home/color-schemes/"

mkdir -p "$HOME/.codex/themes"
cp -a "$repo_dir/codex/themes/." "$HOME/.codex/themes/"

mkdir -p "$HOME/Pictures/wallpapers"
cp -a "$repo_dir/wallpapers/." "$HOME/Pictures/wallpapers/"

mkdir -p "$data_home/noctalia/plugins"
cp -a "$repo_dir/noctalia/plugins/hardware-power" "$data_home/noctalia/plugins/"

if command -v gsettings >/dev/null 2>&1; then
    gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
    gsettings set org.gnome.desktop.interface gtk-theme 'adw-gtk3-dark'
    if gsettings list-keys org.gnome.desktop.interface | grep -qx 'accent-color'; then
        gsettings set org.gnome.desktop.interface accent-color 'red'
    fi
    gsettings set org.gnome.desktop.interface icon-theme 'Papirus-Dark'
    gsettings set org.gnome.desktop.interface cursor-theme 'Adwaita'
    gsettings set org.gnome.desktop.interface cursor-size 24
    gsettings set org.gnome.desktop.interface font-name 'Noto Sans 10'
    gsettings set org.gnome.desktop.interface document-font-name 'Noto Sans 10'
fi

if command -v noctalia >/dev/null 2>&1; then
    noctalia msg plugins enable hov/hardware-power >/dev/null 2>&1 || true
    noctalia msg config-reload >/dev/null 2>&1 || true
    noctalia msg color-scheme-set custom SumiRed >/dev/null 2>&1 || true
    noctalia msg theme-mode-set dark >/dev/null 2>&1 || true
    noctalia msg templates-apply >/dev/null 2>&1 || true
fi

printf 'Configs restored. Previous files, if any, were copied to:\n  %s\n' "$backup_root"
