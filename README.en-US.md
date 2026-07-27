# Local Lake Notes

Local Lake Notes is a Tauri-based local offline note-taking application prototype. Its goal is to allow editing `.lake` documents directly on the desktop using the Yuque Lake editor. The current version primarily uses the native Lake format; document files are saved in a knowledge base directory selected by the user, while non-document data such as application configurations, sorting, and file storage settings are stored in SQLite.

## Current Capabilities

- Select a local directory as a knowledge base.
- Support for multiple local knowledge bases: switch between them, add existing ones, or create new knowledge base directories in a specified location via the left sidebar.
- Create `.lake` documents and edit/save them using the Yuque Lake editor.
- Create spreadsheets and edit/auto-save them locally using the open-source Univer Sheets, with support for Excel `.xlsx` import and export.
- Create multidimensional tables, supporting a table view and multiple Kanban views sharing the same record data.
- Multidimensional tables support field types such as text, single-select, multi-select, number, progress, attachment, time, and URL. Fields can be added, renamed, modified, or deleted.
- Multidimensional table time fields support three formats: date, date-time, and time-only, displaying the corresponding date/time picker based on the format.
- Single-select and multi-select fields in multidimensional tables support adding, editing, and deleting options; deleting an option will synchronously clean up old values in records.
- Multidimensional tables support filtering, sorting, and searching, which are saved with the view configuration. Kanban views support grouping by single-select fields, configuring card display fields, and dragging records to adjust grouping.
- Multidimensional table record details support attachment upload/download, rich-text editing for the body, and full-screen body editing.
- Hierarchical display of knowledge bases, directories, and documents.
- Support for right-clicking the directory area to create new directories, documents, spreadsheets, and multidimensional tables, as well as right-clicking to rename or delete directories or documents.
- Support for expanding/collapsing directories, renaming/deleting directories and documents, and freely dragging to sort or move hierarchies within the same knowledge base.
- Use of the Lake editor's built-in outline capability.
- Support for draggable width adjustment of the directory pane, with the editing area filling the remaining space.
- Support for uploading images and attachments to file storage; currently supports S3-compatible storage, local directories, or WebDAV.
- Application data is stored in SQLite, with support for customizing the database directory in the settings page.
- The bundled desktop application allows opening Developer Tools via the menu for easier runtime error troubleshooting.
- Compatibility with the Lake editor's remote built-in image resources, with isolated editor mount nodes to prevent white screens caused by third-party DOM destruction when switching or closing documents.

## Tech Stack

- Desktop Shell: Tauri 2
- Frontend: React 18, TypeScript, Vite
- Backend: Rust
- Local Database: SQLite, using `rusqlite`
- Editor: Yuque Lake editor static resources, located in `public/vendor/lakex-doc`
- Spreadsheet Editor: Univer open-source Sheets; spreadsheets are persisted as Univer `IWorkbookData` workbook snapshot JSON.
- File Storage: AWS S3 SDK, Local File System, WebDAV

## Directory Structure

```text
.
├── public/vendor/lakex-doc        # Yuque Lake editor resources
├── src                            # React frontend
│   ├── app                        # App controllers and state types
│   ├── components                 # Main interface components
│   ├── features/lake-editor       # Lake editor adaptation, upload, and auto-save
│   ├── features/spreadsheet        # Univer spreadsheet editing, snapshot R/W, and Excel conversion
│   ├── features/multidimensional-table # Multidimensional table fields, records, table view, and Kanban view
│   ├── features/settings          # File storage, data storage, backup, and resource key settings
│   ├── features/workspace         # Knowledge base document tree model
│   └── lib/tauri.ts               # Frontend Tauri call encapsulation
├── src-tauri                      # Tauri/Rust backend
│   ├── src/commands               # Tauri commands
│   ├── src/storage                # SQLite, Object storage provider, backup, and resource encryption implementation
│   └── tests                      # Rust integration tests
├── docs                           # Requirement and planning documents
└── yuque-developer-docs.md        # Compiled Yuque developer documentation
```

