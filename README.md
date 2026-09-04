# Flow

Gestore di attività in stile Asana, **completamente locale**. Nessun account, nessuna
connessione a internet, nessuna dipendenza da installare. Tutto quello che scrivi
finisce in un unico file JSON sul tuo disco.

---

## Avvio

Doppio clic su **`Flow.exe`**. Non c'è altro da sapere.

Puoi trascinarlo sulla barra delle applicazioni o nel menu Start per averlo
sempre a portata di mano. Si apre una finestra dedicata, con la sua icona: non è
un browser travestito e non c'è nessuna barra degli indirizzi.

### Niente server, niente porte

Flow è una finestra WebView2 — il motore di pagina che Windows ha già dentro, lo
stesso che fa funzionare Edge. L'interfaccia sta in `app\`, e l'eseguibile gliela
serve **da dentro il proprio processo**: nessun socket aperto, nessuna porta in
ascolto, niente che resti acceso dopo che hai chiuso la finestra.

Quando l'app salva non parla con un server: chiama direttamente il codice che
scrive `data\board.json`.

### Serve internet?

No, mai. Non esistendo nemmeno un indirizzo di rete su cui affacciarsi, Flow non
è raggiungibile né da questo computer né dagli altri della tua rete. Font, icone
e stili sono tutti dentro la cartella: nessuna risorsa viene scaricata.

### Serve installare qualcosa?

No. Flow si appoggia a due cose che Windows ha già di suo:

- **.NET Framework 4.x**, incluso in Windows 8, 10 e 11;
- **il runtime WebView2**, installato di serie su Windows 10 e 11 insieme a Edge.

Su un Windows aggiornato ci sono entrambi. Se il runtime WebView2 mancasse, Flow
te lo dice all'avvio con un messaggio, invece di fallire in silenzio.

---

## Portabilità

