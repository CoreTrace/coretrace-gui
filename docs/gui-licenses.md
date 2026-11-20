# Desktop GUI license inventory

CoreTrace Desktop 6.0.0-beta.3 uses **Tauri 2, React and a platform WebView**. The desktop shell links Rust code into the executable and embeds the Vite frontend. Qt is absent from the active build. The archived Electron sources and the separately installed analysis executable are outside this inventory.

## Components and linkage

| Component in the lockfiles | Declared license | How it reaches the user |
| --- | --- | --- |
| Tauri 2.11.5, tauri-runtime-wry 2.11.4 and WRY 0.55.1 | MIT OR Apache-2.0 | Rust libraries linked into the desktop executable. WRY calls the platform WebView. |
| Tao 0.35.3 | Apache-2.0 | Rust window/event-loop library linked into the executable. |
| React and React DOM 19.2.8 | MIT | JavaScript bundled into frontend assets by Vite. |
| Monaco Editor 0.52.2, @monaco-editor/react 4.7.0 | MIT | The editor and worker are bundled frontend assets. Preserve Monaco’s own third-party notices as well as its license. |
| lucide-react 0.468.0 | ISC | Icons are bundled with the interface. Its license credits Feather-derived portions under MIT. |
| @tauri-apps/api 2.11.1 | Apache-2.0 OR MIT | JavaScript bundled with the frontend bridge. |

The [CycloneDX 1.6 SBOM](gui-sbom.cdx.json) lists **522 package versions**, comprising 513 resolved registry crates across all Cargo targets (including build dependencies) and nine production npm packages. Each entry identifies its ecosystem, version, package URL and declared license expression. A platform ships a subset of this list. Native WebView libraries and SDK binaries have their own distribution terms and sit outside the lockfile inventory.

## What the installers contain

The package evidence below comes from the published [v6.0.0-beta.3 release](https://github.com/CoreTrace/coretrace-gui/releases/tag/v6.0.0-beta.3). Each downloaded asset was checked against its release SHA-256 digest.

| Release artifact inspected | Linkage and packaging evidence | Attribution implications |
| --- | --- | --- |
| Linux amd64 Debian package | The control file depends on `libgtk-3-0` and `libwebkit2gtk-4.1-0`. The executable’s ELF `NEEDED` entries include GTK 3, WebKitGTK 4.1 and JavaScriptCoreGTK 4.1. The distro supplies the shared objects. | GTK includes LGPL-covered code. WebKitGTK identifies BSD and LGPL-2.1 terms. Retain the notices, license and compatible-library replacement rights. |
| Linux amd64 AppImage | The SquashFS payload contains `usr/lib/libgtk-3.so.0`, `libwebkit2gtk-4.1.so.0`, `libjavascriptcoregtk-4.1.so.0` and WebKit helper processes. The program links dynamically to libraries redistributed inside the image. | Carry the applicable copyrights and license texts. Provide corresponding source for the redistributed LGPL libraries, including distro patches, using a permitted distribution method. Permit modification for the user’s own use and reverse engineering for debugging those changes. Preserve a working replacement or relinking route. |
| macOS universal app updater archive | The app contains the executable and Resources directory. The executable references Apple’s system `WebKit.framework`; the archive contains no separate WebKit framework. The release workflow also builds a DMG. | Apple supplies WKWebView through the OS. Attribute the shipped Rust bindings and embedded frontend. |
| Windows x64 NSIS installer | The payload contains the desktop executable, installer helpers and third-party notices. The MSVC build of `webview2-com-sys` links the WebView2 loader statically. Tauri’s default installation mode obtains the Evergreen runtime if needed. | The Rust bindings declare MIT. Microsoft’s redistribution terms apply separately to the SDK loader and any redistributed runtime. A fixed-runtime installer would need a new inventory. |

See the upstream references for [Tauri platform WebViews](https://v2.tauri.app/reference/webview-versions/), [WebKitGTK licensing](https://webkitgtk.org/reference/webkit2gtk/stable/index.html), [LGPL 2.1 §§4 and 6](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html), [Microsoft WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).

## Notices and source delivery

- Bundle CoreTrace’s [Apache-2.0 license](../LICENSE) and [NOTICE](../NOTICE) alongside [THIRD_PARTY_NOTICES.txt](../src-tauri/THIRD_PARTY_NOTICES.txt). Users can open the latter from **À propos → Licences open source**. Retain attribution and license texts when redistributing compiled or bundled code. [Apache License §4](https://www.apache.org/licenses/LICENSE-2.0)
- The generator collects top-level license and notice files from the resolved packages and identifies components that supply no such file. For those entries, verify upstream attribution separately. Five crates declare MPL-2.0 in this snapshot. Provide a way to obtain the source of the exact covered files, including distributed modifications. [Mozilla’s MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- For Debian/Ubuntu distribution builds, the generator appends the installed GTK, WebKitGTK and JavaScriptCoreGTK copyright files and their binary and source package versions. The application resources also include the LGPL 2.1 text. Use the recorded source versions to retrieve and retain the matching distro source packages. For AppImage releases, make corresponding source available alongside the binaries or document another applicable LGPL distribution method. This inventory verifies packaging and attribution; historical source delivery was not verified.

## Reproduce

From the repository root with the desktop prerequisites installed:

```sh
npm ci
npm run sbom
npm run notices
git diff -- docs/gui-sbom.cdx.json src-tauri/THIRD_PARTY_NOTICES.txt
```

The first command after installation regenerates the machine-readable inventory. The second regenerates the portable attribution file. `npm run dist` and the release workflow use `npm run notices -- --distribution` before packaging. Inspect a staged installer to confirm its resource directory contains `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.txt` and `licenses/LGPL-2.1.txt`. For Linux artifacts also compare the native libraries in the final image against the build host’s source-package records. The SBOM alone cannot identify system libraries added by the bundler.