## Data Storage

`.lake` documents, Univer workbook snapshot JSON spreadsheets, and multidimensional table JSON are saved in the knowledge base directory selected by the user. For example:

```text
/Users/you/Notes/
├── Work/
│   ├── RequirementAnalysis.lake
│   ├── Budget.json
│   └── LaunchLog.dbtable.json
└── Personal/
    └── ReadingNotes.lake
```

Note: Individual spreadsheet documents can be imported or exported as `.xlsx` via the top menu; exporting the knowledge base as a ZIP will convert spreadsheets into editable Excel files. Multidimensional tables use `.dbtable.json` to save record-based schemas; exporting the knowledge base as a ZIP preserves the original `.dbtable.json` files to avoid incorrect conversion to Markdown or Excel.

Application-specific data is stored in SQLite and is no longer written to the knowledge base directory:

- Recently opened knowledge base paths
- Known knowledge base list
- Directory and document sorting
- File storage settings
- Non-sensitive metadata for backups and resource keys

In the development environment, a fixed SQLite file within the repository is used for consistent debugging:

```text
src-tauri/dev-data/yuque-lake-notes.sqlite3
```

This directory is added to `.gitignore` and will not be committed.

The bundled application uses Tauri's local application data directory, with data saved according to the application identifier. On macOS, this is typically located at:

```text
~/Library/Application Support/com.weistuday.yuque.lake-notes/yuque-lake-notes.sqlite3
```

Note: SQLite does not write inside the `.app` bundle. macOS application bundles are not suitable for mutable data during installation, signing, and upgrading; actual writable data should reside in the application data directory.

Note: The application identifier remains `com.weistuday.yuque.lake-notes` for compatibility with existing local configurations and SQLite data directories.

You can customize the SQLite database directory in **Settings -> Data Storage**. The app will use a fixed filename in the selected directory:

```text
yuque-lake-notes.sqlite3
```

When switching to an empty directory without a database file, the app will copy the current database there before switching. If `yuque-lake-notes.sqlite3` already exists in the target directory, it will switch to using that database directly.

The database directory configuration is not written into SQLite itself but is saved to a separate file in the application configuration directory:

```text
database-location.json
```

This allows the app to locate the database first upon startup and then read the application data from SQLite.

`workspace.json`, `oss-settings.json`, and `.yuque-lake-notes/order.json` produced by older versions will be migrated to SQLite upon reading.

## Environment Requirements

- Node.js 20 or higher
- npm
- Rust stable
- Xcode Command Line Tools (required for macOS builds)

Check environment:

```bash
node -v
npm -v
rustc --version
cargo --version
```

## Install Dependencies

```bash
cd /Users/weifeng/code/OpenSource/yuque
npm install
```

## Local Development

Start the desktop app in development mode:

```bash
npm run tauri dev
```

This command will automatically start the Vite development server:

```bash
npm run dev
```

Default frontend address:

```text
http://127.0.0.1:1420
```

Note: Opening the Vite page directly in a browser will use browser fallback storage; full file system, SQLite, and OSS upload capabilities must be verified within the Tauri desktop window.

In both development mode and the bundled app, you can open DevTools via the menu **View -> Open Developer Tools** or using the shortcut `CmdOrCtrl+Alt+I`.

Running `npm run tauri dev` repeatedly in development mode will reuse the same database by default:

```text
src-tauri/dev-data/yuque-lake-notes.sqlite3
```

If you change the database directory in the settings page, subsequent development sessions will prioritize the custom directory.

## Local Verification Process

It is recommended to use an empty directory for verification to avoid affecting real notes:

```bash
mkdir -p /tmp/yuque-lake-test
npm run tauri dev
```

Verify in the application:

1. Select `/tmp/yuque-lake-test` as the knowledge base.
2. Add a second temporary directory in the knowledge base entry point on the left; after switching, confirm that the directory tree only shows content from the current knowledge base.
3. Create a new knowledge base from the left entry point and confirm that the app creates a directory in the selected parent folder and activates it automatically.
4. Remove the current knowledge base from the list and confirm that it is only forgotten from the list and not deleted from the local disk.
5. Create directories, `.lake` documents, spreadsheets, and multidimensional tables.
6. Edit document content and observe the auto-save status.
7. Create multiple headings and confirm that the Lake editor's built-in outline displays correctly.
8. Switch or close Lake documents and confirm that no white screen occurs.
9. Right-click the directory area to confirm you can create directories, documents, spreadsheets, and multidimensional tables; right-click directories or documents to confirm you can rename or delete them.
10. Rename directories, documents, and knowledge bases.
11. Save and reopen a spreadsheet to confirm content loads normally via Univer; import and export `.xlsx` and confirm content is readable.
12. Open a multidimensional table and confirm you can add records, edit fields, modify field types, manage single/multi-select options, and upload/download attachments in the table view.
13. Modify the time field format in a multidimensional table and confirm that: date format shows only the calendar, date-time format shows calendar and time, and time-only format shows only time.
14. In the multidimensional table Kanban view: add Kanbans, rename/delete Kanbans, switch grouping fields, configure card field display, and drag records to other groups.
15. Configure filtering, sorting, and searching in a multidimensional table; confirm that filter configurations remain effective after switching views or reopening.
16. Open a multidimensional table record detail, edit the body, and enter full-screen body editing; confirm content auto-saves.
17. Export the knowledge base as a ZIP and confirm that `.lake` documents, spreadsheet `.xlsx` files, and multidimensional table `.dbtable.json` files are all included.
18. Delete test directories, test documents, test spreadsheets, or test multidimensional tables.
19. Drag directories, documents, spreadsheets, or multidimensional tables before/after peers, inside directories, or to the end of the root directory; confirm that sidebar order, disk paths, and sorting after restart remain consistent.
20. Drag the directory pane boundary and confirm the width is adjustable and the editing area fills the remaining space.
21. Select a temporary database directory in **Settings -> Data Storage**, save, and restart the app; confirm that recent knowledge bases, known knowledge base list, and sorting are still normal.
22. Upload images and attachments after configuring file storage; confirm they can be previewed and downloaded from documents or multidimensional table records.
23. Switch to local file storage, select a temporary directory, and upload images and attachments; confirm resource objects are generated in the directory and remain previewable/downloadable after restart.
24. Perform a resource migration dry-run in the file storage settings; confirm that you can see resources to be migrated, involved documents, unreadable resources, and conflict statistics.

## Testing

Frontend tests:

```bash
npm run test:run
```

Rust tests:

```bash
cd src-tauri
cargo test
```

Full verification recommendation:

```bash
npm run build
npm run test:run
cd src-tauri && cargo test
```

## Build Frontend

```bash
npm run build
```

This command performs TypeScript checks and generates Vite static assets in `dist/`.

## Bundle Desktop Application

This project uses GitHub Actions native runners to build installers for macOS, Windows, and Linux respectively. Do not attempt to cross-compile installers for all systems directly on a macOS machine, as Tauri's installer generation depends on the native toolchains of each platform.

Standard Release Process:

1. Complete version number, README, and code changes on a feature branch. Execute at least `npm run build`, `npm run test:run`, and `cd src-tauri && cargo test`.
2. Commit and push the feature branch; merge into `devlop` first and confirm `devlop` contains all changes.
3. Create a `release/vX.Y.Z` branch from the latest `devlop` and push it as the release candidate branch.
4. Create a PR from `release/vX.Y.Z` to `main`. This must be completed via a GitHub Pull Request; merging locally and pushing to `main` is prohibited.
5. After the PR is merged, switch to the latest `main` and confirm that `main` HEAD equals the release merge commit from `origin/main`.
6. Create the version tag only on the release merge commit of `main`. Tagging on feature branches, `devlop`, or release branches is prohibited.
7. After pushing the tag, create a GitHub Release and ensure the Release points to the release merge commit of `main`.
8. Use only the version number for the Release name (e.g., `v1.7.0`), not the app name plus version number.
9. Release notes should only describe changes from the previous version; do not copy the full description of the previous version into the current Release.
10. After publishing, confirm Release assets are uploaded and that the Release name, notes, version number, and tag are consistent.