Sì: puoi zippare la cartella e usarla altrove. Flow si orienta da sé — parte
sempre dalla posizione in cui si trova `Flow.exe` e cerca lì accanto `app\` e
`data\`. Funziona da chiavetta USB, con qualsiasi lettera di unità, e anche se il
percorso contiene spazi.

L'unica regola: **`Flow.exe` e la cartella `app\` vanno tenuti insieme.** Se li
separi, all'avvio te lo dice invece di aprire una finestra vuota.

Non c'è più nessun collegamento `.lnk` con percorsi assoluti da riparare, e
nessun `node.exe` da copiare: l'eseguibile *è* l'applicazione.

| Scenario | Serve installare qualcosa? |
|---|---|
| Cartella zippata, qualsiasi PC con Windows 10 o 11 | no |
| Cartella su chiavetta USB | no |
| Windows 8.1 senza runtime WebView2 | solo il runtime WebView2 |

I tuoi dati viaggiano con la cartella: sono in `data\board.json`, dentro il
pacchetto. Se preferisci un archivio pulito, cancella `data\` prima di zippare
(verrà ricreato al primo avvio) — ma **esporta prima**, se ti servono.

Una cosa da sapere prima di zippare: `data\.webview2` è la cache del motore di
pagina, può arrivare a qualche decina di MB ed è del tutto usa e getta. Puoi
cancellarla quando vuoi, viene ricreata da sola al primo avvio.

---

## Dove finiscono i dati

```
data\board.json          l'archivio: progetti, attività, etichette, impostazioni
data\backups\            copie automatiche, a rotazione: solo le ultime 25
```

Il salvataggio è automatico e avviene circa mezzo secondo dopo ogni modifica. La
scrittura è atomica (file temporaneo + rinomina), quindi un blocco improvviso del
computer non può lasciarti un archivio troncato. Una copia di sicurezza viene
messa da parte al massimo ogni 5 minuti.

Puoi copiare `data\board.json` dove vuoi: è il tuo archivio, in chiaro e leggibile.
Da **Impostazioni → Apri cartella** arrivi al file in due clic.

---

## Cosa sa fare

**Viste**

- **Oggi** — cruscotto con attività in ritardo, di oggi, dei prossimi 7 giorni,
  statistiche e andamento delle ultime settimane.
- **Bacheca** — colonne in stile kanban, con trascinamento tra le sezioni.
- **Elenco** — righe compatte raggruppate per sezione, riordinabili con il
  trascinamento.
- **Calendario** — mese intero; trascina un'attività su un altro giorno per
  spostarne la scadenza.
- **Note** — appunti del progetto e collegamenti a cartelle o file sul disco.
- **Prossimi 7 giorni**, **Tutte le attività**, **Completate**.

**Ordinamento delle sezioni**

Ogni sezione ha il suo criterio, scelto col pulsante accanto al contatore (in
bacheca e in vista elenco) e ricordato nell'archivio:

| Criterio | Cosa fa |
|----------|---------|
| **Manuale** | l'ordine che scrivi trascinando — è il valore predefinito |
| **Urgenza** | priorità alta prima; a pari priorità, scadenza più vicina |
| **Scadenza più vicina** | date crescenti, senza scadenza in fondo |
| **Aggiunte di recente** | dalla più nuova alla più vecchia |
| **Aggiunte meno di recente** | dalla più vecchia alla più nuova |
| **Ultima modifica** | modificate per ultime in cima |
| **Alfabetico A→Z** | per titolo, senza distinzione di accenti e maiuscole |

Le attività completate restano in fondo con ogni criterio. In una sezione con un
criterio attivo il riordino a mano non ha effetto: trascinandoci dentro
un'attività la sposti di sezione, ma il posto lo decide il criterio. Le viste
*Oggi*, *Prossimi 7 giorni*, *Tutte* e *Completate* hanno il loro ordinamento
per data e non sono interessate.

**Attività**

Titolo, note in markdown leggero, scadenza, priorità, etichette colorate,
assegnatario, sotto-attività con barra di avanzamento, duplicazione.

**Note e collegamenti di un progetto**

La quarta scheda di un progetto (tasto `4`) tiene due cose:

- gli **appunti** del progetto, in markdown leggero come le note di un'attività;
- i **collegamenti**: pulsanti colorati che puntano a una cartella o a un file sul
  disco. Un click apre l'**Esplora risorse** — su una cartella ne mostra il
  contenuto, su un file apre la cartella che lo contiene con il file già
  selezionato. **Il file non viene mai eseguito.**

Il percorso si mette con il selettore di Windows (*Scegli cartella…* /
*Scegli file…*), incollandolo, o scrivendolo a mano. L'etichetta è preimpostata col
nome dell'ultima cartella e si può cambiare, come il colore. Il pulsante `…` su un
collegamento apre *Modifica*, *Copia percorso* e *Rimuovi*.

I collegamenti servono l'Esplora risorse, quindi funzionano solo avviando
`Flow.exe`: aprendo `app\index.html` nel browser si vedono, ma il click avvisa che
serve l'applicazione.

**Ordine dei progetti**

I progetti nella barra laterale si riordinano trascinandoli, ma solo dopo aver
aperto il lucchetto: il pulsante **Riordina progetti**, in fondo all'elenco,
attiva la modalità (l'elenco si colora leggermente e compare una maniglia su
ogni riga). Un secondo click la richiude. Di partenza il riordino è **bloccato**,
per non spostare un progetto per sbaglio mentre lo si apre. L'ordine viene
salvato nell'archivio ed è annullabile con `Ctrl+Z`.

**Etichette**

Il pulsante `…` accanto a *ETICHETTE*, in fondo alla barra laterale, apre la
gestione: crea, rinomina, cambia colore, elimina. Eliminandone una viene tolta
anche dalle attività che la usavano (annullabile con `Ctrl+Z`). Ci arrivi anche
col tasto destro su un'etichetta, o da `Ctrl+K` → *Gestisci etichette*.

Nel pannello di un'attività, il selettore delle etichette propone **Crea "…"**
mentre digiti un nome che non esiste ancora.

**Interfaccia**

Tema chiaro, scuro o automatico (segue Windows), colore principale
personalizzabile, densità comoda o compatta, barra laterale comprimibile.
Annulla e ripristina illimitati sulla sessione (`Ctrl+Z` / `Ctrl+Shift+Z`).

Il **pannello dei dettagli** si affianca al contenuto invece di coprirlo: il suo
bordo sinistro si trascina per allargarlo o stringerlo (doppio clic per tornare
alla misura predefinita) e la larghezza viene ricordata. Su finestre sotto i
1100 pixel torna sovrapposto.

In **Impostazioni → Pannello dei dettagli** scegli come si chiude:

| Modo | Comportamento |
|------|---------------|
| Automatico *(predefinito)* | un click fuori dal pannello lo chiude |
| Fisso | resta aperto finché non lo chiudi con la ✕ o con `Esc` |

In tutti e due i modi `Esc` e la ✕ chiudono, e cliccando un'altra attività il
pannello cambia attività invece di chiudersi.

---

## Inserimento rapido

Premi `N` e scrivi in italiano naturale. Flow riconosce al volo:

| Cosa scrivi | Cosa diventa |
|---|---|
| `oggi`, `domani`, `dopodomani` | scadenza |
| `lunedì`, `ven`, `prossimo martedì` | scadenza |
| `tra 3 giorni`, `fra 2 settimane` | scadenza |
| `12/03`, `12-03-2026`, `12 marzo` | scadenza |
| `!alta` `!media` `!bassa` | priorità |
| `#casa` | etichetta (creata se non esiste) |
| `@Marco` | assegnatario (creato se non esiste) |
| `+Lavoro` | progetto di destinazione |

