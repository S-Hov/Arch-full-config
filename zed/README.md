# Конфигурация Zed

Переносимый комплект настроек Zed для веб-разработки на JavaScript/TypeScript. Интерфейс и клавиши приближены к VS Code, слева находится дерево проекта, настроены локальные модели Ollama, проверка русской и английской орфографии, генерация сообщений коммитов и перевод документации при наведении.

## Состав

| Путь | Назначение |
| --- | --- |
| `config/settings.json` | Основные настройки редактора, языков, терминала, интерфейса и ИИ |
| `config/keymap.json` | VS Code-подобные горячие клавиши |
| `config/tasks.json` | Запуск Kitty и перевод выделенного текста |
| `codebook/codebook.toml` | Русский и английский словари Codebook |
| `extensions/ollama-hover-translate/` | Исходники локального hover-переводчика через Ollama |
| `ollama/commit-message.Modelfile` | Строгий профиль генератора Conventional Commits |

Модели Ollama, кэши Zed, скачанные language server'ы и каталог `target/` намеренно не хранятся в Git.

## Что настроено

- базовая раскладка клавиш VS Code;
- дерево папок и файлов слева, Material Icon Theme и VSCode Dark Modern;
- JavaScript, TypeScript, JSX, TSX, HTML, CSS, JSON, ESLint, Biome, Emmet, Tailwind CSS, Prisma и Dockerfile;
- отступ в 2 пробела и форматирование средствами текущего проекта;
- `Alt+Shift+↑/↓` дублирует строку или выделение;
- `Ctrl+Alt+T` открывает внешнее окно Kitty в корне проекта;
- `Alt+Shift+T` переводит выделенный текст, копирует результат в буфер и показывает уведомление;
- перевод имени, документации и диагностик при наведении без чтения всего проекта;
- Codebook проверяет русскую и английскую орфографию в комментариях, строках, документации и идентификаторах;
- `qwen2.5-coder:3b-base` используется для быстрого автодополнения;
- `qwen3.5:4b` используется для Agent Panel, inline assistant и перевода;
- профиль `zed-commit`, основанный на `qwen3.5:9b`, генерирует только однострочные Conventional Commits;
- сообщения коммитов генерируются в формате Conventional Commits.
- встроенный Git организован как VS Code Source Control: дерево файлов, Staged/Unstaged, file diff, история и Git Graph.

## Зависимости

Для Arch Linux:

```bash
sudo pacman -S --needed \
  nodejs npm kitty fish wl-clipboard libnotify \
  ttf-jetbrains-mono-nerd
```

Zed и Ollama установите отдельно подходящим для системы способом. После установки Ollama команда должна находиться через `command -v ollama`, а API должен отвечать на `http://127.0.0.1:11434`.

Для сборки локального расширения используйте toolchain через `rustup`. В Arch пакеты `rust` и `rustup` конфликтуют, поэтому нужен только один из них; для добавления WASI-target удобнее `rustup`:

```bash
sudo pacman -S --needed rustup
rustup default stable
rustup target add wasm32-wasip2
```

## Модели Ollama

Текущая конфигурация ожидает две модели:

```bash
ollama pull qwen3.5:4b
ollama pull qwen3.5:9b
ollama pull qwen2.5-coder:3b-base
```

Это только инструкция для восстановления системы: модели не входят в репозиторий и сами при копировании конфигов не скачиваются.

Создайте специализированный профиль генератора коммитов. Он ссылается на уже скачанные веса `qwen3.5:9b` и почти не занимает дополнительного места:

```bash
ollama create zed-commit \
  -f "$HOME/Projects/Arch-full-config/zed/ollama/commit-message.Modelfile"
```

Для использования `qwen3.5:9b` ещё и как основного агента замените `qwen3.5:4b` в поле `agent.default_model` файла `~/.config/zed/settings.json`. Для автодополнения оставьте `qwen2.5-coder:3b-base`.

## Установка

Сначала полностью закройте Zed и сделайте резервную копию:

```bash
repo="$HOME/Projects/Arch-full-config/zed"
backup="$HOME/.config-backup-zed-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$backup"
[ -d "$HOME/.config/zed" ] && cp -a "$HOME/.config/zed" "$backup/"
[ -d "$HOME/.config/codebook" ] && cp -a "$HOME/.config/codebook" "$backup/"
echo "Резервная копия: $backup"
```

Установите конфиги:

```bash
mkdir -p "$HOME/.config/zed" "$HOME/.config/codebook"
cp -a "$repo/config/." "$HOME/.config/zed/"
cp -a "$repo/codebook/." "$HOME/.config/codebook/"
```