Example:

```bash
git switch main
git pull --ff-only origin main
git tag v1.7.0
git push origin v1.7.0
```

Release notes format:

```text
v1.4.0

Main changes from v1.3.0 to v1.4.0:

- New or optimized capabilities.
- Fixed issues.
- Updates to documentation, version numbers, and build configurations.

Verification:

- npm run build
- npm run test:run
- cd src-tauri && cargo test
```

Draft of current Release notes:

```text
v1.7.4

Main changes from v1.7.3 to v1.7.4:

- Added global and document-level font settings, optimized Kanban display, and supported tag grouping and multidimensional table long-text height persistence.
- Added "Close Current Tab" and "Close Other Tabs" operations, while retaining locked tabs and handling unsaved documents before closing.
- Fixed missing code block names in HTML export; uses single-file Base64 export for images-only files, and generates a zip with a resource directory when attachments are present.
- Added zoom in, zoom out, reset, and shortcut close for images within documents and exported HTML.
- Optimized performance for opening documents with many images using concurrent loading, batch filling, and local preview caching to prevent attachment pre-loading from blocking the initial screen.
- Added image size optimization settings to generate optimized previews while maintaining clarity, saving the compressed image only if the result is smaller.
- Fixed clipboard permission failure alerts for tables in WebView, added compatible copy paths, and improved auto-release commands and local data cleanup.
- Updated README release instructions and updated app, Tauri config, Node package, and Rust crate version numbers to 1.7.4.

Verification:

- npm run build
- npm run test:run
- cd src-tauri && cargo test
- git diff --check
```

Current GitHub Actions will build:

| Platform | Architecture | Artifact |
| --- | --- | --- |
| macOS | arm64 | `.dmg` |
| macOS | x64 | `.dmg` |
| Windows | x64 | NSIS `.exe` |
| Windows | arm64 | NSIS `.exe` |
| Linux | x64 | `.deb`, `.rpm`, `.AppImage` |
| Linux | arm64 | `.deb`, `.rpm`, `.AppImage` |

Local builds are only recommended for artifacts native to the current system.

macOS `.dmg`:

```bash
npm run tauri -- build --bundles dmg --ci --no-sign
```

Handling macOS "App is damaged and cannot be opened" warnings:

The current Release macOS `.dmg` is built using `--no-sign` and does not have a Developer ID signature or Apple notarization. After downloading from a browser, macOS Gatekeeper may mark the app as "damaged." If you confirm the installer came from this project's GitHub Release, you can first drag the app to `/Applications`, then execute:

```bash
xattr -dr com.apple.quarantine "/Applications/Local Lake Notes.app"
```

If the app is still in the Downloads folder, replace the path with the actual `.app` path, e.g.:

```bash
xattr -dr com.apple.quarantine "$HOME/Downloads/Local Lake Notes.app"
```

The permanent solution is to configure Developer ID signing and Apple notarization for macOS Releases; `--no-sign` should not be used for official external distribution.

Windows NSIS `.exe`:

```bash
npm run tauri -- build --bundles nsis --ci --no-sign
```

Linux `.deb`, `.rpm`, `.AppImage`:

```bash
npm run tauri -- build --bundles deb,rpm,appimage --ci --no-sign
```

Shortcut build for current local platform:

```bash
npm run build:current
```

macOS artifacts are typically located at:

```text
src-tauri/target/<target-triple>/release/bundle/dmg/
```

Note:

- `--no-sign` is only suitable for local verification and internal testing. Unsigned/unnotarized macOS apps may trigger "damaged" or "cannot be opened" alerts from Gatekeeper.
- Unsigned Windows installers may trigger SmartScreen risk warnings.
- Official distribution requires macOS Developer ID signing, notarization, and Windows code signing certificates.

## File Storage Configuration

