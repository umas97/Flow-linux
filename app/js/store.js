/* Store: stato applicativo, persistenza su file locale, cronologia annulla/ripristina. */
(function (global) {
  'use strict';

  var U = global.U;
  var SCHEMA = 1;

  /* ------------------------------------------------------------------ *
   * Backend di persistenza
   *  - "server": servito da ./flow -> scrive su data/board.json
   *  - "local" : aperto con doppio clic su index.html -> localStorage
   *
   * Il nome "server" è rimasto per comodità: dietro non c'è più un server,
   * ma l'host nativo che risponde alle stesse chiamate /api/ restando
   * dentro il processo dell'applicazione.
   *
   * L'host monta la pagina su uno schema URI proprio (flow://flow.example):
   * senza contarlo qui l'app ripiegherebbe su localStorage pur avendo
   * l'archivio su disco già disponibile.
   * ------------------------------------------------------------------ */
  var isServed = location.protocol === 'flow:' ||
    location.protocol === 'http:' || location.protocol === 'https:';
  var BACKEND = isServed ? 'server' : 'local';
  var LS_KEY = 'flow.board';
  var LS_PREFS = 'flow.prefs';

  var listeners = [];
  var undoStack = [];
  var redoStack = [];
  var MAX_UNDO = 60;

  var Store = {
    state: null,
    backend: BACKEND,
    saveStatus: 'idle', // idle | dirty | saving | saved | error
    lastError: null
  };

  /* ---------------------------- dati iniziali ---------------------------- */

  function seed() {
    var t = U.today();
    var pid = 'p_welcome', pid2 = 'p_casa';
    var s1 = 's_todo', s2 = 's_doing', s3 = 's_done';
    var n = new Date().toISOString();

    function task(o) {
      return Object.assign({
        id: U.uid('t'), projectId: pid, sectionId: s1, title: '', notes: '',
        done: false, completedAt: null, due: null, priority: 0, tags: [],
        assignee: null, subtasks: [], order: 0, createdAt: n, updatedAt: n
      }, o);
    }

    return {
      schema: SCHEMA,
      createdAt: n,
      settings: { theme: 'system', accent: '#294AAE', density: 'comfortable', startView: 'today' },
      people: [
        { id: 'me', name: 'Io', color: '#294AAE' }
      ],
      tags: [
        { id: 'tg_urgente', name: 'urgente', color: '#AE2929' },
        { id: 'tg_idea', name: 'idea', color: '#AE8C29' },
        { id: 'tg_casa', name: 'casa', color: '#29AE6B' }
      ],
      projects: [
        {
          id: pid, name: 'Benvenuto in Flow', color: '#294AAE', icon: '🚀',
          archived: false, view: 'board', order: 1000, createdAt: n,
          sections: [
            { id: s1, name: 'Da fare', order: 1000 },
            { id: s2, name: 'In corso', order: 2000 },
            { id: s3, name: 'Fatto', order: 3000 }
          ]
        },
        {
          id: pid2, name: 'Casa', color: '#29AE6B', icon: '🏡',
          archived: false, view: 'list', order: 2000, createdAt: n,
          sections: [
            { id: 's_casa1', name: 'Questa settimana', order: 1000 },
            { id: 's_casa2', name: 'Prima o poi', order: 2000 }
          ]
        }
      ],
      tasks: [
        task({
          title: 'Premi N per creare la tua prima attività', sectionId: s1, order: 1000,
          priority: 3, due: t, tags: ['tg_urgente'], assignee: 'me',
          notes: 'La casella di inserimento rapido capisce il linguaggio naturale.\n\nProva a scrivere:\n\n`Chiamare il commercialista domani !alta #urgente @Io`\n\n- **domani / lunedì / 12/03** → scadenza\n- **!alta !media !bassa** → priorità\n- **#etichetta** → etichetta\n- **@persona** → assegnatario',
          subtasks: [
            { id: U.uid('st'), title: 'Scrivi il titolo', done: true },
            { id: U.uid('st'), title: 'Aggiungi una scadenza', done: false },
            { id: U.uid('st'), title: 'Trascinala in un\'altra colonna', done: false }
          ]
        }),
        task({
          title: 'Trascina le schede tra le colonne', sectionId: s1, order: 2000,
          priority: 2, due: U.addDays(t, 1),
          notes: 'Puoi trascinare le attività tra le sezioni della bacheca, riordinarle nella vista elenco e spostarle di giorno nel calendario.'
        }),
        task({
          title: 'Ctrl+K apre la palette dei comandi', sectionId: s2, order: 1000,
          priority: 1, tags: ['tg_idea'],
          notes: 'Cerca qualsiasi attività o progetto, oppure lancia un comando: cambia tema, esporta i dati, crea un progetto.'
        }),
        task({
          title: 'Tutto è salvato in data/board.json', sectionId: s2, order: 2000,
          notes: 'Nessun account, nessuna rete. Il file resta sul tuo disco e viene salvato automaticamente a ogni modifica, con backup a rotazione in `data/backups/`.',
          subtasks: [
            { id: U.uid('st'), title: 'Esporta una copia quando vuoi', done: false }
          ]
        }),
        task({
          title: 'Tema chiaro, scuro o automatico', sectionId: s3, order: 1000,
          done: true, completedAt: n,
          notes: 'Il selettore è in basso nella barra laterale. "Auto" segue il tema di GNOME.'
        }),
        task({ title: 'Fare la spesa', projectId: pid2, sectionId: 's_casa1', order: 1000, due: t, tags: ['tg_casa'], priority: 2 }),
        task({ title: 'Prenotare il tagliando dell\'auto', projectId: pid2, sectionId: 's_casa1', order: 2000, due: U.addDays(t, 3) }),
        task({ title: 'Riordinare il garage', projectId: pid2, sectionId: 's_casa2', order: 1000, tags: ['tg_casa'] })
      ]
    };
  }

  /* Tipi di collegamento e criteri d'ordine, di un progetto come di
     un'attivita'. Come SECTION_SORTS: duplicati di proposito, store.js e'
     caricato prima di views.js e non puo' leggerli da Views. */
  var LINK_KINDS = ['dir', 'file', 'url'];
  var LINK_SORTS = ['manual', 'kind', 'alpha'];

  // Un collegamento web si riconosce solo dallo schema: "www.qualcosa" puo'
  // essere anche il nome di una cartella su una rete.
  var URL_RE = /^https?:[/][/]/i;

  /** Vero se la stringa e' un indirizzo web (http/https). */
  Store.isUrl = function (v) { return URL_RE.test(String(v || '').trim()); };

  /**
   * Ripulisce un percorso incollato. Un percorso copiato da un terminale
   * arriva spesso fra virgolette, e con quelle attaccate non e' piu' un
   * percorso assoluto: /api/open lo rifiuterebbe e il tipo non si
   * riconoscerebbe.
   */
  Store.cleanPath = function (v) {
    var s = String(v == null ? '' : v).trim();
    if (s.length > 1 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      s = s.slice(1, -1).trim();
    }
    return s;
  };

  /**
   * Etichetta predefinita di un collegamento. Regola unica: la usano il
   * selettore, l'incolla e normalize.
   * - indirizzo web: il nome del sito, che dice piu' dell'ultimo pezzo del
   *   percorso ("example.com" invece di "index.html");
   * - percorso: l'ultimo segmento; sulla radice la barra ("/").
   */
  Store.pathLeaf = function (path) {
    var raw = String(path || '').trim();
    if (URL_RE.test(raw)) {
      var host = raw.replace(URL_RE, '').split(/[\/?#]/)[0];
      return host.replace(/^www[.]/i, '') || raw;
    }
    var clean = raw.replace(/[/]+$/, '');
    // Solo barre: e' la radice, e la radice si chiama cosi'.
    if (!clean) return raw ? '/' : 'Collegamento';
    var parts = clean.split('/');
    return parts[parts.length - 1] || clean;
  };

  /* ---------------------------- normalizzazione ---------------------------- */

  /* Deve restare allineato a Views.SORTS: store.js è caricato prima di views.js,
     quindi normalize non può leggere l'elenco da là. */
  var SECTION_SORTS = ['manual', 'priority', 'due', 'created-desc', 'created-asc', 'updated', 'alpha'];

  // Schede di un progetto. Un valore ignoto torna alla bacheca invece di
  // lasciare V.content senza niente da mostrare.
  var PROJECT_VIEWS = ['board', 'list', 'calendar', 'notes'];


  /* I collegamenti stanno su un progetto (scheda Note) e su un'attivita'
     (pannello dettaglio): stessa forma, stessa finestra, quindi anche stesso
     controllo. fallback e' il colore di chi non ce l'ha. */
  function normalizeLinks(o, fallback) {
    if (LINK_SORTS.indexOf(o.linksSort) < 0) o.linksSort = 'manual';
    o.links = (Array.isArray(o.links) ? o.links : [])
      // Un collegamento senza percorso non porta in nessun posto: si scarta.
      .filter(function (l) {
        return l && typeof l.path === 'string' && Store.cleanPath(l.path).length;
      })
      .map(function (l) {
        var path = Store.cleanPath(l.path);
        // Il tipo dichiarato vince, ma un indirizzo web resta un indirizzo
        // web anche se l'archivio dice altro: altrimenti /api/open ci
        // proverebbe come se fosse un percorso su disco.
        var kind = LINK_KINDS.indexOf(l.kind) < 0 ? 'dir' : l.kind;
        if (URL_RE.test(path)) kind = 'url';
        else if (kind === 'url') kind = 'dir';
        return {
          id: l.id || U.uid('l'),
          path: path,
          label: l.label || Store.pathLeaf(path),
          color: U.snap(l.color || fallback, COLORE),
          kind: kind
        };
      });
  }

  /* Colore predefinito: Indaco, la sedicesima tinta della tavolozza in
     app.js. Ogni colore memorizzato viene da li' — uno fuori tavolozza
     (archivio scritto da una versione precedente) rientra con U.snap. */
  var COLORE = '#294AAE';

  function normalize(data) {
    var d = data && typeof data === 'object' ? data : {};
    var n = new Date().toISOString();

    d.schema = SCHEMA;
    d.settings = Object.assign({
      theme: 'system', accent: COLORE, density: 'comfortable',
      startView: 'today', sidebarCollapsed: false, detailWidth: 440, detailAutoHide: true,
      projectsLocked: true, rememberProjectView: true, defaultProjectView: 'board'
    }, d.settings || {});
    d.settings.accent = U.snap(d.settings.accent, COLORE);
    // Larghezza del pannello dettagli: numero entro i limiti della maniglia.
    var dw = +d.settings.detailWidth;
    d.settings.detailWidth = isNaN(dw) ? 440 : Math.max(320, Math.min(720, Math.round(dw)));
    // Chiusura al click fuori: acceso salvo esplicito "false".
    d.settings.detailAutoHide = d.settings.detailAutoHide !== false;
    // Riordino dei progetti: bloccato salvo esplicito "false".
    d.settings.projectsLocked = d.settings.projectsLocked !== false;
    // Schede dei progetti: si ricorda l'ultima salvo esplicito "false".
    d.settings.rememberProjectView = d.settings.rememberProjectView !== false;
    // Scheda su cui aprire un progetto quando non si ricorda l'ultima.
    if (PROJECT_VIEWS.indexOf(d.settings.defaultProjectView) < 0) {
      d.settings.defaultProjectView = 'board';
    }
    d.people = Array.isArray(d.people) ? d.people : [];
    d.tags = Array.isArray(d.tags) ? d.tags : [];
    d.projects = Array.isArray(d.projects) ? d.projects : [];
    d.tasks = Array.isArray(d.tasks) ? d.tasks : [];

    /* Ordine dei progetti nella barra laterale. Chi non l'ha lo riceve dalla
       propria posizione attuale nell'array, dopo il progetto che lo precede:
       così al primo avvio dopo l'aggiornamento nessun progetto si muove. */
    var lastOrder = 0;
    d.projects.forEach(function (p, i) {
      if (typeof p.order !== 'number' || isNaN(p.order)) {
        p.order = Math.max(lastOrder, i * 1000) + 1000;
      }
      lastOrder = p.order;
    });
    // Array riallineato all'ordine visivo: d.projects[0] è davvero il primo
    // progetto a schermo, e ci contano il recupero degli orfani e createTask.
    d.projects.sort(function (a, b) { return a.order - b.order; });

    d.projects.forEach(function (p) {
      p.id = p.id || U.uid('p');
      p.name = p.name || 'Progetto';
      p.color = U.snap(p.color, COLORE);
      p.sections = Array.isArray(p.sections) && p.sections.length ? p.sections : [{ id: U.uid('s'), name: 'Da fare', order: 1000 }];
      p.sections.forEach(function (s, i) {
        s.id = s.id || U.uid('s');
        if (typeof s.order !== 'number') s.order = (i + 1) * 1000;
        // Un criterio sconosciuto (archivio di una versione più nuova, o scritto
        // a mano) torna a Manuale invece di far sparire le attività.
        if (SECTION_SORTS.indexOf(s.sort) < 0) s.sort = 'manual';
      });
      if (PROJECT_VIEWS.indexOf(p.view) < 0) p.view = 'board';
      if (!p.createdAt) p.createdAt = n;

      // Scheda Note: appunti in markdown, collegamenti a cartelle, file o web.
      if (typeof p.notes !== 'string') p.notes = '';
      normalizeLinks(p, p.color);
    });

    var validProjects = {};
    d.projects.forEach(function (p) { validProjects[p.id] = p; });

    d.tasks.forEach(function (t, i) {
      t.id = t.id || U.uid('t');
      t.title = t.title || '(senza titolo)';
      t.notes = t.notes || '';
      t.done = !!t.done;
      t.priority = typeof t.priority === 'number' ? t.priority : 0;
      t.tags = Array.isArray(t.tags) ? t.tags : [];
      t.subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
      t.subtasks.forEach(function (s) { s.id = s.id || U.uid('st'); s.done = !!s.done; });
      if (typeof t.order !== 'number') t.order = (i + 1) * 1000;
      if (!t.createdAt) t.createdAt = n;
      if (!t.updatedAt) t.updatedAt = t.createdAt;
      if (t.done && !t.completedAt) t.completedAt = t.updatedAt;
      if (!t.done) t.completedAt = null;

      // Ripara riferimenti orfani: l'attività finisce nel primo progetto/sezione valido.
      var p = validProjects[t.projectId];
      if (!p) { p = d.projects[0]; t.projectId = p ? p.id : null; }
      if (p && !p.sections.some(function (s) { return s.id === t.sectionId; })) {
        t.sectionId = p.sections[0].id;
      }

      // Collegamenti dell'attività: gli stessi della scheda Note del progetto.
      normalizeLinks(t, (p && p.color) || d.settings.accent);
    });

    var tagIds = {};
    // Colori delle persone: come le etichette, sempre dalle 24 in tavolozza.
    d.people.forEach(function (p) { p.color = U.snap(p.color, COLORE); });

    d.tags.forEach(function (g) {
      g.id = g.id || U.uid('tg');
      g.color = U.snap(g.color, COLORE);
      tagIds[g.id] = true;
    });
    d.tasks.forEach(function (t) {
      t.tags = t.tags.filter(function (id) { return tagIds[id]; });
    });

    return d;
  }

  /* ---------------------------- I/O ---------------------------- */

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(LS_PREFS) || '{}'); } catch (e) { return {}; }
  }

  function savePrefs() {
    var s = Store.state && Store.state.settings;
    if (!s) return;
    try {
      // Lo script inline di index.html applica il tema prima del primo paint
      // e non conosce la tavolozza: la coppia dell'accento gli arriva gia'
      // risolta (sopra il pieno scuro il testo e' sempre #1A1A1A).
      var pal = U.paletteOf(s.accent);
      localStorage.setItem(LS_PREFS, JSON.stringify({
        theme: s.theme, accent: s.accent, density: s.density,
        accentScuro: pal ? pal.scuro : s.accent,
        accentTesto: pal ? pal.testo : '#fff'
      }));
    } catch (e) {}
  }

  Store.load = function () {
    if (BACKEND === 'server') {
      return fetch('/api/data', { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (json) {
          var fresh = !(json && json.schema);
          Store.state = normalize(fresh ? seed() : json);
          savePrefs();
          if (fresh) flush(); // primo avvio: creo subito board.json sul disco
          return Store.state;
        })
        .catch(function (err) {
          // Il server non risponde: si continua in sola memoria, senza perdere dati sul disco.
          Store.lastError = err;
          Store.backend = 'memory';
          Store.state = normalize(readLocal() || seed());
          return Store.state;
        });
    }
    Store.state = normalize(readLocal() || seed());
    savePrefs();
    return Promise.resolve(Store.state);
  };

  function readLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Store.state));
      return true;
    } catch (e) { return false; }
  }

  function setStatus(s) {
    Store.saveStatus = s;
    emit('status');
  }

  var flushing = false, pendingAgain = false;

  function flush() {
    if (!Store.state) return;
    if (flushing) { pendingAgain = true; return; }

    savePrefs();

    if (Store.backend !== 'server') {
      writeLocal();
      setStatus('saved');
      return;
    }

    flushing = true;
    setStatus('saving');
    // Indentato di proposito: board.json è pensato per restare leggibile a occhio.
    fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Store.state, null, 2)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setStatus('saved');
    }).catch(function (err) {
      Store.lastError = err;
      writeLocal(); // rete locale caduta: copia di sicurezza nel browser
      setStatus('error');
    }).then(function () {
      flushing = false;
      if (pendingAgain) { pendingAgain = false; flush(); }
    });
  }

  var scheduleSave = U.debounce(flush, 450);

  /** Salvataggio sincrono di emergenza alla chiusura della finestra. */
  Store.flushNow = function () {
    if (!Store.state) return;
    savePrefs();
    writeLocal();
    if (Store.backend === 'server' && navigator.sendBeacon) {
      try {
        navigator.sendBeacon('/api/data', new Blob([JSON.stringify(Store.state, null, 2)], { type: 'application/json' }));
      } catch (e) {}
    }
  };

  /* ---------------------------- mutazioni ---------------------------- */

  function snapshot() { return JSON.stringify(Store.state); }

  /**
   * Unico punto di ingresso per modificare lo stato.
   * `label` compare nel toast di annullamento.
   */
  Store.commit = function (label, fn, opts) {
    var before = snapshot();
    var result = fn(Store.state);
    if (result === false) return false; // la mutazione si è annullata da sola

    if (!(opts && opts.noUndo)) {
      undoStack.push({ label: label, data: before });
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack.length = 0;
    }
    setStatus('dirty');
    scheduleSave();
    emit('change', label);
    return true;
  };

  /** Modifica senza cronologia (es. preferenze UI). */
  Store.quiet = function (fn) {
    fn(Store.state);
    setStatus('dirty');
    scheduleSave();
    emit('change');
  };

  /**
   * Segna la modifica su chi la registra. Serve a chi cambia una cosa che vive
   * sia su un progetto sia su un'attività — i collegamenti — senza dover
   * sapere quale dei due ha in mano: un'attività ha updatedAt, un progetto no.
   */
  Store.touch = function (o) {
    if (o && typeof o.updatedAt === 'string') o.updatedAt = new Date().toISOString();
  };

  Store.canUndo = function () { return undoStack.length > 0; };
  Store.canRedo = function () { return redoStack.length > 0; };

  Store.undo = function () {
    var entry = undoStack.pop();
    if (!entry) return null;
    redoStack.push({ label: entry.label, data: snapshot() });
    Store.state = normalize(JSON.parse(entry.data));
    setStatus('dirty');
    scheduleSave();
    emit('change', 'undo');
    return entry.label;
  };

  Store.redo = function () {
    var entry = redoStack.pop();
    if (!entry) return null;
    undoStack.push({ label: entry.label, data: snapshot() });
    Store.state = normalize(JSON.parse(entry.data));
    setStatus('dirty');
    scheduleSave();
    emit('change', 'redo');
    return entry.label;
  };

  Store.replaceAll = function (data) {
    undoStack.push({ label: 'importazione', data: snapshot() });
    Store.state = normalize(data);
    redoStack.length = 0;
    setStatus('dirty');
    flush();
    emit('change', 'import');
  };

  /* ---------------------------- eventi ---------------------------- */

  function emit(type, payload) {
    listeners.forEach(function (l) { if (l.type === type) l.fn(payload); });
  }

  Store.on = function (type, fn) { listeners.push({ type: type, fn: fn }); };

  /* ---------------------------- selettori ---------------------------- */

  Store.project = function (id) {
    return Store.state.projects.filter(function (p) { return p.id === id; })[0] || null;
  };

  Store.task = function (id) {
    return Store.state.tasks.filter(function (t) { return t.id === id; })[0] || null;
  };

  Store.tag = function (id) {
    return Store.state.tags.filter(function (g) { return g.id === id; })[0] || null;
  };

  Store.person = function (id) {
    return Store.state.people.filter(function (p) { return p.id === id; })[0] || null;
  };

  Store.section = function (projectId, sectionId) {
    var p = Store.project(projectId);
    if (!p) return null;
    return p.sections.filter(function (s) { return s.id === sectionId; })[0] || null;
  };

  Store.tasksOf = function (projectId) {
    return Store.state.tasks.filter(function (t) { return t.projectId === projectId; });
  };

  Store.activeProjects = function () {
    return Store.state.projects.filter(function (p) { return !p.archived; })
      .sort(function (a, b) { return a.order - b.order; });
  };

  /** Ordine da dare a un progetto nuovo: in fondo all'elenco. */
  Store.nextProjectOrder = function () {
    var max = 0;
    Store.state.projects.forEach(function (p) {
      if (typeof p.order === 'number' && p.order > max) max = p.order;
    });
    return max + 1000;
  };

  /** Progresso 0..1 di un progetto (attività completate / totali). */
  Store.progress = function (projectId) {
    var list = Store.tasksOf(projectId);
    if (!list.length) return { done: 0, total: 0, ratio: 0 };
    var done = list.filter(function (t) { return t.done; }).length;
    return { done: done, total: list.length, ratio: done / list.length };
  };

  /* ---------------------------- azioni di dominio ---------------------------- */

  Store.createTask = function (fields) {
    var n = new Date().toISOString();
    var projectId = fields.projectId || (Store.activeProjects()[0] || {}).id;
    var p = Store.project(projectId);
    var sectionId = fields.sectionId || (p && p.sections[0].id);

    var siblings = Store.state.tasks.filter(function (t) {
      return t.projectId === projectId && t.sectionId === sectionId;
    });
    var minOrder = siblings.reduce(function (m, t) { return Math.min(m, t.order); }, Infinity);

    var task = Object.assign({
      id: U.uid('t'), projectId: projectId, sectionId: sectionId,
      title: 'Nuova attività', notes: '', done: false, completedAt: null,
      due: null, priority: 0, tags: [], assignee: null, subtasks: [],
      links: [], linksSort: 'manual',
      order: siblings.length ? minOrder - 1000 : 1000,
      createdAt: n, updatedAt: n
    }, fields);

    Store.state.tasks.push(task);
    return task;
  };

  Store.updateTask = function (id, patch) {
    var t = Store.task(id);
    if (!t) return null;
    Object.assign(t, patch);
    t.updatedAt = new Date().toISOString();
    if ('done' in patch) t.completedAt = patch.done ? t.updatedAt : null;
    return t;
  };

  Store.deleteTask = function (id) {
    var i = Store.state.tasks.findIndex(function (t) { return t.id === id; });
    if (i >= 0) Store.state.tasks.splice(i, 1);
  };

  /** I colori gia' assegnati in una lista, per U.farColor. */
  function coloriDi(list) {
    return list.map(function (x) { return x.color; });
  }

  Store.ensureTag = function (name) {
    var clean = String(name).trim().toLowerCase().replace(/^#/, '');
    if (!clean) return null;
    var found = Store.state.tags.filter(function (g) { return g.name.toLowerCase() === clean; })[0];
    if (found) return found;
    // Colore dalla tavolozza unica (app.js), il piu' lontano dalle etichette
    // che ci sono gia': a giro sulla ruota due etichette create di seguito
    // distavano quindici gradi, cioe' sembravano lo stesso colore.
    var tag = { id: U.uid('tg'), name: clean, color: U.farColor(coloriDi(Store.state.tags)) };
    Store.state.tags.push(tag);
    return tag;
  };

  Store.ensurePerson = function (name) {
    var clean = String(name).trim().replace(/^@/, '');
    if (!clean) return null;
    var found = Store.state.people.filter(function (p) {
      return p.name.toLowerCase() === clean.toLowerCase();
    })[0];
    if (found) return found;
    // Tinta della tavolozza piu' lontana da quelle delle altre persone: la
    // derivava dal nome, ma un hash non sa niente di chi c'e' gia' e finiva
    // spesso sul vicino di ruota di qualcun altro.
    var person = { id: U.uid('pe'), name: clean, color: U.farColor(coloriDi(Store.state.people)) };
    Store.state.people.push(person);
    return person;
  };

  Store.seedData = seed;
  Store.normalize = normalize;
  Store.loadPrefs = loadPrefs;

  global.Store = Store;
})(window);
