/* Rendering: barra laterale, barra superiore e le quattro viste. */
(function (global) {
  'use strict';

  var U = global.U, Store = global.Store, icon = global.icon;
  var V = {};

  var PRIO_NAME = ['Nessuna', 'Bassa', 'Media', 'Alta'];

  /* ------------------------------------------------------------------ *
   * Filtri
   * ------------------------------------------------------------------ */

  V.matchesFilters = function (t) {
    var f = App.ui.filters;
    if (f.tags.length && !f.tags.every(function (id) { return t.tags.indexOf(id) >= 0; })) return false;
    if (f.priority != null && t.priority !== f.priority) return false;
    if (f.assignee && t.assignee !== f.assignee) return false;
    if (App.ui.search) {
      var q = App.ui.search.toLowerCase();
      var hay = (t.title + ' ' + t.notes).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  };

  V.hasActiveFilters = function () {
    var f = App.ui.filters;
    return !!(f.tags.length || f.priority != null || f.assignee || App.ui.search);
  };

  /** Attività in scadenza: scadute o entro `days` giorni, non completate. */
  function dueWithin(days) {
    return Store.state.tasks.filter(function (t) {
      if (t.done || !t.due) return false;
      var d = U.diffDays(t.due);
      return d != null && d <= days;
    });
  }

  /* ------------------------------------------------------------------ *
   * Frammenti riutilizzabili
   * ------------------------------------------------------------------ */

  function checkbox(t) {
    var cls = 'check' + (t.done ? ' on' : '') + (t.priority === 3 ? ' p3' : t.priority === 2 ? ' p2' : '');
    return '<button class="' + cls + '" data-act="toggle-done" data-id="' + t.id + '" ' +
      'title="' + (t.done ? 'Segna come da fare' : 'Completa') + '" aria-label="Completa">' + icon('check') + '</button>';
  }

  function duePill(t) {
    if (!t.due) return '';
    var d = U.diffDays(t.due);
    var cls = t.done ? '' : d < 0 ? ' due-late' : d === 0 ? ' due-today' : '';
    return '<span class="pill' + cls + '">' + icon('calendar') + U.esc(U.humanDate(t.due)) + '</span>';
  }

  function tagPills(t, max) {
    return t.tags.slice(0, max || 3).map(function (id) {
      var g = Store.tag(id);
      if (!g) return '';
      return '<span class="pill tag" style="--tc:' + g.color + '">' + U.esc(g.name) + '</span>';
    }).join('');
  }

  function subPill(t) {
    if (!t.subtasks.length) return '';
    var done = t.subtasks.filter(function (s) { return s.done; }).length;
    return '<span class="pill sub">' + icon('checkCircle') + done + '/' + t.subtasks.length + '</span>';
  }

  function avatar(personId, cls) {
    var p = Store.person(personId);
    if (!p) return '';
    return '<span class="avatar' + (cls ? ' ' + cls : '') + '" style="--ac:' + p.color + '" title="' + U.esc(p.name) + '">' +
      U.esc(U.initials(p.name)) + '</span>';
  }

  function projTag(t) {
    var p = Store.project(t.projectId);
    if (!p) return '';
    return '<span class="row-proj"><span class="proj-dot" style="--pc:' + p.color + '"></span>' + U.esc(p.name) + '</span>';
  }

  V.card = function (t) {
    var cls = 'card' + (t.done ? ' done' : '') + (t.priority ? ' p' + t.priority : '') +
      (App.ui.selectedTaskId === t.id ? ' selected' : '');
    var meta = duePill(t) + tagPills(t) + subPill(t) +
      (t.notes ? '<span class="pill" title="Contiene note">' + icon('list') + '</span>' : '') +
      (t.assignee ? avatar(t.assignee) : '');
    return '<article class="' + cls + '" draggable="true" data-task="' + t.id + '" data-act="open-task" data-id="' + t.id + '">' +
      (t.priority ? '<span class="card-bar"></span>' : '') +
      '<div class="card-top">' + checkbox(t) + '<div class="card-title">' + U.esc(t.title) + '</div></div>' +
      '<div class="card-meta">' + meta + '</div>' +
      '</article>';
  };

  V.row = function (t, opts) {
    opts = opts || {};
    var cls = 'row' + (t.done ? ' done' : '') + (App.ui.selectedTaskId === t.id ? ' selected' : '');
    var meta = '';
    if (opts.showProject) meta += projTag(t);
    meta += tagPills(t, 2) + subPill(t);
    if (t.priority) meta += '<span class="pill prio-' + t.priority + '">' + icon('flag') + PRIO_NAME[t.priority] + '</span>';
    meta += duePill(t);
    if (t.assignee) meta += avatar(t.assignee);
    // Trascinabile solo dove esiste una zona di rilascio (vista elenco di un progetto).
    return '<div class="' + cls + '" draggable="' + (opts.drag ? 'true' : 'false') + '" data-task="' + t.id + '" ' +
      'data-act="open-task" data-id="' + t.id + '">' +
      (opts.grip ? '<span class="row-grip">' + icon('grip') + '</span>' : '') +
      checkbox(t) +
      '<div class="row-title">' + U.esc(t.title) + '</div>' +
      '<div class="row-meta">' + meta + '</div>' +
      '</div>';
  };

  /* ------------------------------------------------------------------ *
   * Ordinamento delle sezioni
   * ------------------------------------------------------------------ */

  /* Criteri nell'ordine in cui compaiono nel menu. "short" è l'etichetta
     mostrata sul pulsante quando il criterio non è Manuale. */
  V.SORTS = [
    { key: 'manual', label: 'Manuale', short: '', ic: 'grip' },
    { key: 'priority', label: 'Urgenza', short: 'Urgenza', ic: 'flag' },
    { key: 'due', label: 'Scadenza più vicina', short: 'Scadenza', ic: 'calendar' },
    { key: 'created-desc', label: 'Aggiunte di recente', short: 'Recenti', ic: 'sparkles' },
    { key: 'created-asc', label: 'Aggiunte meno di recente', short: 'Meno recenti', ic: 'clock' },
    { key: 'updated', label: 'Ultima modifica', short: 'Modifica', ic: 'edit' },
    { key: 'alpha', label: 'Alfabetico A→Z', short: 'A→Z', ic: 'sortAz' }
  ];

  V.sortInfo = function (key) {
    return V.SORTS.filter(function (s) { return s.key === key; })[0] || V.SORTS[0];
  };

  function cmpStr(x, y) {
    x = x || ''; y = y || '';
    return x < y ? -1 : x > y ? 1 : 0;
  }

  // Senza scadenza in fondo, in tutti i criteri che guardano le date.
  function byDue(a, b) {
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return cmpStr(a.due, b.due);
  }

  var CMP = {
    manual: function () { return 0; },
    priority: function (a, b) { return (b.priority - a.priority) || byDue(a, b); },
    due: byDue,
    'created-desc': function (a, b) { return cmpStr(b.createdAt, a.createdAt); },
    'created-asc': function (a, b) { return cmpStr(a.createdAt, b.createdAt); },
    updated: function (a, b) { return cmpStr(b.updatedAt, a.updatedAt); },
    // Naturale e insensibile agli accenti: "È ora" sta accanto a "e ora".
    alpha: function (a, b) {
      return a.title.localeCompare(b.title, 'it', { sensitivity: 'base', numeric: true });
    }
  };

  /* Unico punto che ordina le attività di una sezione. Le completate restano
     sempre in fondo in ogni criterio, e "order" chiude i pareggi: così l'esito
     è sempre lo stesso a parità di dati. */
  V.sortTasks = function (list, sort) {
    var by = CMP[sort] || CMP.manual;
    return list.slice().sort(function (a, b) {
      return (a.done - b.done) || by(a, b) || (a.order - b.order);
    });
  };

  /** Selettore dell'ordinamento nella testata di sezione. */
  function sortBtn(s) {
    var info = V.sortInfo(s.sort);
    var on = info.key !== 'manual';
    return '<button class="sort-btn' + (on ? ' on' : '') + '" data-act="section-sort" data-id="' + s.id +
      '" title="Ordinamento: ' + U.esc(info.label) + '">' + icon(info.ic, 'sm') +
      (on ? '<span>' + U.esc(info.short) + '</span>' : '') + '</button>';
  }

  function emptyState(iconName, title, text) {
    return '<div class="empty">' + icon(iconName) + '<h3>' + U.esc(title) + '</h3><p>' + text + '</p></div>';
  }

  /* ------------------------------------------------------------------ *
   * Barra laterale
   * ------------------------------------------------------------------ */

  V.sidebar = function () {
    var t = U.today();
    var tasks = Store.state.tasks;
    var overdue = tasks.filter(function (x) { return !x.done && x.due && U.diffDays(x.due) < 0; }).length;
    var todayCount = tasks.filter(function (x) { return !x.done && x.due && U.diffDays(x.due) <= 0; }).length;
    var weekCount = dueWithin(7).length;
    var openCount = tasks.filter(function (x) { return !x.done; }).length;
    var doneCount = tasks.filter(function (x) { return x.done; }).length;

    var nav = [
      { id: 'today', label: 'Oggi', ic: 'home', count: todayCount, hot: overdue > 0 },
      { id: 'upcoming', label: 'Prossimi 7 giorni', ic: 'calendar', count: weekCount },
      { id: 'all', label: 'Tutte le attività', ic: 'layers', count: openCount },
      { id: 'completed', label: 'Completate', ic: 'checkCircle', count: doneCount }
    ];

    U.$('#sideNav').innerHTML = nav.map(function (n) {
      var active = App.ui.route.kind === n.id;
      return '<button class="nav-item' + (active ? ' active' : '') + '" data-act="nav" data-route="' + n.id + '">' +
        icon(n.ic) + '<span class="nav-label">' + n.label + '</span>' +
        (n.count ? '<span class="nav-count' + (n.hot ? ' hot' : '') + '">' + n.count + '</span>' : '') +
        '</button>';
    }).join('');

    // A lucchetto aperto i progetti si trascinano: il <li> è l'elemento
    // trascinabile, così la presa vale su tutta la riga e non solo sulla maniglia.
    var unlocked = !Store.state.settings.projectsLocked;
    var list = U.$('#projectList');
    list.classList.toggle('reorder', unlocked);
    list.innerHTML = Store.activeProjects().map(function (p) {
      var active = App.ui.route.kind === 'project' && App.ui.route.id === p.id;
      var pr = Store.progress(p.id);
      var circ = 2 * Math.PI * 6;
      return '<li' + (unlocked ? ' draggable="true" data-projdrag="' + p.id + '"' : '') + '>' +
        '<button class="proj-item' + (active ? ' active' : '') + '" data-act="nav" data-route="project" data-id="' + p.id + '" ' +
        'data-ctx="project" style="--pc:' + p.color + '">' +
        (unlocked ? '<span class="proj-grip">' + icon('grip', 'sm') + '</span>' : '') +
        (p.icon ? '<span class="proj-emoji">' + U.esc(p.icon) + '</span>'
          : '<span class="proj-dot" style="--pc:' + p.color + '"></span>') +
        '<span class="nav-label">' + U.esc(p.name) + '</span>' +
        '<svg class="ring" viewBox="0 0 16 16"><circle class="bg" cx="8" cy="8" r="6"></circle>' +
        '<circle class="fg" cx="8" cy="8" r="6" stroke-dasharray="' + circ.toFixed(1) + '" ' +
        'stroke-dashoffset="' + (circ * (1 - pr.ratio)).toFixed(1) + '" stroke-linecap="round"></circle></svg>' +
        '</button></li>';
    }).join('') || '<li style="padding:6px 10px;font-size:12.5px;color:var(--text-3)">Nessun progetto</li>';

    // Lucchetto in fondo all'elenco: apre e chiude il riordino.
    U.$('#projectsLock').innerHTML =
      '<button class="lock-btn' + (unlocked ? ' on' : '') + '" data-act="toggle-projects-lock" title="' +
      (unlocked ? 'Blocca il riordino dei progetti' : 'Sblocca il riordino dei progetti') + '">' +
      icon(unlocked ? 'unlock' : 'lock', 'sm') +
      '<span>' + (unlocked ? 'Riordino attivo' : 'Riordina progetti') + '</span></button>';

    var counts = {};
    Store.state.tasks.forEach(function (x) {
      if (x.done) return;
      x.tags.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    });
    U.$('#tagList').innerHTML = Store.state.tags.map(function (g) {
      var on = App.ui.filters.tags.indexOf(g.id) >= 0;
      return '<li><button class="tag-chip' + (on ? ' active' : '') + '" style="--tc:' + g.color + '" ' +
        'data-act="toggle-tag" data-id="' + g.id + '">' + U.esc(g.name) +
        (counts[g.id] ? '<span class="cnt">' + counts[g.id] + '</span>' : '') + '</button></li>';
    }).join('') || '<li style="padding:2px 2px;font-size:12px;color:var(--text-3)">Le etichette compaiono qui</li>';

    var theme = Store.state.settings.theme;
    U.$('#themeSwitch').innerHTML = [
      { id: 'light', ic: 'sun', label: 'Chiaro' },
      { id: 'dark', ic: 'moon', label: 'Scuro' },
      { id: 'system', ic: 'monitor', label: 'Auto' }
    ].map(function (o) {
      return '<button class="theme-opt' + (theme === o.id ? ' active' : '') + '" data-act="theme" data-theme="' + o.id + '" ' +
        'title="Tema ' + o.label.toLowerCase() + '">' + icon(o.ic, 'sm') + o.label + '</button>';
    }).join('');

    U.$('.side-collapse').innerHTML = icon('panelLeft');
    U.$('[data-act="new-project"]').innerHTML = icon('plus');
    U.$('[data-act="manage-tags"]').innerHTML = icon('more');
    U.$('[data-act="settings"]').innerHTML = icon('settings');
    U.$('[data-act="help"]').innerHTML = icon('keyboard');

    U.$('#projectsGroup').classList.toggle('collapsed', !!App.ui.collapsed.projects);
    U.$('#tagsGroup').classList.toggle('collapsed', !!App.ui.collapsed.tags);
  };

  /* ------------------------------------------------------------------ *
   * Barra superiore
   * ------------------------------------------------------------------ */

  var ROUTE_TITLES = {
    today: { t: 'Oggi', ic: 'home' },
    upcoming: { t: 'Prossimi 7 giorni', ic: 'calendar' },
    all: { t: 'Tutte le attività', ic: 'layers' },
    completed: { t: 'Completate', ic: 'checkCircle' }
  };

  V.topbar = function () {
    var r = App.ui.route;
    var left, right = '';

    if (r.kind === 'project') {
      var p = Store.project(r.id);
      if (!p) { App.go('today'); return; }
      var pr = Store.progress(p.id);
      left = '<div class="tb-title">' +
        (p.icon ? '<span class="proj-emoji" style="font-size:19px" data-act="project-icon">' + U.esc(p.icon) + '</span>'
          : '<span class="proj-dot" style="--pc:' + p.color + ';width:11px;height:11px"></span>') +
        '<input class="ttl" value="' + U.esc(p.name) + '" data-act="rename-project" size="' + Math.max(6, p.name.length) + '">' +
        '</div>' +
        '<span class="tb-sub">' + pr.done + '/' + pr.total + ' completate</span>';

      var views = [
        { id: 'board', ic: 'board', label: 'Bacheca' },
        { id: 'list', ic: 'list', label: 'Elenco' },
        { id: 'calendar', ic: 'calendar', label: 'Calendario' },
        { id: 'notes', ic: 'file', label: 'Note' }
      ];
      right += '<div class="seg">' + views.map(function (v) {
        return '<button data-act="set-view" data-view="' + v.id + '" class="' + (p.view === v.id ? 'active' : '') + '" ' +
          'title="' + v.label + '">' + icon(v.ic, 'sm') + '<span class="vlbl">' + v.label + '</span></button>';
      }).join('') + '</div>';
    } else {
      var info = ROUTE_TITLES[r.kind] || ROUTE_TITLES.today;
      var sub = '';
      if (r.kind === 'today') sub = U.longDate(U.today());
      left = '<div class="tb-title">' + icon(info.ic, 'lg') + '<span class="ttl">' + info.t + '</span></div>' +
        (sub ? '<span class="tb-sub">' + U.esc(sub) + '</span>' : '');
    }

    right += '<div class="search-box">' + icon('search', 'sm') +
      '<input type="text" id="searchInput" placeholder="Cerca…" value="' + U.esc(App.ui.search) + '">' +
      (App.ui.search ? '<button class="icon-btn tiny" data-act="clear-search">' + icon('x', 'sm') + '</button>' : '') +
      '</div>';
    right += '<button class="btn ghost" data-act="filters" title="Filtri">' + icon('filter') + '</button>';
    if (r.kind === 'project') {
      right += '<button class="btn ghost" data-act="project-menu" title="Opzioni progetto">' + icon('more') + '</button>';
    }

    // Visibile solo a barra laterale chiusa (o su finestre strette): è la via di ritorno.
    U.$('#topbar').innerHTML =
      '<button class="icon-btn side-toggle" data-act="toggle-sidebar" ' +
      'title="Mostra barra laterale (Ctrl+B)" aria-label="Mostra barra laterale">' + icon('panelLeft') + '</button>' +
      '<div class="tb-left">' + left + '</div><div class="tb-right">' + right + '</div>';
  };

  V.filterbar = function () {
    if (!V.hasActiveFilters()) return '';
    var f = App.ui.filters, chips = [];
    if (App.ui.search) chips.push(chip('search', '“' + U.esc(App.ui.search) + '”', 'clear-search'));
    f.tags.forEach(function (id) {
      var g = Store.tag(id);
      if (g) chips.push(chip('tag', U.esc(g.name), 'toggle-tag', id));
    });
    if (f.priority != null) chips.push(chip('flag', 'Priorità ' + PRIO_NAME[f.priority], 'clear-priority'));
    if (f.assignee) {
      var p = Store.person(f.assignee);
      if (p) chips.push(chip('user', U.esc(p.name), 'clear-assignee'));
    }
    function chip(ic, label, act, id) {
      return '<span class="fchip">' + icon(ic, 'sm') + label +
        '<button data-act="' + act + '"' + (id ? ' data-id="' + id + '"' : '') + '>' + icon('x', 'sm') + '</button></span>';
    }
    return '<div class="filterbar"><span class="lbl">Filtri</span>' + chips.join('') +
      '<button class="btn sm ghost" data-act="clear-filters">Azzera tutto</button></div>';
  };

  /* ------------------------------------------------------------------ *
   * Vista bacheca
   * ------------------------------------------------------------------ */

  V.board = function (p) {
    var all = Store.tasksOf(p.id).filter(V.matchesFilters);
    var sections = p.sections.slice().sort(function (a, b) { return a.order - b.order; });

    var cols = sections.map(function (s) {
      var list = V.sortTasks(all.filter(function (t) { return t.sectionId === s.id; }), s.sort);
      return '<section class="column" data-section="' + s.id + '">' +
        '<div class="col-head">' +
        '<input class="col-name" value="' + U.esc(s.name) + '" data-act="rename-section" data-id="' + s.id + '">' +
        '<span class="col-count">' + list.length + '</span>' +
        sortBtn(s) +
        '<button class="icon-btn tiny" data-act="section-menu" data-id="' + s.id + '">' + icon('more') + '</button>' +
        '</div>' +
        '<div class="col-body' + (list.length ? '' : ' is-empty') + '" data-drop="' + s.id + '">' +
        list.map(V.card).join('') + '</div>' +
        '<button class="col-add" data-act="add-task" data-section="' + s.id + '">' + icon('plus', 'sm') + 'Aggiungi attività</button>' +
        '</section>';
    }).join('');

    return '<div class="board">' + cols +
      '<button class="add-col" data-act="add-section">' + icon('plus', 'sm') + 'Nuova sezione</button></div>';
  };

  /* ------------------------------------------------------------------ *
   * Vista elenco (per progetto)
   * ------------------------------------------------------------------ */

  V.list = function (p) {
    var all = Store.tasksOf(p.id).filter(V.matchesFilters);
    var sections = p.sections.slice().sort(function (a, b) { return a.order - b.order; });

    var html = sections.map(function (s) {
      var list = V.sortTasks(all.filter(function (t) { return t.sectionId === s.id; }), s.sort);
      return '<section class="list-section" data-section="' + s.id + '">' +
        '<div class="list-sec-head">' +
        '<input class="col-name" value="' + U.esc(s.name) + '" data-act="rename-section" data-id="' + s.id + '" style="flex:0 1 auto;font-size:12.5px;font-weight:700">' +
        '<span class="col-count">' + list.length + '</span>' +
        sortBtn(s) +
        '<button class="icon-btn tiny" data-act="section-menu" data-id="' + s.id + '">' + icon('more') + '</button>' +
        '</div>' +
        '<div class="drop-zone' + (list.length ? '' : ' is-empty') + '" data-drop="' + s.id + '">' +
        list.map(function (t) { return V.row(t, { grip: true, drag: true }); }).join('') +
        '</div>' +
        '<button class="quick-row" data-act="add-task" data-section="' + s.id + '">' + icon('plus', 'sm') + 'Aggiungi attività</button>' +
        '</section>';
    }).join('');

    return '<div class="list-view">' + html +
      '<button class="btn ghost" data-act="add-section" style="margin-top:6px">' + icon('plus', 'sm') + 'Nuova sezione</button></div>';
  };

  /* ------------------------------------------------------------------ *
   * Vista calendario
   * ------------------------------------------------------------------ */

  V.calendar = function (p) {
    var ym = App.ui.calMonth.split('-');
    var year = +ym[0], month = +ym[1] - 1;
    var first = new Date(year, month, 1);
    var start = U.fromKey(U.startOfWeek(U.toKey(first)));
    var todayKey = U.today();

    var pool = (p ? Store.tasksOf(p.id) : Store.state.tasks).filter(function (t) {
      return t.due && V.matchesFilters(t);
    });
    var byDay = {};
    pool.forEach(function (t) { (byDay[t.due] = byDay[t.due] || []).push(t); });

    var cells = '';
    var cursor = new Date(start);
    for (var i = 0; i < 42; i++) {
      var key = U.toKey(cursor);
      var out = cursor.getMonth() !== month;
      var dow = cursor.getDay();
      var list = (byDay[key] || []).sort(function (a, b) { return (a.done - b.done) || (b.priority - a.priority); });
      var shown = list.slice(0, 3);
      cells += '<div class="cal-cell' + (out ? ' out' : '') + (key === todayKey ? ' today' : '') +
        (dow === 0 || dow === 6 ? ' weekend' : '') + '" data-day="' + key + '">' +
        '<span class="cal-num">' + cursor.getDate() + '</span>' +
        shown.map(function (t) {
          var pr = Store.project(t.projectId);
          return '<div class="cal-task' + (t.done ? ' done' : '') + '" draggable="true" data-task="' + t.id + '" ' +
            'data-act="open-task" data-id="' + t.id + '" style="--pc:' + (pr ? pr.color : 'var(--accent)') + '" ' +
            'title="' + U.esc(t.title) + '">' + U.esc(t.title) + '</div>';
        }).join('') +
        (list.length > 3 ? '<div class="cal-more">+' + (list.length - 3) + ' altre</div>' : '') +
        '</div>';
      cursor.setDate(cursor.getDate() + 1);
    }

    var label = U.MONTHS[month] + ' ' + year;
    return '<div class="cal">' +
      '<div class="cal-head">' +
      '<span class="cal-title">' + label + '</span>' +
      '<button class="icon-btn" data-act="cal-prev">' + icon('chevronLeft') + '</button>' +
      '<button class="icon-btn" data-act="cal-next">' + icon('chevronRight') + '</button>' +
      '<button class="btn sm" data-act="cal-today">Oggi</button>' +
      '<span class="tb-sub" style="margin-left:6px">Trascina un\'attività per spostarne la scadenza</span>' +
      '</div>' +
      '<div class="cal-grid">' +
      ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(function (d) {
        return '<div class="cal-dow">' + d + '</div>';
      }).join('') + cells + '</div></div>';
  };

  /* ------------------------------------------------------------------ *
   * Cruscotto "Oggi"
   * ------------------------------------------------------------------ */

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return 'Ancora in piedi';
    if (h < 13) return 'Buongiorno';
    if (h < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  }

  V.dashboard = function () {
    var todayKey = U.today();
    var tasks = Store.state.tasks.filter(V.matchesFilters);
    var open = tasks.filter(function (t) { return !t.done; });

    var overdue = open.filter(function (t) { return t.due && U.diffDays(t.due) < 0; })
      .sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    var todayList = open.filter(function (t) { return t.due === todayKey; })
      .sort(function (a, b) { return b.priority - a.priority; });
    var soon = open.filter(function (t) {
      var d = t.due ? U.diffDays(t.due) : null;
      return d != null && d > 0 && d <= 7;
    }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    var noDate = open.filter(function (t) { return !t.due; });

    var doneToday = Store.state.tasks.filter(function (t) {
      return t.done && t.completedAt && t.completedAt.slice(0, 10) === todayKey;
    }).length;

    // barre dei 7 giorni precedenti
    var spark = [];
    var max = 1;
    for (var i = 6; i >= 0; i--) {
      var k = U.addDays(todayKey, -i);
      var c = Store.state.tasks.filter(function (t) {
        return t.done && t.completedAt && t.completedAt.slice(0, 10) === k;
      }).length;
      max = Math.max(max, c);
      spark.push({ key: k, count: c, label: U.DAYS_SHORT[U.fromKey(k).getDay()] });
    }

    var stats = [
      { k: 'In ritardo', v: overdue.length, d: overdue.length ? 'da recuperare' : 'tutto in ordine', c: '#ef4444', hot: overdue.length > 0 },
      { k: 'Oggi', v: todayList.length, d: 'in scadenza', c: '#f59e0b' },
      { k: 'Completate oggi', v: doneToday, d: 'ben fatto', c: '#10b981' },
      { k: 'Aperte', v: open.length, d: 'in totale', c: 'var(--accent)' }
    ];

    function section(title, ic, list, opts) {
      if (!list.length) return '';
      return '<div class="panel-card" style="margin-bottom:14px">' +
        '<div class="panel-head">' + icon(ic) + title + '<span class="sp"></span>' +
        '<span class="col-count">' + list.length + '</span></div>' +
        '<div class="panel-body">' + list.slice(0, opts && opts.limit || 50).map(function (t) {
          return V.row(t, { showProject: true });
        }).join('') + '</div></div>';
    }

    var main = section('In ritardo', 'alert', overdue) +
      section('Oggi', 'zap', todayList) +
      section('Prossimi 7 giorni', 'calendar', soon, { limit: 12 }) +
      section('Senza scadenza', 'inbox', noDate, { limit: 8 });

    if (!main) {
      main = '<div class="panel-card">' + emptyState('sparkles', 'Tutto sotto controllo',
        'Nessuna attività in scadenza. Premi <kbd>N</kbd> per aggiungerne una.') + '</div>';
    }

    var projects = Store.activeProjects().map(function (p) {
      var pr = Store.progress(p.id);
      return '<button class="proj-prog" data-act="nav" data-route="project" data-id="' + p.id + '" style="--pc:' + p.color + ';width:100%">' +
        (p.icon ? '<span class="proj-emoji">' + U.esc(p.icon) + '</span>' : '<span class="proj-dot" style="--pc:' + p.color + '"></span>') +
        '<span class="nm">' + U.esc(p.name) + '</span>' +
        '<span class="bar"><i style="width:' + Math.round(pr.ratio * 100) + '%"></i></span>' +
        '<span class="pct">' + Math.round(pr.ratio * 100) + '%</span></button>';
    }).join('') || '<p style="font-size:13px;color:var(--text-3);padding:4px">Nessun progetto ancora.</p>';

    return '<div class="dash">' +
      '<div class="dash-hero"><div>' +
      '<div class="hero-greet">' + greeting() + '</div>' +
      '<div class="hero-sub">' + U.esc(U.longDate(todayKey)) +
      (open.length ? ' · ' + open.length + ' attività aperte' : ' · nessuna attività aperta') + '</div>' +
      '</div><button class="btn primary" data-act="quick-add">' + icon('plus', 'sm') + 'Nuova attività</button></div>' +

      '<div class="stats">' + stats.map(function (s) {
        return '<div class="stat' + (s.hot ? ' hot' : '') + '" style="--sc:' + s.c + '">' +
          '<span class="glow"></span><div class="k">' + s.k + '</div>' +
          '<div class="v">' + s.v + '</div><div class="d">' + s.d + '</div></div>';
      }).join('') + '</div>' +

      '<div class="panels"><div>' + main + '</div><div>' +
      '<div class="panel-card" style="margin-bottom:14px"><div class="panel-head">' + icon('chart') +
      'Ultimi 7 giorni<span class="sp"></span><span class="tb-sub">completate</span></div>' +
      '<div class="panel-body pad"><div class="spark">' + spark.map(function (s) {
        var h = Math.round((s.count / max) * 74);
        return '<div class="spark-col' + (s.key === todayKey ? ' today' : '') + '">' +
          '<div class="spark-bar' + (s.count ? '' : ' zero') + '" style="height:' + Math.max(3, h) + 'px" data-v="' + s.count + '"></div>' +
          '<span class="spark-lbl">' + s.label + '</span></div>';
      }).join('') + '</div></div></div>' +

      '<div class="panel-card"><div class="panel-head">' + icon('folder') + 'Progetti</div>' +
      '<div class="panel-body pad">' + projects + '</div></div>' +
      '</div></div></div>';
  };

  /* ------------------------------------------------------------------ *
   * Elenchi trasversali (tutte / prossimi / completate)
   * ------------------------------------------------------------------ */

  V.crossList = function (kind) {
    var tasks = Store.state.tasks.filter(V.matchesFilters);
    var groups = [];

    if (kind === 'completed') {
      var done = tasks.filter(function (t) { return t.done; })
        .sort(function (a, b) { return (b.completedAt || '') < (a.completedAt || '') ? -1 : 1; });
      if (!done.length) {
        return '<div class="list-view">' + emptyState('checkCircle', 'Ancora nessuna attività completata',
          'Quando spunti un\'attività la ritrovi qui.') + '</div>';
      }
      var buckets = {};
      done.forEach(function (t) {
        var k = (t.completedAt || '').slice(0, 10) || 'senza data';
        (buckets[k] = buckets[k] || []).push(t);
      });
      groups = Object.keys(buckets).sort().reverse().map(function (k) {
        return { title: k === 'senza data' ? 'Senza data' : U.humanDate(k, { weekday: true }), list: buckets[k] };
      });
    } else if (kind === 'upcoming') {
      var open = tasks.filter(function (t) { return !t.done; });
      var over = open.filter(function (t) { return t.due && U.diffDays(t.due) < 0; });
      if (over.length) groups.push({ title: 'In ritardo', list: over.sort(byDue), hot: true });
      for (var i = 0; i < 7; i++) {
        var key = U.addDays(U.today(), i);
        var list = open.filter(function (t) { return t.due === key; }).sort(byPrio);
        if (list.length) groups.push({ title: U.humanDate(key, { weekday: true }), list: list });
      }
      var later = open.filter(function (t) { return t.due && U.diffDays(t.due) > 6; }).sort(byDue);
      if (later.length) groups.push({ title: 'Più avanti', list: later });
      if (!groups.length) {
        return '<div class="list-view">' + emptyState('calendar', 'Settimana libera',
          'Nessuna attività con scadenza nei prossimi 7 giorni.') + '</div>';
      }
    } else {
      var byProject = {};
      tasks.filter(function (t) { return !t.done; }).forEach(function (t) {
        (byProject[t.projectId] = byProject[t.projectId] || []).push(t);
      });
      groups = Store.activeProjects().filter(function (p) { return byProject[p.id]; }).map(function (p) {
        return { title: p.name, color: p.color, icon: p.icon, list: byProject[p.id].sort(byPrio) };
      });
      if (!groups.length) {
        return '<div class="list-view">' + emptyState('sparkles', 'Nessuna attività aperta',
          V.hasActiveFilters() ? 'Nessun risultato con i filtri attuali.' : 'Premi <kbd>N</kbd> per crearne una.') + '</div>';
      }
    }

    function byDue(a, b) { return (a.due || '') < (b.due || '') ? -1 : 1; }
    function byPrio(a, b) { return (b.priority - a.priority) || ((a.due || '9') < (b.due || '9') ? -1 : 1); }

    return '<div class="list-view">' + groups.map(function (g) {
      return '<section class="list-section">' +
        '<div class="list-sec-head">' +
        (g.icon ? '<span class="proj-emoji">' + U.esc(g.icon) + '</span>'
          : g.color ? '<span class="proj-dot" style="--pc:' + g.color + '"></span>' : '') +
        '<h3' + (g.hot ? ' style="color:var(--p3)"' : '') + '>' + U.esc(g.title) + '</h3>' +
        '<span class="col-count">' + g.list.length + '</span></div>' +
        g.list.map(function (t) { return V.row(t, { showProject: !g.color }); }).join('') +
        '</section>';
    }).join('') + '</div>';
  };

  /* ------------------------------------------------------------------ *
   * Vista Note: appunti del progetto e collegamenti al disco
   * ------------------------------------------------------------------ */

  /* Un <div> e non un <button>: dentro c'e' il pulsante del menu, e un
     <button> annidato in un altro il parser HTML lo sposterebbe fuori.
     La delega prende il [data-act] piu' interno, quindi il menu vince
     sull'apertura del collegamento. */
  function linkCard(l) {
    return '<div class="link-card" data-act="open-link" data-id="' + l.id + '" ' +
      'style="--lc:' + l.color + '" title="' + U.esc(l.path) + '">' +
      '<span class="lk-ic">' + icon(l.kind === 'file' ? 'file' : 'folder') + '</span>' +
      '<span class="lk-body"><span class="lk-label">' + U.esc(l.label) + '</span>' +
      '<span class="lk-path">' + U.esc(l.path) + '</span></span>' +
      '<button class="icon-btn tiny lk-more" data-act="link-menu" data-id="' + l.id + '" ' +
      'title="Opzioni del collegamento">' + icon('more', 'sm') + '</button>' +
      '</div>';
  }

  V.notes = function (p) {
    var links = p.links || [];
    return '<div class="notes-page">' +

      '<section class="np-block">' +
      '<div class="np-head"><h3>Appunti</h3>' +
      '<button class="btn sm ghost" data-act="edit-proj-notes">' + icon('edit', 'sm') + 'Modifica</button>' +
      '</div>' +
      '<div class="notes-view np-notes' + (p.notes ? '' : ' placeholder') + '" data-act="edit-proj-notes">' +
      (p.notes ? U.miniMarkdown(p.notes)
        : 'Appunti del progetto: titoli, elenchi, link. Si scrive in markdown leggero.') +
      '</div></section>' +

      '<section class="np-block">' +
      '<div class="np-head"><h3>Collegamenti</h3>' +
      '<span class="col-count">' + links.length + '</span>' +
      '<button class="btn sm" data-act="add-link">' + icon('plus', 'sm') + 'Aggiungi collegamento</button>' +
      '</div>' +
      (links.length
        ? '<div class="link-grid">' + links.map(linkCard).join('') + '</div>'
        : emptyState('folder', 'Nessun collegamento',
          'Collega la cartella del progetto sul disco: un click la apre nell’Esplora risorse.')) +
      '</section>' +

      '</div>';
  };

  /* ------------------------------------------------------------------ *
   * Punto d'ingresso
   * ------------------------------------------------------------------ */

  V.content = function () {
    var r = App.ui.route, body;
    if (r.kind === 'project') {
      var p = Store.project(r.id);
      if (!p) { App.go('today'); return; }
      body = p.view === 'list' ? V.list(p)
        : p.view === 'calendar' ? V.calendar(p)
          : p.view === 'notes' ? V.notes(p) : V.board(p);
    } else if (r.kind === 'today') {
      body = V.dashboard();
    } else {
      body = V.crossList(r.kind);
    }
    U.$('#content').innerHTML = V.filterbar() + body;
  };

  V.PRIO_NAME = PRIO_NAME;
  V.avatar = avatar;
  V.emptyState = emptyState;
  global.Views = V;
})(window);