Images, attachments, short-term export temporary objects, and backup objects currently use a unified file storage provider. In the settings page, you can select an active provider; new uploads and backups will be written to this provider. Existing `yuque-resource://...` links in documents record the provider/storageId and can still read historical resources after switching providers.

Image size optimization can be configured in the settings page: "Original" (default) keeps original images; "Clarity First" limits the longest side to 2560; "Size First" limits it to 1920. Existing resources only generate optimized previews based on the policy and do not overwrite original images; new uploads are only saved as optimized versions if the result is smaller.

### S3 Compatible Storage

The S3 provider uses S3-compatible configuration items:

- endpoint
- bucket
- region
- access key
- secret key
- public base URL (optional, used only for old public links or explicit CDN scenarios)
- force path style
- image prefix
- file prefix
- Default export resource policy
- Signed link default/maximum validity

Uploaded image keys are saved in directories by year and month, e.g.:

```text
images/2026/04/<uuid>.png
```

It is recommended to keep the bucket private (read/write) and avoid public read-only bucket policies. The app saves images and attachments as `yuque-resource://...` internal references. Editing previews, attachment downloads, short-term signing, and export resource reading are all handled by the Tauri backend using S3 credentials; the frontend does not hold the S3 secret.

### Local and WebDAV Storage

The local provider requires selecting a local directory as the object root. The app saves resources, backups, and indexes as relative object keys and rejects out-of-bounds keys like `..` or absolute paths.

The WebDAV provider requires configuring the server address, username, password, root path, and storage identifier. `.lake` and multidimensional table documents only save the provider, storageId, and relative object key, without writing the full WebDAV URL or credentials.

Before uploading images and attachments via S3 or WebDAV providers, you must configure a local resource encryption key in the settings page. New remote uploads are encrypted by the Tauri backend using the local key before being written to storage. The original objects in the provider are ciphertexts and cannot be previewed directly via object URL. The key is stored in the local application's SQLite database, and `.lake` documents only save the `keyFingerprint`. If switching devices, you must import the corresponding resource key, otherwise old encrypted resources cannot be decrypted. The local provider reads/writes directly to the local directory and does not perform additional resource-level encryption/decryption.

There are two export resource strategies:

- Local Resource Package: For single HTML files containing only images, it exports a single file with images embedded as Base64. If ordinary attachments are present, it exports a ZIP where images are placed in `assets/` and attachments in `attachments/`, referenced by `index.html` via relative paths. If no resources are present, it exports a plain HTML. Single Markdown files are exported directly by default, images are embedded where possible, and ZIPs are used only if attachments are present. Overall knowledge base exports always put resources into a ZIP. This is suitable for long-term archiving and offline delivery.
- Short-term Signed Links: Only supported by the S3 provider. Resource links in exported files are rewritten as S3 presigned URLs with an expiration date, suitable for temporary online delivery. Encrypted resources are not signed as raw ciphertexts; the app first decrypts them and uploads a temporary plaintext object to the `tmp/exports/` prefix, then generates a short-term link for that plaintext object. Once expired, files must be re-exported; it is recommended to configure a lifecycle cleanup rule for this prefix on the object storage side.

### Resource Migration

The file storage panel in the settings page provides a resource migration entry to batch copy resources referenced in the current knowledge base from an old provider to the currently active provider.

- Dry-run calculates the number of resources, number of involved documents, total size, unreadable resources, and target conflicts.
- Execution copies and validates all target objects first, then rewrites `resourceRef` in `.lake` documents and multidimensional tables.
- If the same `resourceRef` is referenced by multiple documents, it is only copied once.
- Migration converts resources according to the target provider policy: if the target is local, it writes directly readable resource objects; if the target is S3 or WebDAV, it writes encrypted resource objects with `enc` and `keyFingerprint`.
- Objects in the old provider are not deleted after migration; cleaning up old objects requires separate confirmation.

## Future Directions

- Add import capabilities for `.lake` to HTML/Markdown.
- Enhance multidimensional table view capabilities, such as field order, showing/hiding table fields, and more view types.
- Support multiple storage profiles and unified credential management.
