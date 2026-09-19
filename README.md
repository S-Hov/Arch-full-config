# Arch Linux + Niri + Noctalia v5

Персональный набор конфигураций для минимального Wayland-окружения на Arch Linux. Основная связка — **Niri 26.04+**, **Noctalia v5**, Kitty, Fish с Tide и Yazi.

> Конфигурация рассчитана именно на Noctalia v5. Команды Noctalia v4 (`qs -c noctalia-shell ...`) здесь не используются.

## Что находится в репозитории

| Каталог | Назначение | Куда устанавливать |
| --- | --- | --- |
| [`niri/`](niri/README.md) | Композитор, мониторы, окна, горячие клавиши и интеграция Noctalia v5 | `~/.config/niri/` |
| [`kitty/`](kitty/README.md) | Терминал, Nerd Font и цветовая тема Noctalia | `~/.config/kitty/` |
| [`zed/`](zed/README.md) | Zed в стиле VS Code, веб-разработка, локальный ИИ, перевод и орфография | `~/.config/zed/` и `~/.config/codebook/` |
| [`fish/`](fish/README.md) | Интерактивная оболочка, Tide, Fisher и команда `pac` | `~/.config/fish/` |
| [`yazi/`](yazi/README.md) | Терминальный файловый менеджер и пользовательские клавиши | `~/.config/yazi/` |
| [`cooling/`](cooling/README.md) | Безопасная WMI-кривая вентиляторов Lenovo Legion 83LV | `/usr/local/libexec/`, `/etc/`, systemd |

В каждом каталоге есть отдельная инструкция с описанием файлов, зависимостей и способов проверки.

## Возможности

- модульный конфиг Niri с отдельными файлами для ввода, дисплеев, раскладки окон, правил, анимаций и клавиш;
- Noctalia v5 запускается вместе с Niri и управляет launcher, lock screen и аудио-OSD;
- US + русская фонетическая раскладка, переключение через `Alt+Shift`;
- двухмониторный шаблон: `DP-1` 2560×1440 и `DP-2` 3840×2160;
- Kitty с Fish, Nerd Font, прозрачностью и темой Noctalia;
- Zed с VS Code-клавишами, веб-инструментами, Ollama, Codebook и локальным hover-переводом;
- Fish с Tide и удобной обёрткой `pac` над `paru`, `yay` или `pacman`;
- Yazi с показом скрытых файлов и привычными клавишами копирования/вставки;
- агрессивная кривая трёх вентиляторов Lenovo Legion 83LV через штатный `lenovo_wmi_other`, с автоматическим возвратом к BIOS при ошибке.

## Зависимости

Базовые пакеты из официальных репозиториев Arch:

```bash
sudo pacman -S --needed \
  niri xwayland-satellite xdg-desktop-portal-gnome xdg-desktop-portal-gtk \
  kitty fish yazi fd micro firefox nautilus polkit-kde-agent ttf-hack-nerd
```

Noctalia v5 устанавливается из AUR:

```bash
paru -S noctalia-git
```

Для охлаждения Lenovo 83LV нужны штатное ядро 7.2+ и утилиты мониторинга:

```bash
sudo pacman -S --needed linux linux-headers python lm_sensors nvidia-utils
```

`LenovoLegionLinux`, `legion_laptop force=1` и `legiond` на 83LV/RLCN не используются: они рассчитаны на другую карту EC. Подробности и миграция описаны в [`cooling/README.md`](cooling/README.md).

Вместо `paru` можно использовать другой AUR helper. `xwayland-satellite` нужен X11-приложениям; если они не используются, пакет необязателен.

## Установка

Сначала клонируйте репозиторий и перейдите в него:

```bash
git clone <URL-этого-репозитория> ~/Projects/Arch-full-config
cd ~/Projects/Arch-full-config
```

Сделайте резервную копию существующих настроек:

```bash
backup="$HOME/.config-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
for app in niri kitty fish yazi; do
  [ -e "$HOME/.config/$app" ] && cp -a "$HOME/.config/$app" "$backup/"
done
echo "Резервная копия: $backup"
```

Скопируйте конфиги:

```bash
for app in niri kitty fish yazi; do
  mkdir -p "$HOME/.config/$app"
  cp -a "$HOME/Projects/Arch-full-config/$app/." "$HOME/.config/$app/"
done
```

Для установки WMI-кривой Lenovo Legion 83LV:

```bash
sudo ./cooling/install.sh
```

Установщик сначала проверит модель, ядро, WMI-диапазоны и выполнит пятисекундный безопасный тест. Старое несовместимое решение будет отключено и сохранено в `/var/backups`.

## Обязательная настройка после установки

1. Выполните `niri msg outputs` и замените `DP-1`/`DP-2`, разрешения и частоты в `~/.config/niri/cfg/display.kdl` на значения своих мониторов.
2. Проверьте точное имя шрифта командой `kitty +kitten choose-fonts`; при необходимости измените `font_family` в `~/.config/kitty/kitty.conf`.
3. Убедитесь, что Noctalia v5 запускается командой `noctalia`, а `noctalia msg --help` показывает IPC-команды.
4. Проверьте конфиг Niri:

   ```bash
   niri validate
   ```

Niri следит за конфигом и применяет корректные изменения без перезапуска сессии.

## Быстрая проверка

```bash
niri validate
fish -n ~/.config/fish/config.fish
kitty --debug-config
yazi --debug
systemctl status legion-fan-curve.service
sensors lenovo_wmi_other-virtual-0
```

`kitty --debug-config` запускает Kitty и печатает разобранную конфигурацию. `yazi --debug` полезен для проверки окружения и доступных зависимостей.

## Важные замечания

- `niri/cfg/display.kdl` привязан к конкретным выходам и не является универсальным.
- `fish/fish_variables` содержит сохранённые universal variables и оформление Tide. Перед публикацией изменений стоит проверять, что туда не попали токены или приватные пути.
- Файлы в `fish/functions/`, `fish/completions/` и `fish/conf.d/` в основном установлены Fisher и Tide. Пользовательская логика находится в `fish/config.fish`.
- Noctalia хранит собственные настройки отдельно; этот репозиторий настраивает её интеграцию с Niri, но не заменяет конфигурацию самой оболочки.
- Раздел `cooling/` намеренно привязан к DMI `83LV`; на другой модели установщик завершится без записи в оборудование.

## Полезные ссылки

- [Niri: конфигурация](https://github.com/niri-wm/niri/wiki/Configuration:-Introduction)
- [Noctalia v5: установка](https://docs.noctalia.dev/v5/getting-started/installation/)
- [Noctalia v5 + Niri](https://docs.noctalia.dev/v5/compositor-settings/niri/)
- [Kitty: конфигурация](https://sw.kovidgoyal.net/kitty/conf/)
- [Fish: документация](https://fishshell.com/docs/current/)
- [Yazi: конфигурация](https://yazi-rs.github.io/docs/configuration/overview/)
- [Linux Lenovo WMI Other driver](https://github.com/torvalds/linux/blob/master/drivers/platform/x86/lenovo/wmi-other.c)