Esempio:

```
Chiamare il commercialista martedì !alta #urgente @Io +Lavoro
```

diventa un'attività intitolata *"Chiamare il commercialista"*, con scadenza a
martedì, priorità alta, etichetta `urgente`, assegnata a te, nel progetto *Lavoro*.

---

## Scorciatoie

| | |
|---|---|
| `Ctrl+K` | palette dei comandi (cerca tutto, esegui tutto) |
| `N` | nuova attività |
| `/` | vai alla ricerca |
| `Ctrl+Z` / `Ctrl+Shift+Z` | annulla / ripristina |
| `Ctrl+B` | mostra o nascondi la barra laterale |
| `Ctrl+Shift+P` | nuovo progetto |
| `Ctrl+E` | esporta l'archivio |
| `T` | cambia tema |
| `G` poi `O` `P` `A` `C` | vai a Oggi / Prossimi / Tutte / Completate |
| `1` `2` `3` `4` | bacheca / elenco / calendario / note |
| `Esc` | chiudi pannello o finestra |
| `?` | elenco completo delle scorciatoie |

---

## Struttura della cartella

```
Flow.exe            l'applicazione (usa questo)
Flow.exe.config     accompagna l'eseguibile, deve stargli accanto
build.cmd           ricompila Flow.exe, serve solo se tocchi src\
lib\                le tre librerie di WebView2
src\
  Flow.cs           l'host: finestra, file serviti, salvataggio su disco
  Flow.manifest     permessi e nitidezza sugli schermi ad alta densità
app\
  index.html        struttura della pagina
  styles.css        temi e componenti
  flow.ico          icona
  js\
    icons.js        icone SVG in linea
    util.js         date, DOM, markdown minimale
    store.js        stato, salvataggio, annulla/ripristina
    parse.js        interpretazione del linguaggio naturale
    views.js        rendering delle viste
    detail.js       pannello attività, menu, modali
    app.js          routing, eventi, trascinamento, scorciatoie
data\
  board.json        il tuo archivio
  backups\          copie automatiche
  flow.log          log dell'ultimo avvio
  .webview2\        cache del motore di pagina, cancellabile
  .window           posizione e dimensione della finestra
```

Nessun `package.json`, nessun `node_modules`, niente da installare per usarla.

### Ricompilare

Serve solo se metti mano a `src\Flow.cs`: doppio clic su **`build.cmd`**. Usa il
compilatore C# che sta già dentro Windows (`csc.exe`, parte di .NET Framework):
niente Visual Studio, niente SDK, niente pacchetti da scaricare.

---

## Copie di sicurezza

**La cartella non cresce all'infinito.** I backup ruotano: `data\backups\`
conserva al massimo **25** file `board-*.json` e cancella i più vecchi man mano.
Il tetto di spazio è quindi circa *25 × la dimensione di* `board.json` — con
qualche centinaio di attività si parla di pochi MB. Numero e peso complessivo
sono scritti in **Impostazioni**, sotto *Archivio dati*.

Tre regole tengono la cronologia utile invece che ingombrante:

- al massimo **una copia ogni 5 minuti**;
- la soglia dei 5 minuti è letta **dal disco**, non tenuta in memoria: l'app si
  chiude per intero ogni volta che chiudi la finestra, e una soglia in memoria
  ripartirebbe da zero facendo un backup a ogni avvio;
- se dall'ultima copia **non è cambiato nulla**, non ne viene creata un'altra
  identica.

I file di emergenza `illeggibile-*.json` (creati solo se `board.json` risulta
illeggibile) hanno una rotazione a parte: se ne tengono 5.

**Copie manuali**: Impostazioni → Esporta, oppure `Ctrl+E`. Ottieni un `.json`
con tutto dentro, ripristinabile da Impostazioni → Importa. Queste non vengono
mai cancellate: finiscono dove le salvi tu.

Se `board.json` dovesse risultare illeggibile, Flow non lo sovrascrive: ne mette
una copia in `data\backups\illeggibile-<data>.json` e riparte da un archivio
nuovo, così hai sempre modo di recuperare a mano.
