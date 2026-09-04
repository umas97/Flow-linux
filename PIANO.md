# Piano di lavoro — 10 interventi su Flow

Documento di lavoro: raccoglie diagnosi, decisioni prese e piano di attuazione dei punti
richiesti — i nove iniziali più uno aggiunto dopo. Si avanza **una fase per volta, a
comando**. Ogni fase ha uno stato che viene aggiornato qui man mano.

Le fasi sono numerate **nell'ordine in cui conviene svilupparle**, non nell'ordine in cui
sono state chieste: la colonna “Richiesta” riporta il numero originale, così ogni punto
resta rintracciabile.

Legenda stato: `da fare` · `in corso` · `fatto` · `rimandato`

| Fase | Richiesta | Intervento | Stato | Tocca |
|:----:|:---------:|------------|-------|-------|
| 1 | 7 | Scorrimento con la rotellina (elenco, viste lunghe, pannelli) | fatto | `styles.css`, `app.js` |
| 2 | 3 | Barra dei dettagli affiancata invece che sovrapposta | fatto | `styles.css`, `app.js`, `detail.js`, `store.js` |
| 3 | 10 | Chiusura del pannello dettagli al click fuori, a scelta | fatto | `detail.js`, `app.js`, `store.js`, `README.md` |
| 4 | 2 | Sposta sezione a destra / sinistra | fatto | `app.js`, `detail.js`, `icons.js`, `styles.css` |
| 5 | 4 | Sotto-attività a capo automatico | fatto | `detail.js`, `styles.css` |
| 6 | 8 | Trascinamento attività (riordino e cambio sezione) | da fare | `app.js`, `styles.css` |
| 7 | 6 | Ordinamenti per sezione | da fare | `views.js`, `app.js`, `store.js`, `styles.css`, `README.md` |
| 8 | 5 | Riordino dei progetti + lucchetto | da fare | `views.js`, `app.js`, `store.js`, `index.html`, `styles.css` |
| 9 | 1 | Sezione Note per progetto con collegamenti a cartelle | da fare | `src/Flow.cs`, `views.js`, `app.js`, `store.js`, `styles.css`, `README.md` |
| 10 | 9 | Ripulitura dei dati personali + git | da fare | `data/`, `dist/`, `.gitignore`, `README.md` |

### Perché quest'ordine
- **1 e 2** sono la stessa zona di CSS (la catena delle altezze della griglia) e vanno
  sistemate prima di toccare le viste: senza scorrimento non si riesce nemmeno a provare
  come si deve tutto il resto.
- **3** viene subito dopo la 2 perché tocca lo stesso pannello e la stessa impostazione.
- **4 e 5** sono due correzioni piccole e indipendenti: buone da fare qui, mentre la testa
  è ancora sul pannello dettagli e sulle sezioni.
- **6 prima di 7**: l'ordinamento “Manuale” è esattamente quello che il trascinamento
  scrive, quindi il trascinamento va sistemato prima di offrire alternative.
- **8 dopo la 6**: il riordino dei progetti riusa lo stesso meccanismo di trascinamento
  appena messo a punto.
- **9 penultima**: è l'unica che richiede di modificare l'host e rilanciare `build.cmd`.
- **10 per ultima**: si ripulisce e si committa quando non si tocca più niente.

Ordine in forma breve, con i numeri delle richieste originali fra parentesi:
`1 (7) → 2 (3) → 3 (10) → 4 (2) → 5 (4) → 6 (8) → 7 (6) → 8 (5) → 9 (1) → 10 (9)`

---

## Modifiche al modello dati (`data/board.json`)

Tutte additive: `normalize()` in [store.js](app/js/store.js) riempie i valori di default,
quindi un `board.json` esistente continua a funzionare senza migrazione e `schema` resta a
`1`. Il controllo `Accepts()` dell'host ([Flow.cs:519](src/Flow.cs#L519)) guarda solo
`"tasks":[` e `"projects":[`: nessuna delle chiavi nuove lo disturba.

| Campo | Dove | Tipo / default | Fase |
|-------|------|----------------|:----:|
| `settings.detailWidth` | impostazioni | `440` | 2 |
| `settings.detailAutoHide` | impostazioni | `true` | 3 |
| `sort` | sezione | `"manual"` | 7 |
| `order` | progetto | numero, ~1000 di distanza (frazionario come le attività) | 8 |
| `settings.projectsLocked` | impostazioni | `true` | 8 |
| `notes` | progetto | `""` | 9 |
| `links` | progetto | `[]` di `{ id, path, label, color, kind }` — `kind`: `"dir"` \| `"file"` | 9 |

`project.view` accetta un valore in più: `"notes"` (fase 9).

---

## Fase 1 · Scorrimento con la rotellina
<sub>richiesta 7</sub>

**Stato:** fatto

### Diagnosi
Non è un problema di rotellina: **nessun contenitore ha un'altezza definita**, quindi
`overflow: auto` non ha mai niente da far scorrere.

