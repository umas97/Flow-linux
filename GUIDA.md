# Flow

Gestore di attività in stile Asana, **completamente locale**. Nessun account, nessuna
connessione a internet, nessuna dipendenza da installare. Tutto quello che scrivi
finisce in un unico file JSON sul tuo disco.

---

## Avvio

Apri la cartella in un terminale e lancia **`./flow`**. Non c'è altro da sapere.

Per averlo nel menu delle applicazioni, una volta sola:

```
./install.sh
```

Da lì in poi Flow è fra le applicazioni di GNOME, con la sua icona, e si può
aggiungere ai preferiti nella barra laterale. `./uninstall.sh` toglie la voce di
menu; **la tua cartella `data/` non viene toccata**, né dall'una né dall'altro.

Si apre una finestra dedicata, con la sua icona: non è un browser travestito e
non c'è nessuna barra degli indirizzi.

### Niente server, niente porte

Flow è una finestra WebKitGTK — lo stesso motore di pagina che Ubuntu usa per il
suo browser di sistema e per le anteprime. L'interfaccia sta in `app/`, e l'host
gliela serve **da dentro il proprio processo**: nessun socket aperto, nessuna
porta in ascolto, niente che resti acceso dopo che hai chiuso la finestra.

Quando l'app salva non parla con un server: chiama direttamente il codice che
scrive `data/board.json`.

### Serve internet?

No, mai. Non esistendo nemmeno un indirizzo di rete su cui affacciarsi, Flow non
è raggiungibile né da questo computer né dagli altri della tua rete. Font, icone
e stili sono tutti dentro la cartella: nessuna risorsa viene scaricata.

### Serve installare qualcosa?

Quattro pacchetti, tutti nei repository ufficiali di Ubuntu 24.04:

```
sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1
```

Su una Ubuntu con GNOME sono quasi sempre già installati, perché li usa il resto
del sistema. Niente `pip`, niente ambienti virtuali, niente da compilare. Se
manca qualcosa, Flow te lo dice all'avvio e ti stampa il comando esatto, invece
di fallire in silenzio.

---

## Portabilità

Sì: puoi comprimere la cartella e usarla altrove. Flow si orienta da sé — parte
sempre dalla posizione in cui si trova lo script `flow` e cerca lì accanto `app/`
e `data/`. Funziona da chiavetta USB e anche se il percorso contiene spazi.

L'unica regola: **`flow`, `src/` e la cartella `app/` vanno tenuti insieme.** Se
li separi, all'avvio te lo dice invece di aprire una finestra vuota.

Spostando la cartella dopo aver lanciato `./install.sh`, la voce di menu punta
ancora al vecchio percorso: rilancia `./install.sh` dalla posizione nuova.

| Scenario | Serve installare qualcosa? |
|---|---|
| Cartella copiata su un'altra Ubuntu 24.04 con GNOME | quasi sempre no |
| Cartella su chiavetta USB | no |
| Distribuzione senza i binding PyGObject/WebKitGTK | i quattro pacchetti `apt` |

I tuoi dati viaggiano con la cartella: sono in `data/board.json`, dentro il
pacchetto. Se preferisci un archivio pulito, cancella `data/` prima di
comprimere (verrà ricreato al primo avvio) — ma **esporta prima**, se ti servono.

Una cosa da sapere prima di comprimere: `data/.webkit` è la cache del motore di
pagina, può arrivare a qualche decina di MB ed è del tutto usa e getta. Puoi
cancellarla quando vuoi, viene ricreata da sola al primo avvio.

---

## Dove finiscono i dati

```
data/board.json          l'archivio: progetti, attività, etichette, impostazioni
data/backups/            copie automatiche, a rotazione: solo le ultime 25
```

Il salvataggio è automatico e avviene circa mezzo secondo dopo ogni modifica. La
scrittura è atomica (file temporaneo + rinomina), quindi un blocco improvviso del
computer non può lasciarti un archivio troncato. Una copia di sicurezza viene
messa da parte al massimo ogni 5 minuti.

Puoi copiare `data/board.json` dove vuoi: è il tuo archivio, in chiaro e leggibile.
Da **Impostazioni → Apri cartella** arrivi al file in due clic: si apre il gestore
file con `board.json` già selezionato.

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
- **Note** — appunti del progetto e collegamenti a cartelle, file o siti web
  (gli stessi collegamenti li ha anche ogni attività, nel suo pannello).
- **Prossimi 7 giorni**, **Tutte le attività**, **Completate**.

Le quattro schede di un progetto si scelgono in alto a destra o coi tasti
`1` `2` `3` `4`. In **Impostazioni → Schede dei progetti** decidi cosa succede
riaprendo un progetto:

| Modo | Comportamento |
|------|---------------|
| Ricorda *(predefinito)* | ogni progetto si riapre sulla scheda che stavi guardando |
| Sempre la stessa | ogni progetto si apre sulla scheda scelta in *Scheda all'apertura* — bacheca, elenco, calendario o note — e il cambio di scheda vale solo finché resti nel progetto |

Passando da *Sempre la stessa* a *Ricorda* le schede ricordate prima tornano
come erano: la scelta fissa non le sovrascrive.

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
assegnatario, sotto-attività con barra di avanzamento, collegamenti a cartelle,
file o siti web, duplicazione.

**Collegamenti**

Un collegamento è un pulsante colorato che apre una cartella, un file o un
indirizzo web. Stanno in due posti, con le stesse regole e la stessa finestra:

