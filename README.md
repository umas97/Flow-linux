# Flow

Gestore di attività in stile Asana per Windows, **completamente locale**: nessun account,
nessuna connessione, nessuna porta in ascolto, nessuna dipendenza da installare. Tutto
l'archivio è un file JSON leggibile a mano, `data\board.json`.

Un eseguibile da 40 KB — compilato da **un solo file C#** — apre una finestra WebView2 e le
serve l'interfaccia da dentro il proprio processo.

> **Documentazione per l'utente: [GUIDA.md](GUIDA.md)** — viste, scorciatoie, inserimento
> rapido, backup, portabilità. Questo file è la mappa per chi mette mano al codice.

---

## Avvio e compilazione

```
Flow.exe            avvia l'app (doppio clic, o dalla shell)
build.cmd           ricompila Flow.exe — serve solo dopo aver modificato src\Flow.cs
```

Non esiste nessuno step di build per il frontend: **nessun bundler, nessun linter, nessun
test runner, nessun `package.json`**. Modificare qualcosa sotto `app\` ha effetto al
riavvio di `Flow.exe` (le risposte partono con `Cache-Control: no-cache`). `F12` apre i
DevTools; gli errori non gestiti della pagina e quelli dell'host finiscono in
`data\flow.log`.

`build.cmd` usa il `csc.exe` che Windows ha già dentro
(`%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`): niente Visual Studio, niente
SDK, niente NuGet. Referenzia le tre DLL di WebView2 in [lib/](lib/) e produce `Flow.exe`
nella radice del repository. `Flow.exe.config` (`probing privatePath="lib"`) deve restare
accanto all'eseguibile, altrimenti le DLL non vengono trovate.

Requisiti a runtime: .NET Framework 4.x e il runtime WebView2 — entrambi già presenti su un
Windows 10/11 aggiornato.

Aprire [app/index.html](app/index.html) direttamente nel browser funziona: il frontend
riconosce il protocollo `file:` e ripiega su `localStorage`. Comodo per lavorare sulla UI
senza ricompilare, ma `/api/*` non è disponibile.

---

## Architettura

### Due metà, un processo

[src/Flow.cs](src/Flow.cs) (1044 righe) non monta nulla: registra un filtro
`WebResourceRequested` su `https://flow.example/*` e risponde a ogni richiesta in-process.
[Flow.cs:552-621](src/Flow.cs#L552-L621) instrada `/api/*`, `ServeStatic` serve i file di
`app\` (con guardia sul path traversal e tabella MIME).

`SetVirtualHostNameToFolderMapping` **non** è usato di proposito: servirebbe i file da sé
scavalcando l'handler, e `/api/*` non arriverebbe mai. Aggiungere una `fetch` dal frontend
verso un endpoint nuovo richiede quindi un `case` nuovo in quello switch.

| Endpoint | |
|---|---|
| `GET/PUT /api/data` | legge e scrive `board.json` |
| `GET /api/info` | percorsi, numero e peso dei backup, versione di WebView2 |
| `POST /api/reveal` | mostra `board.json` nell'Esplora risorse |
| `POST /api/pick` | dialogo nativo cartella/file |
| `POST /api/kind` | cartella o file? lo chiede al disco |
| `POST /api/open` | evidenzia un percorso nell'Esplora risorse |
| `/api/quit`, `/api/health` | chiusura, ping |

`/api/pick`, `/api/kind` e `/api/open` prendono un **corpo in testo semplice, non JSON**
(`dir`/`file` e un percorso): in `Flow.cs` non c'è un parser JSON e una stringa sola non
giustifica scriverne uno.

`/api/pick` apre il dialogo nativo, quindi risponde solo dopo la scelta dell'utente: tiene
la richiesta con `e.GetDeferral()` e mostra il dialogo da un `BeginInvoke` (un dialogo
modale non si può aprire dentro l'event handler). `/api/kind` fa lo stesso e sposta
`Directory.Exists`/`File.Exists` su un thread del pool — una condivisione di rete morta
blocca per secondi, e questo codice gira sul thread della UI.

`/api/open` si limita a **rivelare** un percorso (`explorer.exe "<dir>"` oppure
`/select,"<file>"`), rifiuta tutto ciò che non sia un percorso rooted ed esistente, e
**non fa mai** `Process.Start` sul file stesso. Decide cartella-o-file guardando il
filesystem, mai dal `kind` memorizzato nel collegamento.

### Frontend: globali, nessun modulo

Script semplici su `window`, caricati in ordine di dipendenza da
[index.html](app/index.html#L106-L112) — cambiare l'ordine rompe l'avvio:

| File | | Righe |
|---|---|--:|
| [icons.js](app/js/icons.js) | set di SVG in linea | 67 |
| [util.js](app/js/util.js) | `U` — date, DOM, markdown minimale | 194 |
| [store.js](app/js/store.js) | `Store` — stato, salvataggio, annulla/ripristina | 595 |
| [parse.js](app/js/parse.js) | `Parse` — linguaggio naturale italiano | 181 |
| [views.js](app/js/views.js) | `Views` — rendering delle viste | 773 |
| [detail.js](app/js/detail.js) | `Menu`, `Modal`, `Detail` | 701 |
| [app.js](app/js/app.js) | `App` — routing, eventi, drag & drop, scorciatoie | 2171 |

Ogni file è un IIFE `(function (global) { 'use strict'; … })(window)`.

### Stato e persistenza

[app/js/store.js](app/js/store.js) è l'unico posto in cui lo stato cambia:

- `Store.commit(label, fn)` — muta + accoda uno snapshot per l'undo (`JSON.stringify`
  completo dello stato, profondità 60) + programma il salvataggio. `label` compare nel
  toast di annullamento.
- `Store.quiet(fn)` — muta senza cronologia (preferenze di UI).
- Il salvataggio è `U.debounce(flush, 450)` → `PUT /api/data` con
  `JSON.stringify(state, null, 2)`: indentato di proposito, `board.json` deve restare
  leggibile da un essere umano.
- `Store.backend` vale `server` (servito dall'host), `local` (`file:` → localStorage) o
  `memory` (host irraggiungibile: ripiega su localStorage e avvisa).
- `normalize()` gira a ogni caricamento, undo, redo e import: riempie i default e **ripara
  i riferimenti orfani** (un'attività che punta a un progetto/sezione inesistente viene
  riattaccata, gli id di etichette sconosciute vengono scartati). Undo e redo
  ri-normalizzano, quindi non fare mai affidamento sull'identità degli oggetti attraverso
  un commit.

**Cancello sul salvataggio:** l'host rifiuta di scrivere qualcosa che non sembri una
board — `Accepts()` a [Flow.cs:811](src/Flow.cs#L811) pretende che il corpo grezzo contenga
`"tasks":[` **e** `"projects":[`. Rinominare una di quelle due chiavi di primo livello
romperebbe in silenzio ogni salvataggio con un HTTP 400. Lo stesso controllo protegge la
scrittura in chiusura.

**Chiusura:** `OnFormClosing` annulla la chiusura, chiama `ExecuteScriptAsync` per leggere
`window.Store.state` e lo rimanda indietro come messaggio web `flow:save:`; un timer di
1,5 s forza la chiusura se la pagina non risponde. È così che si salvano gli ultimi 450 ms
di modifiche, e dipende dal fatto che `Store` resti un globale con uno `state`
serializzabile in JSON.

**Backup** (`data\backups\`, al massimo 25 `board-*.json`, uno ogni 5 minuti, saltato se
identico al più recente): la soglia dei 5 minuti è letta all'avvio dall'mtime del file più
recente, non tenuta in memoria, perché il processo esce ogni volta che la finestra si
chiude. Un `board.json` illeggibile viene copiato in `illeggibile-*.json` (max 5) invece di
essere sovrascritto.

### Rendering

Nessun virtual DOM. `App.render()` ricostruisce barra laterale, topbar e contenuto
assegnando `innerHTML`; `renderContent()` salva e ripristina `scrollTop`/`scrollLeft` a
mano, e `isEditingInDetail()` evita di ridisegnare il pannello dettagli mentre un campo di
testo lì dentro ha il fuoco (un `<button>` col fuoco **non** deve bloccarlo: prima lasciava
dati vecchi sullo schermo).

Le textarea del pannello dettagli sono dimensionate dal CSS `field-sizing: content`, non da
JS: misurare `scrollHeight` subito dopo l'`innerHTML` cadeva in mezzo all'animazione di
280 ms della colonna, e alla prima apertura il titolo veniva alto centinaia di pixel.
`autoGrow()` in `detail.js` sopravvive solo come fallback per un runtime senza
`field-sizing`, e lì aspetta che la larghezza del pannello smetta di cambiare.

Tutta l'interazione è delega di eventi su `document`, con chiave negli attributi data:
`data-act` per la shell ([app.js:835](app/js/app.js#L835)) e `data-d` dentro il pannello
dettagli ([detail.js:347](app/js/detail.js#L347)). UI nuova = emetti l'attributo, aggiungi
un `case`. `data-task` marca i trascinabili, `data-drop` una zona di rilascio, `data-day`
una cella del calendario.

La vista corrente sta in `location.hash` (`#today`, `#p/<id>`) così avanti e indietro della
finestra funzionano; è specchiata in `localStorage['flow.route']` per l'avvio successivo.

---

## Convenzioni che contano

- **Italiano.** Ogni commento, stringa della UI, etichetta di commit e messaggio di log è
  in italiano. Va tenuto così.
- **Sintassi ES5, DOM moderno.** `var`, function expression, nessuna arrow function,
  template literal o classe in tutto `app\js\`. `fetch`, `closest`, `dataset`,
  `Object.assign` e `color-mix()` sono usati liberamente: il runtime è sempre
  Edge/WebView2 aggiornato.
- **Le date sono stringhe**, mai oggetti `Date` nello stato: chiavi in ora locale
  `"YYYY-MM-DD"` via `U.toKey` / `U.fromKey` / `U.addDays` / `U.diffDays`.
- **L'ordinamento è frazionario.** Attività e sezioni portano un `order` numerico
  (~1000 di distanza); il drag & drop calcola un valore nuovo con
  `U.orderBetween(before, after)` invece di reindicizzare.
- **Niente viene scaricato dalla rete.** Le icone sono SVG in linea in
  [icons.js](app/js/icons.js), i font sono font di sistema, le note sono rese da
  `U.miniMarkdown` (prima l'escape, poi una manciata di regole inline). Non aggiungere un
  CDN, un import di font o una libreria.
- **I token del tema** sono variabili CSS sotto `html[data-theme="light"|"dark"]` in
  [app/styles.css](app/styles.css). Lo script inline in
  [index.html](app/index.html#L9-L21) rilegge `localStorage['flow.prefs']` prima del primo
  paint per evitare un lampeggio: ogni impostazione nuova che influenza il primo paint va
  rispecchiata lì **e** in `Store.savePrefs()`.
- **Schede dei progetti.** `project.view` è uno fra `board` / `list` / `calendar` /
  `notes` (l'elenco con icone ed etichette è `Views.PROJECT_VIEWS`, usato da topbar,
  impostazioni e scorciatoie `1`-`4`), validato in `normalize()`: un valore sconosciuto
  ripiega su `board` invece di lasciare `V.content` senza niente da rendere. Nessuno legge
  `project.view` direttamente — lo fanno `App.projectView(p)` / `App.setProjectView`,
  perché con `settings.rememberProjectView` disattivo la scheda vive in `App.ui.tempView`
  (azzerato da `App.go`, mai persistito).
- **Note e collegamenti.** La scheda Note tiene `project.notes` (markdown),
  `project.links` (`{ id, path, label, color, kind }`, con `kind` fra `dir` / `file` /
  `url`) e `project.linksSort` (`manual` / `kind` / `alpha`). `normalize()` tiene coerenti
  `kind` e `path` nei due versi: un percorso `http(s)://` è sempre `url`, e un `kind`
  `url` su un percorso su disco viene declassato — altrimenti `/api/open` proverebbe un
  indirizzo web come percorso del filesystem. I percorsi passano da `Store.cleanPath`
  (trim + rimozione delle virgolette che aggiunge "Copia come percorso"). Un collegamento
  `url` non tocca mai l'host: `window.open` viene intercettato da `NewWindowRequested`,
  che lo passa al browser predefinito.
- **Gli stessi collegamenti stanno sulle attività**: `task.links` / `task.linksSort`,
  identici a quelli di un progetto e ripuliti dalla stessa `normalizeLinks()`. Non
  esiste una seconda copia dell'interfaccia: finestra, menu, ordinamento e riquadri
  sono quelli della scheda Note, esposti come `App.links`
  (`of` / `open` / `modal` / `menu` / `sortMenu`) e chiamati dal pannello dettaglio con
  l'attività al posto del progetto. `Views.linkCard(l, at)` e `Views.linkSortBtn(o, at)`
  ricevono il nome dell'attributo di delega, `act` nel guscio e `d` dentro `#detail`.
  Chi muta un elenco chiama `Store.touch(o)`: aggiorna `updatedAt` se chi possiede i
  collegamenti ce l'ha (un'attività sì, un progetto no).
- **Una sola tavolozza.** `COLORS` (24) e `EMOJIS` (48) in cima ad
  [app.js](app/js/app.js) sono l'unica fonte per progetti, etichette, collegamenti e
  colore principale. C'erano quattro array copiati da dodici colori che divergevano a ogni
  modifica: non reintrodurre un literal locale.
- **Inserimento rapido** ([app/js/parse.js](app/js/parse.js)) interpreta l'italiano
  naturale: date (`oggi`, `ven`, `tra 3 giorni`, `12/03`, `12 marzo`), `!alta`, `#tag`,
  `@persona`, `+progetto`. Etichette e persone citate lì vengono create al volo da
  `Store.ensureTag` / `ensurePerson`.

---

## Struttura

```
Flow.exe            l'applicazione (versionata: vedi la nota sotto)
Flow.exe.config     probing privatePath="lib", deve stare accanto all'exe
build.cmd           ricompila Flow.exe
lib\                le tre librerie di WebView2
src\
  Flow.cs           host: finestra, file serviti, /api/*, salvataggio, backup
  Flow.manifest     permessi e DPI awareness
app\
  index.html        struttura della pagina + script anti-lampeggio del tema
  styles.css        token dei temi e componenti
  flow.ico          icona
  js\               icons, util, store, parse, views, detail, app
data\               archivio dell'utente, creato al primo avvio (gitignored)
GUIDA.md            documentazione per l'utente finale
CLAUDE.md           istruzioni per Claude Code
```

---

## Note sul repository

- **`data\` è l'archivio vivo dell'utente** — `board.json`, `backups\`, `flow.log`,
  `.window` e la cache di WebView2. Tutto quello che sta lì dentro è gitignored tranne
  `.gitkeep`, e la cartella viene ricreata dall'app: un clone fresco ha `data\` vuota, e
  al primo avvio `seed()` in [store.js](app/js/store.js) scrive `board.json`. **Non
  riscrivere `board.json` né svuotare `backups\` come parte di una modifica al codice**:
  su una copia di lavoro quello è l'archivio reale di qualcuno.
- **`Flow.exe` è versionato**, quindi una modifica a `src\Flow.cs` non è utilizzabile
  finché `build.cmd` non è girato — e un commit che tocca `src\` deve portarsi dietro
  l'exe ricompilato, altrimenti su GitHub finisce un binario che non corrisponde al suo
  sorgente.
- Il vecchio percorso di avvio (un server Node `http` su 127.0.0.1, un launcher `.vbs`,
  un `.lnk`) e gli zip rilasciati sotto `dist\` sono stati rimossi nella fase 10. La
  logica di storage in `Flow.cs` è una traduzione diretta del `server.js` di allora; se
  serve rivedere l'originale è nella storia: `git show db0942b:vecchio-avvio-server/server.js`.
- [GUIDA.md](GUIDA.md) è documentazione per l'utente finale in italiano e fa da specifica
  per scorciatoie, viste e regole dei backup: va aggiornata quando se ne cambia una.
