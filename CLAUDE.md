# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flow — a fully local, Asana-style task manager for Ubuntu 24.04 (GNOME on Wayland). A
GTK 3 + WebKitGTK host (`src/flow.py`, one Python file) serves the `app/` folder **from
inside its own process** and answers `/api/*` itself. There is no server, no open port, no
package manager, no dependencies beyond four apt packages, no build step, no test suite.
All data lives in `data/board.json`.

## Commands

```
./flow              run the app
./install.sh        write the .desktop entry and icon into ~/.local/share
./uninstall.sh      remove them (never touches data/)
```

Runtime requirements, all from the official Ubuntu 24.04 repositories:

```
sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1
```

`gir1.2-soup-3.0` comes in as a dependency of `gir1.2-webkit2-4.1` and is used for response
headers. Nothing else: **no `pip`, no virtualenv, no compilation.** If a binding is missing,
`src/flow.py` says which package to install instead of failing on the import.

**There is no build step, bundler, linter or test runner — for the host either.** Editing
anything under [app/](app/) or [src/flow.py](src/flow.py) takes effect on the next launch —
just restart `./flow` (responses are sent `Cache-Control: no-cache`). F12 opens the WebKit
inspector; uncaught page errors and host errors are appended to `data/flow.log`.

Opening [app/index.html](app/index.html) directly in a browser also works — the frontend
detects the `file:` protocol and falls back to `localStorage`. Useful for quick UI work,
but `/api/*` is then unavailable.

## Architecture

### Two halves, one process

[src/flow.py](src/flow.py) mounts nothing: it registers the **custom URI scheme `flow://`**
on `WebKitWebContext` and answers every request in-process — `_su_richiesta` routes
`/api/*`, `_servi_statico` serves files from `app/` (path-traversal guarded, MIME table).
The page lives at `flow://flow.example/index.html`. Adding a frontend `fetch` to a new
endpoint therefore requires a new branch in `_su_richiesta`.

A custom scheme rather than `http` is what keeps the project's invariant — **no socket, no
port**. Two consequences that are easy to trip over:

- the scheme must be registered `secure` *and* `cors enabled` on the
  `WebKitSecurityManager`, or the page gets no `localStorage` and `fetch` to `/api/` is
  refused;
- responses must use `WebKitURISchemeResponse` + `finish_with_response()`; the older
  `finish()` cannot set a status code, so a 404 would reach the page as a 200.

Endpoints: `GET/PUT /api/data`, `GET /api/info` (paths, backup count/bytes, WebKitGTK
version), `POST /api/reveal` (file manager), `POST /api/pick`, `POST /api/kind`,
`POST /api/open`, `/api/quit`, `/api/health`, `/api/ping`.

`/api/pick`, `/api/kind` and `/api/open` take a **plain-text body, not JSON**
(`dir`/`file` and a path respectively): it is a single string and parsing it as JSON would
add nothing. `/api/pick` opens `Gtk.FileChooserNative` — which goes through the XDG portal,
so it looks and behaves like the system file manager and works on Wayland — and answers only
once the user has chosen: it keeps the request and calls `finish_with_response()` from the
`response` handler, because a modal dialog can't be opened inside the request handler.
`/api/open` only ever *reveals* a path: for a file it calls D-Bus
`org.freedesktop.FileManager1.ShowItems`, which really selects it inside its folder the way
`explorer.exe /select,` did; for a directory it opens the contents through `Gio.AppInfo`. It
refuses anything that isn't an absolute, existing POSIX path and **never** executes the file
— and it decides dir-vs-file by looking at the filesystem, never from the link's stored
`kind`. `~` is expanded here, never in the stored data. `/api/kind` answers
`{"exists":true,"kind":"dir"|"file"}` for an absolute path that is really there and
`{"exists":false}` otherwise; it is what makes the link dialog pick the type by itself. It
does the `stat` on a `threading.Thread` and returns via `GLib.idle_add` — a dead network
share blocks for seconds, and this runs on the window's main loop.

### Window

`Gtk.Application` with application-id `it.flow.Flow` is the single-instance lock (over
D-Bus): a second launch doesn't open a second window, it arrives as `activate` and calls
`present()`. That id must match the `.desktop` filename written by `install.sh`, or GNOME
won't tie the window to the menu entry and shows a generic icon.

`data/.window` holds `x,y,width,height,maximized`. On Wayland **the coordinates are saved
but never applied** — a window doesn't get to place itself, and there is no X11 fallback
branch. The un-maximized size is measured 200 ms late, because maximizing delivers the
resize *before* the window reports itself maximized: reading it immediately would store the
full-screen size as if it were the normal one.

