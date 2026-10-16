# 0.2.5 — исправление автономного запуска игры

15 октября 2026 пользователь воспроизвёл `ModuleNotFoundError: No module named 'gui7'` в игре «Чай вместо подвига» 1.0.0. Ошибка была в нашей сборке, а не в пользовательском Windows или проекте.

## Причина и исправление

Компилятор копировал `SDK/gui/game/guisupport.rpy`. Это служебный файл шаблона: при init он импортирует `launcher/game/gui7` и генерирует GUI. SDK содержит этот модуль, а готовая игра — нет. Копировать launcher в игру не требуется: теперь официальный `generate_gui` и `gui_images` выполняются **при компиляции** в новой временной папке. В игру попадают готовые GUI-изображения и `.rpy`, не требующие `gui7`/изменения `sys.path`. Старый compiler-owned guisupport перезаписывается минимальным совместимым helper, его старый `.rpyc` удаляется.

Пример пересобран как **1.0.1**; архив 1.0.0 не перезаписан, поскольку был занят. Распаковывать новый ZIP нужно в новую папку, не поверх старой.

## Ошибка предыдущей проверки

Ren'Py test command может продолжить выполнение после init-исключения и закончить PASSED. В старом `.artifacts/tea-runtime-qa-nJlTJ9/test-output.log` ошибка gui7 присутствует **перед** тестами. Поэтому прошлое утверждение об исправном запуске 0.2.4/игры 1.0.0 отозвано. Новый парсер отклоняет этот настоящий старый журнал (`runtimeException=true`, `passed=false`). Также subprocess сборки отвергает traceback даже при exit 0.

Добавлена отдельная проверка обычного EXE **без аргументов и команды test**. В временную распакованную копию добавляется только пассивный periodic callback: он ждёт реальный экран `main_menu`, сохраняет снимок и закрывает процесс. Он не подавляет исключения и не заменяет меню. QA-код не входит в поставляемый ZIP. Используются отдельный Windows desktop, ANGLE/Direct3D11 и dummy audio; пользовательская мышь/клавиатура не управляются.

## Подтверждение

- `npm test`: 91/91; регрессии на восстановленное исключение + ложный PASSED, subprocess exit 0 + traceback, сгенерированные GUI-изображения и отсутствие импортов SDK.
- `npm run build` (через desktop build), `npm run test:sites` 4/4, Tauri/Rust release 0.2.5 собран.
- `npm run verify:tea:startup`: `.artifacts/tea-runtime-qa-mHIz1F/result.json`: обычный EXE 1.0.1 дошёл до главного меню, exit 0, `mainMenuReady=true`, `runtimeException=false`. Снимок `qa-startup.png` показывает меню и версию 1.0.1.
- `npm run verify:tea`: `.artifacts/tea-runtime-qa-pOUi2X/result.json`: 5/5 сценариев, 14/14 утверждений, `runtimeException=false`. Все четыре сочетания выборов и отдельный Save/Load/Rollback/история; проверены предметные слои и их геометрия.
- Отрицательный контроль: обычный запуск сохранённого старого ZIP `.artifacts/tea-rejected-0.2.4-win.zip` воспроизвёл gui7, **не достиг меню и был отклонён**. `.artifacts/tea-runtime-qa-XD97Eb/result.json`: `mainMenuReady=false`, `runtimeException=true`, `passed=false`.
- Rust EXE сохранил/повторно открыл полный проект без изменений JSON и экспортировал Windows ZIP: `.artifacts/native-025/result.json` (`nativeStorage=true`, `reopenEqualsOriginal=true`).
- Экспортированный именно Rust EXE ZIP также прошёл отдельный обычный запуск без аргументов: `.artifacts/tea-runtime-qa-JEyhZe/result.json`, `mainMenuReady=true`, `runtimeException=false`, exit 0. `cargo test --release --locked --manifest-path src-tauri/Cargo.toml` с `CARGO_BUILD_JOBS=1`: 5/5; журнал `.artifacts/native-025/rust-release-tests.log`.
- Inno Setup 0.2.5 собран; установщик не устанавливался автоматически, не подписан коммерческим сертификатом и не опубликован в GitHub Releases.

Проверочные команды: `npm run verify:tea:startup` и `npm run verify:tea`. Сырые результаты, журналы и снимки поставки находятся в `release-games/tea-with-goblins/QA/1.0.1/`. Старые результаты сохранены отдельно как отозванные; не использовать их зелёный статус как приёмку запуска.

## Артефакты

| Файл | Размер | SHA-256 |
| --- | ---: | --- |
| `release-games/tea-with-goblins/chay_vmesto_podviga-1.0.1-win.zip` | 95 721 659 байт | `461aec3069cff9676ea76b26e9fe806b2a806aa4cd43b26e7109b769e2c6b599` |
| `release-rust/setup/Istoriya-Rust-Setup-0.2.5-x64.exe` | 416 126 001 байт | `98af69ad5ab4d7ca890e6e1ee7753d02d6734e0481392ced8e00259fad6dcb45` |

## Границы

Проверено на текущей Windows 11, не на чистой машине. Звук не прослушивался; повторная приёмка всех DPI/обновления/отката ещё не выполнена. Исправление gui7 не закрывает полный MVP или все анимационные пресеты. Выявленные отдельно сброс масштаба/эмоции при некоторых анимациях ещё не исправлены в этом выпуске: работа над ними была прервана ради ошибки запуска. Предыдущая debug-сборка Rust также требует отдельного разбора; release и native integration проверяются независимо.
