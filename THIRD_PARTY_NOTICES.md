# Third-party software and notices

For the Tauri/Rust 0.2.0 distribution, runtime files are under `native/renpy-sdk/` and `native/public/`; notices are under `licenses/`. Rust dependency license texts and the locked dependency list are collected in `RUST_DEPENDENCY_LICENSES.txt` and `Cargo.lock`. The bundled Node runtime retains its upstream license in `NODE_RUNTIME_LICENSE.txt`. JavaScript dependency and font notices are collected as before. Electron/Chromium files described below apply only to the legacy Electron package. Microsoft WebView2 is a separate Microsoft component, installed only when missing using the officially signed bootstrapper and subject to Microsoft's terms.

The installer includes unmodified Ren'Py 8.5.3 binaries and their accompanying license file at `resources/renpy-sdk/LICENSE.txt`. Ren'Py includes MIT, LGPL and other licensed components. Source distributions and upstream licensing details are available at https://www.renpy.org/release/8.5.3 and https://www.renpy.org/doc/html/license.html. Users may replace the externally stored runtime libraries; the application does not prohibit debugging modified libraries.

Electron/Chromium notices are supplied beside the executable (`LICENSE.electron.txt`, `LICENSES.chromium.html`). React, Zustand, Phosphor and other JavaScript dependency notices are collected at build time in `resources/licenses/NODE_DEPENDENCY_LICENSES.txt`.

Manrope and Cormorant Garamond fonts retain their upstream SIL Open Font License texts in `resources/licenses/`. DejaVu fonts retain `resources/public/fonts/DejaVuSans.txt`.

Demo illustrations in `public/assets` are demonstration content, not user project data. No license to third-party trademarks is granted. Local development screenshots and personal projects are not part of the repository or installer.