### Frontend: globals, no modules

Plain scripts on `window`, loaded in dependency order by
[index.html](app/index.html#L107-L113) — changing the order breaks startup:

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
  `memory` (host unreachable — falls back to localStorage and warns). The detection at
  [store.js:21](app/js/store.js#L21) accepts `flow:` alongside `http:`/`https:`; without
  that branch the app would fall back to localStorage while the on-disk archive sits
  right there.
- `normalize()` runs on every load, undo, redo and import: it fills defaults and **repairs
  orphan references** (a task pointing at a missing project/section is reattached, unknown
  tag ids are dropped). Undo/redo re-normalize, so never rely on object identity across a
  commit.

**Save gate:** the host refuses to write anything that doesn't look like a board —
`accetta()` in [flow.py](src/flow.py) requires the raw body to match `"tasks":[` *and*
`"projects":[`. Renaming either top-level key would silently break every save with
HTTP 400. The same check guards the shutdown write.

**Shutdown:** `delete-event` cancels the close, calls `evaluate_javascript()` to read
`window.Store.state`, and posts it back through
`window.webkit.messageHandlers.flow` prefixed `flow:save:` — a 1.5 s timer force-closes if
the page doesn't answer. This is what saves the last 450 ms of edits, and it depends on
`Store` staying a global with a JSON-serializable `state`.

`navigator.sendBeacon` — the frontend's other safety net — **does not work on a custom
scheme** (WebKit allows it on HTTP/S only). Harmless, because the call is already inside a
`try`, but the deferred shutdown above is now the only guarantee: don't add code that
relies on the beacon.

**Careful with the message signal:** in WebKit2 4.1 `script-message-received` carries a
`WebKitJavascriptResult`, not the JavaScript value. Read the text with
`risultato.get_js_value().to_string()`. Reading one level too high raises nothing visible —
messages arrive and are silently dropped, and the only symptom is that shutdown stops saving
and page errors stop reaching the log.

**Backups** (`data/backups/`, max 25 `board-*.json`, one per 5 minutes, skipped if identical
to the newest): the 5-minute threshold is read from the newest file's mtime at startup, not
kept in memory, because the process exits every time the window closes. The copy is skipped
when identical but **the threshold is reset anyway**. An unreadable `board.json` is copied
to `illeggibile-*.json` (max 5) instead of being overwritten. Writes are atomic: temp file,
`flush` + `fsync`, `os.replace()`.

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
`data-act` for the app shell ([app.js:965](app/js/app.js#L965)) and `data-d` inside the
detail panel ([detail.js:485](app/js/detail.js#L485)). New UI = emit the attribute, add a
`case`. `data-task` marks draggables, `data-drop` a section drop zone, `data-day` a calendar
cell.

The current view lives in `location.hash` (`#today`, `#p/<id>`) so the window's back/forward
work; it is mirrored into `localStorage['flow.route']` for the next launch.

### Conventions that matter

- **Italian.** Every comment, UI string, commit label and log message is in Italian — in
  the Python host as much as in the frontend. This file is the one exception: it is written
  for Claude Code and stays in English. Keep it that way.
- **Standard library and PyGObject only.** `src/flow.py` imports nothing that isn't on a
  stock Ubuntu 24.04 with the four packages above. No `pip`, no `requirements.txt`.
- **POSIX paths only.** Separator `/`, root `/`, absolute paths starting with `/`. An
  archive carried over from Windows will show its links as invalid: **never rewrite the
  stored data** to fix it — an unresolvable path stays saved and produces an error message,
  it is not deleted or altered.
- **ES5 syntax, modern DOM.** `var`, `function` expressions, no arrow functions, template
  literals or classes anywhere in `app/js/`. `fetch`, `closest`, `dataset`, `Object.assign`
  and CSS `color-mix()` are used freely — the runtime is always current WebKitGTK.
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
  *and* in `Store.savePrefs()`. The "Auto" theme follows GNOME: WebKitGTK maps
  `prefers-color-scheme` onto the system setting.
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
  strip the quotes a path copied out of a terminal carries, which would make the path
  non-absolute). In the dialog the type follows the path — `guessKind` from the text
  right away, then `askKind`/`/api/kind` from the disk, and `save()` waits for that
  answer — until the user touches the segmented control, which sets `ownKind` and
  freezes it. A `url` link never touches the host: `window.open` is caught by the
  WebView's `create` signal, which hands it to the default browser via `Gio.AppInfo`, so
  web links also work with no host at all.
  The same links live on a **task** (`task.links` / `task.linksSort`, rendered in the
  detail panel under the subtasks): same shape, cleaned by the same `normalizeLinks()`,
  and the same UI — the dialog, the menu, the sort menu and the card fragments are
  exposed as `App.links` (`of`/`open`/`modal`/`menu`/`sortMenu`) and called with the task
  in place of the project, so there is no second copy. `Views.linkCard(l, at)` and
  `Views.linkSortBtn(o, at)` take the name of the delegation attribute (`act` in the
  shell, `d` inside `#detail`). Whoever mutates a list calls `Store.touch(o)`, which
  bumps `updatedAt` only if the owner has one (a task does, a project doesn't).
- **One palette.** `PALETTE` (24 rows) and `EMOJIS` (48) at the top of
  [app.js](app/js/app.js) are the single source for projects, tags, links and the
  accent colour; `COLORS` is just `PALETTE`'s light values. There used to be four
  copied twelve-colour arrays that drifted apart on every edit — don't reintroduce
  a local literal, and don't hard-code a hex in `store.js` either (`ensureTag` /
  `ensurePerson` go through `U.farColor()`).
  **A colour is never auto-assigned by walking the palette in order** — 24 hues
  15° apart mean consecutive entries look identical. `U.farColor(used)` takes the
  colours already assigned and returns the palette hue whose *nearest* used hue is
  farthest away, picking at random among ties (so two archives don't come out the
  same, and a deleted colour is reused). Its four callers pass the peers of what
  they are creating: `Store.state.projects` for the new-project dialog (which
  preselects that swatch instead of `COLORS[0]`), `state.tags`, `state.people`, and
  the owner's `links` in `linkModal`. Non-palette or grey values in `used` have no
  hue and are ignored.
  Every row is one hue in two variants: `chiaro` is **the value stored in
  `board.json`** — the colour's identity, theme-independent — `scuro` is how that
  same hue is drawn under the dark theme, and `testo` is the readable text over the
  light fill (over the dark one it is always `#1A1A1A`); all pairs clear WCAG AA.
  `U.setPalette` registers the table and `U.tint(hex)` / `U.tintText(hex)` pick the
  variant for the current theme: **never emit a stored colour straight into an
  inline `style`** — everything that writes `--pc`/`--tc`/`--lc`/`--ac`/`--c` goes
  through `U.tint`, and `--accent`/`--accent-fg` are set in `applyTheme()` (mirrored
  for the first paint by `savePrefs` → `accentScuro`/`accentTesto` → the inline
  script in `index.html`). Because those hexes are baked into the HTML, changing
  theme re-renders (`App.setTheme` and the `prefers-color-scheme` listener).
  `normalize()` snaps any colour outside the palette to the nearest hue with
  `U.snap` — that is what converts an archive written by an older version, and it
  is the reason a hand-written hex will not survive a reload.
- **Quick add** ([app/js/parse.js](app/js/parse.js)) parses Italian natural language:
  dates (`oggi`, `ven`, `tra 3 giorni`, `12/03`, `12 marzo`), `!alta`, `#tag`, `@person`,
  `+project`. Tags and people named there are created on the fly by `Store.ensureTag` /
  `ensurePerson`.

## Repo notes

- **`data/` is the user's live archive** — `board.json`, `backups/`, `flow.log`, `.window`
  and the engine cache in `.webkit`. Everything under it is gitignored, and the folder is
  created by the app itself: a fresh clone has no `data/` at all, and the first launch
  writes `board.json` from `seed()` in [store.js](app/js/store.js). Never
  rewrite `board.json` or clear `backups/` as part of a code change — on a working copy
  that is somebody's real archive.
- **No checked-in binaries.** The host is Python source run as-is: a change to
  `src/flow.py` is usable on the next launch, there is no artefact to regenerate and no
  commit to keep in step with an executable.
- **Linux only.** Windows support (`Flow.cs` with WebView2 and WinForms, `build.cmd`,
  `lib/`, `Flow.exe`) was removed when the app was ported to Ubuntu; the storage logic in
  `flow.py` is a direct translation of that `Flow.cs`, which in turn translated an older
  `server.js`. Both originals are in the repository history if you need them.
- **Declared target: GNOME on Wayland, Ubuntu 24.04.** There are no conditional branches
  for X11, KDE or other file managers — where needed, the generic `Gio.AppInfo` fallback is
  enough. Don't add any.
- [GUIDA.md](GUIDA.md) is end-user documentation in Italian and doubles as the spec for
  shortcuts, views and backup rules — update it when you change any of them.
  [README.md](README.md) is the repository's technical overview (what GitHub shows):
  architecture, endpoints, conventions — a condensed version of this file, in Italian;
  keep the two in step.
