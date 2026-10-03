#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

mapfile -t official_packages < "$repo_dir/packages/official.txt"
sudo pacman -S --needed "${official_packages[@]}"

if command -v paru >/dev/null 2>&1; then
    aur_helper=paru
elif command -v yay >/dev/null 2>&1; then
    aur_helper=yay
else
    printf 'Install paru or yay, then run this script again for AUR packages.\n' >&2
    exit 1
fi

mapfile -t aur_packages < "$repo_dir/packages/aur.txt"
"$aur_helper" -S --needed "${aur_packages[@]}"

if command -v noctalia >/dev/null 2>&1; then
    noctalia msg templates-apply >/dev/null 2>&1 || true
fi

printf 'Packages installed. Shelly and cliamp should now be available in PATH.\n'
