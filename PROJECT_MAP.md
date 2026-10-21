# Карта проекта

## Как устроен репозиторий

Основной путь: `src/` (редактор) → `src-tauri/` (нативные операции) → `runtime/` (правила и компилятор) → готовая Ren’Py-игра. Пользовательский `.vnproject` — самостоятельный формат данных, не файл Ren’Py.

Документация разделена по назначению: [оглавление](docs/README.md), [установка](docs/INSTALL.md), [разработка](docs/DEVELOPMENT.md), [описания поставок](docs/releases/), исторические отчёты `docs/RELEASE_*.md`. Сгенерированные установщики, PDF/HTML и большие portable-примеры находятся в GitHub Releases, не в дереве исходников.

## Точки входа

| Путь | Назначение |
| --- | --- |
| `src-tauri/` | Основная нативная оболочка Rust/Tauri, файлы, диалоги, окно и запуск компилятора |
| `src-tauri/src/diagnostics.rs`, `diagnostics_system.rs`, `src/platform/diagnostics.js`, `src/components/Diagnostics.jsx` | Ограниченный локальный журнал, безопасный отчёт, Win32 clipboard/папка, явные QA receipts, независимость от project/error boundary |
| `src/domain/dialogFocus.js`, `tests/diagnostics.test.mjs`, `scripts/verify-native-diagnostics.mjs` | Реальная видимость закрытых details, async-focus, приватность/очередь и native-доказательства отказов/перезапуска |
| `src/platform/desktop.js` | Асинхронный адаптер нативного API, сохранение и закрытие |
| `src/platform/nativeMedia.js`, `nativeStorage.js`, `recoveryExport.js` | Renderer/file transport bridge, очередь сохранения без потери поздних правок, portable/reference recovery |
| `scripts/prepare-media-load-qa.mjs`, `verify-native-media-qa.mjs` | Ограниченный native load benchmark, hashes и дисковая проверка восстановления/пустого проекта |
| `src/components/WorkspaceLayout.jsx`, `src/domain/workspaceLayout.js`, `src/workspace.css` | Регулируемая и сохраняемая компоновка панелей |
| `src/components/DockPanel.jsx`, `src/components/dock-panel.css` | Внутренние открепляемые панели, изменение размеров и возврат в компоновку |
| `runtime/keyframes.mjs`, `src/components/KeyframeFields.jsx`, `tests/keyframes.test.mjs` | Общая модель 2D-камеры/ключей, редактирование, семплирование и интерполяции |
| `runtime/rpg-model.mjs`, `runtime/rpg-script.mjs`, `src/components/RpgWorkspace.jsx`, `src/components/RpgGameplay.jsx` | Определения игрового мира, отдельное состояние игрока и экспорт RPG |
| `src/components/RpgActionFields.jsx`, `src/components/ReadyPacks.jsx`, `src/domain/readyPacks.js`, `public/assets/packs/` | No-code действия, явный импорт набора и графика с происхождением |
| `scripts/verify-keyframes.mjs`, `scripts/verify-rpg.mjs`, `tests/rpg.test.mjs` | Регрессии модели и выполнение в реальном Ren’Py runtime |
| `docs/manual034/`, `scripts/build-user-guide.py` | Текст инструкции, реальные скриншоты и генератор PDF/HTML |
| `src/domain/canvasViewport.js`, `src/components/useCanvasViewport.js`, `src/components/CanvasViewControls.jsx` | Независимая навигация вида, истинный zoom/Fit, pointer ownership, клавиатура и восстановление слоя вне кадра |
| `tests/canvas-viewport.test.mjs`, `scripts/verify-native-canvas.mjs`, `scripts/verify-native-canvas-pixels.mjs` | Модель viewport, дисковая проверка UI-правок/portable, actual packaged geometry и пиксели без переноса zoom в игру |
| `src/components/ProjectSceneTree.jsx`, `src/domain/sceneTree.js`, `src/components/scene-tree.css` | Виртуальное дерево глав/сцен, поиск, collapse persistence, keyboard/current reveal |
| `src/components/StoryMap.jsx`, `src/domain/graphViewport.js`, `src/components/useGraphViewport.js` | Один derived routing-index, геометрия/viewport culling, поиск и центрирование карты |
| `src/domain/edgeRouting.js`, `src/components/RoutedMapEdge.jsx`, `tests/edge-routing.test.mjs` | Fixed-position obstacle routing, обратные/петлевые связи, отдельный верхний слой click-labels, bounds/Fit и предупреждение о перекрытых портах в обеих картах |
| `src/domain/audioAuthoring.js`, `tests/audio-authoring-status.test.mjs` | Подключение/декодирование записей и явное состояние потерянной, пустой или неверного типа ссылки |
| `scripts/prepare-workspace-qa.mjs`, `scripts/verify-native-workspace.mjs`, `tests/workspace-navigation.test.mjs` | Большой native-профиль, авторская ветвь/дисковая проверка/portable и runtime cases |
| `src/components/StoryboardEditor.jsx`, `src/domain/storyboard.js` | Лента шагов и накопленное состояние сцены |
| `src/components/VisualLayers.jsx`, `src/domain/visualLayers.js` | Слои кадра и маршрутизация правок в исходное действие |
| `src/components/PropPicker.jsx`, `src/domain/propAuthoring.js` | Атомарное создание предмета/реакции/инвентаря/шага осмотра вместе с говорящим/голосом/SFX |
| `src/components/ChoiceFields.jsx`, `src/domain/branchAuthoring.js` | Варианты выбора и атомарное создание настоящих пустых веток |
| `src/platform/nativeError.js` | Единый native caller, сохраняющий сообщения об ошибках |
| `scripts/verify-native-author-workflow.mjs` | Дисковая/portable-проверка единого авторского пути и testcase готовой игры |
| `runtime/interactions.mjs`, `runtime/interaction-script.mjs`, `src/components/PropInteractionFields.jsx`, `src/components/PreviewGameplay.jsx` | Исполнение и no-code правка реакций/голоса/SFX, доступные цели применения из инвентаря |
| `runtime/native-worker.mjs` | Временный Node worker существующего компилятора Ren'Py |
| `scripts/build-native-installer.ps1`, `installer/istoriya-rust.iss` | Rust-установщик Inno Setup |
| `examples/tea-with-goblins/` | Полный сценарий, раскадровка и редактируемая текстовая постановка |
| `src/App.jsx` | Главная страница, ресурсы, редактор сцен и инспектор |
| `src/store/projectStore.js` | Проекты, действия, история и сохранение |
| `src/components/` | Шкала, карты глав и сцен, меню, типографика |
| `src/domain/` | Проверки, предпросмотр, геометрия трансформаций |
| `src/domain/previewSession.js`, `src/platform/previewStorage.js`, `src/components/PreviewSystemPanel.jsx` | Отдельные тестовые Save/Load/rollback/history/preferences, транзакции слотов и семантическая совместимость |
| `runtime/` | Компиляция Ren'Py, сборка платформ, время и переходы |
| `runtime/project-format.mjs`, `asset-fields.mjs`, `project-path.mjs` | Проверка структуры, поля ресурсов, безопасные имена папок |
| `runtime/text-style.mjs` | Общие правила стиля текста редактора и Ren'Py |
| `src/components/RecoveryBoundary.jsx` | Перехват ошибки рендера и аварийная выгрузка проекта |
| `electron/` | Диалоги, локальное хранилище, безопасный preload |
| `public/` | Демонстрационные иллюстрации и шрифты |
| `installer/istoriya.iss` | Inno Setup: установка, ярлыки и удаление |
| `scripts/build-installer.ps1` | Проверки, сборка, фильтрация, Inno, SHA-256 |
| `scripts/collect-notices.mjs` | Уведомления сторонних компонентов |
| `tests/` | Автоматические регрессионные проверки |
| `worker/`, `.openai/` | Дополнительная упаковка web-прототипа |
| `docs/` | Аудит, ограничения и результаты проверок |

Данные пользователя: `%APPDATA%/vn-creator/projects` и выбранные автором папки. SDK, сборки, ключи, проекты и локальные дизайн-снимки не публикуются в Git.