- nella scheda **Note** di un progetto (tasto `4`), sotto gli **appunti** del
  progetto — anche loro in markdown leggero come le note di un'attività;
- nel **pannello dei dettagli** di un'attività, sotto le sotto-attività.

Sulle schede della bacheca un'attività che ne ha compare con la pastiglia 🔗 e
il loro numero. Duplicando un'attività si duplicano anche i suoi collegamenti.

I tipi sono tre:

| Tipo | Un click | Come si inserisce |
|------|----------|-------------------|
| **Cartella** | apre il gestore file mostrandone il contenuto | *Scegli cartella…*, incolla, o a mano |
| **File** | apre la cartella che lo contiene, **col file già selezionato** | *Scegli file…*, incolla, o a mano |
| **Collegamento web** | apre l'indirizzo nel **browser predefinito** | solo incolla o a mano |

**Un file non viene mai eseguito**: viene soltanto evidenziato nella sua cartella.

Il tipo si mette da sé, mentre scrivi o incolli: `https://…` è un indirizzo web,
e per un percorso su disco è Flow a guardare se esiste ed è una cartella o un
file — l'estensione è solo il primo indizio, quindi una cartella chiamata
`versione 1.2` e un file senza estensione finiscono comunque nel tipo giusto.
Sotto il selettore a tre stati c'è scritto come l'ha capito; toccando il
selettore la scelta diventa tua e il tipo non si muove più. Le virgolette che si
porta dietro un percorso copiato da un terminale le toglie da sé.

I percorsi sono quelli di Linux: iniziano con `/`, e `~` sta per la tua cartella
personale. Un archivio arrivato da una macchina Windows si apre senza problemi,
ma i suoi collegamenti con percorsi tipo `C:\Progetti` non porteranno da nessuna
parte: restano scritti, e cliccandoli Flow dice che il percorso non esiste. Li
puoi correggere a mano, uno per uno — nessun dato viene toccato al posto tuo.

L'etichetta è preimpostata col nome dell'ultima cartella, o col nome del sito per
un indirizzo web. Il colore di un collegamento nuovo è la tinta più lontana da
quelle degli altri collegamenti già presenti, così una lista si distingue a
occhio: si cambia con un clic sulla pastiglia. Il pulsante `…` su un collegamento apre *Modifica*,
*Copia percorso* e *Rimuovi*.

Con più di un collegamento compare il selettore d'ordine accanto al contatore:
*Ordine di inserimento* (predefinito), *Tipo* (cartelle, poi file, poi web) o
*Nome A→Z*. La scelta è salvata nell'archivio, e ogni progetto e ogni attività
ha la sua.

Cartelle e file passano dal gestore file, quindi funzionano solo avviando
`./flow`: aprendo `app/index.html` nel browser si vedono, ma il click avvisa che
serve l'applicazione. **Gli indirizzi web funzionano in tutti e due i modi.**

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

Tema chiaro, scuro o automatico (segue GNOME), colore principale scelto fra 24
tinte, densità comoda o compatta, barra laterale comprimibile. Progetti ed etichette
prendono i colori dalla stessa tavolozza, e un progetto può avere una fra 48 icone.
Le 24 tinte coprono la ruota cromatica a intervalli regolari e hanno due varianti,
una per il tema chiaro e una per quello scuro: il colore scelto resta lo stesso e
cambia solo la resa, così resta leggibile in entrambi i temi. Quando Flow propone
un colore da solo — un progetto nuovo, un'etichetta o una persona nominata
nell'inserimento rapido, un collegamento — non prende la tinta successiva della
tavolozza ma quella più lontana da quelle già in uso: due progetti sono agli
antipodi della ruota, tre a 120 gradi l'uno dall'altro, e non capita di ritrovarsi
con cinque sfumature dello stesso rosso. Resta comunque una proposta: il colore si
sceglie a mano fra tutte e 24. Un archivio salvato
da una versione precedente di Flow, con i colori vecchi, viene riportato in
tavolozza sulla tinta più vicina alla prima apertura.
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
flow                l'avvio (usa questo)
install.sh          mette Flow nel menu delle applicazioni
uninstall.sh        lo toglie, senza toccare i tuoi dati
src/
  flow.py           l'host: finestra, file serviti, salvataggio su disco
app/
  index.html        struttura della pagina
  styles.css        temi e componenti
  flow.svg          icona
  js/
    icons.js        icone SVG in linea
    util.js         date, DOM, markdown minimale
    store.js        stato, salvataggio, annulla/ripristina
    parse.js        interpretazione del linguaggio naturale
    views.js        rendering delle viste
    detail.js       pannello attività, menu, modali
    app.js          routing, eventi, trascinamento, scorciatoie
data/               creata al primo avvio, non c'è niente da preparare
  board.json        il tuo archivio
  backups/          copie automatiche
  flow.log          log dell'ultimo avvio
  .webkit/          cache del motore di pagina, cancellabile
  .window           dimensione della finestra
```

Nessun `package.json`, nessun `node_modules`, niente da compilare: `src/flow.py`
è il programma, eseguito così com'è.

Al primo avvio `data/` è vuota: Flow ci scrive un `board.json` con un progetto di
esempio, *Benvenuto in Flow*, che puoi svuotare da **Impostazioni → Azzera tutto**.

---

## Copie di sicurezza

**La cartella non cresce all'infinito.** I backup ruotano: `data/backups/`
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
