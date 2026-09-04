/* Controller: avvio, routing, eventi, drag & drop, palette, scorciatoie. */
(function (global) {
  'use strict';

  var U = global.U, Store = global.Store, Views = global.Views,
    Detail = global.Detail, Menu = global.Menu, Modal = global.Modal, icon = global.icon;

  var App = {
    ui: {
      route: { kind: 'today', id: null },
      search: '',
      filters: { tags: [], priority: null, assignee: null },
      calMonth: U.today().slice(0, 7),
      selectedTaskId: null,
      collapsed: { projects: false, tags: false },
      sidebarCollapsed: false,
      // Scheda del progetto in corso di visita quando le schede non si
      // ricordano: vive quanto la visita e non finisce nell'archivio.
      tempView: null
    }
  };
  global.App = App;

  /* ================================================================== *
   * TAVOLOZZE
   *
   * Una sola definizione per tutto: progetti, etichette, collegamenti e
   * colore d'accento. Prima erano quattro elenchi copiati da dodici colori
   * l'uno, che divergevano a ogni ritocco.
   * 24 colori = quattro righe da sei nella griglia .swatches.
   * ================================================================== */

  var COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#6d5efc', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    '#b91c1c', '#0f766e', '#1d4ed8', '#7e22ce', '#78716c', '#64748b'
  ];

  // 48 icone = quattro righe da dodici. Raggruppate per ambito, cosi' si
  // trovano a occhio: lavoro, casa, studio, tempo libero, viaggi, simboli.
  var EMOJIS = [
    '📁', '📂', '📋', '📌', '💼', '🏢', '🖥️', '⚙️', '🛠️', '🔧', '🧰', '📐',
    '🏡', '🛋️', '🧹', '🍳', '🛒', '🌱', '🪴', '🐾', '🚗', '🚲', '✈️', '🧳',
    '📚', '🎓', '📝', '🧠', '💡', '🔬', '🧩', '📷', '🎨', '🎸', '🎬', '🎮',
    '🏋️', '⚽', '🏔️', '💰', '📈', '🎯', '🚀', '🔥', '⭐', '❤️', '⚡', '🌍'
  ];

  /* ================================================================== *
   * RENDERING
   * ================================================================== */

  App.renderContent = function () {
    var c = U.$('#content');
    /* Gli appunti del progetto sono l'unico campo di testo che vive dentro
       #content: ridisegnarlo mentre si scrive azzererebbe testo e cursore.
       Stessa ragione di isEditingInDetail, con lo stesso limite volontario —
       il controllo guarda quel solo campo, non un <button> col fuoco. */
    var a = document.activeElement;
    if (a && a.classList && a.classList.contains('np-notes-edit')) return;

    var top = c.scrollTop, left = c.scrollLeft;
    // La bacheca scorre in orizzontale da sé e ogni colonna in verticale:
    // senza salvarli, ogni ridisegno riporterebbe tutto all'inizio.
    var board = c.querySelector('.board');
    var boardLeft = board ? board.scrollLeft : 0;
    var cols = {};
    U.$$('.column', c).forEach(function (col) {
      var body = col.querySelector('.col-body');
      if (body && body.scrollTop) cols[col.dataset.section] = body.scrollTop;
    });

    Views.content();

    c.scrollTop = top; c.scrollLeft = left;
    var board2 = c.querySelector('.board');
    if (board2) board2.scrollLeft = boardLeft;
    U.$$('.column', c).forEach(function (col) {
      var v = cols[col.dataset.section];
      if (!v) return;
      var body = col.querySelector('.col-body');
      if (body) body.scrollTop = v;
    });
  };

  App.render = function (opts) {
    opts = opts || {};
    Views.sidebar();
    if (!opts.keepTopbar) Views.topbar();
    App.renderContent();
    if (Detail.isOpen() && !isEditingInDetail()) Detail.render();
    updateSaveState();
  };

  /**
   * Ridisegnare il pannello mentre si scrive azzererebbe cursore e testo.
   * Vale però solo per i campi di testo: un <button> cliccato prende il focus
   * anche lui, e bloccare il ridisegno lì lasciava il pannello indietro
   * rispetto ai dati (etichette tolte che restavano a schermo).
   */
  function isEditingInDetail() {
    var a = document.activeElement;
    if (!a || !U.$('#detail').contains(a)) return false;
    return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable;
  }

  /* La vista corrente vive nell'hash: i tasti Indietro/Avanti della finestra funzionano. */
  var CROSS_VIEWS = ['today', 'upcoming', 'all', 'completed'];

  function routeToHash(r) {
    return r.kind === 'project' ? '#p/' + r.id : '#' + r.kind;
  }

  function hashToRoute(h) {
    h = String(h || '').replace(/^#/, '');
    if (!h) return null;
    if (h.indexOf('p/') === 0) {
      var id = h.slice(2);
      return Store.project(id) ? { kind: 'project', id: id } : null;
    }
    return CROSS_VIEWS.indexOf(h) >= 0 ? { kind: h, id: null } : null;
  }

  App.go = function (kind, id) {
    App.ui.route = { kind: kind, id: id || null };
    App.ui.calMonth = U.today().slice(0, 7);
    App.ui.tempView = null;
    try { localStorage.setItem('flow.route', JSON.stringify(App.ui.route)); } catch (e) {}
    var h = routeToHash(App.ui.route);
    if (location.hash !== h) location.hash = h;
    if (innerWidth <= 760) U.$('#app').classList.remove('side-open');
    App.render();
    U.$('#content').scrollTop = 0;
  };

  addEventListener('hashchange', function () {
    var r = hashToRoute(location.hash);
    if (!r) return;
    if (r.kind === App.ui.route.kind && r.id === App.ui.route.id) return;
    App.go(r.kind, r.id);
  });

  /** Su finestre strette la barra laterale scorre sopra il contenuto; altrimenti si comprime. */
  App.toggleSidebar = function () {
    if (innerWidth <= 760) {
      U.$('#app').classList.toggle('side-open');
      return;
    }
    App.ui.sidebarCollapsed = !App.ui.sidebarCollapsed;
    U.$('#app').classList.toggle('side-collapsed', App.ui.sidebarCollapsed);
    Store.quiet(function (st) { st.settings.sidebarCollapsed = App.ui.sidebarCollapsed; });
  };

  function updateSaveState() {
    var n = U.$('#saveState');
    if (!n) return;
    var s = Store.saveStatus;
    n.dataset.s = s;
    var labels = { idle: 'Salvato', dirty: 'In attesa', saving: 'Salvataggio…', saved: 'Salvato', error: 'Errore' };
    U.$('.save-label', n).textContent = labels[s] || 'Salvato';
    n.title = Store.backend === 'server'
      ? 'I dati sono su data/board.json'
      : 'Modalità locale: i dati restano nel browser. Usa Esporta per salvarli su file.';
  }

  /* ================================================================== *
   * NOTIFICHE
   * ================================================================== */

  App.toast = function (msg, ic, undoable) {
    var host = U.$('#toasts');
    var t = U.el('div', { class: 'toast' + (ic === 'alert' ? ' err' : '') });
    t.innerHTML = icon(ic || 'checkCircle', 'sm') + '<span>' + U.esc(msg) + '</span>';
    if (undoable && Store.canUndo()) {
      var b = U.el('button', {}, 'Annulla');
      b.onclick = function () { App.undo(); dismiss(); };
      t.appendChild(b);
    }
    host.appendChild(t);
    var timer = setTimeout(dismiss, undoable ? 5200 : 2600);
    function dismiss() {
      clearTimeout(timer);
      if (!t.parentNode) return;
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 220);
    }
    while (host.children.length > 3) host.firstChild.remove();
  };

  App.undo = function () {
    var label = Store.undo();
    if (label) { App.render(); App.toast('Annullato: ' + label, 'undo'); }
    else App.toast('Niente da annullare', 'undo');
  };

  App.redo = function () {
    var label = Store.redo();
    if (label) { App.render(); App.toast('Ripristinato: ' + label, 'repeat'); }
  };

  /* ================================================================== *
   * TEMA
   * ================================================================== */

  var mq = matchMedia('(prefers-color-scheme: dark)');

  function applyTheme() {
    var s = Store.state.settings;
    var dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.setProperty('--accent', s.accent);
    document.documentElement.dataset.density = s.density === 'compact' ? 'compact' : '';
  }
  mq.addEventListener('change', function () {
    if (Store.state && Store.state.settings.theme === 'system') applyTheme();
  });

  App.setTheme = function (t) {
    Store.quiet(function (st) { st.settings.theme = t; });
    applyTheme();
    Views.sidebar();
  };

  /* ================================================================== *
   * AZIONI
   * ================================================================== */

  function currentProject() {
    return App.ui.route.kind === 'project' ? Store.project(App.ui.route.id) : null;
  }

  /* Quale scheda mostrare in un progetto, e dove finisce il cambio.
     Con settings.rememberProjectView la scelta sta nel progetto e si ritrova
     al ritorno; senza, ogni progetto si apre sulla scheda predefinita e il
     cambio vale solo per la visita in corso (App.ui.tempView, azzerata da
     App.go). Cosi' spegnendo e riaccendendo l'opzione le schede ricordate
     non si perdono. */
  App.projectView = function (p) {
    var s = Store.state.settings;
    if (s.rememberProjectView) return p.view;
    return App.ui.tempView || s.defaultProjectView;
  };

  App.setProjectView = function (p, v) {
    if (Store.state.settings.rememberProjectView) Store.quiet(function () { p.view = v; });
    else App.ui.tempView = v;
    App.render();
  };

  function defaultTarget() {
    var p = currentProject() || Store.activeProjects()[0];
    return p ? { projectId: p.id, sectionId: p.sections[0].id } : null;
  }

  App.createTaskInline = function (projectId, sectionId) {
    var created = null;
    Store.commit('nuova attività', function () {
      created = Store.createTask({ projectId: projectId, sectionId: sectionId, title: '' });
    });
    App.render();
    Detail.open(created.id);
    setTimeout(function () {
      var ta = U.$('.dt-title');
      if (ta) ta.focus();
    }, 60);
  };

  App.newProject = function () {
    var colors = COLORS, emojis = EMOJIS;
    Modal.open(
      '<div class="modal-head"><h2>Nuovo progetto</h2></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label>Nome</label><input class="input" id="npName" placeholder="Es. Ristrutturazione casa" maxlength="60"></div>' +
      '<div class="field"><label>Icona</label><div class="swatches emoji" id="npEmoji">' +
      emojis.map(function (e) {
        return '<button class="swatch" data-e="' + e + '" style="background:var(--surface-2);font-size:15px">' +
          e + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>Colore</label><div class="swatches" id="npColor">' +
      colors.map(function (c, i) {
        return '<button class="swatch' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" style="--c:' + c + '"></button>';
      }).join('') + '</div></div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" data-x="cancel">Annulla</button>' +
      '<button class="btn primary" data-x="create">Crea progetto</button></div>',
      {
        onMount: function (box) {
          var color = colors[0], emoji = '';
          U.$('#npColor', box).onclick = function (e) {
            var b = e.target.closest('[data-c]'); if (!b) return;
            color = b.dataset.c;
            U.$$('#npColor .swatch', box).forEach(function (s) { s.classList.toggle('on', s === b); });
          };
          U.$('#npEmoji', box).onclick = function (e) {
            var b = e.target.closest('[data-e]'); if (!b) return;
            var was = b.classList.contains('on');
            U.$$('#npEmoji .swatch', box).forEach(function (s) { s.classList.remove('on'); });
            if (!was) { b.classList.add('on'); emoji = b.dataset.e; } else emoji = '';
          };
          box.querySelector('[data-x="cancel"]').onclick = Modal.close;
          box.querySelector('[data-x="create"]').onclick = create;
          U.$('#npName', box).addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); create(); }
          });
          function create() {
            var name = U.$('#npName', box).value.trim() || 'Nuovo progetto';
            var id = U.uid('p');
            Store.commit('nuovo progetto', function (st) {
              st.projects.push({
                id: id, name: name, color: color, icon: emoji, archived: false, view: 'board',
                order: Store.nextProjectOrder(), // in fondo all'elenco
                notes: '', links: [],
                createdAt: new Date().toISOString(),
                sections: [
                  { id: U.uid('s'), name: 'Da fare', order: 1000 },
                  { id: U.uid('s'), name: 'In corso', order: 2000 },
                  { id: U.uid('s'), name: 'Fatto', order: 3000 }
                ]
              });
            });
            Modal.close();
            App.go('project', id);
            App.toast('Progetto “' + name + '” creato', 'folder');
          }
        }
      }
    );
  };

  /* ---------------- gestione etichette ---------------- */

  var TAG_COLORS = COLORS;

  function tagUsage(id) {
    return Store.state.tasks.filter(function (t) { return t.tags.indexOf(id) >= 0; }).length;
  }

  App.manageTags = function () {
    function rows() {
      if (!Store.state.tags.length) {
        return '<p style="font-size:13px;color:var(--text-3);padding:22px 2px;text-align:center">' +
          'Nessuna etichetta ancora. Creane una qui sotto.</p>';
      }
      return Store.state.tags.map(function (g) {
        var n = tagUsage(g.id);
        return '<div class="tag-row" data-id="' + g.id + '">' +
          '<button class="tag-swatch" data-x="color" style="--c:' + g.color + '" title="Cambia colore"></button>' +
          '<input class="tag-name" value="' + U.esc(g.name) + '" maxlength="24" spellcheck="false">' +
          '<span class="tag-use">' + (n ? n + ' attività' : 'non usata') + '</span>' +
          '<button class="icon-btn" data-x="del" title="Elimina etichetta">' + icon('trash', 'sm') + '</button>' +
          '</div>';
      }).join('');
    }

    var box = Modal.open(
      '<div class="modal-head">' + icon('tag') + '<h2>Etichette</h2>' +
      '<button class="icon-btn" data-x="close">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' +
      '<div id="tagRows">' + rows() + '</div>' +
      '<div class="tag-new">' +
      '<input class="input" id="newTag" placeholder="Nome della nuova etichetta…" maxlength="24" spellcheck="false">' +
      '<button class="btn primary" data-x="add">' + icon('plus', 'sm') + 'Crea</button>' +
      '</div>' +
      '<p class="hint" style="padding-bottom:12px">Clicca il quadratino per il colore, il nome per rinominare. ' +
      'Eliminando un\'etichetta la tolgo anche dalle attività che la usano.</p>' +
      '</div>',
      { noFocus: true }
    );

    function refresh() {
      U.$('#tagRows', box).innerHTML = rows();
    }

    box.querySelector('[data-x="close"]').onclick = Modal.close;

    U.$('#tagRows', box).addEventListener('click', function (e) {
      var btn = e.target.closest('[data-x]');
      if (!btn) return;
      var id = btn.closest('.tag-row').dataset.id;
      var g = Store.tag(id);
      if (!g) return;

      if (btn.dataset.x === 'color') {
        var m = Menu.open(btn, [], {
          width: 200,
          html: '<div class="menu-head">Colore</div><div class="swatches">' +
            TAG_COLORS.map(function (c) {
              return '<button class="swatch' + (c === g.color ? ' on' : '') + '" data-c="' + c + '" style="--c:' + c + '"></button>';
            }).join('') + '</div>'
        });
        m.addEventListener('click', function (ev) {
          var s = ev.target.closest('[data-c]');
          if (!s) return;
          Menu.close();
          Store.commit('colore etichetta', function () { Store.tag(id).color = s.dataset.c; });
          refresh();
        });
        return;
      }

      if (btn.dataset.x === 'del') {
        var n = tagUsage(id);
        if (!n) { removeTag(id, g.name); return; }
        Modal.close();
        Modal.confirm('Eliminare “' + U.esc(g.name) + '”?',
          'È usata da <b>' + n + '</b> attività: verrà tolta da tutte. ' +
          'Le attività restano al loro posto. Puoi annullare con <kbd>Ctrl</kbd>+<kbd>Z</kbd>.',
          'Elimina', function () {
            removeTag(id, g.name);
            App.manageTags();
          }, true);
      }
    });

    function removeTag(id, name) {
      Store.commit('eliminazione etichetta', function (st) {
        st.tags = st.tags.filter(function (x) { return x.id !== id; });
        st.tasks.forEach(function (t) {
          t.tags = t.tags.filter(function (x) { return x !== id; });
        });
      });
      var i = App.ui.filters.tags.indexOf(id);
      if (i >= 0) App.ui.filters.tags.splice(i, 1);
      App.render();
      if (!U.$('#modal').hidden && U.$('#tagRows')) refresh();
      App.toast('Etichetta “' + name + '” eliminata', 'trash', true);
    }

    U.$('#tagRows', box).addEventListener('change', function (e) {
      if (!e.target.matches('.tag-name')) return;
      var id = e.target.closest('.tag-row').dataset.id;
      var g = Store.tag(id);
      if (!g) return;
      var name = e.target.value.trim().toLowerCase().replace(/^#/, '');
      if (!name) { e.target.value = g.name; return; }
      var dup = Store.state.tags.filter(function (x) { return x.id !== id && x.name === name; })[0];
      if (dup) {
        App.toast('Esiste già un\'etichetta “' + name + '”', 'alert');
        e.target.value = g.name;
        return;
      }
      Store.commit('rinomina etichetta', function () { Store.tag(id).name = name; });
      refresh();
    });

    function addTag() {
      var input = U.$('#newTag', box);
      var v = input.value.trim().replace(/^#/, '');
      if (!v) return;
      if (Store.state.tags.some(function (g) { return g.name === v.toLowerCase(); })) {
        App.toast('Esiste già un\'etichetta “' + v.toLowerCase() + '”', 'alert');
        return;
      }
      Store.commit('nuova etichetta', function () { Store.ensureTag(v); });
      input.value = '';
      refresh();
      input.focus();
    }

    box.querySelector('[data-x="add"]').onclick = addTag;
    U.$('#newTag', box).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addTag(); }
    });
    setTimeout(function () { U.$('#newTag', box).focus(); }, 30);
  };

  /* ---------------- inserimento rapido ---------------- */

  App.quickAdd = function () {
    var target = defaultTarget();
    if (!target) { App.newProject(); return; }
    var chosenProject = target.projectId;

    Modal.open(
      '<div class="modal-head" style="padding-bottom:6px"><h2 style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px">Nuova attività</h2>' +
      '<button class="btn sm" id="qaProj"></button></div>' +
      '<div class="modal-body" style="padding-bottom:0">' +
      '<input class="qa-input" id="qaInput" placeholder="Che cosa c\'è da fare?" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="qa-chips" id="qaChips"></div>' +
      '<div class="qa-hint">' +
      '<span><b>domani</b> · <b>lun</b> · <b>12/03</b> scadenza</span>' +
      '<span><b>!alta</b> priorità</span>' +
      '<span><b>#etichetta</b></span>' +
      '<span><b>@persona</b></span>' +
      '<span><b>+progetto</b></span>' +
      '<span style="margin-left:auto"><kbd>↵</kbd> crea · <kbd>Ctrl</kbd>+<kbd>↵</kbd> crea e apri</span>' +
      '</div>',
      {
        onMount: function (box) {
          var input = U.$('#qaInput', box);
          var chips = U.$('#qaChips', box);
          var projBtn = U.$('#qaProj', box);

          function paintProj() {
            var p = Store.project(chosenProject);
            projBtn.innerHTML = p
              ? (p.icon ? '<span class="proj-emoji">' + U.esc(p.icon) + '</span>'
                : '<span class="proj-dot" style="--pc:' + p.color + '"></span>') + U.esc(p.name)
              : 'Progetto';
          }
          projBtn.onclick = function () {
            Menu.open(projBtn, Store.activeProjects().map(function (p) {
              return {
                label: p.name, color: p.color, emoji: p.icon, on: p.id === chosenProject,
                onClick: function () { chosenProject = p.id; paintProj(); input.focus(); }
              };
            }), { alignRight: true, search: 'Cerca progetto…' });
          };
          paintProj();

          function preview() {
            var r = Parse.parse(input.value, { projects: Store.activeProjects() });
            if (r.projectId) { chosenProject = r.projectId; paintProj(); }
            var out = [];
            if (r.due) out.push('<span class="pill due-today">' + icon('calendar') + U.esc(U.humanDate(r.due, { weekday: true })) + '</span>');
            if (r.priority) out.push('<span class="pill prio-' + r.priority + '">' + icon('flag') + Views.PRIO_NAME[r.priority] + '</span>');
            r.tags.forEach(function (name) {
              var g = Store.state.tags.filter(function (x) { return x.name === name; })[0];
              out.push('<span class="pill tag" style="--tc:' + (g ? g.color : 'var(--accent)') + '">' + U.esc(name) +
                (g ? '' : ' <span style="opacity:.6">nuova</span>') + '</span>');
            });
            r.assignees.forEach(function (name) {
              out.push('<span class="pill">' + icon('user') + U.esc(name) + '</span>');
            });
            chips.innerHTML = out.join('');
          }
          input.addEventListener('input', preview);

          input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(e.ctrlKey || e.metaKey);
            }
          });

          function submit(open) {
            var raw = input.value.trim();
            if (!raw) { Modal.close(); return; }
            var r = Parse.parse(raw, { projects: Store.activeProjects() });
            if (!r.title) r.title = raw;
            var newId = null;
            Store.commit('nuova attività', function () {
              var tagIds = r.tags.map(function (n) { var g = Store.ensureTag(n); return g && g.id; }).filter(Boolean);
              var assignee = r.assignees.length ? Store.ensurePerson(r.assignees[0]).id : null;
              var pid = r.projectId || chosenProject;
              var proj = Store.project(pid);
              var t = Store.createTask({
                projectId: pid,
                sectionId: proj ? proj.sections[0].id : null,
                title: r.title, due: r.due, priority: r.priority,
                tags: tagIds, assignee: assignee
              });
              newId = t.id;
            });
            input.value = '';
            chips.innerHTML = '';
            App.render();
            if (open) { Modal.close(); Detail.open(newId); }
            else { App.toast('“' + (r.title.length > 30 ? r.title.slice(0, 30) + '…' : r.title) + '” aggiunta', 'plus', true); input.focus(); }
          }
        }
      }
    );
  };

  /* ---------------- impostazioni ---------------- */

  App.settings = function () {
    var s = Store.state.settings;
    var colors = COLORS;

    Modal.open(
      '<div class="modal-head">' + icon('settings') + '<h2>Impostazioni</h2>' +
      '<button class="icon-btn" data-x="close">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' +

      '<div class="set-row"><div class="sp"><div class="nm">Colore principale</div>' +
      '<div class="ds">Tinta di accento dell\'interfaccia</div></div></div>' +
      '<div class="swatches" id="stColor" style="padding:0 0 12px">' +
      colors.map(function (c) {
        return '<button class="swatch' + (c === s.accent ? ' on' : '') + '" data-c="' + c + '" style="--c:' + c + '"></button>';
      }).join('') + '</div>' +

      '<div class="set-row"><div class="sp"><div class="nm">Densità</div>' +
      '<div class="ds">Altezza delle righe negli elenchi</div></div>' +
      '<div class="seg" id="stDensity">' +
      '<button data-v="comfortable" class="' + (s.density !== 'compact' ? 'active' : '') + '">Comoda</button>' +
      '<button data-v="compact" class="' + (s.density === 'compact' ? 'active' : '') + '">Compatta</button>' +
      '</div></div>' +

      '<div class="set-row"><div class="sp"><div class="nm">Pannello dei dettagli</div>' +
      '<div class="ds">Automatico: un click fuori lo chiude. Fisso: resta aperto fino alla ✕</div></div>' +
      '<div class="seg" id="stDetailHide">' +
      '<button data-v="auto" class="' + (s.detailAutoHide ? 'active' : '') + '">Automatico</button>' +
      '<button data-v="fixed" class="' + (s.detailAutoHide ? '' : 'active') + '">Fisso</button>' +
      '</div></div>' +

      '<div class="set-row"><div class="sp"><div class="nm">Schede dei progetti</div>' +
      '<div class="ds">Se ricordare l\'ultima scheda aperta in ogni progetto</div></div>' +
      '<div class="seg" id="stRememberView">' +
      '<button data-v="remember" class="' + (s.rememberProjectView ? 'active' : '') + '">Ricorda</button>' +
      '<button data-v="fixed" class="' + (s.rememberProjectView ? '' : 'active') + '">Sempre la stessa</button>' +
      '</div></div>' +

      // La scelta della scheda serve solo a chi non le ricorda: sta nascosta
      // finche' non si passa a "Sempre la stessa".
      '<div id="stDefaultViewRow" style="border-bottom:1px solid var(--border)"' +
      (s.rememberProjectView ? ' hidden' : '') + '>' +
      '<div class="set-row" style="border-bottom:0;padding-bottom:0"><div class="sp">' +
      '<div class="nm">Scheda all\'apertura</div>' +
      '<div class="ds">Quella con cui si apre ogni progetto</div></div></div>' +
      '<div class="seg" id="stDefaultView" style="margin:8px 0 11px">' +
      Views.PROJECT_VIEWS.map(function (v) {
        return '<button data-v="' + v.id + '" class="' + (s.defaultProjectView === v.id ? 'active' : '') + '">' +
          icon(v.ic, 'sm') + v.label + '</button>';
      }).join('') + '</div></div>' +

      '<div class="set-row"><div class="sp"><div class="nm">Archivio dati</div>' +
      '<div class="ds" id="stWhere">…</div></div>' +
      '<button class="btn sm" data-x="reveal">' + icon('folder', 'sm') + 'Apri cartella</button></div>' +
      '<div class="path-box" id="stPath" style="margin-bottom:12px">…</div>' +

      '<div class="set-row"><div class="sp"><div class="nm">Copia di sicurezza</div>' +
      '<div class="ds">Esporta o ripristina l\'intero archivio in JSON</div></div>' +
      '<button class="btn sm" data-x="export">' + icon('download', 'sm') + 'Esporta</button>' +
      '<button class="btn sm" data-x="import">' + icon('upload', 'sm') + 'Importa</button></div>' +

      '<div class="set-row"><div class="sp"><div class="nm" style="color:var(--p3)">Ricomincia da zero</div>' +
      '<div class="ds">Cancella tutte le attività e i progetti</div></div>' +
      '<button class="btn sm danger" data-x="reset">Azzera</button></div>' +

      '<div style="padding:14px 0 6px;font-size:11.5px;color:var(--text-3);line-height:1.6">' +
      'Flow · applicazione locale, nessuna connessione a internet.<br>' +
      Store.state.tasks.length + ' attività · ' + Store.state.projects.length + ' progetti · ' +
      Store.state.tags.length + ' etichette</div>' +
      '</div>',
      {
        onMount: function (box) {
          box.querySelector('[data-x="close"]').onclick = Modal.close;

          U.$('#stColor', box).onclick = function (e) {
            var b = e.target.closest('[data-c]'); if (!b) return;
            Store.quiet(function (st) { st.settings.accent = b.dataset.c; });
            applyTheme();
            U.$$('#stColor .swatch', box).forEach(function (x) { x.classList.toggle('on', x === b); });
            App.render();
          };

          U.$('#stDensity', box).onclick = function (e) {
            var b = e.target.closest('[data-v]'); if (!b) return;
            Store.quiet(function (st) { st.settings.density = b.dataset.v; });
            applyTheme();
            U.$$('#stDensity button', box).forEach(function (x) { x.classList.toggle('active', x === b); });
          };

          U.$('#stDetailHide', box).onclick = function (e) {
            var b = e.target.closest('[data-v]'); if (!b) return;
            // Preferenza d'interfaccia: fuori dalla cronologia annulla/ripristina.
            Store.quiet(function (st) { st.settings.detailAutoHide = b.dataset.v === 'auto'; });
            U.$$('#stDetailHide button', box).forEach(function (x) { x.classList.toggle('active', x === b); });
          };

          U.$('#stRememberView', box).onclick = function (e) {
            var b = e.target.closest('[data-v]'); if (!b) return;
            var remember = b.dataset.v === 'remember';
            Store.quiet(function (st) { st.settings.rememberProjectView = remember; });
            U.$$('#stRememberView button', box).forEach(function (x) { x.classList.toggle('active', x === b); });
            U.$('#stDefaultViewRow', box).hidden = remember;
            // Tornando a "Ricorda" la scheda della visita in corso non conta
            // piu': la mostra il progetto.
            App.ui.tempView = null;
            App.render();
          };

          U.$('#stDefaultView', box).onclick = function (e) {
            var b = e.target.closest('[data-v]'); if (!b) return;
            Store.quiet(function (st) { st.settings.defaultProjectView = b.dataset.v; });
            U.$$('#stDefaultView button', box).forEach(function (x) { x.classList.toggle('active', x === b); });
            // Si vede subito: la scheda scelta diventa anche quella mostrata
            // adesso, al posto di quella su cui si era arrivati.
            App.ui.tempView = null;
            App.render();
          };

          box.querySelector('[data-x="export"]').onclick = App.exportData;
          box.querySelector('[data-x="import"]').onclick = App.importData;
          box.querySelector('[data-x="reveal"]').onclick = function () {
            if (Store.backend !== 'server') { App.toast('Disponibile solo avviando Flow.exe', 'alert'); return; }
            fetch('/api/reveal', { method: 'POST' }).catch(function () {});
          };
          box.querySelector('[data-x="reset"]').onclick = function () {
            Modal.close();
            Modal.confirm('Azzerare tutto?',
              'Verranno eliminati <b>tutti</b> i progetti e le attività. L\'operazione è annullabile con <kbd>Ctrl</kbd>+<kbd>Z</kbd> finché l\'app resta aperta.',
              'Sì, azzera', function () {
                Store.commit('azzeramento', function (st) {
                  st.projects = []; st.tasks = []; st.tags = [];
                });
                Detail.close();
                App.go('today');
                App.toast('Archivio azzerato', 'trash', true);
              }, true);
          };

          if (Store.backend === 'server') {
            fetch('/api/info').then(function (r) { return r.json(); }).then(function (i) {
              U.$('#stPath', box).textContent = i.file;
              U.$('#stWhere', box).textContent = 'File JSON sul disco · ' +
                (i.backups || 0) + ' backup su ' + (i.maxBackups || 25) +
                ' · ' + U.bytes(i.backupBytes || 0) + ' in tutto';
            }).catch(function () {});
          } else {
            U.$('#stPath', box).textContent = 'Archiviazione del browser (localStorage)';
            U.$('#stWhere', box).textContent = 'Avvia “Flow.exe” per salvare su file';
          }
        }
      }
    );
  };

  App.exportData = function () {
    var blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: 'application/json' });
    var a = U.el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flow-' + U.today() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    App.toast('Archivio esportato', 'download');
  };

  App.importData = function () {
    var inp = U.el('input', { type: 'file', accept: 'application/json,.json' });
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var data;
        try { data = JSON.parse(fr.result); } catch (e) {
          App.toast('File non valido', 'alert'); return;
        }
        if (!data || !Array.isArray(data.tasks)) { App.toast('Formato non riconosciuto', 'alert'); return; }
        Modal.close();
        Modal.confirm('Importare l\'archivio?',
          'I dati attuali verranno sostituiti da <b>' + data.tasks.length + '</b> attività e <b>' +
          (data.projects || []).length + '</b> progetti. Puoi annullare con <kbd>Ctrl</kbd>+<kbd>Z</kbd>.',
          'Importa', function () {
            Store.replaceAll(data);
            Detail.close();
            applyTheme();
            App.go('today');
            App.toast('Archivio importato', 'upload', true);
          });
      };
      fr.readAsText(f);
    };
    inp.click();
  };

  /* ---------------- scorciatoie ---------------- */

  App.help = function () {
    var groups = [
      {
        h: 'Generale', k: [
          ['Palette comandi', ['Ctrl', 'K']],
          ['Nuova attività', ['N']],
          ['Cerca', ['/']],
          ['Annulla / Ripristina', ['Ctrl', 'Z']],
          ['Barra laterale', ['Ctrl', 'B']],
          ['Cambia tema', ['T']],
          ['Questa finestra', ['?']]
        ]
      },
      {
        h: 'Navigazione', k: [
          ['Oggi', ['G', 'O']],
          ['Prossimi 7 giorni', ['G', 'P']],
          ['Tutte le attività', ['G', 'A']],
          ['Completate', ['G', 'C']],
          ['Chiudi pannello', ['Esc']]
        ]
      },
      {
        h: 'Nel progetto', k: [
          ['Vista bacheca', ['1']],
          ['Vista elenco', ['2']],
          ['Vista calendario', ['3']],
          ['Vista note', ['4']],
          ['Nuovo progetto', ['Ctrl', 'Shift', 'P']]
        ]
      },
      {
        h: 'Inserimento rapido', k: [
          ['Scadenza', ['domani']],
          ['Priorità', ['!alta']],
          ['Etichetta', ['#casa']],
          ['Assegnatario', ['@Marco']],
          ['Progetto', ['+Lavoro']]
        ]
      }
    ];

    Modal.open(
      '<div class="modal-head">' + icon('keyboard') + '<h2>Scorciatoie</h2>' +
      '<button class="icon-btn" data-x="close">' + icon('x') + '</button></div>' +
      '<div class="modal-body"><div class="keys-grid">' +
      groups.map(function (g) {
        return '<div><h4>' + g.h + '</h4>' + g.k.map(function (row) {
          return '<div class="key-row"><span class="sp">' + row[0] + '</span><span class="kk">' +
            row[1].map(function (k) { return '<kbd>' + U.esc(k) + '</kbd>'; }).join('') + '</span></div>';
        }).join('') + '</div>';
      }).join('') + '</div></div>',
      { wide: true, onMount: function (box) { box.querySelector('[data-x="close"]').onclick = Modal.close; } }
    );
  };

  /* ================================================================== *
   * PALETTE COMANDI
   * ================================================================== */

  var Pal = { open: false, items: [], index: 0 };

  function commands() {
    return [
      { t: 'Nuova attività', s: 'Crea con linguaggio naturale', ic: 'plus', run: App.quickAdd },
      { t: 'Nuovo progetto', s: 'Bacheca con tre sezioni', ic: 'folder', run: App.newProject },
      { t: 'Gestisci etichette', s: 'Crea, rinomina, cambia colore, elimina', ic: 'tag', run: App.manageTags },
      { t: 'Vai a Oggi', s: 'Cruscotto giornaliero', ic: 'home', run: function () { App.go('today'); } },
      { t: 'Vai a Prossimi 7 giorni', s: '', ic: 'calendar', run: function () { App.go('upcoming'); } },
      { t: 'Vai a Tutte le attività', s: '', ic: 'layers', run: function () { App.go('all'); } },
      { t: 'Vai a Completate', s: '', ic: 'checkCircle', run: function () { App.go('completed'); } },
      { t: 'Tema scuro', s: '', ic: 'moon', run: function () { App.setTheme('dark'); } },
      { t: 'Tema chiaro', s: '', ic: 'sun', run: function () { App.setTheme('light'); } },
      { t: 'Tema automatico', s: 'Segue le impostazioni di sistema', ic: 'monitor', run: function () { App.setTheme('system'); } },
      { t: 'Esporta archivio', s: 'Scarica un file JSON', ic: 'download', run: App.exportData },
      { t: 'Importa archivio', s: 'Ripristina da un file JSON', ic: 'upload', run: App.importData },
      { t: 'Impostazioni', s: '', ic: 'settings', run: App.settings },
      { t: 'Scorciatoie da tastiera', s: '', ic: 'keyboard', run: App.help },
      { t: 'Annulla ultima modifica', s: '', ic: 'undo', run: App.undo }
    ];
  }

  function highlight(text, q) {
    if (!q) return U.esc(text);
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return U.esc(text);
    return U.esc(text.slice(0, i)) + '<mark>' + U.esc(text.slice(i, i + q.length)) + '</mark>' + U.esc(text.slice(i + q.length));
  }

  function palSearch(q) {
    var groups = [];
    var ql = q.trim().toLowerCase();

    var cmds = commands().filter(function (c) { return !ql || c.t.toLowerCase().indexOf(ql) >= 0; });
    var projects = Store.activeProjects().filter(function (p) { return ql && p.name.toLowerCase().indexOf(ql) >= 0; });
    var tasks = [];
    if (ql) {
      tasks = Store.state.tasks.filter(function (t) {
        return t.title.toLowerCase().indexOf(ql) >= 0 || (t.notes || '').toLowerCase().indexOf(ql) >= 0;
      }).sort(function (a, b) { return (a.done - b.done) || (b.priority - a.priority); }).slice(0, 20);
    }

    if (tasks.length) {
      groups.push({
        head: 'Attività', items: tasks.map(function (t) {
          var p = Store.project(t.projectId);
          return {
            ic: t.done ? 'checkCircle' : 'circle',
            title: highlight(t.title, q),
            sub: (p ? p.name : '') + (t.due ? ' · ' + U.humanDate(t.due) : ''),
            run: function () { App.go(p ? 'project' : 'all', p && p.id); Detail.open(t.id); }
          };
        })
      });
    }
    if (projects.length) {
      groups.push({
        head: 'Progetti', items: projects.map(function (p) {
          var pr = Store.progress(p.id);
          return {
            ic: 'folder', title: highlight(p.name, q), sub: pr.done + '/' + pr.total + ' completate',
            run: function () { App.go('project', p.id); }
          };
        })
      });
    }
    if (cmds.length) {
      groups.push({
        head: 'Comandi', items: cmds.map(function (c) {
          return { ic: c.ic, title: highlight(c.t, q), sub: c.s, run: c.run };
        })
      });
    }
    return groups;
  }

  function paintPalette() {
    var q = U.$('#paletteInput').value;
    var groups = palSearch(q);
    Pal.items = [];
    var html = groups.map(function (g) {
      return '<div class="pal-group">' + g.head + '</div>' + g.items.map(function (it) {
        var i = Pal.items.push(it) - 1;
        return '<button class="pal-item" data-i="' + i + '">' + icon(it.ic) +
          '<span class="pal-main"><span class="pal-title">' + it.title + '</span>' +
          (it.sub ? '<span class="pal-sub">' + U.esc(it.sub) + '</span>' : '') + '</span></button>';
      }).join('');
    }).join('');
    U.$('#paletteResults').innerHTML = html ||
      '<div class="empty" style="padding:26px">' + icon('search') + '<p>Nessun risultato</p></div>';
    Pal.index = 0;
    hlPalette();
  }

  function hlPalette() {
    var nodes = U.$$('#paletteResults .pal-item');
    nodes.forEach(function (n, i) { n.classList.toggle('hl', i === Pal.index); });
    if (nodes[Pal.index]) nodes[Pal.index].scrollIntoView({ block: 'nearest' });
  }

  App.openPalette = function () {
    Pal.open = true;
    U.$('#palette').hidden = false;
    var inp = U.$('#paletteInput');
    inp.value = '';
    paintPalette();
    setTimeout(function () { inp.focus(); }, 10);
  };

  App.closePalette = function () {
    Pal.open = false;
    U.$('#palette').hidden = true;
  };

  U.$('#paletteInput').addEventListener('input', paintPalette);
  U.$('#palette').addEventListener('mousedown', function (e) {
    if (e.target === U.$('#palette')) App.closePalette();
  });
  U.$('#paletteResults').addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (!b) return;
    var it = Pal.items[+b.dataset.i];
    App.closePalette();
    if (it) it.run();
  });
  U.$('#paletteInput').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); Pal.index = Math.min(Pal.items.length - 1, Pal.index + 1); hlPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); Pal.index = Math.max(0, Pal.index - 1); hlPalette(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var it = Pal.items[Pal.index];
      App.closePalette();
      if (it) it.run();
    } else if (e.key === 'Escape') { e.preventDefault(); App.closePalette(); }
  });

  /* ================================================================== *
   * EVENTI GLOBALI (delega)
   * ================================================================== */

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    var id = el.dataset.id;

    switch (act) {
      case 'nav':
        return App.go(el.dataset.route, id);

      case 'toggle-sidebar':
        return App.toggleSidebar();

      case 'toggle-group': {
        var g = el.dataset.group;
        App.ui.collapsed[g] = !App.ui.collapsed[g];
        return Views.sidebar();
      }

      // Preferenza d'interfaccia: fuori dalla cronologia annulla/ripristina.
      case 'toggle-projects-lock': {
        Store.quiet(function (st) { st.settings.projectsLocked = !st.settings.projectsLocked; });
        Views.sidebar();
        return App.toast(Store.state.settings.projectsLocked
          ? 'Riordino dei progetti bloccato'
          : 'Riordino dei progetti attivo: trascina i progetti',
          Store.state.settings.projectsLocked ? 'lock' : 'unlock');
      }

      case 'theme':
        return App.setTheme(el.dataset.theme);

      case 'quick-add':
        return App.quickAdd();

      case 'new-project':
        return App.newProject();

      case 'manage-tags':
        return App.manageTags();

      case 'settings':
        return App.settings();

      case 'help':
        return App.help();

      case 'toggle-done': {
        e.stopPropagation();
        var t = Store.task(id);
        if (!t) return;
        var willDone = !t.done;
        Store.commit(willDone ? 'completamento' : 'riapertura', function () {
          Store.updateTask(id, { done: willDone });
        });
        App.render();
        if (willDone) App.toast('Completata: ' + (t.title.length > 26 ? t.title.slice(0, 26) + '…' : t.title), 'checkCircle', true);
        return;
      }

      case 'open-task':
        return Detail.open(id);

      case 'toggle-tag': {
        var arr = App.ui.filters.tags;
        var i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1); else arr.push(id);
        return App.render();
      }

      case 'clear-search':
        App.ui.search = '';
        return App.render();

      case 'clear-priority':
        App.ui.filters.priority = null;
        return App.render();

      case 'clear-assignee':
        App.ui.filters.assignee = null;
        return App.render();

      case 'clear-filters':
        App.ui.search = '';
        App.ui.filters = { tags: [], priority: null, assignee: null };
        return App.render();

      case 'filters':
        return openFilterMenu(el);

      case 'set-view': {
        var p = currentProject();
        if (!p) return;
        return App.setProjectView(p, el.dataset.view);
      }

      /* ---- scheda Note del progetto ---- */

      case 'edit-proj-notes':
        return editProjectNotes();

      case 'add-link': {
        var lp = currentProject();
        if (lp) linkModal(lp, null);
        return;
      }

      case 'open-link': {
        var op = currentProject();
        var ol = op && linkOf(op, id);
        if (ol) openLink(ol);
        return;
      }

      case 'links-sort': {
        var sp = currentProject();
        if (sp) openLinksSortMenu(el, sp);
        return;
      }

      case 'link-menu': {
        e.stopPropagation();
        var mp = currentProject();
        var ml = mp && linkOf(mp, id);
        if (ml) openLinkMenu(el, mp, ml);
        return;
      }

      case 'add-task': {
        var proj = currentProject();
        if (!proj) return;
        return App.createTaskInline(proj.id, el.dataset.section);
      }

      case 'add-section': {
        var pr = currentProject();
        if (!pr) return;
        var sid = U.uid('s');
        Store.commit('nuova sezione', function () {
          var max = pr.sections.reduce(function (m, s) { return Math.max(m, s.order); }, 0);
          pr.sections.push({ id: sid, name: 'Nuova sezione', order: max + 1000, sort: 'manual' });
        });
        App.render();
        var input = U.$('[data-act="rename-section"][data-id="' + sid + '"]');
        if (input) { input.focus(); input.select(); }
        return;
      }

      case 'section-menu':
        return openSectionMenu(el, id);

      case 'section-sort':
        return openSortMenu(el, id);

      case 'project-menu':
        return openProjectMenu(el, currentProject());

      case 'project-icon':
        return pickEmoji(el, currentProject());

      case 'cal-prev':
      case 'cal-next': {
        var parts = App.ui.calMonth.split('-');
        var d = new Date(+parts[0], +parts[1] - 1 + (act === 'cal-next' ? 1 : -1), 1);
        App.ui.calMonth = U.toKey(d).slice(0, 7);
        return App.renderContent();
      }

      case 'cal-today':
        App.ui.calMonth = U.today().slice(0, 7);
        return App.renderContent();
    }
  });

  /* rinomina in linea (sezioni e progetto) */
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches('[data-act="rename-section"]')) {
      var p = currentProject();
      if (!p) return;
      var name = el.value.trim() || 'Sezione';
      Store.commit('rinomina sezione', function () {
        p.sections.forEach(function (s) { if (s.id === el.dataset.id) s.name = name; });
      });
      return App.render();
    }
    if (el.matches('[data-act="rename-project"]')) {
      var pr = currentProject();
      if (!pr) return;
      var nm = el.value.trim() || 'Progetto';
      Store.commit('rinomina progetto', function () { pr.name = nm; });
      return App.render();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('[data-act="rename-section"],[data-act="rename-project"]')) {
      e.preventDefault();
      e.target.blur();
    }
  }, true);

  /* ricerca */
  var doSearch = U.debounce(function () {
    Views.sidebar();
    App.renderContent();
  }, 140);

  document.addEventListener('input', function (e) {
    if (e.target.id === 'searchInput') {
      App.ui.search = e.target.value;
      doSearch();
    }
  });

  /* menu contestuale sui progetti della barra laterale */
  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest('#tagList')) {   // tasto destro su un'etichetta: aprine la gestione
      e.preventDefault();
      return App.manageTags();
    }
    var el = e.target.closest('[data-ctx="project"]');
    if (!el) return;
    e.preventDefault();
    openProjectMenu({ getBoundingClientRect: function () { return { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }; } },
      Store.project(el.dataset.id));
  });

  U.$('#scrim').addEventListener('click', function () {
    Detail.close();
    U.$('#app').classList.remove('side-open');
  });

  /* ---------------- menu ---------------- */

  function openFilterMenu(anchor) {
    var f = App.ui.filters;
    var items = [{ head: 'Priorità' }];
    [3, 2, 1, 0].forEach(function (n) {
      items.push({
        label: Views.PRIO_NAME[n], ic: 'flag', on: f.priority === n,
        onClick: function () { f.priority = f.priority === n ? null : n; App.render(); }
      });
    });
    if (Store.state.people.length) {
      items.push({ head: 'Assegnatario' });
      Store.state.people.forEach(function (p) {
        items.push({
          label: p.name, color: p.color, on: f.assignee === p.id,
          onClick: function () { f.assignee = f.assignee === p.id ? null : p.id; App.render(); }
        });
      });
    }
    items.push({ sep: true });
    items.push({
      label: 'Azzera tutti i filtri', ic: 'x', onClick: function () {
        App.ui.filters = { tags: [], priority: null, assignee: null };
        App.ui.search = '';
        App.render();
      }
    });
    Menu.open(anchor, items, { alignRight: true });
  }

  /* L'ordinamento di una sezione finisce nell'archivio e nella cronologia
     annulla/ripristina: è una scelta di contenuto, non una preferenza
     d'interfaccia. */
  function openSortMenu(anchor, sectionId) {
    var p = currentProject();
    if (!p) return;
    var s = Store.section(p.id, sectionId);
    if (!s) return;
    Menu.open(anchor, [{ head: 'Ordina la sezione' }].concat(Views.SORTS.map(function (o) {
      return {
        label: o.label, ic: o.ic, on: (s.sort || 'manual') === o.key,
        onClick: function () {
          if ((s.sort || 'manual') === o.key) return;
          Store.commit('ordinamento sezione', function () { s.sort = o.key; });
          App.render();
        }
      };
    })), { alignRight: true });
  }

  function openSectionMenu(anchor, sectionId) {
    var p = currentProject();
    if (!p) return;
    // Ordine visivo (per "order"), non ordine dell'array: le due sequenze
    // divergono dopo il primo spostamento.
    var sorted = p.sections.slice().sort(function (a, b) { return a.order - b.order; });
    var idx = sorted.findIndex(function (s) { return s.id === sectionId; });
    // In vista elenco le sezioni stanno una sotto l'altra.
    var giu = App.projectView(p) === 'list';
    Menu.open(anchor, [
      { label: 'Aggiungi attività', ic: 'plus', onClick: function () { App.createTaskInline(p.id, sectionId); } },
      {
        label: 'Rinomina', ic: 'edit', onClick: function () {
          var inp = U.$('[data-act="rename-section"][data-id="' + sectionId + '"]');
          if (inp) { inp.focus(); inp.select(); }
        }
      },
      { sep: true },
      {
        label: giu ? 'Sposta su' : 'Sposta a sinistra',
        ic: giu ? 'chevronUp' : 'chevronLeft',
        disabled: idx <= 0,
        onClick: function () { moveSection(p, sectionId, -1); }
      },
      {
        label: giu ? 'Sposta giù' : 'Sposta a destra',
        ic: giu ? 'chevronDown' : 'chevronRight',
        disabled: idx < 0 || idx >= sorted.length - 1,
        onClick: function () { moveSection(p, sectionId, 1); }
      },
      { sep: true },
      {
        label: 'Completa tutte', ic: 'checkCircle', onClick: function () {
          Store.commit('completamento sezione', function () {
            Store.state.tasks.forEach(function (t) {
              if (t.projectId === p.id && t.sectionId === sectionId && !t.done) Store.updateTask(t.id, { done: true });
            });
          });
          App.render();
          App.toast('Sezione completata', 'checkCircle', true);
        }
      },
      {
        label: 'Elimina sezione', ic: 'trash', danger: true, onClick: function () {
          if (p.sections.length <= 1) { App.toast('Serve almeno una sezione', 'alert'); return; }
          var count = Store.state.tasks.filter(function (t) { return t.projectId === p.id && t.sectionId === sectionId; }).length;
          Modal.confirm('Eliminare la sezione?',
            count ? 'Le <b>' + count + '</b> attività contenute verranno spostate nella prima sezione.'
              : 'La sezione è vuota.',
            'Elimina', function () {
              Store.commit('eliminazione sezione', function () {
                var fallback = p.sections.filter(function (s) { return s.id !== sectionId; })[0];
                Store.state.tasks.forEach(function (t) {
                  if (t.projectId === p.id && t.sectionId === sectionId) t.sectionId = fallback.id;
                });
                p.sections = p.sections.filter(function (s) { return s.id !== sectionId; });
              });
              App.render();
              App.toast('Sezione eliminata', 'trash', true);
            }, true);
        }
      }
    ], { alignRight: true });
  }

  // Si lavora solo sull'ordine visivo e si parte dall'id: passare fra le funzioni
  // un indice dell'array e usarlo su una lista ordinata per "order" spostava la
  // sezione sbagliata dal secondo spostamento in poi.
  function moveSection(p, sectionId, dir) {
    var sorted = p.sections.slice().sort(function (a, b) { return a.order - b.order; });
    var idx = sorted.findIndex(function (s) { return s.id === sectionId; });
    var target = idx + dir;
    if (idx < 0 || target < 0 || target >= sorted.length) return;
    Store.commit('riordino sezioni', function () {
      var tmp = sorted[idx];
      sorted[idx] = sorted[target];
      sorted[target] = tmp;
      // Rinumerazione: array e "order" restano sempre in fase, così il difetto
      // non può ripresentarsi.
      sorted.forEach(function (s, i) { s.order = (i + 1) * 1000; });
      p.sections = sorted;
    });
    App.render();
  }

  function openProjectMenu(anchor, p) {
    if (!p) return;
    var colors = COLORS;
    var m = Menu.open(anchor, [
      {
        label: 'Rinomina', ic: 'edit', onClick: function () {
          if (App.ui.route.id !== p.id) App.go('project', p.id);
          setTimeout(function () {
            var inp = U.$('[data-act="rename-project"]');
            if (inp) { inp.focus(); inp.select(); }
          }, 60);
        }
      },
      { label: 'Cambia icona', ic: 'sparkles', onClick: function () { pickEmoji(anchor, p); } },
      { sep: true },
      {
        label: 'Completa tutte le attività', ic: 'checkCircle', onClick: function () {
          Store.commit('completamento progetto', function () {
            Store.tasksOf(p.id).forEach(function (t) { if (!t.done) Store.updateTask(t.id, { done: true }); });
          });
          App.render();
          App.toast('Progetto completato', 'checkCircle', true);
        }
      },
      {
        label: 'Elimina progetto', ic: 'trash', danger: true, onClick: function () {
          var count = Store.tasksOf(p.id).length;
          Modal.confirm('Eliminare “' + U.esc(p.name) + '”?',
            'Verranno eliminate anche le <b>' + count + '</b> attività contenute. Puoi annullare con <kbd>Ctrl</kbd>+<kbd>Z</kbd>.',
            'Elimina', function () {
              Store.commit('eliminazione progetto', function (st) {
                st.tasks = st.tasks.filter(function (t) { return t.projectId !== p.id; });
                st.projects = st.projects.filter(function (x) { return x.id !== p.id; });
              });
              if (App.ui.route.id === p.id) App.go('today'); else App.render();
              App.toast('Progetto eliminato', 'trash', true);
            }, true);
        }
      }
    ], {
      alignRight: true,
      html: '<div class="menu-head">Colore</div><div class="swatches">' +
        colors.map(function (c) {
          return '<button class="swatch' + (c === p.color ? ' on' : '') + '" data-pc="' + c + '" style="--c:' + c + '"></button>';
        }).join('') + '</div><div class="menu-sep"></div>'
    });

    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pc]');
      if (!b) return;
      Store.commit('colore progetto', function () { p.color = b.dataset.pc; });
      Menu.close();
      App.render();
    });
  }

  function pickEmoji(anchor, p) {
    if (!p) return;
    var emojis = EMOJIS;
    var m = Menu.open(anchor, [], {
      width: 292,
      html: '<div class="menu-head">Icona del progetto</div>' +
        '<div class="swatches emoji">' +
        emojis.map(function (e) {
          return '<button class="swatch" data-em="' + e + '" style="background:var(--surface-2);font-size:15px">' + e + '</button>';
        }).join('') + '</div>' +
        '<div class="menu-sep"></div>' +
        '<button class="menu-item" data-em="">' + icon('x') + '<span class="sp">Nessuna icona</span></button>'
    });
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-em]');
      if (!b) return;
      Store.commit('icona progetto', function () { p.icon = b.dataset.em; });
      Menu.close();
      App.render();
    });
  }

  /* ================================================================== *
   * SCHEDA NOTE: APPUNTI E COLLEGAMENTI
   * ================================================================== */

  function linkOf(p, id) {
    return (p.links || []).filter(function (l) { return l.id === id; })[0] || null;
  }

  /* Stesso gioco delle note di un'attivita': la vista markdown viene
     sostituita da un textarea, e il salvataggio avviene sul blur. */
  function editProjectNotes() {
    var p = currentProject();
    var holder = U.$('[data-act="edit-proj-notes"].np-notes');
    if (!p || !holder) return;

    var ta = U.el('textarea', { class: 'notes-edit np-notes-edit' });
    ta.value = p.notes || '';
    holder.replaceWith(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.style.height = Math.max(220, ta.scrollHeight) + 'px';

    var closed = false;
    function done(save) {
      if (closed) return;
      closed = true;
      // Con Esc il fuoco e' ancora nel campo, e il guardiano di renderContent
      // bloccherebbe il ridisegno lasciando il textarea a schermo. Il gestore
      // del blur non rientra: "closed" e' gia' vero.
      ta.blur();
      if (save && ta.value !== (p.notes || '')) {
        Store.commit('appunti del progetto', function () { p.notes = ta.value; });
      }
      App.render();
    }
    ta.addEventListener('blur', function () { done(true); });
    ta.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); done(false); }
      // Invio da solo va a capo: sono appunti, non un campo a riga singola.
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); ta.blur(); }
    });
  }

  /* ---------------- collegamenti a cartelle e file ---------------- */

  var LINK_COLORS = TAG_COLORS;

  /** Senza host non c'e' nessun Esplora risorse da aprire. */
  function needsHost() {
    if (Store.backend === 'server') return false;
    App.toast('Disponibile solo avviando Flow.exe', 'alert');
    return true;
  }

  /* Tipo indovinato dal solo testo: un indirizzo web si riconosce dallo schema,
     per un percorso l'unico indizio e' l'estensione. E' la risposta immediata;
     se l'host c'e', askKind la corregge guardando il disco. */
  function guessKind(path) {
    var v = Store.cleanPath(path);
    if (Store.isUrl(v)) return 'url';
    return /[.][A-Za-z0-9]{1,8}$/.test(v.replace(/[\\/]+$/, '')) ? 'file' : 'dir';
  }

  /* Tipo certo: lo dice l'host guardando il disco, perche' l'estensione sbaglia
     sia su una cartella chiamata "versione 1.2" sia su un file senza estensione.
     done riceve 'dir' o 'file' se il percorso esiste davvero, altrimenti null —
     indirizzo web, percorso inesistente, nessun host — e allora vale guessKind.
     Risponde sempre, cosi' chi salva puo' aspettare la risposta. */
  function askKind(path, done) {
    var v = Store.cleanPath(path);
    if (!v || Store.isUrl(v) || Store.backend !== 'server') { done(null); return; }
    fetch('/api/kind', { method: 'POST', body: v })
      .then(function (r) { return r.json(); })
      .then(function (res) { done(res && res.exists && res.kind ? res.kind : null); })
      .catch(function () { done(null); });
  }

  /* Cosa dire di come si e' capito il tipo, prima che risponda l'host. */
  function hintFor(path) {
    if (Store.isUrl(path)) return 'È un indirizzo web: si vede dallo schema.';
    return 'Dedotto dal percorso: correggilo se sbaglia.';
  }

  function openLink(l) {
    /* Un indirizzo web non passa dall'host: la finestra nuova e' intercettata
       da NewWindowRequested, che apre il browser predefinito e non una finestra
       di WebView2. Aprendo index.html in un browser normale e' una scheda,
       quindi i collegamenti web funzionano anche senza Flow.exe. */
    if (l.kind === 'url') {
      try { window.open(l.path, '_blank', 'noopener'); }
      catch (err) { App.toast('Non si apre: indirizzo non valido', 'alert'); }
      return;
    }

    if (needsHost()) return;
    fetch('/api/open', { method: 'POST', body: l.path }).then(function (r) {
      if (r.ok) return null;
      return r.json().catch(function () { return null; });
    }).then(function (j) {
      if (j) App.toast('Non si apre: ' + (j.error || 'percorso non raggiungibile'), 'alert');
    }).catch(function () {
      App.toast('Non si apre: host non raggiungibile', 'alert');
    });
  }

  function openLinkMenu(anchorEl, p, l) {
    Menu.open(anchorEl, [
      { head: 'Collegamento' },
      { ic: 'edit', label: 'Modifica', onClick: function () { linkModal(p, l); } },
      {
        ic: 'copy', label: 'Copia percorso', onClick: function () {
          try { navigator.clipboard.writeText(l.path); App.toast('Percorso copiato', 'copy'); }
          catch (err) { App.toast('Copia non riuscita', 'alert'); }
        }
      },
      { sep: true },
      { ic: 'trash', label: 'Rimuovi', danger: true, onClick: function () { removeLink(p, l); } }
    ], { width: 220 });
  }

  function openLinksSortMenu(anchorEl, p) {
    Menu.open(anchorEl, [{ head: 'Ordina i collegamenti' }].concat(
      Views.LINK_SORTS.map(function (o) {
        return {
          ic: o.ic, label: o.label, on: (p.linksSort || 'manual') === o.key,
          onClick: function () {
            Store.commit('ordinamento collegamenti', function () { p.linksSort = o.key; });
            App.render();
          }
        };
      })
    ), { width: 230 });
  }

  function removeLink(p, l) {
    Store.commit('collegamento rimosso', function () {
      p.links = p.links.filter(function (x) { return x.id !== l.id; });
    });
    App.render();
    App.toast('Collegamento rimosso', 'trash', true);
  }

  /**
   * Finestra di un collegamento, la stessa per crearlo e per modificarlo.
   * Il percorso si mette in tre modi: selettore nativo, incolla, o a mano.
   */
  function linkModal(p, existing) {
    var color = (existing && existing.color) || p.color;
    var kind = (existing && existing.kind) || 'dir';
    // L'etichetta segue il percorso finche' non la si scrive a mano; su un
    // collegamento che esiste gia' e' roba dell'utente e non si tocca.
    var ownLabel = !!existing;
    // Il tipo invece segue sempre il percorso — anche riaprendo un
    // collegamento, se il percorso viene cambiato — e si ferma solo quando lo
    // si sceglie a mano qui sotto.
    var ownKind = false;

    Modal.open(
      '<div class="modal-head"><h2>' + (existing ? 'Modifica collegamento' : 'Nuovo collegamento') + '</h2></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label>Percorso o indirizzo</label>' +
      '<input class="input mono" id="lkPath" spellcheck="false" ' +
      'placeholder="C:\\Progetti\\Casa   oppure   https://esempio.it" value="' +
      (existing ? U.esc(existing.path) : '') + '">' +
      '<div class="hint">Un indirizzo web si incolla e basta: per quello non c\'e\' selettore.</div></div>' +
      '<div class="field"><div class="lk-browse">' +
      '<button class="btn sm" data-x="pick-dir">' + icon('folder', 'sm') + 'Scegli cartella\u2026</button>' +
      '<button class="btn sm" data-x="pick-file">' + icon('file', 'sm') + 'Scegli file\u2026</button>' +
      '</div></div>' +
      '<div class="field"><label>Tipo</label><div class="seg" id="lkKind">' +
      Views.LINK_KINDS.map(function (k) {
        return '<button data-v="' + k.key + '">' + icon(k.ic, 'sm') + U.esc(k.label) + '</button>';
      }).join('') +
      '</div><div class="hint" id="lkKindHint"></div></div>' +
      '<div class="field"><label>Etichetta</label>' +
      '<input class="input" id="lkLabel" maxlength="40" placeholder="Come lo vuoi chiamare" value="' +
      (existing ? U.esc(existing.label) : '') + '"></div>' +
      '<div class="field"><label>Colore</label><div class="swatches" id="lkColor">' +
      LINK_COLORS.map(function (c) {
        return '<button class="swatch' + (c === color ? ' on' : '') + '" data-c="' + c + '" style="--c:' + c + '"></button>';
      }).join('') + '</div></div>' +
      '</div>' +
      '<div class="modal-foot">' +
      (existing ? '<button class="btn danger" data-x="del">Rimuovi</button>' : '') +
      '<button class="btn" data-x="cancel">Annulla</button>' +
      '<button class="btn primary" data-x="save">Salva</button></div>',
      {
        onMount: function (box) {
          var pathInput = U.$('#lkPath', box);
          var labelInput = U.$('#lkLabel', box);

          var kindHint = U.$('#lkKindHint', box);

          function setKind(v, why) {
            kind = Views.kindInfo(v).key;
            U.$$('#lkKind button', box).forEach(function (b) {
              b.classList.toggle('active', b.dataset.v === kind);
            });
            kindHint.textContent = why || '';
          }
          setKind(kind, 'Si imposta da sé in base al percorso.');

          U.$('#lkKind', box).onclick = function (ev) {
            var b = ev.target.closest('[data-v]');
            if (!b) return;
            ownKind = true;
            setKind(b.dataset.v, 'Scelto a mano.');
          };

          /* Riconoscimento del tipo: prima l'estensione, subito, poi la
             risposta dell'host, che guarda il disco e sa la verita'. La
             richiesta parte a mano ferma, e quando torna si controlla che il
             percorso sia ancora quello: la risposta di uno precedente non deve
             sovrascrivere un tipo piu' recente. */
          var autoKind = U.debounce(function (asked) {
            askKind(asked, function (found) {
              if (!found || ownKind || Store.cleanPath(pathInput.value) !== asked) return;
              setKind(found, found === 'dir' ? 'È una cartella: trovata su disco.' : 'È un file: trovato su disco.');
            });
          }, 300);

          U.$('#lkColor', box).onclick = function (ev) {
            var b = ev.target.closest('[data-c]');
            if (!b) return;
            color = b.dataset.c;
            U.$$('#lkColor .swatch', box).forEach(function (x) { x.classList.toggle('on', x === b); });
          };

          labelInput.addEventListener('input', function () { ownLabel = true; });
          pathInput.addEventListener('input', function () {
            var v = Store.cleanPath(pathInput.value);
            if (!ownLabel) labelInput.value = v ? Store.pathLeaf(v) : '';
            if (ownKind) return;
            setKind(guessKind(v), v ? hintFor(v) : '');
            autoKind(v);
          });

          function pick(what) {
            if (needsHost()) return;
            fetch('/api/pick', { method: 'POST', body: what })
              .then(function (r) { return r.json(); })
              .then(function (res) {
                if (!res || !res.path) return;   // finestra annullata
                pathInput.value = res.path;
                // Il selettore sa con certezza cosa e' stato scelto — ma non
                // conta come scelta a mano: se poi il percorso viene riscritto,
                // il tipo torna a seguirlo.
                setKind(what, what === 'dir' ? 'Cartella, scelta col selettore.' : 'File, scelto col selettore.');
                if (!ownLabel) labelInput.value = Store.pathLeaf(res.path);
                pathInput.focus();
              })
              .catch(function () { App.toast('Selettore non disponibile', 'alert'); });
          }
          U.$('[data-x="pick-dir"]', box).onclick = function () { pick('dir'); };
          U.$('[data-x="pick-file"]', box).onclick = function () { pick('file'); };

          if (existing) {
            U.$('[data-x="del"]', box).onclick = function () {
              Modal.close();
              removeLink(p, existing);
            };
          }
          U.$('[data-x="cancel"]', box).onclick = Modal.close;
          U.$('[data-x="save"]', box).onclick = save;
          pathInput.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); save(); }
          });
          labelInput.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); save(); }
          });

          /* Si salva anche con Invio, che puo' arrivare prima che la verifica
             del tipo sia tornata: qui la si aspetta, cosi' nell'archivio non
             finisce un tipo dedotto quando l'host sapeva quello giusto. */
          var saving = false;
          function save() {
            var path = Store.cleanPath(pathInput.value);
            if (!path) { App.toast('Serve un percorso o un indirizzo', 'alert'); pathInput.focus(); return; }
            if (saving) return;
            if (ownKind) { write(path); return; }
            saving = true;
            askKind(path, function (found) {
              saving = false;
              if (found) kind = found;
              write(path);
            });
          }

          function write(path) {
            if (kind === 'url' && !Store.isUrl(path)) {
              // Senza schema window.open lo prenderebbe per un percorso
              // relativo alla pagina e finirebbe su https://flow.example/.
              path = 'https://' + path.replace(/^[/]+/, '');
            }
            // E il contrario: un indirizzo web incollato con il tipo su
            // "Cartella" non e' una cartella, qualunque cosa dica il selettore.
            if (kind !== 'url' && Store.isUrl(path)) kind = 'url';

            var label = labelInput.value.trim() || Store.pathLeaf(path);
            Store.commit(existing ? 'collegamento' : 'nuovo collegamento', function () {
              if (existing) {
                existing.path = path; existing.label = label;
                existing.color = color; existing.kind = kind;
              } else {
                if (!Array.isArray(p.links)) p.links = [];
                p.links.push({ id: U.uid('l'), path: path, label: label, color: color, kind: kind });
              }
            });
            Modal.close();
            App.render();
          }
        }
      }
    );
  }

  /* ================================================================== *
   * TRASCINAMENTO
   * ================================================================== */

  var drag = { id: null, projId: null, line: null, zone: null, afterId: null };

  document.addEventListener('dragstart', function (e) {
    // Progetti della barra laterale: il <li> porta data-projdrag solo a
    // lucchetto aperto, quindi da bloccato non parte nessun trascinamento.
    var pnode = e.target.closest('[data-projdrag]');
    if (pnode) {
      drag.projId = pnode.dataset.projdrag;
      drag.id = null; drag.zone = null; drag.afterId = null;
      pnode.classList.add('dragging');
      document.body.classList.add('is-dragging-proj');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', drag.projId); } catch (err) {}
      return;
    }

    var node = e.target.closest('[data-task]');
    if (!node) return;
    drag.id = node.dataset.task;
    drag.zone = null;
    drag.afterId = null;
    node.classList.add('dragging');
    // Serve al CSS per mostrare il riquadro tratteggiato delle sezioni vuote.
    document.body.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', drag.id); } catch (err) {}
  });

  document.addEventListener('dragend', endDrag);

  function endDrag() {
    U.$$('.dragging').forEach(function (n) { n.classList.remove('dragging'); });
    U.$$('.drop-active').forEach(function (n) { n.classList.remove('drop-active'); });
    if (drag.line) { drag.line.remove(); drag.line = null; }
    drag.id = null; drag.projId = null; drag.zone = null; drag.afterId = null;
    document.body.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-proj');
    edgeStop();
  }

  /* La zona di rilascio di una sezione vale anche quando il puntatore sta sulla
     testata o sul pulsante "Aggiungi attività": una sezione vuota era alta pochi
     pixel e non si riusciva a centrarla. */
  function zoneAt(el) {
    if (!el || !el.closest) return null;
    var zone = el.closest('[data-drop]');
    if (zone) return zone;
    var host = el.closest('.column, .list-section');
    return host ? U.$('[data-drop]', host) : null;
  }

  /** Vero se la sezione della zona ha un ordinamento diverso da Manuale. */
  function isSorted(zone) {
    var p = currentProject();
    var s = p && Store.section(p.id, zone.dataset.drop);
    return !!(s && s.sort && s.sort !== 'manual');
  }

  function afterElement(container, y, sel) {
    var els = U.$$((sel || '[data-task]') + ':not(.dragging)', container);
    var best = null, bestDist = -Infinity;
    els.forEach(function (child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > bestDist) { bestDist = offset; best = child; }
    });
    return best;
  }

  document.addEventListener('dragover', function (e) {
    if (drag.projId) return projectDragOver(e);
    if (!drag.id) return;

    var day = e.target.closest('[data-day]');
    if (day) {
      e.preventDefault();
      U.$$('.drop-active').forEach(function (n) { if (n !== day) n.classList.remove('drop-active'); });
      day.classList.add('drop-active');
      if (drag.line) { drag.line.remove(); drag.line = null; }
      drag.zone = null;
      edgeScroll(e);
      return;
    }

    var zone = zoneAt(e.target);
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Evidenza: la colonna in bacheca, la zona stessa in vista elenco.
    var mark = zone.closest('.column') || zone;
    U.$$('.drop-active').forEach(function (n) { if (n !== mark) n.classList.remove('drop-active'); });
    mark.classList.add('drop-active');

    var after = afterElement(zone, e.clientY);
    drag.zone = zone;
    drag.afterId = after ? after.dataset.task : null;

    // In una sezione vuota il riquadro tratteggiato dice già dove si finisce:
    // la linea di inserimento lo spezzerebbe in due. In una sezione ordinata
    // prometterebbe una posizione che il criterio non rispetterà.
    if (zone.classList.contains('is-empty') || isSorted(zone)) {
      if (drag.line) { drag.line.remove(); drag.line = null; }
    } else {
      if (!drag.line) drag.line = U.el('div', { class: 'drop-line' });
      if (after) zone.insertBefore(drag.line, after);
      else zone.appendChild(drag.line);
    }

    edgeScroll(e);
  });

  document.addEventListener('drop', function (e) {
    if (drag.projId) return projectDrop(e);
    if (!drag.id) return;
    var id = drag.id;

    var day = e.target.closest('[data-day]');
    if (day) {
      e.preventDefault();
      var key = day.dataset.day;
      Store.commit('scadenza', function () { Store.updateTask(id, { due: key }); });
      App.render();
      App.toast('Spostata al ' + U.humanDate(key), 'calendar', true);
      return;
    }

    // Zona e riferimento arrivano dall'ultimo dragover: sono esattamente il
    // punto in cui si vedeva la linea di inserimento.
    var zone = drag.zone, refId = drag.afterId;
    if (!zone) {
      zone = zoneAt(e.target);
      var refEl = zone && afterElement(zone, e.clientY);
      refId = refEl ? refEl.dataset.task : null;
    }
    if (!zone) return;
    e.preventDefault();

    var p = currentProject();
    var moving = Store.task(id);
    if (!p || !moving) return;
    var sectionId = zone.dataset.drop;

    // Con un ordinamento di sezione diverso da "Manuale" il posto lo decide il
    // criterio: riordinare a mano dentro la stessa sezione non avrebbe effetto.
    var sec = Store.section(p.id, sectionId);
    if (sec && sec.sort && sec.sort !== 'manual' &&
      moving.projectId === p.id && moving.sectionId === sectionId) {
      App.toast('Ordinamento attivo: passa a Manuale per riordinare a mano', 'alert');
      return;
    }

    // L'ordine si calcola sul modello, non sul DOM: le completate stanno in
    // fondo conservando il loro "order", quindi la sequenza lungo il DOM non è
    // monotòna e U.orderBetween riceveva coppie incoerenti (es. 3000 e 0),
    // facendo saltare l'attività in un punto qualunque.
    var group = !!moving.done;
    var siblings = Store.tasksOf(p.id).filter(function (t) {
      return t.sectionId === sectionId && t.id !== id && !!t.done === group;
    }).sort(function (a, b) { return a.order - b.order; });

    // Rilasciata in fondo, o nella zona dell'altro gruppo: va in coda al proprio.
    var ref = refId ? Store.task(refId) : null;
    var idx = ref && !!ref.done === group ? siblings.indexOf(ref) : -1;
    if (idx < 0) idx = siblings.length;

    var before = idx > 0 ? siblings[idx - 1].order : null;
    var after = idx < siblings.length ? siblings[idx].order : null;
    var newOrder = U.orderBetween(before, after);

    // Difesa dalle collisioni: le medie ripetute avvicinano i valori fino a
    // farli coincidere, e due attività con lo stesso "order" si scambiano di
    // posto a ogni ridisegno. Costa una rinumerazione ogni molti spostamenti.
    var tight = (before != null && Math.abs(newOrder - before) < 1) ||
      (after != null && Math.abs(after - newOrder) < 1);

    Store.commit('spostamento', function () {
      Store.updateTask(id, { projectId: p.id, sectionId: sectionId, order: newOrder });
      if (tight) renumberSection(p.id, sectionId);
    });
    App.render();
  });

  /** Rinumera una sezione a passi di 1000 conservando l'ordine visivo. */
  function renumberSection(projectId, sectionId) {
    Store.tasksOf(projectId)
      .filter(function (t) { return t.sectionId === sectionId; })
      .sort(function (a, b) { return (a.done - b.done) || (a.order - b.order); })
      .forEach(function (t, i) { t.order = (i + 1) * 1000; });
  }

  /* ---------------- riordino dei progetti (barra laterale) ---------------- *
     Stesso meccanismo delle attività: la linea di inserimento dice dove si
     finisce, l'ordine si calcola sul modello e non sul DOM.                  */

  function projectDragOver(e) {
    var list = e.target.closest('#projectList');
    if (!list) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    var after = afterElement(list, e.clientY, '[data-projdrag]');
    drag.afterId = after ? after.dataset.projdrag : null;

    // Un <li>, non un <div>: l'elenco dei progetti è una lista.
    if (!drag.line) drag.line = U.el('li', { class: 'drop-line' });
    if (after) list.insertBefore(drag.line, after);
    else list.appendChild(drag.line);

    edgeScroll(e);
  }

  function projectDrop(e) {
    if (!e.target.closest('#projectList')) return;
    e.preventDefault();

    var id = drag.projId, refId = drag.afterId;
    var moving = Store.state.projects.filter(function (p) { return p.id === id; })[0];
    if (!moving) return;

    // I vicini si cercano nel modello: i progetti archiviati non compaiono
    // nell'elenco ma hanno comunque un "order" fra quelli visibili.
    var siblings = Store.activeProjects().filter(function (p) { return p.id !== id; });
    var idx = -1;
    if (refId) {
      siblings.forEach(function (p, i) { if (p.id === refId) idx = i; });
    }
    if (idx < 0) idx = siblings.length;

    var before = idx > 0 ? siblings[idx - 1].order : null;
    var after = idx < siblings.length ? siblings[idx].order : null;
    var newOrder = U.orderBetween(before, after);

    // Stessa difesa dalle collisioni delle attività: le medie ripetute
    // avvicinano i valori fino a farli coincidere.
    var tight = (before != null && Math.abs(newOrder - before) < 1) ||
      (after != null && Math.abs(after - newOrder) < 1);

    Store.commit('riordino progetti', function (st) {
      moving.order = newOrder;
      if (tight) {
        st.projects.slice()
          .sort(function (a, b) { return a.order - b.order; })
          .forEach(function (p, i) { p.order = (i + 1) * 1000; });
      }
      // Array riallineato all'ordine visivo, come fa normalize().
      st.projects.sort(function (a, b) { return a.order - b.order; });
    });
    App.render();
  }

  /* ---------------- scorrimento automatico ai bordi ---------------- *
     Senza questo, con l'area di contenuto che dopo la fase 1 scorre davvero,
     un'attività non riesce a uscire dalla porzione visibile. Non basta stare su
     "dragover": a puntatore fermo il browser lo emette ogni 350ms, quindi lo
     scorrimento andrebbe a scatti. Serve un timer proprio.                    */

  var EDGE = 64, EDGE_MAX = 22;
  var edge = { timer: null, v: null, dy: 0, h: null, dx: 0 };

  /** Primo antenato che scorre davvero sull'asse richiesto. */
  function scroller(el, axis) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var ov = getComputedStyle(n)[axis === 'v' ? 'overflowY' : 'overflowX'];
      if (ov !== 'auto' && ov !== 'scroll') continue;
      if (axis === 'v' ? n.scrollHeight > n.clientHeight + 2
        : n.scrollWidth > n.clientWidth + 2) return n;
    }
    return null;
  }

  // Velocità proporzionale a quanto si è dentro la fascia: al bordo è massima.
  function edgeSpeed(dist) {
    return Math.max(2, Math.round((1 - Math.max(0, dist) / EDGE) * EDGE_MAX));
  }

  function edgeScroll(e) {
    edge.v = null; edge.dy = 0; edge.h = null; edge.dx = 0;

    var v = scroller(e.target, 'v');
    if (v) {
      var rv = v.getBoundingClientRect();
      if (e.clientY - rv.top < EDGE) { edge.v = v; edge.dy = -edgeSpeed(e.clientY - rv.top); }
      else if (rv.bottom - e.clientY < EDGE) { edge.v = v; edge.dy = edgeSpeed(rv.bottom - e.clientY); }
    }

    var h = scroller(e.target, 'h');
    if (h) {
      var rh = h.getBoundingClientRect();
      if (e.clientX - rh.left < EDGE) { edge.h = h; edge.dx = -edgeSpeed(e.clientX - rh.left); }
      else if (rh.right - e.clientX < EDGE) { edge.h = h; edge.dx = edgeSpeed(rh.right - e.clientX); }
    }

    if (!edge.dy && !edge.dx) return edgeStop();
    if (!edge.timer) edge.timer = setInterval(edgeStep, 16);
  }

  function edgeStep() {
    if (!drag.id && !drag.projId) return edgeStop();
    if (edge.v && edge.dy) edge.v.scrollTop += edge.dy;
    if (edge.h && edge.dx) edge.h.scrollLeft += edge.dx;
  }

  function edgeStop() {
    if (edge.timer) { clearInterval(edge.timer); edge.timer = null; }
    edge.v = null; edge.h = null; edge.dy = 0; edge.dx = 0;
  }

  /* ================================================================== *
   * TASTIERA
   * ================================================================== */

  var chord = null, chordTimer = null;

  function typing(e) {
    var t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;

    if (mod && (e.key === 'k' || e.key === 'K' || e.key === 'p' && !e.shiftKey)) {
      e.preventDefault();
      return Pal.open ? App.closePalette() : App.openPalette();
    }

    if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); return App.newProject(); }
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      if (typing(e)) return; // dentro un campo di testo vince l'annulla del browser
      e.preventDefault();
      return e.shiftKey ? App.redo() : App.undo();
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      if (typing(e)) return;
      e.preventDefault();
      return App.redo();
    }
    if (mod && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      return App.toggleSidebar();
    }
    if (mod && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); return App.exportData(); }

    if (e.key === 'Escape') {
      if (Menu.node) return Menu.close();
      if (!U.$('#modal').hidden) return Modal.close();
      if (Pal.open) return App.closePalette();
      if (Detail.isOpen()) return Detail.close();
      if (App.ui.search) { App.ui.search = ''; return App.render(); }
      return;
    }

    if (typing(e)) return;

    if (e.key === '/') { e.preventDefault(); var s = U.$('#searchInput'); if (s) s.focus(); return; }
    if (e.key === '?') { e.preventDefault(); return App.help(); }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); return App.quickAdd(); }
    if (e.key === 't' || e.key === 'T') {
      var cur = Store.state.settings.theme;
      return App.setTheme(cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark');
    }

    if (e.key === 'g' || e.key === 'G') {
      chord = 'g';
      clearTimeout(chordTimer);
      chordTimer = setTimeout(function () { chord = null; }, 1200);
      return;
    }
    if (chord === 'g') {
      chord = null;
      var map = { o: 'today', p: 'upcoming', a: 'all', c: 'completed' };
      var dest = map[e.key.toLowerCase()];
      if (dest) { e.preventDefault(); return App.go(dest); }
    }

    if (App.ui.route.kind === 'project' && ['1', '2', '3', '4'].indexOf(e.key) >= 0) {
      var p = currentProject();
      if (!p) return;
      var v = Views.PROJECT_VIEWS[+e.key - 1];
      return App.setProjectView(p, v.id);
    }
  });

  /* ================================================================== *
   * AVVIO
   * ================================================================== */

  Store.on('change', function () { App.render(); });
  Store.on('status', updateSaveState);

  window.addEventListener('beforeunload', function () { Store.flushNow(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') Store.flushNow();
  });

  // Niente battito da mandare: non c'è più un processo separato da tenere
  // sveglio. Chiudendo la finestra si chiude l'applicazione, e l'host salva
  // lo stato prima di lasciar andare.

  Store.load().then(function () {
    applyTheme();

    App.ui.sidebarCollapsed = !!Store.state.settings.sidebarCollapsed && innerWidth > 760;
    U.$('#app').classList.toggle('side-collapsed', App.ui.sidebarCollapsed);

    // Larghezza del pannello dettagli: la colonna della griglia la legge da qui.
    Detail.setWidth(Store.state.settings.detailWidth, false);

    var start = hashToRoute(location.hash);
    if (!start) {
      try {
        var saved = JSON.parse(localStorage.getItem('flow.route') || 'null');
        if (saved && (saved.kind !== 'project' || Store.project(saved.id))) start = saved;
      } catch (e) {}
    }
    if (start) App.ui.route = start;
    location.hash = routeToHash(App.ui.route);

    App.render();
    U.$('#app').classList.add('ready');
    U.$('#app').setAttribute('aria-hidden', 'false');
    setTimeout(function () {
      U.$('#splash').classList.add('gone');
      setTimeout(function () { var s = U.$('#splash'); if (s) s.remove(); }, 400);
    }, 260);

    if (Store.backend === 'memory') {
      App.toast('Server locale non raggiungibile: modifiche salvate solo nel browser', 'alert');
    }
  });

  addEventListener('resize', function () {
    if (innerWidth > 760) U.$('#app').classList.remove('side-open');
    // Passando la soglia il pannello cambia modo (affiancato / sovrapposto):
    // lo scrim va acceso o spento di conseguenza.
    Detail.syncDock();
  });
})(window);
