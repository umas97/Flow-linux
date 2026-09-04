# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flow — a fully local, Asana-style task manager for Windows. A WinForms + WebView2 host
(`Flow.exe`, one C# file) serves the `app/` folder **from inside its own process** and
answers `/api/*` itself. There is no server, no open port, no package manager, no
dependencies, no test suite. All data lives in `data/board.json`.

## Commands

```
Flow.exe            run the app (double click, or from the shell)
build.cmd           recompile Flow.exe — only needed after editing src/Flow.cs
```

`build.cmd` invokes the `csc.exe` bundled with Windows
(`%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`); no SDK, no NuGet.
It references the three WebView2 DLLs in [lib/](lib/) and produces `Flow.exe` in the repo
root. `Flow.exe.config` (`probing privatePath="lib"`) must stay next to the exe or the DLLs
are not found.

**There is no build step, bundler, linter or test runner for the frontend.** Editing
anything under [app/](app/) takes effect on the next launch — just restart `Flow.exe`
(responses are sent `Cache-Control: no-cache`). F12 opens DevTools; uncaught page errors and
host errors are appended to `data/flow.log`.

Opening [app/index.html](app/index.html) directly in a browser also works — the frontend
detects the `file:` protocol and falls back to `localStorage`. Useful for quick UI work
without recompiling, but `/api/*` is then unavailable.

## Architecture

### Two halves, one process

[src/Flow.cs](src/Flow.cs) mounts nothing: it registers a `WebResourceRequested` filter on
`https://flow.example/*` and answers every request in-process —
[Flow.cs:426-495](src/Flow.cs#L426-L495) routes `/api/*`, `ServeStatic` serves files from
`app/` (path-traversal guarded, MIME table). `SetVirtualHostNameToFolderMapping` is
deliberately *not* used: it would serve files itself and bypass the handler, so `/api/*`
would never arrive. Adding a frontend `fetch` to a new endpoint therefore requires a new
`case` in that switch.

Endpoints: `GET/PUT /api/data`, `GET /api/info` (paths, backup count/bytes, WebView2
version), `POST /api/reveal` (explorer), `POST /api/pick`, `POST /api/kind`,
`POST /api/open`, `/api/quit`, `/api/health`.

`/api/pick`, `/api/kind` and `/api/open` take a **plain-text body, not JSON**
(`dir`/`file` and a path respectively): there is no JSON parser in `Flow.cs` and one
string doesn't justify writing one. `/api/pick` opens the native `FolderBrowserDialog` /
`OpenFileDialog`, so it answers only once the user has chosen — it holds the request
with `e.GetDeferral()` and shows the dialog from a `BeginInvoke` (a modal dialog can't
be opened inside the event handler). `/api/open` only ever *reveals* a path in
Explorer (`explorer.exe "<dir>"` or `/select,"<file>"`), refuses anything that isn't a
rooted, existing path, and **never** `Process.Start`s the file itself — and it decides
dir-vs-file by looking at the filesystem, never from the link's stored `kind`.
`/api/kind` answers `{"exists":true,"kind":"dir"|"file"}` for a rooted path that is
really there and `{"exists":false}` otherwise; it is what makes the link dialog pick
the type by itself. Like `/api/pick` it holds the request with a deferral and does the
`Directory.Exists`/`File.Exists` on a thread-pool thread — a dead network share blocks
for seconds, and this runs on the UI thread.

### Frontend: globals, no modules

Plain scripts on `window`, loaded in dependency order by
[index.html](app/index.html#L106-L112) — changing the order breaks startup:

`icons.js` (inline SVG set) → `util.js` (`U`) → `store.js` (`Store`) → `parse.js` (`Parse`)
→ `views.js` (`Views`) → `detail.js` (`Menu`, `Modal`, `Detail`) → `app.js` (`App`).

Each file is an IIFE `(function (global) { 'use strict'; … })(window)`.

### State and persistence

[app/js/store.js](app/js/store.js) is the only place state changes:

- `Store.commit(label, fn)` — mutate + push an undo snapshot (full `JSON.stringify` of
  state, 60 deep) + schedule a save. `label` is shown in the undo toast.
- `Store.quiet(fn)` — mutate without undo history (UI prefs).
- Saving is `U.debounce(flush, 450)` → `PUT /api/data` with `JSON.stringify(state, null, 2)`
  (indented on purpose: `board.json` is meant to be human-readable).
- `Store.backend` is `server` (served by the host), `local` (`file:` → localStorage), or
  `memory` (host unreachable — falls back to localStorage and warns).
- `normalize()` runs on every load, undo, redo and import: it fills defaults and **repairs
  orphan references** (a task pointing at a missing project/section is reattached, unknown
  tag ids are dropped). Undo/redo re-normalize, so never rely on object identity across a
  commit.

**Save gate:** the host refuses to write anything that doesn't look like a board —
`Accepts()` at [Flow.cs:519](src/Flow.cs#L519) requires the raw body to match `"tasks":[`
*and* `"projects":[`. Renaming either top-level key would silently break every save with
HTTP 400. The same check guards the shutdown write.

**Shutdown:** `OnFormClosing` cancels the close, calls `ExecuteScriptAsync` to read
`window.Store.state`, and posts it back as a `flow:save:` web message
([Flow.cs:617-661](src/Flow.cs#L617-L661)) — a 1.5 s timer force-closes if the page doesn't
answer. This is what saves the last 450 ms of edits, and it depends on `Store` staying a
global with a JSON-serializable `state`.

**Backups** (`data/backups/`, max 25 `board-*.json`, one per 5 minutes, skipped if identical
to the newest): the 5-minute threshold is read from the newest file's mtime at startup, not
kept in memory, because the process exits every time the window closes. An unreadable
`board.json` is copied to `illeggibile-*.json` (max 5) instead of being overwritten.

### Rendering

There is no virtual DOM. `App.render()` rebuilds the sidebar, topbar and content by
assigning `innerHTML`; `renderContent()` saves and restores `scrollTop/scrollLeft` by hand,
and `isEditingInDetail()` skips re-rendering the detail panel while a text field there has
focus (a focused `<button>` must *not* block it — that used to leave stale data on screen).

The detail panel's textareas (task title, subtasks) are sized by CSS `field-sizing:
content`, not by JS: measuring `scrollHeight` right after `innerHTML` landed in the
middle of the panel column's 280 ms width animation, so the first open got a title box
hundreds of pixels tall. `autoGrow()` in `detail.js` survives only as the fallback for a
runtime without `field-sizing`, and there it waits for the panel width to stop changing.

All interaction is event delegation on `document`, keyed by data attributes:
`data-act` for the app shell ([app.js:835](app/js/app.js#L835)) and `data-d` inside the
detail panel ([detail.js:347](app/js/detail.js#L347)). New UI = emit the attribute, add a
`case`. `data-task` marks draggables, `data-drop` a section drop zone, `data-day` a calendar
cell.

The current view lives in `location.hash` (`#today`, `#p/<id>`) so the window's back/forward
work; it is mirrored into `localStorage['flow.route']` for the next launch.

### Conventions that matter

- **Italian.** Every comment, UI string, commit label and log message is in Italian. Keep it
  that way.
- **ES5 syntax, modern DOM.** `var`, `function` expressions, no arrow functions, template
  literals or classes anywhere in `app/js/`. `fetch`, `closest`, `dataset`, `Object.assign`
  and CSS `color-mix()` are used freely — the runtime is always current Edge/WebView2.
- **Dates are strings**, never `Date` objects in state: local-time keys `"YYYY-MM-DD"` via
  `U.toKey`/`U.fromKey`/`U.addDays`/`U.diffDays`.
- **Ordering is fractional.** Tasks and sections carry a numeric `order` (~1000 apart);
  drag & drop computes a new value with `U.orderBetween(before, after)` instead of
  reindexing.
- **Nothing is fetched from the network.** Icons are inline SVG in
  [app/js/icons.js](app/js/icons.js), fonts are system fonts, notes are rendered by
  `U.miniMarkdown` (escapes first, then a handful of inline rules) — do not add a CDN link,
  a font import or a library.
- **Theme tokens** are CSS variables under `html[data-theme="light"|"dark"]` in
  [app/styles.css](app/styles.css). The inline script in
  [index.html](app/index.html#L9-L21) re-reads `localStorage['flow.prefs']` before first
  paint to avoid a flash; any new setting that affects first paint must be mirrored there
  *and* in `Store.savePrefs()`.
- **Project tabs.** `project.view` is one of `board` / `list` / `calendar` / `notes`
  (the list with icons and labels is `Views.PROJECT_VIEWS`, used by the topbar, the
  settings and the `1`-`4` shortcuts), validated in `normalize()` — an unknown value
  falls back to `board` rather than leaving `V.content` with nothing to render.
  Nothing reads `project.view` directly: `App.projectView(p)` / `App.setProjectView`
  do, because with `settings.rememberProjectView` off the tab lives in
  `App.ui.tempView` (cleared by `App.go`, never persisted) and every project opens on
  `settings.defaultProjectView` — so turning the option back on finds the remembered
  tabs untouched.
- **Project notes and links.** The Notes tab holds `project.notes` (markdown),
  `project.links` (`{ id, path, label, color, kind }`, `kind` being `dir` / `file` /
  `url`) and `project.linksSort` (`manual` / `kind` / `alpha`). `normalize()` keeps
  `kind` and `path` consistent in both directions: an `http(s)://` path is always
  `url`, and a `url` kind on a disk path is demoted — otherwise `/api/open` would try
  a web address as a filesystem path. Paths pass through `Store.cleanPath` (trim +
  strip the quotes Explorer's "Copia come percorso" adds, which would make the path
  non-rooted). In the dialog the type follows the path — `guessKind` from the text
  right away, then `askKind`/`/api/kind` from the disk, and `save()` waits for that
  answer — until the user touches the segmented control, which sets `ownKind` and
  freezes it. A `url` link never touches the host: `window.open` is caught by
  `NewWindowRequested`, which hands it to the default browser, so web links also work
  with no host at all.
- **One palette.** `COLORS` (24) and `EMOJIS` (48) at the top of
  [app.js](app/js/app.js) are the single source for projects, tags, links and the
  accent colour. There used to be four copied twelve-colour arrays that drifted
  apart on every edit — don't reintroduce a local literal.
- **Quick add** ([app/js/parse.js](app/js/parse.js)) parses Italian natural language:
  dates (`oggi`, `ven`, `tra 3 giorni`, `12/03`, `12 marzo`), `!alta`, `#tag`, `@person`,
  `+project`. Tags and people named there are created on the fly by `Store.ensureTag` /
  `ensurePerson`.

## Repo notes

- **`data/` is the user's live archive** — `board.json`, `backups/`, `flow.log`, `.window`
  and the WebView2 cache. Everything under it is gitignored except `.gitkeep`, and the
  whole folder is recreated by the app: a fresh clone has an empty `data/`, and the first
  launch writes `board.json` from `seed()` in [store.js](app/js/store.js). Never rewrite
  `board.json` or clear `backups/` as part of a code change — on a working copy that is
  somebody's real archive.
- `Flow.exe` is checked in, so a change to `src/Flow.cs` isn't usable until `build.cmd`
  has run — and a commit that touches `src/` must carry the rebuilt exe, or GitHub gets a
  binary that doesn't match its source.
- The superseded launch path (a Node `http` server on 127.0.0.1, `.vbs` launcher, `.lnk`)
  and the released zips under `dist/` were removed in phase 10. The storage logic in
  `Flow.cs` is a direct translation of that server's `server.js`; if you ever need to see
  the original, it is in history — `git show db0942b:vecchio-avvio-server/server.js`.
- [GUIDA.md](GUIDA.md) is end-user documentation in Italian and doubles as the spec for
  shortcuts, views and backup rules — update it when you change any of them.
  [README.md](README.md) is the repository's technical overview (what GitHub shows):
  architecture, endpoints, conventions — a condensed version of this file, also in
  Italian; keep the two in step.
