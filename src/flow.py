#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
Flow — host nativo.

Una finestra WebKitGTK che monta la cartella app/ su uno
schema URI interno (flow://flow.example) e risponde da sé
alle chiamate /api/*. Non apre socket, non ascolta su nessuna
porta: le richieste sono intercettate dentro il processo e
risolte leggendo e scrivendo su disco.

La logica di archiviazione — scrittura atomica, backup a
rotazione, salvataggio dei file illeggibili — è quella che
stava in Flow.cs, tradotta senza cambiamenti di comportamento.

Un solo file, nessuna compilazione: bastano i pacchetti
PyGObject e WebKitGTK dei repository di Ubuntu.
============================================================
"""

import json
import os
import re
import shutil
import sys
import threading
import urllib.parse
from datetime import datetime

# ---------------------------------------------------------------- *
# Dipendenze — un traceback Python davanti all'utente non spiega niente
# ---------------------------------------------------------------- *

APT = ("sudo apt install python3-gi python3-gi-cairo "
       "gir1.2-gtk-3.0 gir1.2-webkit2-4.1")


def _manca(cosa):
    """Esce dicendo cosa manca e con quale comando si rimedia."""
    sys.stderr.write(
        "Flow non può partire: manca " + cosa + ".\n\n"
        "Si installa con:\n\n    " + APT + "\n\n")
    sys.exit(1)


try:
    import gi
except ImportError:
    _manca("il binding Python per GObject (pacchetto python3-gi)")

try:
    gi.require_version("Gtk", "3.0")
    gi.require_version("Gdk", "3.0")
except ValueError:
    _manca("il binding GTK 3 (pacchetto gir1.2-gtk-3.0)")

try:
    gi.require_version("WebKit2", "4.1")
except ValueError:
    _manca("il binding WebKitGTK 4.1 (pacchetto gir1.2-webkit2-4.1)")

try:
    gi.require_version("Soup", "3.0")
except ValueError:
    _manca("il binding libsoup 3 (pacchetto gir1.2-soup-3.0)")

from gi.repository import GLib, Gdk, Gio, Gtk, Soup, WebKit2  # noqa: E402


# ---------------------------------------------------------------- *
# Percorsi e costanti
# ---------------------------------------------------------------- *

class Percorsi(object):
    HOST = "flow.example"
    SCHEMA = "flow"
    URL_INIZIALE = SCHEMA + "://" + HOST + "/index.html"

    MAX_BACKUP = 25
    MAX_EMERGENZA = 5
    BACKUP_OGNI = 5 * 60          # secondi

    RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    APP = os.path.join(RADICE, "app")
    DATI = os.path.join(RADICE, "data")
    BACKUP = os.path.join(DATI, "backups")
    ARCHIVIO = os.path.join(DATI, "board.json")
    LOG = os.path.join(DATI, "flow.log")
    FINESTRA = os.path.join(DATI, ".window")
    ICONA = os.path.join(APP, "flow.svg")

    @staticmethod
    def prepara():
        if not os.path.isdir(Percorsi.DATI):
            os.makedirs(Percorsi.DATI, exist_ok=True)
        if not os.path.isdir(Percorsi.BACKUP):
            os.makedirs(Percorsi.BACKUP, exist_ok=True)

    @staticmethod
    def log(messaggio):
        try:
            Percorsi.prepara()
            riga = (datetime.now().replace(microsecond=0).isoformat()
                    + " [flow] " + messaggio + "\n")
            with open(Percorsi.LOG, "a", encoding="utf-8") as f:
                f.write(riga)
        except Exception:
            pass


# ---------------------------------------------------------------- *
# Archiviazione — il vecchio server.js, senza HTTP
# ---------------------------------------------------------------- *

class Archivio(object):
    _ultimo_backup = 0.0

    @staticmethod
    def init():
        """La soglia dei backup riparte dal disco, non dalla memoria."""
        Percorsi.prepara()
        elenco = Archivio._elenco("board-")
        if not elenco:
            return
        try:
            Archivio._ultimo_backup = os.path.getmtime(elenco[-1])
        except OSError:
            pass

    @staticmethod
    def _timbro():
        return datetime.now().strftime("%Y%m%d-%H%M%S")

    @staticmethod
    def _elenco(prefisso):
        """I nomi contengono la data: l'ordine alfabetico è anche cronologico."""
        try:
            trovati = [os.path.join(Percorsi.BACKUP, n)
                       for n in os.listdir(Percorsi.BACKUP)
                       if n.startswith(prefisso) and n.endswith(".json")]
            trovati.sort()
            return trovati
        except OSError:
            return []

    @staticmethod
    def _sfoltisci(prefisso, tieni):
        """Tiene solo gli ultimi `tieni` file con quel prefisso."""
        elenco = Archivio._elenco(prefisso)
        for percorso in elenco[:max(0, len(elenco) - tieni)]:
            try:
                os.remove(percorso)
            except OSError:
                break

    @staticmethod
    def statistiche():
        quanti, byte = 0, 0
        try:
            for nome in os.listdir(Percorsi.BACKUP):
                if not nome.endswith(".json"):
                    continue
                quanti += 1
                byte += os.path.getsize(os.path.join(Percorsi.BACKUP, nome))
        except OSError:
            pass
        return quanti, byte

    @staticmethod
    def leggi():
        """
        Legge board.json così com'è: la validazione vera la fa il frontend.
        Se il file c'è ma non è un oggetto JSON non viene sovrascritto alla
        cieca — se ne mette una copia da parte e si riparte da un archivio nuovo.
        """
        if not os.path.isfile(Percorsi.ARCHIVIO):
            return None

        try:
            with open(Percorsi.ARCHIVIO, "r", encoding="utf-8",
                      errors="replace") as f:
                grezzo = f.read()
        except OSError as err:
            Percorsi.log("board.json non leggibile: " + str(err))
            Archivio._emergenza()
            return None

        # Il BOM va tolto: un file salvato da un editor che lo aggiunge lo contiene.
        grezzo = grezzo.lstrip("﻿ \t\r\n")
        if not grezzo:
            return None

        if grezzo[0] != "{":
            Percorsi.log("board.json non contiene un oggetto JSON")
            Archivio._emergenza()
            return None
        return grezzo

    @staticmethod
    def _emergenza():
        destinazione = os.path.join(
            Percorsi.BACKUP, "illeggibile-" + Archivio._timbro() + ".json")
        try:
            Percorsi.prepara()
            shutil.copyfile(Percorsi.ARCHIVIO, destinazione)
            Archivio._sfoltisci("illeggibile-", Percorsi.MAX_EMERGENZA)
            Percorsi.log("copia di emergenza salvata in " + destinazione)
        except OSError:
            pass

    @staticmethod
    def scrivi(testo):
        """Scrittura atomica: file temporaneo + sostituzione."""
        Percorsi.prepara()
        Archivio._ruota_backup()

        tmp = Percorsi.ARCHIVIO + ".tmp"
        # flush + fsync prima di sostituire: os.replace è atomico rispetto al
        # nome, non rispetto ai byte ancora fermi nella cache del sistema.
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(testo)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, Percorsi.ARCHIVIO)

    @staticmethod
    def _ruota_backup():
        if not os.path.isfile(Percorsi.ARCHIVIO):
            return

        adesso = datetime.now().timestamp()
        if adesso - Archivio._ultimo_backup < Percorsi.BACKUP_OGNI:
            return
        Archivio._ultimo_backup = adesso

        try:
            # Niente copie identiche: aprire e chiudere l'app senza modifiche
            # riempirebbe la cronologia di doppioni, buttando fuori quelle utili.
            elenco = Archivio._elenco("board-")
            if elenco and Archivio._stesso_contenuto(elenco[-1], Percorsi.ARCHIVIO):
                return

            destinazione = os.path.join(
                Percorsi.BACKUP, "board-" + Archivio._timbro() + ".json")
            # Il nome ha la precisione del secondo: con la soglia dei 5 minuti
            # non ci si arriva mai, ma se ci si arrivasse la copia già presente
            # resta al suo posto invece di essere sovrascritta.
            if os.path.exists(destinazione):
                return
            shutil.copyfile(Percorsi.ARCHIVIO, destinazione)
            Archivio._sfoltisci("board-", Percorsi.MAX_BACKUP)
        except OSError as err:
            Percorsi.log("backup non riuscito: " + str(err))

    @staticmethod
    def _stesso_contenuto(a, b):
        try:
            if os.path.getsize(a) != os.path.getsize(b):
                return False
            with open(a, "rb") as fa, open(b, "rb") as fb:
                while True:
                    x = fa.read(65536)
                    y = fb.read(65536)
                    if x != y:
                        return False
                    if not x:
                        return True
        except OSError:
            return False


# ---------------------------------------------------------------- *
# La finestra
# ---------------------------------------------------------------- *

# Riconosce una struttura plausibile senza dover interpretare tutto il JSON:
# è la stessa difesa che faceva server.js prima di scrivere.
HA_TASKS = re.compile(r'"tasks"\s*:\s*\[')
HA_PROJECTS = re.compile(r'"projects"\s*:\s*\[')

LARGHEZZA_MIN, ALTEZZA_MIN = 760, 520
LARGHEZZA_DEF, ALTEZZA_DEF = 1440, 900
SFONDO = (17, 18, 23)

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
}

# Gli errori di script finiscono in data/flow.log: senza barra del browser
# sotto mano, è l'unico modo per accorgersene.
SCRIPT_ERRORI = (
    "window.addEventListener('error',function(e){try{"
    "window.webkit.messageHandlers.flow.postMessage("
    "'flow:err:'+e.message+' @ '+e.filename+':'+e.lineno)}catch(x){}});")

# Chiesto alla pagina in chiusura: consegna lo stato prima che si spenga tutto.
SCRIPT_CONSEGNA = (
    "(function(){try{"
    "if(window.Store&&Store.state)"
    "window.webkit.messageHandlers.flow.postMessage("
    "'flow:save:'+JSON.stringify(Store.state,null,2));"
    "else window.webkit.messageHandlers.flow.postMessage('flow:save:');"
    "}catch(err){window.webkit.messageHandlers.flow.postMessage("
    "'flow:save:');}})()")


def accetta(corpo):
    """Non si scrive sul disco qualcosa che non somiglia a un archivio."""
    if not corpo:
        return False
    if not corpo.lstrip().startswith("{"):
        return False
    return bool(HA_TASKS.search(corpo) and HA_PROJECTS.search(corpo))


def leggi_corpo(richiesta):
    """Il corpo arriva come flusso: va letto fino a EOF, non a blocchi singoli."""
    flusso = richiesta.get_http_body()
    if flusso is None:
        return ""
    pezzi = bytearray()
    try:
        while True:
            blocco = flusso.read_bytes(65536, None)
            if blocco is None or blocco.get_size() == 0:
                break
            pezzi += blocco.get_data()
    except GLib.Error:
        pass
    return bytes(pezzi).decode("utf-8", "replace")


def espandi(percorso):
    """
    `~` si espande qui e non nei dati: nell'archivio resta scritto come
    l'utente l'ha inserito, e resta valido anche cambiando nome utente.
    """
    if percorso.startswith("~"):
        return os.path.expanduser(percorso)
    return percorso


class FinestraFlow(object):

    def __init__(self, applicazione):
        self._svuotato = False          # la pagina ha già consegnato lo stato?
        self._guardia = 0               # timer che chiude comunque
        self._dialoghi = set()          # i selettori vivi, altrimenti spariscono
        self._normale = (LARGHEZZA_DEF, ALTEZZA_DEF)
        self._misura_rinviata = 0

        self.finestra = Gtk.ApplicationWindow(application=applicazione)
        self.finestra.set_title("Flow")
        self.finestra.set_size_request(LARGHEZZA_MIN, ALTEZZA_MIN)
        self.finestra.set_default_size(LARGHEZZA_DEF, ALTEZZA_DEF)
        if os.path.isfile(Percorsi.ICONA):
            try:
                self.finestra.set_icon_from_file(Percorsi.ICONA)
            except GLib.Error:
                pass

        self._ripristina_finestra()

        # Tutto passa di qui: pagina, script, stili e API. La cartella app/ e
        # l'archivio su disco rispondono da dentro il processo, senza rete.
        #
        # Lo schema è personalizzato e non http: senza un server in ascolto
        # non c'è nessun http da servire, e questa è l'unica strada che tiene
        # le richieste dentro il processo.
        motore = self._cartella_motore()
        gestore = WebKit2.WebsiteDataManager(base_data_directory=motore,
                                             base_cache_directory=motore)
        contesto = WebKit2.WebContext.new_with_website_data_manager(gestore)
        contesto.register_uri_scheme(Percorsi.SCHEMA, self._su_richiesta)
        # Senza "secure" il localStorage non è disponibile sullo schema, e
        # senza "cors enabled" il fetch verso /api/ verrebbe rifiutato.
        sicurezza = contesto.get_security_manager()
        sicurezza.register_uri_scheme_as_secure(Percorsi.SCHEMA)
        sicurezza.register_uri_scheme_as_cors_enabled(Percorsi.SCHEMA)

        contenuti = WebKit2.UserContentManager()
        contenuti.register_script_message_handler("flow")
        contenuti.connect("script-message-received::flow", self._su_messaggio)
        contenuti.add_script(WebKit2.UserScript.new(
            SCRIPT_ERRORI,
            WebKit2.UserContentInjectedFrames.TOP_FRAME,
            WebKit2.UserScriptInjectionTime.START,
            None, None))

        # Contesto e gestore dei contenuti si passano alla costruzione: dopo
        # non si cambiano più.
        self.view = WebKit2.WebView(web_context=contesto,
                                    user_content_manager=contenuti)
        colore = Gdk.RGBA()
        colore.red, colore.green, colore.blue = [c / 255.0 for c in SFONDO]
        colore.alpha = 1.0
        self.view.set_background_color(colore)

        impostazioni = self.view.get_settings()
        impostazioni.set_enable_developer_extras(True)      # F12 resta utile
        impostazioni.set_enable_back_forward_navigation_gestures(False)
        impostazioni.set_javascript_can_access_clipboard(True)

        self.view.connect("context-menu", lambda *_: True)  # l'app ha i suoi menu
        self.view.connect("create", self._su_nuova_finestra)
        self.view.connect("close", lambda *_: self.finestra.close())
        self.view.connect("load-changed", self._su_caricamento)
        self.view.connect("load-failed", self._su_caricamento_fallito)
        self.view.connect("web-process-terminated", self._su_motore_caduto)

        self.finestra.add(self.view)
        self.finestra.connect("delete-event", self._su_chiusura)
        self.finestra.connect("configure-event", self._su_geometria)
        self.finestra.connect("key-press-event", self._su_tasto)

        self.view.load_uri(Percorsi.URL_INIZIALE)
        self.finestra.show_all()
        Percorsi.log("avviata — archivio: " + Percorsi.ARCHIVIO)

    def presenta(self):
        self.finestra.present()

    @staticmethod
    def _cartella_motore():
        """
        La cache del motore sta nella cartella, così l'insieme resta portabile.
        Se la cartella non è scrivibile (chiavetta protetta, percorso di
        sistema) si ripiega sul profilo utente invece di non partire.
        """
        locale = os.path.join(Percorsi.DATI, ".webkit")
        try:
            os.makedirs(locale, exist_ok=True)
            sonda = os.path.join(locale, ".prova")
            with open(sonda, "w"):
                pass
            os.remove(sonda)
            return locale
        except OSError:
            ripiego = os.path.join(GLib.get_user_data_dir(), "flow")
            os.makedirs(ripiego, exist_ok=True)
            Percorsi.log("cartella non scrivibile, uso " + ripiego)
            return ripiego

    # ------------------------- le API, senza rete -------------------------

    def _su_richiesta(self, richiesta, _dati=None):
        # get_path() può portarsi dietro query e frammento: all'instradamento
        # serve solo il percorso, come AbsolutePath in Flow.cs.
        percorso = richiesta.get_path() or "/"
        percorso = percorso.split("?")[0].split("#")[0]

        if not percorso.startswith("/api/"):
            self._servi_statico(richiesta, percorso)
            return

        metodo = (richiesta.get_http_method() or "GET").upper()

        try:
            if percorso == "/api/data":
                if metodo == "GET":
                    self._rispondi(richiesta, 200, Archivio.leggi() or "{}")
                elif metodo in ("PUT", "POST"):
                    self._salva(richiesta)
                else:
                    self._rispondi(richiesta, 405,
                                   '{"error":"metodo non ammesso"}')
                return

            if percorso == "/api/info":
                quanti, byte = Archivio.statistiche()
                self._rispondi(richiesta, 200, "{" +
                               '"file":' + json.dumps(Percorsi.ARCHIVIO) + "," +
                               '"dir":' + json.dumps(Percorsi.DATI) + "," +
                               '"backups":' + str(quanti) + "," +
                               '"backupBytes":' + str(byte) + "," +
                               '"maxBackups":' + str(Percorsi.MAX_BACKUP) + "," +
                               '"host":' + json.dumps(
                                   "WebKitGTK %d.%d.%d" % (
                                       WebKit2.get_major_version(),
                                       WebKit2.get_minor_version(),
                                       WebKit2.get_micro_version())) +
                               "}")
                return

            if percorso == "/api/reveal":
                bersaglio = (Percorsi.ARCHIVIO
                             if os.path.isfile(Percorsi.ARCHIVIO)
                             else Percorsi.DATI)
                mostra_nel_gestore(bersaglio)
                self._rispondi(richiesta, 200, '{"ok":true}')
                return

            if percorso == "/api/pick":
                if metodo != "POST":
                    self._rispondi(richiesta, 405,
                                   '{"error":"metodo non ammesso"}')
                    return
                self._selettore(richiesta, leggi_corpo(richiesta).strip())
                return

            if percorso == "/api/open":
                if metodo != "POST":
                    self._rispondi(richiesta, 405,
                                   '{"error":"metodo non ammesso"}')
                    return
                problema = apri_percorso(leggi_corpo(richiesta))
                if problema is None:
                    self._rispondi(richiesta, 200, '{"ok":true}')
                else:
                    self._rispondi(richiesta, 404,
                                   '{"error":' + json.dumps(problema) + "}")
                return

            if percorso == "/api/kind":
                if metodo != "POST":
                    self._rispondi(richiesta, 405,
                                   '{"error":"metodo non ammesso"}')
                    return
                self._tipo_di(richiesta, leggi_corpo(richiesta))
                return

            if percorso == "/api/quit":
                self._rispondi(richiesta, 200, '{"ok":true}')
                GLib.idle_add(self.finestra.close)
                return

            if percorso in ("/api/health", "/api/ping"):
                self._rispondi(richiesta, 200, '{"ok":true}')
                return

            self._rispondi(richiesta, 404, '{"error":"endpoint sconosciuto"}')

        except Exception as err:
            Percorsi.log("errore su " + percorso + ": " + repr(err))
            self._rispondi(richiesta, 500,
                           '{"error":' + json.dumps(str(err)) + "}")

    def _salva(self, richiesta):
        corpo = leggi_corpo(richiesta)

        if not accetta(corpo):
            self._rispondi(richiesta, 400, '{"error":"struttura inattesa"}')
            return

        Archivio.scrivi(corpo)
        self._rispondi(richiesta, 200, '{"ok":true,"bytes":' +
                       str(len(corpo.encode("utf-8"))) + "}")

    def _rispondi(self, richiesta, codice, testo):
        byte = testo.encode("utf-8")
        self._consegna(richiesta, codice, byte,
                       "application/json; charset=utf-8", "no-store")

    @staticmethod
    def _consegna(richiesta, codice, byte, tipo, cache):
        flusso = Gio.MemoryInputStream.new_from_data(byte)
        risposta = WebKit2.URISchemeResponse.new(flusso, len(byte))
        # finish() non permette di scegliere il codice di stato: senza
        # finish_with_response un 404 arriverebbe alla pagina come un 200.
        risposta.set_status(codice, "OK" if codice == 200 else "Error")
        risposta.set_content_type(tipo)
        intestazioni = Soup.MessageHeaders.new(Soup.MessageHeadersType.RESPONSE)
        # set_content_type basta al motore, ma non arriva a chi legge le
        # intestazioni dal fetch: l'originale le esponeva entrambe.
        intestazioni.append("Content-Type", tipo)
        intestazioni.append("Cache-Control", cache)
        risposta.set_http_headers(intestazioni)
        richiesta.finish_with_response(risposta)

    # ------------------- collegamenti a cartelle e file -------------------
    # Tre endpoint per la scheda Note dei progetti: /api/pick (selettore),
    # /api/kind (cartella o file?) e /api/open (mostra nel gestore file).
    # Il corpo della richiesta e' il percorso (o "dir"/"file") in chiaro, non
    # un oggetto JSON: e' una stringa sola, interpretarla come JSON non
    # aggiungerebbe niente.

    def _selettore(self, richiesta, tipo):
        """
        Apre il selettore nativo. La risposta arriva a scelta effettuata:
        finish_with_response si chiama dal gestore della risposta, non qui —
        una finestra modale non si può aprire dentro il gestore della richiesta.
        Gtk.FileChooserNative passa dal portal XDG, quindi su Wayland ha
        l'aspetto e i permessi del gestore file di sistema.
        """
        if tipo == "file":
            azione = Gtk.FileChooserAction.OPEN
            titolo = "Scegli un file da collegare"
        else:
            azione = Gtk.FileChooserAction.SELECT_FOLDER
            titolo = "Scegli una cartella da collegare"

        dialogo = Gtk.FileChooserNative.new(
            titolo, self.finestra, azione, "Scegli", "Annulla")
        dialogo.set_modal(True)
        # Senza un riferimento nostro il dialogo verrebbe raccolto dal
        # garbage collector prima che l'utente scelga.
        self._dialoghi.add(dialogo)

        def risposta(d, esito):
            scelta = '{"cancelled":true}'
            try:
                if esito == Gtk.ResponseType.ACCEPT:
                    percorso = d.get_filename()
                    if percorso:
                        scelta = '{"path":' + json.dumps(percorso) + "}"
            except Exception as err:
                Percorsi.log("selettore non riuscito: " + str(err))
            try:
                self._rispondi(richiesta, 200, scelta)
            except Exception as err:
                Percorsi.log("risposta al selettore non riuscita: " + str(err))
            self._dialoghi.discard(d)

        dialogo.connect("response", risposta)
        dialogo.show()

    def _tipo_di(self, richiesta, grezzo):
        """
        Guarda il disco e dice se il percorso è una cartella o un file.
        Serve alla finestra dei collegamenti per mettere il tipo da sé:
        l'estensione da sola sbaglia sia in un verso (una cartella chiamata
        "versione 1.2") sia nell'altro (un file senza estensione).
        Guarda e risponde: non apre e non scrive niente.

        Interrogare il disco può volerci tempo — una cartella di rete che non
        risponde ci mette secondi — e qui si è sul filo della finestra: la
        verifica va su un thread e la risposta torna sul ciclo principale.
        """
        def lavora():
            esito = tipo_di(grezzo)
            GLib.idle_add(consegna, esito)

        def consegna(esito):
            try:
                self._rispondi(richiesta, 200, esito)
            except Exception as err:
                Percorsi.log("risposta sul tipo non riuscita: " + str(err))
            return False

        threading.Thread(target=lavora, daemon=True).start()

    # ------------------------- i file della cartella app/ -------------------------

    def _servi_statico(self, richiesta, percorso):
        if percorso in ("/", ""):
            percorso = "/index.html"

        try:
            relativo = urllib.parse.unquote(percorso).lstrip("/")
            # realpath da tutte e due le parti: se app/ fosse un collegamento
            # simbolico, il confronto fallirebbe su ogni file.
            radice = os.path.realpath(Percorsi.APP)
            pieno = os.path.realpath(os.path.join(radice, relativo))
        except Exception:
            self._non_trovato(richiesta, percorso)
            return

        # Un percorso con .. non deve poter uscire da app/.
        if (not pieno.startswith(radice + os.sep)
                or not os.path.isfile(pieno)):
            self._non_trovato(richiesta, percorso)
            return

        tipo = MIME.get(os.path.splitext(pieno)[1].lower(),
                        "application/octet-stream")
        with open(pieno, "rb") as f:
            byte = f.read()
        # no-cache e non no-store: basta riavviare per vedere le modifiche
        # ad app/, senza svuotare niente a mano.
        self._consegna(richiesta, 200, byte, tipo, "no-cache")

    def _non_trovato(self, richiesta, percorso):
        Percorsi.log("non trovato: " + percorso)
        self._consegna(richiesta, 404, "Non trovato".encode("utf-8"),
                       "text/plain; charset=utf-8", "no-cache")

    # ------------------------- navigazione esterna -------------------------

    def _su_nuova_finestra(self, _view, azione):
        """Niente finestre di WebKit che spuntano dall'app: apre il browser."""
        try:
            uri = azione.get_request().get_uri()
            parti = urllib.parse.urlparse(uri)
            if parti.scheme in ("http", "https") and parti.hostname != Percorsi.HOST:
                Gio.AppInfo.launch_default_for_uri(uri, None)
        except Exception as err:
            Percorsi.log("apertura esterna non riuscita: " + str(err))
        return None

    @staticmethod
    def _su_caricamento(_view, evento):
        # Una sola riga per caricamento vero: i cambi di rotta dell'app
        # muovono solo il frammento e non passano di qui.
        if evento == WebKit2.LoadEvent.FINISHED:
            Percorsi.log("navigazione: ok")

    @staticmethod
    def _su_caricamento_fallito(_view, _evento, uri, errore):
        Percorsi.log("navigazione: FALLITA su " + uri + " — " + errore.message)
        return False

    @staticmethod
    def _su_motore_caduto(_view, motivo):
        Percorsi.log("motore in errore: " + motivo.value_nick)

    def _su_tasto(self, _finestra, evento):
        if evento.keyval == Gdk.KEY_F12:
            self.view.get_inspector().show()
            return True
        return False

    # ------------------------- chiusura senza perdite -------------------------

    def _su_chiusura(self, *_):
        """
        Il salvataggio automatico scatta 450 ms dopo l'ultima modifica:
        chiudendo subito dopo un ritocco, quel mezzo secondo andrebbe perso.
        La chiusura viene quindi rimandata finché la pagina non ha consegnato
        lo stato — e comunque non oltre un secondo e mezzo.
        """
        if self._svuotato:
            self._salva_geometria()
            return False

        # Un secondo clic sulla X mentre si aspetta la consegna: la richiesta
        # è già partita, riarmare il timer perderebbe quello vecchio e
        # chiederebbe alla pagina due volte lo stesso stato.
        if self._guardia:
            return True

        self._guardia = GLib.timeout_add(1500, self._chiudi_comunque)
        self.view.evaluate_javascript(SCRIPT_CONSEGNA, -1,
                                      None, None, None, None, None)
        return True   # la chiusura si annulla e riparte da _chiudi_comunque

    def _su_messaggio(self, _gestore, risultato):
        # Il segnale porta un JavascriptResult, non il valore JavaScript: il
        # testo sta un livello più sotto.
        try:
            messaggio = risultato.get_js_value().to_string()
        except Exception as err:
            Percorsi.log("messaggio dalla pagina illeggibile: " + str(err))
            return

        if messaggio.startswith("flow:err:"):
            Percorsi.log("errore nella pagina: " + messaggio[len("flow:err:"):])
            return

        if not messaggio.startswith("flow:save:"):
            return

        corpo = messaggio[len("flow:save:"):]
        if accetta(corpo):
            try:
                Archivio.scrivi(corpo)
            except OSError as err:
                Percorsi.log("salvataggio finale non riuscito: " + str(err))
        self._chiudi_comunque()

    def _chiudi_comunque(self):
        if self._svuotato:
            return False
        self._svuotato = True
        for sorgente in ("_guardia", "_misura_rinviata"):
            if getattr(self, sorgente):
                GLib.source_remove(getattr(self, sorgente))
                setattr(self, sorgente, 0)
        # Rientra in _su_chiusura, che ora lascia passare e salva la geometria.
        self.finestra.close()
        return False

    # ------------------------- geometria della finestra -------------------------

    def _su_geometria(self, *_):
        # Su Wayland la posizione non è né leggibile né riapplicabile: si
        # tiene solo la dimensione da non massimizzati, che è quella utile.
        #
        # La misura si prende in ritardo perché massimizzando il ridimensiona-
        # mento arriva prima che la finestra si dichiari massimizzata: leggendo
        # subito si salverebbe la dimensione a tutto schermo come se fosse
        # quella normale, e sarebbe persa per sempre.
        if self._misura_rinviata:
            GLib.source_remove(self._misura_rinviata)
        self._misura_rinviata = GLib.timeout_add(200, self._registra_normale)
        return False

    def _registra_normale(self):
        self._misura_rinviata = 0
        if not self.finestra.is_maximized():
            self._normale = self.finestra.get_size()
        return False

    def _ripristina_finestra(self):
        try:
            if not os.path.isfile(Percorsi.FINESTRA):
                return
            with open(Percorsi.FINESTRA, "r", encoding="utf-8") as f:
                pezzi = f.read().split(",")
            if len(pezzi) < 5:
                return

            larghezza = int(pezzi[2])
            altezza = int(pezzi[3])

            # Uno schermo scollegato lascerebbe una finestra più grande del
            # monitor: valori fuori misura si ignorano e restano i predefiniti.
            massimo = self._area_utile()
            if (LARGHEZZA_MIN <= larghezza <= massimo[0]
                    and ALTEZZA_MIN <= altezza <= massimo[1]):
                self.finestra.set_default_size(larghezza, altezza)
                self._normale = (larghezza, altezza)
            # Le coordinate (pezzi[0], pezzi[1]) si rileggono ma non si
            # applicano: su Wayland una finestra non decide dove mettersi.
            if pezzi[4].strip() == "1":
                self.finestra.maximize()
        except (OSError, ValueError):
            pass

    @staticmethod
    def _area_utile():
        """
        Il più grande degli schermi collegati. È l'equivalente Wayland del
        controllo di Flow.cs, che accettava la geometria salvata se ricadeva
        su un monitor qualsiasi: qui non si sa su quale schermo si aprirà la
        finestra, ma una dimensione che non sta su nessuno è comunque sbagliata.
        """
        larghezza = altezza = 0
        try:
            schermo = Gdk.Display.get_default()
            for i in range(schermo.get_n_monitors()):
                area = schermo.get_monitor(i).get_workarea()
                larghezza = max(larghezza, area.width)
                altezza = max(altezza, area.height)
        except Exception:
            pass
        return (larghezza or 32767, altezza or 32767)

    def _salva_geometria(self):
        try:
            larghezza, altezza = self._normale
            posizione = self.finestra.get_position()
            Percorsi.prepara()
            with open(Percorsi.FINESTRA, "w", encoding="utf-8") as f:
                f.write(",".join([
                    str(posizione[0]), str(posizione[1]),
                    str(larghezza), str(altezza),
                    "1" if self.finestra.is_maximized() else "0"]))
        except OSError:
            pass


# ---------------------------------------------------------------- *
# Gestore file — al posto di explorer.exe
# ---------------------------------------------------------------- *

def mostra_nel_gestore(percorso):
    """
    Evidenzia il file dentro la sua cartella, come faceva "explorer /select,".
    Una cartella invece si apre mostrandone il contenuto: selezionarla
    aprirebbe il livello superiore.
    """
    uri = GLib.filename_to_uri(percorso, None)

    if not os.path.isdir(percorso):
        try:
            bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
            bus.call_sync(
                "org.freedesktop.FileManager1",
                "/org/freedesktop/FileManager1",
                "org.freedesktop.FileManager1", "ShowItems",
                GLib.Variant("(ass)", ([uri], "")), None,
                Gio.DBusCallFlags.NONE, 5000, None)
            return True
        except GLib.Error as err:
            # Nessun gestore file registrato sul bus: si apre la cartella
            # che lo contiene, senza evidenziarlo.
            Percorsi.log("ShowItems non disponibile (" + err.message +
                         "), apro la cartella")
            uri = GLib.filename_to_uri(os.path.dirname(percorso), None)

    try:
        return Gio.AppInfo.launch_default_for_uri(uri, None)
    except GLib.Error as err:
        Percorsi.log("apertura non riuscita: " + err.message)
        return False


def apri_percorso(grezzo):
    """
    Mostra un percorso nel gestore file. **Non esegue mai niente:** un file
    viene solo evidenziato dentro la sua cartella, mai avviato.
    Accetta unicamente percorsi POSIX assoluti che esistono davvero.
    Torna None se è andata, altrimenti il motivo del rifiuto.
    """
    voluto = (grezzo or "").strip().strip('"')
    if not voluto:
        return "percorso vuoto"

    pieno = espandi(voluto)
    # Un percorso relativo si risolverebbe sulla cartella di lavoro del
    # processo: non è mai quello che intendeva chi ha salvato il link.
    if not pieno.startswith("/"):
        return "serve un percorso assoluto"
    pieno = os.path.normpath(pieno)

    if not os.path.exists(pieno):
        return "percorso inesistente"

    return None if mostra_nel_gestore(pieno) else "il gestore file non risponde"


def tipo_di(grezzo):
    # Le virgolette arrivano da chi copia un percorso da un terminale, che
    # lo incolla fra apici.
    voluto = (grezzo or "").strip().strip('"')
    if not voluto:
        return '{"exists":false}'

    pieno = espandi(voluto)
    if not pieno.startswith("/"):
        return '{"exists":false}'

    try:
        pieno = os.path.normpath(pieno)
        if os.path.isdir(pieno):
            return '{"exists":true,"kind":"dir"}'
        if os.path.isfile(pieno):
            return '{"exists":true,"kind":"file"}'
    except OSError:
        pass
    # Non esiste, o non si ha il permesso di guardare: decide chi ha chiesto,
    # in base all'estensione.
    return '{"exists":false}'


# ---------------------------------------------------------------- *
# Avvio
# ---------------------------------------------------------------- *

class Flow(Gtk.Application):
    """
    application_id fa da lucchetto via D-Bus: un secondo avvio non apre una
    seconda finestra, arriva qui come "activate" e riporta avanti quella che
    c'è già.
    """

    def __init__(self):
        Gtk.Application.__init__(self, application_id="it.flow.Flow")
        self.finestra = None

    def do_activate(self):
        if self.finestra is None:
            self.finestra = FinestraFlow(self)
        else:
            self.finestra.presenta()


def errore_fatale(titolo, testo):
    """Un dialogo se c'è uno schermo, altrimenti stderr: mai un traceback."""
    try:
        # Senza init_check un dialogo lanciato da un terminale senza sessione
        # grafica non si aprirebbe e resterebbe lì ad aspettare per sempre.
        if not Gtk.init_check()[0]:
            raise RuntimeError("nessuna sessione grafica")
        dialogo = Gtk.MessageDialog(
            transient_for=None, modal=True,
            message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.OK, text=titolo)
        dialogo.format_secondary_text(testo)
        dialogo.run()
        dialogo.destroy()
    except Exception:
        sys.stderr.write(titolo + "\n\n" + testo + "\n")


def main():
    GLib.set_prgname("it.flow.Flow")
    GLib.set_application_name("Flow")

    if not os.path.isdir(Percorsi.APP):
        errore_fatale(
            "Manca la cartella app/ accanto a flow.",
            "Flow va tenuto insieme alla sua cartella: spostali sempre "
            "entrambi.")
        return 1

    Archivio.init()
    return Flow().run(sys.argv)


if __name__ == "__main__":
    sys.exit(main())