- [styles.css:148-151](app/styles.css#L148-L151) — `.app { display: grid;
  grid-template-columns: var(--side-w) 1fr; height: 100vh; }`. Non c'è
  `grid-template-rows`: la riga è implicita e vale `auto`. Una riga `auto` si allunga
  quanto il contenuto e **sfonda** l'altezza del contenitore.
- di conseguenza `.main` ([styles.css:350](app/styles.css#L350)) è alta quanto il
  contenuto, e `.content { flex: 1; overflow: auto }`
  ([styles.css:416](app/styles.css#L416)) riceve un'altezza già pari al suo contenuto:
  non scorre mai.
- `html, body { overflow: hidden }` ([styles.css:69-72](app/styles.css#L69-L72)) taglia
  via tutto quello che esce dai 100vh. Risultato: le attività oltre il bordo inferiore
  sono irraggiungibili.
- prova indiretta che è sempre stato così: la vista bacheca si arrangia con
  `.column { max-height: calc(100vh - 130px) }` ([styles.css:452](app/styles.css#L452)),
  un numero cucito a mano perché l'altezza reale non arrivava dal genitore.

### Piano
1. `.app`: aggiungere `grid-template-rows: 100%` (riga di altezza definita) e
   `min-height: 0`.
2. `.main`: `min-height: 0; overflow: hidden`.
3. `.content`: `min-height: 0` (mantiene `flex: 1; overflow: auto`).
4. `.column`: togliere il `calc(100vh - 130px)` e passare a `max-height: 100%`, ora che
   l'altezza scende correttamente dal genitore.
5. `.list-view` / `.dash` / `.cal`: verificare che il padding inferiore (40px) resti
   raggiungibile a fine scorrimento.
6. `.dt-body` del pannello dettagli e `.side-list` della barra laterale: aggiungere
   `min-height: 0` (stessa trappola flex: senza, l'`overflow-y: auto` non si attiva).
7. La nuova scheda Note (fase 9) nasce già con la sua area scorrevole.

### Rischi
`renderContent()` salva e ripristina `scrollTop` a mano
([app.js:25-30](app/js/app.js#L25-L30)): con lo scorrimento che finalmente funziona va
controllato che il ripristino non salti più (prima era sempre 0).

### Fatto
- `.app`: `grid-template-rows: 100%` + `min-height: 0` — la riga della griglia ha
  finalmente un'altezza definita.
- `.main`: `min-height: 0; overflow: hidden`.
- `.content`: `min-height: 0` e **colonna flex** (`display: flex; flex-direction: column`),
  così la barra dei filtri sta in cima (`flex: none`) e la vista sotto riceve un'altezza
  definita. Senza questo passaggio `max-height: 100%` sulle colonne non si sarebbe
  risolto (percentuale su un genitore di altezza `auto`).
- `.board`: da `min-height: 100%` a `flex: 1; min-height: 0`;
  `.list-view` / `.dash` / `.cal` marcate `flex: none` per non schiacciarsi.
- `.column`: `max-height: calc(100vh - 130px)` → `max-height: 100%`.
- `.side-list` e `.dt-body`: aggiunto `min-height: 0`.
- `renderContent()`: ora salva e ripristina anche lo scorrimento **orizzontale della
  bacheca** e quello **verticale di ogni colonna** (chiave `data-section`). Prima non
  serviva perché nulla scorreva davvero; con la fase 1 ogni ridisegno li avrebbe
  riportati all'inizio.
- Il padding inferiore delle viste (40px / 30px) è dentro l'elemento che scorre, quindi
  resta raggiungibile a fine corsa.

---

## Fase 2 · Barra dei dettagli affiancata
<sub>richiesta 3</sub>

**Stato:** fatto

### Decisione presa
Si affianca come la barra di VSCode: **larghezza iniziale 440px, bordo sinistro
trascinabile** per allargare/stringere, misura ricordata in
`settings.detailWidth`. Sotto i 1100px di finestra torna sovrapposta con lo scrim (su uno
schermo stretto affiancarla non lascerebbe spazio utile alle sezioni).

### Diagnosi
[styles.css:715-725](app/styles.css#L715-L725): `.detail` è `position: fixed; right: 0`
con `z-index: 41` e `transform: translateX(102%)` da chiusa. Vive fuori dal flusso, quindi
copre il contenuto; su finestre larghe non c'è nessuno scrim, e le colonne di destra
finiscono sotto il pannello.

### Piano
1. `.app`: terza colonna nella griglia →
   `grid-template-columns: var(--side-w) minmax(0, 1fr) var(--detail-w)` con
   `--detail-w: 0px`.
2. `.app.detail-open { --detail-w: var(--detail-size, 440px) }`; `--detail-size` scritta
   sull'elemento `#app` all'avvio a partire da `settings.detailWidth`.
3. `.detail`: da `position: fixed` a elemento di griglia (`position: relative`,
   `overflow: hidden`, `min-width: 0`); l'animazione di apertura passa dalla larghezza
   della colonna (transizione su `grid-template-columns`), non più dal `transform`.
