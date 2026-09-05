# Flow (Linux)

> Fork Linux di [FloppyO1/Flow](https://github.com/FloppyO1/Flow), portato da Windows
> (WebView2 + WinForms) a Ubuntu 24.04 con un host GTK 3 + WebKitGTK.
> La versione **Windows** resta disponibile qui: branch
> [`windows`](../../tree/windows) e release
> [`windows-final`](../../releases/tag/windows-final).

Gestore di attività in stile Asana per Ubuntu, **completamente locale**: nessun account,
nessuna connessione, nessuna porta in ascolto, nessuna dipendenza da compilare. Tutto
l'archivio è un file JSON leggibile a mano, `data/board.json`.

Un host di **un solo file Python** apre una finestra WebKitGTK e le serve l'interfaccia da
dentro il proprio processo.

> **Documentazione per l'utente: [GUIDA.md](GUIDA.md)** — viste, scorciatoie, inserimento
> rapido, backup, portabilità. Questo file è la mappa per chi mette mano al codice.

---

## Avvio

```
./flow              avvia l'app
./install.sh        registra la voce di menu e l'icona in ~/.local/share
./uninstall.sh      le toglie (data/ non viene toccata)
```

Requisiti, tutti dai repository ufficiali di Ubuntu 24.04:

```
sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1
```

`gir1.2-soup-3.0` arriva come dipendenza di `gir1.2-webkit2-4.1` e serve per le
intestazioni delle risposte. Non c'è nient'altro da installare: **niente `pip`, niente
ambienti virtuali, niente compilazione.** Se un binding manca, `src/flow.py` lo dice e
stampa il comando `apt` esatto invece di fallire sull'import.

Non esiste nessuno step di build, né per l'host né per il frontend: **nessun bundler,
nessun linter, nessun test runner, nessun `package.json`**. Modificare qualcosa sotto
`app/` — o dentro `src/flow.py` — ha effetto al riavvio di `./flow` (le risposte partono
con `Cache-Control: no-cache`). `F12` apre l'ispettore WebKit; gli errori non gestiti della
pagina e quelli dell'host finiscono in `data/flow.log`.

Aprire [app/index.html](app/index.html) direttamente nel browser funziona: il frontend
riconosce il protocollo `file:` e ripiega su `localStorage`. Comodo per lavorare sulla UI,
ma `/api/*` non è disponibile.

---

## Architettura

### Due metà, un processo

[src/flow.py](src/flow.py) non monta nulla: registra lo **schema URI `flow://`** su
`WebKitWebContext` e risponde a ogni richiesta in-process. `_su_richiesta` instrada
`/api/*`, `_servi_statico` serve i file di `app/` (con guardia sul path traversal e tabella
MIME). La pagina vive su `flow://flow.example/index.html`.

Uno schema personalizzato e non `http` è la scelta che tiene in piedi l'invariante del
progetto: **nessun socket, nessuna porta**. Il prezzo è che lo schema va dichiarato
`secure` e `cors enabled` sul `WebKitSecurityManager`, altrimenti la pagina resta senza
`localStorage` e il `fetch` verso `/api/` viene rifiutato.

Le risposte usano `WebKitURISchemeResponse` con `finish_with_response()`: la vecchia
`finish()` non permette di scegliere il codice di stato, e un 404 arriverebbe alla pagina
come un 200. Aggiungere una `fetch` dal frontend verso un endpoint nuovo richiede quindi un
ramo nuovo in `_su_richiesta`.

| Endpoint | |
|---|---|
| `GET/PUT /api/data` | legge e scrive `board.json` |
| `GET /api/info` | percorsi, numero e peso dei backup, versione di WebKitGTK |
| `POST /api/reveal` | mostra `board.json` nel gestore file |
| `POST /api/pick` | dialogo nativo cartella/file |
| `POST /api/kind` | cartella o file? lo chiede al disco |
| `POST /api/open` | evidenzia un percorso nel gestore file |
| `/api/quit`, `/api/health`, `/api/ping` | chiusura, ping |

`/api/pick`, `/api/kind` e `/api/open` prendono un **corpo in testo semplice, non JSON**
(`dir`/`file` e un percorso): è una stringa sola, interpretarla come JSON non aggiungerebbe
niente.

`/api/pick` apre `Gtk.FileChooserNative` — che passa dal portal XDG, quindi ha l'aspetto e
i permessi del gestore file di sistema e funziona su Wayland — e risponde solo dopo la
scelta: la richiesta viene tenuta e `finish_with_response()` si chiama dal gestore del
segnale `response`, perché un dialogo modale non si può aprire dentro il gestore della
richiesta. `/api/kind` sposta lo `stat` su un `threading.Thread` e rientra sul ciclo
principale con `GLib.idle_add` — una condivisione di rete morta blocca per secondi, e
questo codice gira sul filo della finestra.

`/api/open` si limita a **rivelare** un percorso: per un file chiama D-Bus
`org.freedesktop.FileManager1.ShowItems`, che lo evidenzia davvero dentro la sua cartella
come faceva `explorer.exe /select,`; per una cartella ne apre il contenuto con
`Gio.AppInfo`. Rifiuta tutto ciò che non sia un percorso POSIX assoluto ed esistente, e
**non esegue mai** il file. Decide cartella-o-file guardando il filesystem, mai dal `kind`
memorizzato nel collegamento. `~` viene espanso qui, non nei dati salvati.

### Frontend: globali, nessun modulo

Script semplici su `window`, caricati in ordine di dipendenza da
[index.html](app/index.html#L107-L113) — cambiare l'ordine rompe l'avvio:

| File | | Righe |
|---|---|--:|
| [icons.js](app/js/icons.js) | set di SVG in linea | 68 |
| [util.js](app/js/util.js) | `U` — date, DOM, markdown minimale | 194 |
| [store.js](app/js/store.js) | `Store` — stato, salvataggio, annulla/ripristina | 621 |
| [parse.js](app/js/parse.js) | `Parse` — linguaggio naturale italiano | 181 |
| [views.js](app/js/views.js) | `Views` — rendering delle viste | 786 |
| [detail.js](app/js/detail.js) | `Menu`, `Modal`, `Detail` | 741 |
| [app.js](app/js/app.js) | `App` — routing, eventi, drag & drop, scorciatoie | 2188 |

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
  `memory` (host irraggiungibile: ripiega su localStorage e avvisa). Il riconoscimento a
  [store.js:21](app/js/store.js#L21) accetta `flow:` oltre a `http:`/`https:`: senza quel
  ramo l'app ripiegherebbe su localStorage pur avendo l'archivio su disco a disposizione.
- `normalize()` gira a ogni caricamento, undo, redo e import: riempie i default e **ripara
  i riferimenti orfani** (un'attività che punta a un progetto/sezione inesistente viene
  riattaccata, gli id di etichette sconosciute vengono scartati). Undo e redo
  ri-normalizzano, quindi non fare mai affidamento sull'identità degli oggetti attraverso
  un commit.

**Cancello sul salvataggio:** l'host rifiuta di scrivere qualcosa che non sembri una
board — `accetta()` in [flow.py](src/flow.py) pretende che il corpo grezzo contenga
`"tasks":[` **e** `"projects":[`. Rinominare una di quelle due chiavi di primo livello
romperebbe in silenzio ogni salvataggio con un HTTP 400. Lo stesso controllo protegge la
scrittura in chiusura.

**Chiusura:** `delete-event` annulla la chiusura, chiama `evaluate_javascript()` per
leggere `window.Store.state` e lo rimanda indietro come messaggio
`window.webkit.messageHandlers.flow` con prefisso `flow:save:`; un timer di 1,5 s forza la
chiusura se la pagina non risponde. È così che si salvano gli ultimi 450 ms di modifiche, e
dipende dal fatto che `Store` resti un globale con uno `state` serializzabile in JSON.

`navigator.sendBeacon` — l'altra rete di sicurezza del frontend — **non funziona su uno
schema personalizzato** (WebKit lo consente solo su HTTP/S). Non è un problema perché la
chiamata sta già dentro un `try`, e la garanzia anti-perdita è quella chiusura ritardata:
ma non contarci più.

**Attenzione al segnale dei messaggi:** in WebKit2 4.1 `script-message-received` porta un
`WebKitJavascriptResult`, non il valore JavaScript. Il testo si legge con
`risultato.get_js_value().to_string()`. Leggerlo un livello troppo in alto non solleva
niente di visibile: i messaggi arrivano e vengono scartati in silenzio, e ci si accorge
solo che la chiusura non salva più e che gli errori di pagina non compaiono nel log.

**Backup** (`data/backups/`, al massimo 25 `board-*.json`, uno ogni 5 minuti, saltato se
identico al più recente): la soglia dei 5 minuti è letta all'avvio dall'mtime del file più
recente, non tenuta in memoria, perché il processo esce ogni volta che la finestra si
chiude. La copia salta se identica ma **la soglia si azzera lo stesso**. Un `board.json`
illeggibile viene copiato in `illeggibile-*.json` (max 5) invece di essere sovrascritto. La
scrittura è atomica: file temporaneo, `flush` + `fsync`, `os.replace()`.

### Finestra

`Gtk.Application` con `application-id` `it.flow.Flow` fa da lucchetto via D-Bus: un secondo
avvio non apre una seconda finestra, arriva come `activate` e chiama `present()`. Lo stesso
id deve combaciare con il nome del file `.desktop` scritto da `install.sh`, altrimenti
GNOME non collega la finestra alla voce di menu e mostra l'icona generica.

`data/.window` conserva `x,y,larghezza,altezza,massimizzata`. Su Wayland **le coordinate si
salvano ma non si applicano**: una finestra non decide dove mettersi, e non c'è nessun ramo
X11 di riserva. La dimensione da non massimizzati si misura con 200 ms di ritardo, perché
massimizzando il ridimensionamento arriva *prima* che la finestra si dichiari massimizzata:
leggendo subito si salverebbe la dimensione a tutto schermo come se fosse quella normale.

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
`data-act` per la shell e `data-d` dentro il pannello dettagli. UI nuova = emetti
l'attributo, aggiungi un `case`. `data-task` marca i trascinabili, `data-drop` una zona di
rilascio, `data-day` una cella del calendario.

La vista corrente sta in `location.hash` (`#today`, `#p/<id>`) così avanti e indietro della
finestra funzionano; è specchiata in `localStorage['flow.route']` per l'avvio successivo.

---

## Convenzioni che contano

- **Italiano.** Ogni commento, stringa della UI, etichetta di commit e messaggio di log è
  in italiano — nell'host Python come nel frontend. Va tenuto così.
- **Solo la standard library e PyGObject.** `src/flow.py` non importa niente che non sia
  già su una Ubuntu 24.04 con i quattro pacchetti sopra. Nessun `pip`, nessun `requirements.txt`.
- **Sintassi ES5, DOM moderno.** `var`, function expression, nessuna arrow function,
  template literal o classe in tutto `app/js/`. `fetch`, `closest`, `dataset`,
  `Object.assign` e `color-mix()` sono usati liberamente: il runtime è sempre WebKitGTK
  aggiornato.
- **Percorsi POSIX e basta.** Separatore `/`, radice `/`, assoluti che iniziano con `/`.
  Un archivio arrivato da una macchina Windows mostrerà i suoi collegamenti come non
  validi: **non riscrivere mai i dati esistenti** per rimediare — un percorso non
  risolvibile resta salvato e produce un messaggio d'errore, non viene cancellato.
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
  rispecchiata lì **e** in `Store.savePrefs()`. Il tema «Auto» segue GNOME: WebKitGTK mappa
  `prefers-color-scheme` sulle impostazioni di sistema.
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
  (trim + rimozione delle virgolette che si porta dietro un percorso copiato da un
  terminale). Un collegamento `url` non tocca mai l'host: `window.open` viene intercettato
  dal segnale `create` della WebView, che lo passa al browser predefinito.
- **Gli stessi collegamenti stanno sulle attività**: `task.links` / `task.linksSort`,
  identici a quelli di un progetto e ripuliti dalla stessa `normalizeLinks()`. Non
  esiste una seconda copia dell'interfaccia: finestra, menu, ordinamento e riquadri
  sono quelli della scheda Note, esposti come `App.links`
  (`of` / `open` / `modal` / `menu` / `sortMenu`) e chiamati dal pannello dettaglio con
  l'attività al posto del progetto. `Views.linkCard(l, at)` e `Views.linkSortBtn(o, at)`
  ricevono il nome dell'attributo di delega, `act` nel guscio e `d` dentro `#detail`.
  Chi muta un elenco chiama `Store.touch(o)`: aggiorna `updatedAt` se chi possiede i
  collegamenti ce l'ha (un'attività sì, un progetto no).
- **Una sola tavolozza.** `PALETTE` (24 righe) e `EMOJIS` (48) in cima ad
  [app.js](app/js/app.js) sono l'unica fonte per progetti, etichette, collegamenti e
  colore principale; `COLORS` sono i soli valori chiari di `PALETTE`. C'erano quattro
  array copiati da dodici colori che divergevano a ogni modifica: non reintrodurre un
  literal locale, nemmeno in `store.js` (`ensureTag` / `ensurePerson` passano da
  `U.farColor()`).
  **Un colore non viene mai assegnato in automatico scorrendo la tavolozza in
  ordine**: 24 tinte a 15 gradi l'una dall'altra, di seguito, sembrano la stessa.
  `U.farColor(usati)` riceve i colori già assegnati e restituisce la tinta la cui
  *più vicina* fra quelle in uso è la più lontana possibile, a sorte fra le
  candidate a pari distanza. La chiamano in quattro: il dialogo di nuovo progetto
  (che preseleziona quel campione invece di `COLORS[0]`), `ensureTag`,
  `ensurePerson` e `linkModal`, ognuno passando i colori dei suoi pari.
  Ogni riga è una tinta in due varianti: `chiaro` è **il valore memorizzato in
  `board.json`** — l'identità del colore, che non dipende dal tema — `scuro` è la
  stessa tinta resa sul fondo scuro e `testo` è il colore leggibile sopra il pieno
  chiaro (sopra quello scuro è sempre `#1A1A1A`); tutte le coppie superano il
  contrasto WCAG AA. `U.tint(hex)` e `U.tintText(hex)` scelgono la variante del tema
  in corso: **un colore memorizzato non finisce mai direttamente in uno `style`
  inline**, chi scrive `--pc`/`--tc`/`--lc`/`--ac`/`--c` passa da `U.tint`, e
  `--accent`/`--accent-fg` li imposta `applyTheme()` (per il primo paint li rispecchia
  `savePrefs` in `accentScuro`/`accentTesto`, che legge lo script inline di
  `index.html`). Siccome quei valori sono scritti dentro l'HTML, cambiare tema
  ridisegna tutto. `normalize()` riporta in tavolozza con `U.snap` un colore che non
  c'è, prendendo la tinta più vicina: è così che rientra un archivio salvato da una
  versione precedente.
- **Inserimento rapido** ([app/js/parse.js](app/js/parse.js)) interpreta l'italiano
  naturale: date (`oggi`, `ven`, `tra 3 giorni`, `12/03`, `12 marzo`), `!alta`, `#tag`,
  `@persona`, `+progetto`. Etichette e persone citate lì vengono create al volo da
  `Store.ensureTag` / `ensurePerson`.

---

## Struttura

```
flow                script di avvio: risolve la propria cartella ed esegue l'host
install.sh          scrive il .desktop e copia l'icona in ~/.local/share
uninstall.sh        li rimuove, senza toccare data/
src/
  flow.py           host: finestra, file serviti, /api/*, salvataggio, backup
app/
  index.html        struttura della pagina + script anti-lampeggio del tema
  styles.css        token dei temi e componenti
  flow.svg          icona, un solo SVG scalabile
  js/               icons, util, store, parse, views, detail, app
data/               archivio dell'utente, creato al primo avvio (gitignored)
GUIDA.md            documentazione per l'utente finale
CLAUDE.md           istruzioni per Claude Code
```

---

## Note sul repository

- **`data/` è l'archivio vivo dell'utente** — `board.json`, `backups/`, `flow.log`,
  `.window` e la cache del motore in `.webkit`. Tutto quello che sta lì dentro è
  gitignored, e la cartella se la crea l'app: un clone fresco non ha `data/` affatto, e al
  primo avvio `seed()` in [store.js](app/js/store.js) scrive `board.json`.
  **Non riscrivere `board.json` né svuotare `backups/` come parte di una modifica al
  codice**: su una copia di lavoro quello è l'archivio reale di qualcuno.
- **Niente binari versionati.** L'host è sorgente Python eseguito così com'è: una modifica
  a `src/flow.py` è utilizzabile al riavvio, non c'è nessun artefatto da rigenerare e
  nessun commit da tenere allineato a un eseguibile.
- **Solo Linux.** Il supporto Windows (`Flow.cs` con WebView2 e WinForms, `build.cmd`,
  `lib/`, `Flow.exe`) è stato rimosso portando l'app su Ubuntu; la logica di archiviazione
  di `flow.py` è una traduzione diretta di quel `Flow.cs`, che a sua volta traduceva un
  vecchio `server.js`. Se serve rivedere gli originali sono nella storia del repository.
- **Bersaglio dichiarato: GNOME su Wayland, Ubuntu 24.04.** Non ci sono rami condizionali
  per X11, KDE o altri gestori file: dove serve basta il ripiego generico su `Gio.AppInfo`.
- [GUIDA.md](GUIDA.md) è documentazione per l'utente finale in italiano e fa da specifica
  per scorciatoie, viste e regole dei backup: va aggiornata quando se ne cambia una.

---

## Licenza

[MIT](LICENSE) — licenza dell'originale [FloppyO1/Flow](https://github.com/FloppyO1/Flow),
mantenuta invariata su questo fork.