Соберите и установите локальный переводчик:

```bash
source_dir="$repo/extensions/ollama-hover-translate"
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/zed/extensions/installed/ollama-hover-translate"
build_dir="$(mktemp -d)"

CARGO_TARGET_DIR="$build_dir" cargo build \
  --manifest-path "$source_dir/Cargo.toml" \
  --release \
  --target wasm32-wasip2

mkdir -p "$install_dir"
cp "$source_dir/extension.toml" "$install_dir/"
cp "$source_dir/biome-server.mjs" "$install_dir/"
cp "$source_dir/server.mjs" "$install_dir/"
cp "$source_dir/selection.mjs" "$install_dir/"
cp "$build_dir/wasm32-wasip2/release/ollama_hover_translate.wasm" \
  "$install_dir/extension.wasm"

rm -rf -- "$build_dir"
```

После этого запустите Zed. Расширения из `auto_install_extensions` будут установлены самим Zed; дождитесь завершения установки Codebook, Biome, темы и иконок, затем один раз перезапустите редактор.

## Использование ИИ-коммитов

1. Откройте Git Panel через `Ctrl+Shift+G`.
2. Добавьте нужные изменения в staged.
3. Установите курсор в поле сообщения коммита.
4. Нажмите значок карандаша или `Alt+L`.
5. Проверьте результат и нажмите `Ctrl+Enter`.

Генератор использует локальный профиль `zed-commit` на базе `qwen3.5:9b` и анализирует staged diff. Результатом должна быть ровно одна английская строка, например `feat(auth): add refresh token validation`.

## Работа со встроенным Git

Панель открывается через `Ctrl+Shift+G`. Изменения разделены на Staged и Unstaged и показаны деревом папок, как в Source Control VS Code. Обычный клик по файлу открывает его отдельный diff.

Основные клавиши:

| Клавиши | Действие |
| --- | --- |
| `Ctrl+Shift+G` | Открыть или сфокусировать Git Panel |
| `Space` | Stage/unstage выбранного файла или изменения |
| `Ctrl+1` | Вкладка Changes |
| `Ctrl+2` | Вкладка History |
| `Ctrl+Alt+G` | Открыть Git Graph |
| `Alt+L` | Сгенерировать сообщение коммита, когда курсор в его поле |
| `Ctrl+Enter` | Создать коммит из поля сообщения |
| `Ctrl+G`, затем `D` | Открыть общий diff проекта |
| `Ctrl+G`, затем `Ctrl+G` | Fetch |
| `Ctrl+G`, затем `↓` | Pull |
| `Ctrl+G`, затем `↑` | Push |

Кнопки `+`/`−` рядом с файлами и заголовками секций позволяют добавлять или убирать отдельные файлы и целые группы. Цветные полосы слева от кода показывают незакоммиченные hunks; staged-изменения отображаются пустым контуром, unstaged — заполненным. Текущая ветка и наличие локальных изменений отображаются в заголовке окна.

Опасные операции вроде Restore, Force Push и удаления untracked-файлов намеренно не получили дополнительных быстрых клавиш: они остаются в контекстном меню и палитре команд с подтверждением.

## Проверка

Проверьте зависимости и Ollama:

```bash
command -v zed node kitty fish wl-copy notify-send ollama
curl -fsS http://127.0.0.1:11434/api/tags
ollama list
```

В Zed:

1. Откройте TypeScript-файл и наведите курсор на функцию или тип — в hover-блоке должны появиться строки «Дословно» и «По контексту».
2. Напишите в комментарии `проверка арфографии` — Codebook должен подчеркнуть ошибку; исправление открывается через `Ctrl+.`.
3. Выделите фразу и нажмите `Alt+Shift+T` — перевод должен попасть в буфер обмена.
4. Нажмите `Ctrl+Alt+T` — Kitty должен открыться в корне текущего проекта.

Если hover-перевод не появился, сначала проверьте, что `qwen3.5:4b` есть в `ollama list`, а расширение собрано в `extension.wasm`. Журнал Zed находится в `~/.local/share/zed/logs/Zed.log`.

## Ограничения

- Встроенная панель терминала Zed не может использовать Kitty как эмулятор. Настройка открывает отдельное окно Kitty; встроенный терминал использует Fish.
- Codebook проверяет орфографию, но не является полноценным грамматическим корректором.
- Hover-переводчик рассчитан на стандартные пути данных Zed и установленный через Zed Biome.
- `.editorconfig`, Prettier или Biome внутри проекта могут переопределять размер отступа и правила форматирования — это ожидаемое поведение.