4. `Detail.open` / `Detail.close` ([detail.js:216-238](app/js/detail.js#L216-L238)):
   aggiungere/togliere `detail-open` su `#app`; lo scrim resta solo sotto la soglia
   stretta.
5. Maniglia: `<div class="detail-grip">` sul bordo sinistro, trascinamento con
   `pointerdown`/`pointermove`/`pointerup`, limiti 320–720px, doppio clic per tornare a
   440. Al rilascio `Store.quiet(st => st.settings.detailWidth = …)`.
6. Media query `max-width: 1100px`: `.detail` torna `position: fixed` + scrim, la maniglia
   si nasconde.
7. Il pannello ha già la sua area scorrevole (`.dt-body`), che con la fase 1 funziona
   davvero.

### Rischi
`Menu.open` posiziona i menu a comparsa con `position: fixed` e coordinate di
`getBoundingClientRect` ([detail.js:110-122](app/js/detail.js#L110-L122)): con il pannello
in griglia le coordinate restano corrette, ma il contenimento ai bordi va riprovato con il
pannello aperto e la finestra stretta.

### Fatto
- `.app`: terza colonna `grid-template-columns: var(--side-w) minmax(0, 1fr) var(--detail-w)`
  con `--detail-w: 0px`; `.app.detail-open` la porta a `var(--detail-size, 440px)` e
  l'apertura è animata con una transizione su `grid-template-columns`.
- `.detail`: da `position: fixed` a elemento di griglia (`position: relative`,
  `overflow: hidden`, `min-width: 0`, niente ombra). La `visibility` ha un ritardo di 280ms
  in chiusura, così il contenuto non sparisce prima che la colonna si sia richiusa.
- Maniglia `.detail-grip` sul bordo sinistro: trascinamento con
  `pointerdown`/`pointermove`/`pointerup`+`pointercancel`, limiti 320–720px, doppio clic
  per tornare a 440. Al rilascio `Store.quiet` scrive `settings.detailWidth`.
  Durante il trascinamento `.app.detail-resizing` spegne la transizione della griglia.
- `Detail.isDocked()` / `Detail.setWidth()` / `Detail.syncDock()` in
  [detail.js](app/js/detail.js); `syncDock` è agganciata a `resize`, così passando la
  soglia lo scrim si accende o si spegne subito.
- Media query `max-width: 1100px`: `--detail-w: 0px`, `.detail` torna `position: fixed` con
  `transform` e ombra, maniglia nascosta. La larghezza ricordata vale anche da sovrapposto.
- `normalize()`: `settings.detailWidth` con default `440`, validato e limitato a 320–720.
- **Correzione collaterale necessaria:** posizionamento esplicito
  (`grid-column: 1 / 2 / 3`) su `.sidebar`, `.main`, `.detail`. Sotto le soglie strette
  quei due elementi passano a `position: fixed` e smettono di essere elementi di griglia:
  senza il posizionamento esplicito l'area principale scivolava nella prima colonna, larga
  0. La media query a 760px non riscrive più il template a due colonne, imposta
  `--side-w: 0px`.

---

## Fase 3 · Chiusura del pannello dettagli al click fuori
<sub>richiesta 10</sub>

**Stato:** fatto

### Decisioni prese
- Riguarda il **pannello dei dettagli** (quello di destra, con la ✕), non la barra laterale
  sinistra.
- Nuova impostazione con due modi:
  - **Automatico** — un click fuori dal pannello lo chiude. Vale **sempre**, anche a
    finestra larga con il pannello agganciato di fianco al contenuto.
  - **Fisso** — comportamento di oggi: il pannello resta aperto finché non lo chiudi con la
    ✕ (o con `Esc`).
- Default: **Automatico** (`settings.detailAutoHide: true`). È il comportamento che hai
  descritto per primo; invertirlo è una riga sola se cambi idea.
- Posto dell'impostazione: pannello **Impostazioni**
  ([app.js:496-591](app/js/app.js#L496-L591)), riga con selettore a due stati come
  “Densità”.

### Diagnosi
Oggi niente chiude il pannello al click fuori: il gestore del click su `#scrim`
([app.js:1018-1021](app/js/app.js#L1018-L1021)) è l'unica via, e lo scrim compare solo
sotto i 760px di finestra ([detail.js:229](app/js/detail.js#L229)). A finestra larga
l'unica uscita sono la ✕ e `Esc`.

### Piano
1. `normalize()`: `settings.detailAutoHide` con default `true`.
2. Riga nelle Impostazioni: `<div class="seg">` con “Automatico” / “Fisso”, scritta con
   `Store.quiet` (preferenza d'interfaccia, fuori dalla cronologia annulla/ripristina).
3. Gestore in `detail.js`: sull'evento `click` a livello di documento, se il pannello è
   aperto, l'impostazione è `Automatico` e il click **non** è dentro il pannello → chiudi.
4. **Le eccezioni sono la parte delicata.** Non deve chiudersi quando il click cade su:
   - un menu a comparsa, il selettore data, una finestra modale, la palette comandi, un
     avviso: questi vivono in `document.body`, **fuori** da `#detail`
     ([detail.js:102](app/js/detail.js#L102)) → il controllo va fatto su
     `.menu, #modal, #palette, #toasts` oltre che su `#detail`;
   - un'altra attività: in quel caso il pannello deve **cambiare attività**, non chiudersi
     (l'ordine dei gestori sulla delega degli eventi va verificato: `[data-act="open-task"]`
     deve vincere);
   - la spunta di completamento di un'altra attività o un pulsante che apre un menu.
5. Si ascolta `click` e non `mousedown`: alla pressione del tasto il campo di testo del
   pannello non ha ancora perso il fuoco, e il suo evento `change` — quello che salva
   titolo, note e sotto-attività ([detail.js:534-549](app/js/detail.js#L534-L549)) — non è
   ancora partito. Chiudendo su `mousedown` si perderebbe l'ultima modifica.
6. `Esc` e la ✕ continuano a funzionare in tutti e due i modi.
7. Aggiornare [README.md](README.md) con la nuova impostazione.

### Fatto
- `normalize()`: `settings.detailAutoHide` default `true` (`!== false`, così un
  `board.json` esistente parte in Automatico).
- Riga **Pannello dei dettagli** nelle Impostazioni ([app.js:538-543](app/js/app.js#L538-L543)),
  `<div class="seg" id="stDetailHide">` con Automatico / Fisso, scritta con `Store.quiet`.
- Gestore in [detail.js:373-397](app/js/detail.js#L373-L397), su `click` a livello di
  documento.
- **Le eccezioni sono risolte in due tempi**, il che le rende robuste senza dover elencare
  ogni pulsante:
  1. subito, per selettore: `#detail, .menu, #modal, #palette, #toasts, #scrim` (tutto ciò
     che appartiene al pannello ma vive in `document.body`) e `[data-task]` (scheda, riga
     o cella del calendario di un'altra attività, spunta di completamento compresa: il
     pannello deve cambiare attività, non chiudersi);
  2. dopo, con un `setTimeout(0)`: la chiusura avviene solo se a fine giro di gestori
     l'attività aperta è ancora la stessa e non si è aperto niente (`Menu.node`, `#modal`,
     `#palette`). Così qualunque pulsante che apre un menu o una modale è coperto senza
     essere nominato — e la delega degli eventi non ha bisogno di un ordine particolare.
- README aggiornato: tabella dei due modi, più il pannello affiancato e ridimensionabile
  della fase 2.

---

## Fase 4 · Sposta sezione a destra / sinistra
<sub>richiesta 2</sub>

**Stato:** fatto

### Diagnosi
Bug preciso in `moveSection` ([app.js:1104-1114](app/js/app.js#L1104-L1114)):

```js
var idx = p.sections.findIndex(...);          // indice nell'ARRAY
...
var sorted = p.sections.slice().sort(byOrder); // indice nell'ORDINE VISIVO
var tmp = sorted[idx].order;                   // ← due indici diversi, mescolati
```

`idx` arriva da `openSectionMenu` ([app.js:1053-1055](app/js/app.js#L1053-L1055)) ed è la
posizione nell'array; viene poi usato per indicizzare `sorted`, che è l'array ordinato per
`order`. Finché le due sequenze coincidono (subito dopo la creazione delle sezioni) il
primo spostamento sembra funzionare; **dallo spostamento successivo in poi** l'array non è
più allineato agli `order` e lo scambio colpisce la sezione sbagliata. Anche il controllo
di estremità (`target < 0 || target >= length`) usa l'indice sbagliato, così la voce
risulta attiva quando dovrebbe essere ferma e viceversa.

### Piano
1. `moveSection(p, sectionId, dir)`: lavorare **solo** sull'array ordinato per `order`,
   ricavando l'indice da `sectionId` (mai passare indici tra funzioni).
2. Dopo lo scambio riallineare anche `p.sections` all'ordine visivo e **riassegnare gli
   `order` come `(i + 1) * 1000`**: array e `order` restano sempre in fase e il difetto non
   può ripresentarsi.
3. `openSectionMenu`: disabilitare (`disabled`, non nascondere) “Sposta a sinistra” sulla
   prima sezione e “Sposta a destra” sull'ultima, calcolate sull'ordine visivo. Serve un
   supporto `disabled` nelle voci di `Menu.open`.
4. In vista elenco le stesse due voci restano utili ma le etichette sono fuorvianti:
   mostrare “Sposta su” / “Sposta giù” quando `p.view === 'list'`.

### Fatto
- `moveSection(p, sectionId, dir)` ([app.js:1151](app/js/app.js#L1151)): riceve l'**id**, non
  più un indice. Ricava l'indice dall'ordine visivo, scambia i due elementi dell'array
  ordinato, **rinumera** tutto con `(i + 1) * 1000` e riassegna `p.sections`. Array e
  `order` restano quindi sempre in fase: il difetto non può ripresentarsi.
- `openSectionMenu` ([app.js:1087](app/js/app.js#L1087)): l'indice si calcola sull'ordine
  visivo e serve solo per disattivare le voci agli estremi (`disabled: idx <= 0` /
  `idx >= sorted.length - 1`). Nessun indice viene più passato fra le funzioni.
- Etichette e icone seguono la vista: “Sposta a sinistra/destra” con `chevronLeft`/
  `chevronRight` in bacheca, “Sposta su/giù” con `chevronUp`/`chevronDown` in vista elenco
  (`p.view === 'list'`).
- Supporto `disabled` nelle voci di `Menu.open` ([detail.js:85-93](app/js/detail.js#L85-L93)):
  classe `.off` e attributo `disabled` sul `<button>`. La voce resta al suo posto invece di
  sparire, e un `<button disabled>` non riceve nemmeno il `mousedown`, quindi cliccarci
  sopra non chiude il menu.
- Nuova icona `chevronUp` in [icons.js](app/js/icons.js); stile `.menu-item.off` in
  [styles.css:863-864](app/styles.css#L863-L864).
- **Effetto collaterale voluto:** `p.sections[0]` — usato come “prima sezione” dal recupero
  delle attività orfane ([store.js:177](app/js/store.js#L177)) e da `createTask`
  ([store.js:418](app/js/store.js#L418)) — ora coincide davvero con la prima sezione a
  schermo, perché l'array viene riallineato all'ordine visivo.

---

## Fase 5 · Sotto-attività a capo automatico
<sub>richiesta 4</sub>

**Stato:** fatto

### Diagnosi
Le sotto-attività sono `<input class="txt">`
([detail.js:315](app/js/detail.js#L315)): un `<input>` è per definizione a riga singola,
il testo lungo scorre orizzontalmente dentro il campo e non è mai leggibile per intero.
Le attività normali invece vanno a capo perché `.card-title` ha
`word-break: break-word` ([styles.css:503](app/styles.css#L503)).

### Piano
1. Sostituire l'`<input>` con `<textarea class="txt" rows="1">` (il valore va nel corpo del
   tag, con `U.esc`).
2. Riusare `autoGrow()` ([detail.js:335-339](app/js/detail.js#L335-L339)) su `input`, come
   già si fa per il titolo, così l'altezza segue il testo.
3. CSS `.sub-item .txt`: `resize: none; overflow: hidden; line-height: 1.45; font-family:
   inherit; word-break: break-word`; `.sub-item` da `align-items: center` a `flex-start`
   perché spunta e cestino restino allineati alla prima riga.
4. Tastiera ([detail.js:551-570](app/js/detail.js#L551-L570)): `Enter` continua a
   confermare e creare la sotto-attività successiva (**non** inserisce una riga);
   `Shift+Enter` inserisce un ritorno a capo vero; `Esc` esce dal campo.
5. `change` su `[data-d="sub-title"]` resta valido per i `<textarea>`.

### Fatto
- `<input class="txt">` → `<textarea class="txt" rows="1">` con il valore nel corpo del tag
  ([detail.js:348](app/js/detail.js#L348)). `U.esc` va bene anche lì dentro, e `change`
  continua a fare `.trim()`, quindi nessun titolo comincia con un ritorno a capo (il
  parser HTML mangerebbe il primo).
- Altezza: `autoGrow` girava solo sul titolo. Ora gira su ogni sotto-attività a fine
  `Detail.render` ([detail.js:369](app/js/detail.js#L369)) e sull'evento `input`
  ([detail.js:626](app/js/detail.js#L626)), con lo stesso selettore del titolo.
- Tastiera ([detail.js:652-656](app/js/detail.js#L652-L656)): `Invio` **senza** Maiusc
  conferma e apre la sotto-attività successiva come prima; `Maiusc+Invio` inserisce un
  ritorno a capo vero (l'evento passa e `input` fa crescere il campo); `Esc` esce.
- CSS ([styles.css:824-840](app/styles.css#L824-L840)): `.sub-item` da
  `align-items: center` a `flex-start`, `.sub-item .txt` con `resize: none`,
  `overflow: hidden`, `line-height: 1.45`, `font-family: inherit`, `min-width: 0` e
  `word-break: break-word`. `.sub-item .check` prende `margin-top: 3px` per restare
  allineata alla prima riga di testo.

### Lasciato come stava
`.row-title` della vista elenco continua a tagliare il titolo con i puntini
([styles.css:589](app/styles.css#L589)): non era nella richiesta.

---

## Fase 6 · Trascinamento delle attività
<sub>richiesta 8</sub>

**Stato:** da fare

### Diagnosi
Il meccanismo ([app.js:1191-1290](app/js/app.js#L1191-L1290)) funziona “a tratti” per
quattro motivi distinti:

1. **Il calcolo dell'ordine parte dal DOM, non dal modello.** Le liste sono ordinate per
   `(a.done - b.done) || (a.order - b.order)`
   ([views.js:299](app/js/views.js#L299), [views.js:317](app/js/views.js#L317)): le
   completate vanno in fondo **conservando il loro `order`**, che può essere piccolo. La
   sequenza degli `order` lungo il DOM quindi non è monotòna, e
   `U.orderBetween(before, after)` riceve una coppia incoerente (es. `before = 3000`,
   `after = 0`) restituendo un valore che fa saltare l'attività in un punto qualunque.
   È questo il caso in cui “sembra non aver fatto niente”.
2. **Le sezioni vuote non si possono centrare.** In vista elenco la zona di rilascio è un
   `<div data-drop>` senza altezza minima ([views.js:322](app/js/views.js#L322)): se la
   sezione è vuota è alta 0px e il puntatore non la incontra mai. In bacheca `.col-body` ha
   `min-height: 20px` ([styles.css:465](app/styles.css#L465)), una striscia di 20 pixel da
   colpire al centimetro.
3. **`order: 0`.** `Store.createTask` assegna `minOrder - 1000`
   ([store.js:410-419](app/js/store.js#L410-L419)) e a forza di aggiunte in cima si arriva
   a 0 e sotto; con lo zero i confronti `before == null` di `U.orderBetween`
   ([util.js:175-180](app/js/util.js#L175-L180)) restano corretti (usa `== null`), ma il
   modello reale contiene già un `order: 0` (`data/board.json`) e le medie ripetute
   avvicinano i valori fino a collidere: due attività con lo stesso `order` si scambiano di
   posto a ogni ridisegno.
4. **Niente scorrimento automatico.** Trascinando verso il bordo la lista non si muove:
   con l'area di contenuto che dopo la fase 1 scorre davvero, senza auto-scorrimento è
   impossibile spostare un'attività fuori dalla porzione visibile.

### Piano
1. **Ordine calcolato sul modello.** Al rilascio si determina l'indice di inserimento tra
   i soli fratelli **non completati** della sezione di destinazione (presi dal modello,
   ordinati per `order`) e si chiama `U.orderBetween` su quella coppia. Il DOM serve solo a
   sapere *dove* si è rilasciato, non *quali* numeri usare.
2. Le attività completate non partecipano al calcolo; se si rilascia nella zona delle
   completate l'attività finisce in fondo alle aperte.
3. **Zone di rilascio sempre colpibili**: `min-height` di ~46px sulle zone vuote, con un
   riquadro tratteggiato “Trascina qui” quando un trascinamento è in corso.
4. **Difesa dalle collisioni**: se `U.orderBetween` restituisce un valore a distanza
   inferiore a 1 dai vicini, si rinumera la sezione (`(i + 1) * 1000`) nella stessa
   `commit`. Costa nulla e chiude il problema alla radice.
5. **Auto-scorrimento** durante il trascinamento: su `dragover`, se il puntatore è entro
   ~60px dal bordo superiore/inferiore di `.content` (o dai bordi laterali in bacheca), si
   scorre progressivamente.
6. **Presa più chiara**: la maniglia `.row-grip` diventa visibile all'hover in modo netto e
   il cursore `grabbing` resta per tutto il trascinamento; `draggable` non viene messo sui
   campi di testo interni, così selezionare il testo non avvia un trascinamento.
7. **Interazione con la fase 7**: in una sezione con ordinamento diverso da “Manuale” il
   riordino interno non ha senso. Trascinare *dentro* la sezione resta permesso (cambio di
   sezione), il riordino interno mostra un avviso “ordinamento attivo: passa a Manuale per
   riordinare a mano”.
8. Resta l'HTML5 drag & drop (funziona bene in WebView2 e regge già il calendario): non
   c'è motivo di riscrivere tutto con i pointer event.

---

## Fase 7 · Ordinamenti per sezione
<sub>richiesta 6</sub>

**Stato:** da fare

### Decisioni prese
- Il selettore sta **in alto su ogni sezione**, accanto al contatore, sia in bacheca sia in
  vista elenco.
- La scelta è **per sezione** e **salvata** in `board.json` (`section.sort`).
- Criteri, in quest'ordine nel menu:

| Voce | Chiave | Comportamento |
|------|--------|---------------|
| Manuale | `manual` | *default*: `order` come oggi, è quello che scrive il trascinamento |
| Urgenza | `priority` | priorità alta → nessuna; a pari priorità, scadenza più vicina |
| Scadenza più vicina | `due` | date crescenti, senza scadenza in fondo |
| Aggiunte di recente | `created-desc` | `createdAt` decrescente |
| Aggiunte meno di recente | `created-asc` | `createdAt` crescente |
| Ultima modifica | `updated` | `updatedAt` decrescente |
| Alfabetico A→Z | `alpha` | titolo, confronto naturale insensibile agli accenti |

- Le **completate restano sempre in fondo**, in ogni ordinamento (è già così oggi e non
  vale la pena cambiarlo).
- Le viste trasversali (Oggi, Prossimi 7 giorni, Tutte, Completate) **non** cambiano: il
  loro ordinamento per data/priorità è già quello giusto.

### Piano
1. `Views.sortTasks(list, sort)`: unico punto che ordina, usato da `V.board` e `V.list`.
   Ordinamento stabile e `(a.done - b.done)` sempre come primo criterio.
2. Testata di sezione: pulsante `data-act="section-sort" data-id="<sid>"` che mostra
   l'icona dell'ordinamento e, se diverso da Manuale, l'etichetta breve. Menu con le sette
   voci e la spunta su quella attiva.
3. `Store.commit('ordinamento sezione', …)` scrive `section.sort` (è una scelta che va
   nell'archivio e nella cronologia annulla/ripristina).
4. `normalize()`: `s.sort = s.sort || 'manual'`, con validazione contro l'elenco dei
   criteri noti (un valore ignoto torna a `manual`).
5. In vista elenco, con ordinamento non manuale, le righe restano trascinabili solo verso
   altre sezioni (vedi fase 6, punto 7 del piano).
6. Aggiornare [README.md](README.md) con la tabella dei criteri.

---

## Fase 8 · Riordino dei progetti + lucchetto
<sub>richiesta 5</sub>

**Stato:** da fare

### Decisioni prese
- I progetti nella barra laterale si trascinano come le attività.
- **In fondo all'elenco dei progetti** un pulsante con il lucchetto attiva/disattiva il
  riordino. **Di default è bloccato** (`settings.projectsLocked: true`).
- A lucchetto chiuso i progetti non sono trascinabili e la maniglia non compare.

### Piano
1. `normalize()`: assegnare `p.order` (`(i + 1) * 1000` per chi non l'ha), rispettando
   l'ordine attuale dell'array — nessun progetto si muove al primo avvio dopo
   l'aggiornamento.
2. `Store.activeProjects()` ordina per `order`. Va verificato ogni uso: barra laterale,
   cruscotto, palette comandi, menu “Progetto” del pannello dettagli, inserimento rapido.
3. Barra laterale ([views.js:152-168](app/js/views.js#L152-L168)): `draggable` sui `<li>`
   quando il lucchetto è aperto, maniglia a sinistra al posto del pallino/emoji all'hover,
   linea di inserimento come per le attività.
4. Rilascio → `U.orderBetween` sui vicini, `Store.commit('riordino progetti', …)`, con la
   stessa difesa dalle collisioni della fase 6, punto 4 del piano.
5. Pulsante lucchetto in `#projectsGroup` ([index.html:48](app/index.html#L48)):
   `data-act="toggle-projects-lock"`, icona `lock`/`unlock` (**da aggiungere** a
   [icons.js](app/js/icons.js)), titolo “Sblocca il riordino dei progetti” /
   “Blocca il riordino dei progetti”. Lo stato va in `settings.projectsLocked` via
   `Store.quiet` (preferenza d'interfaccia, fuori dalla cronologia).
6. A lucchetto aperto, un'ombreggiatura leggera sull'elenco rende evidente la modalità
   attiva.

---

## Fase 9 · Sezione Note per progetto con collegamenti a cartelle
<sub>richiesta 1</sub>

**Stato:** da fare

### Decisioni prese
- **Quarta scheda “Note”** accanto a Bacheca / Elenco / Calendario
  (`project.view === 'notes'`, scorciatoia `4`). Pagina intera: non ruba spazio alle
  sezioni.
- Contiene un'area di **note in markdown** (stesso `U.miniMarkdown` delle attività) e una
  griglia di **collegamenti**: pulsanti colorati in stile etichetta.
- Etichetta predefinita = **nome della cartella finale**, modificabile; colore scelto da
  una tavolozza.
- Aggiunta di un collegamento in tre modi: **selettore nativo di Windows**, **incolla del
  percorso**, **trascinamento** di cartella/file dall'Esplora risorse.
- Al click: si apre **l'Esplora risorse con la cartella e l'elemento evidenziato**. Un
  collegamento a file apre la cartella che lo contiene con il file selezionato; un
  collegamento a cartella apre quella cartella mostrandone il contenuto. **Il file non
  viene mai eseguito.**

### Piano — host (`src/Flow.cs`, richiede `build.cmd`)
1. Nuovo endpoint `POST /api/pick` (nuovo `case` nello switch di
   [Flow.cs:441-490](src/Flow.cs#L441-L490)): apre `FolderBrowserDialog` o
   `OpenFileDialog` secondo il corpo `{"kind":"dir"|"file"}` e risponde
   `{"path":"…","name":"…"}` (o `{"cancelled":true}`). Va eseguito sul thread
   dell'interfaccia (`BeginInvoke`) e la risposta è asincrona: l'endpoint apre la finestra
   e risponde a scelta effettuata.
2. Nuovo endpoint `POST /api/open` con corpo `{"path":"…"}`:
   - percorso normalizzato con `Path.GetFullPath`, rifiutati i percorsi vuoti, gli UNC non
     esistenti e tutto ciò che non esiste sul disco (risposta 404, nessuna finestra);
   - se è un file: `explorer.exe /select,"<file>"`;
   - se è una cartella: `explorer.exe /select,"<cartella>"` apre il livello superiore con
     la cartella evidenziata → si usa invece `explorer.exe "<cartella>"`, che ne mostra il
     contenuto (deciso al punto precedente);
   - **mai** `Process.Start(path)` sul file: non si esegue niente.
3. `/api/reveal` resta com'è (apre l'archivio dati dalle impostazioni).
4. Il trascinamento dall'Esplora risorse dentro il WebView non passa dal JavaScript
   (Chromium non espone il percorso reale): si intercetta a livello host. Se l'aggancio
   nativo risulta troppo fragile, il trascinamento **degrada** su selettore + incolla, che
   restano sempre disponibili. Da verificare in fase di attuazione.

### Piano — interfaccia
5. `V.notes(p)`: intestazione, area note (vista markdown + modifica come le note delle
   attività), griglia collegamenti, pulsante “Aggiungi collegamento”, area di
   trascinamento.
6. Scheda nella barra superiore ([views.js:212-220](app/js/views.js#L212-L220)) e
   istradamento in `V.content` ([views.js:559-571](app/js/views.js#L559-L571)); tasto `4`
   nelle scorciatoie ([app.js:1408-1414](app/js/app.js#L1408-L1414)) e nella finestra
   delle scorciatoie.
7. Modale “Collegamento”: percorso (con `Sfoglia…`), etichetta (precompilata col nome
   finale), colore. Stessa modale per la modifica; menu contestuale sul pulsante per
   Modifica / Copia percorso / Rimuovi.
8. `normalize()`: `p.notes = p.notes || ''`, `p.links` array con `id`, `path`, `label`
   (default = ultimo segmento del percorso), `color`, `kind`; scartati gli elementi senza
   `path`.
9. Se l'app gira senza host (`Store.backend !== 'server'`, cioè `index.html` aperto nel
   browser) i collegamenti si vedono ma il click avvisa che serve `Flow.exe`, come già fa
   “Apri cartella” nelle impostazioni.
10. Aggiornare [README.md](README.md) (nuova vista + scorciatoia) e la sezione “Endpoints”
    di [CLAUDE.md](CLAUDE.md).

### Nota di sicurezza
I percorsi arrivano dall'interfaccia locale, ma l'endpoint `/api/open` va comunque scritto
in modo che accetti **solo** percorsi esistenti e non passi mai la stringa a una shell
(argomenti separati, niente `cmd /c`).

---

## Fase 10 · Ripulitura dei dati personali + git
<sub>richiesta 9</sub>

**Stato:** da fare

### Decisioni prese
- **`data/`: svuota e ignora.** Copia dell'archivio attuale salvata **fuori dal progetto**,
  poi `board.json` riportato al progetto di esempio “Benvenuto in Flow”, e via
  `backups/`, `flow.log`, `.window`, `.webview2/` (11 MB di cache del browser).
  In repository resta solo `data/.gitkeep`.
- **Binari**: restano `Flow.exe` e le tre DLL in `lib/`; via `dist/*.zip`; **via anche
  `vecchio-avvio-server/`**.
- **git**: `git init` + `.gitignore` + primo commit. La pubblicazione su GitHub la fai tu.

### Cosa contiene dati personali (verificato)
| File | Contenuto |
|------|-----------|
| `data/board.json` | progetto reale “FAC FIRMWARE” con le sue attività |
| `data/backups/*.json` (8 file) | copie dello stesso archivio |
| `data/flow.log` | percorso `C:\Users\Filippo\Desktop\free-asana\data\board.json` |
| `data/.window` | geometria della finestra (`-187,-926,1440,900,0`) |
| `data/.webview2/` | cache, cronologia e cookie del WebView2 (11 MB) |
| `dist/*.zip` | pacchetti rilasciati, verosimilmente con dentro un `board.json` reale |

Nel codice (`src/`, `app/`, `*.md`, `build.cmd`) **non c'è nessun percorso, nome o indirizzo
personale**: verificato con ricerca su `Filippo`, `smasaps`, `Desktop`.

### Piano
1. Copia di sicurezza di `data/board.json` e `data/backups/` nella cartella di lavoro
   temporanea, fuori dal progetto; ti dico dove.
2. Verifica del contenuto degli zip in `dist/` prima di eliminarli (se contengono un
   archivio reale è un motivo in più).
3. Pulizia: `data/board.json` → archivio di esempio; eliminati `data/backups/*`,
   `data/flow.log`, `data/.window`, `data/.webview2/`, `dist/`,
   `vecchio-avvio-server/`; creato `data/.gitkeep`.
4. `.gitignore`:
   ```
   data/*
   !data/.gitkeep
   dist/
   *.pdb
   Thumbs.db
   desktop.ini
   ```
5. `CLAUDE.md`: togliere il riferimento a `vecchio-avvio-server/` e a `dist/`.
6. `README.md`: controllare che non prometta file che non ci sono più.
7. `git init`, `git add -A`, primo commit. Nessun push: lo decidi tu.

### Da tenere a mente
`Flow.exe` è compilato: se nella fase 9 si modifica `src/Flow.cs`, va rilanciato
`build.cmd` **prima** del commit, altrimenti su GitHub finisce un eseguibile che non
corrisponde ai sorgenti.

---

## Note trasversali

- **Italiano** in ogni commento, stringa d'interfaccia, etichetta di `commit` e messaggio
  di log.
- **ES5** in `app/js/`: `var`, `function`, nessuna arrow function, nessun template literal,
  nessuna classe.
- Ogni nuovo elemento interattivo emette un `data-act` (guscio applicativo) o `data-d`
  (pannello dettagli) e aggiunge il proprio `case` alla delega degli eventi.
- Ogni modifica allo stato passa da `Store.commit` (con cronologia) o `Store.quiet`
  (preferenze d'interfaccia).
- Dopo ogni fase: riavviare `Flow.exe`, provare la funzione, controllare `data/flow.log`
  e aggiornare lo stato nella tabella in cima.
- Questo documento è di lavoro: se non lo vuoi su GitHub, si elimina alla fase 10.
