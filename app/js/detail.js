/* Pannello dettaglio attività, menu a comparsa, selettore data e finestre modali. */
(function (global) {
  'use strict';

  var U = global.U, Store = global.Store, icon = global.icon;

  /* ================================================================== *
   * MENU A COMPARSA
   * ================================================================== */

  var Menu = { node: null };

  Menu.close = function () {
    if (Menu.node) { Menu.node.remove(); Menu.node = null; }
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onMenuKey, true);
  };

  function onOutside(e) {
    if (Menu.node && !Menu.node.contains(e.target)) Menu.close();
  }
  function onMenuKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); Menu.close(); }
  }

  /**
   * items: array di { label, ic, onClick, danger, on, disabled, sep:true, head:'…', html:'…', color }
   */
  Menu.open = function (anchor, items, opts) {
    Menu.close();
    opts = opts || {};
    var m = U.el('div', { class: 'menu' });
    if (opts.width) m.style.minWidth = opts.width + 'px';

    if (opts.search) {
      var inp = U.el('input', { class: 'menu-search', type: 'text', placeholder: opts.search, spellcheck: 'false' });
      m.appendChild(inp);

      // Riga "Crea …": senza, filtrando su un nome nuovo il menu resta vuoto
      // e nulla lascia capire che Invio crea la voce.
      var createBtn = null;
      if (opts.onEnter) {
        createBtn = U.el('button', { class: 'menu-item mi-create' });
        createBtn.style.display = 'none';
        createBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var v = inp.value.trim();
          if (v) opts.onEnter(v);
        });
        m.appendChild(createBtn);
      }

      inp.addEventListener('input', function () {
        var q = inp.value.toLowerCase();
        U.$$('.menu-item:not(.mi-create)', m).forEach(function (b) {
          var t = (b.dataset.search || b.textContent).toLowerCase();
          b.style.display = t.indexOf(q) >= 0 ? '' : 'none';
        });
        if (createBtn) {
          var v = inp.value.trim();
          var taken = items.some(function (it) {
            return it.label && it.label.toLowerCase() === v.toLowerCase();
          });
          if (v && !taken) {
            createBtn.innerHTML = icon('plus') + '<span class="sp">Crea “' + U.esc(v) + '”</span>';
            createBtn.style.display = '';
          } else {
            createBtn.style.display = 'none';
          }
        }
        if (opts.onSearch) opts.onSearch(inp.value, m);
      });

      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && opts.onEnter) { e.preventDefault(); opts.onEnter(inp.value); }
      });
      setTimeout(function () { inp.focus(); }, 10);
    }

    if (opts.html) m.insertAdjacentHTML('beforeend', opts.html);

    items.forEach(function (it) {
      if (it.sep) { m.appendChild(U.el('div', { class: 'menu-sep' })); return; }
      if (it.head) { m.appendChild(U.el('div', { class: 'menu-head' }, U.esc(it.head))); return; }
      var b = U.el('button', {
        class: 'menu-item' + (it.danger ? ' danger' : '') + (it.on ? ' on' : '') +
          (it.disabled ? ' off' : ''),
        dataset: { search: it.label || '' }
      });
      // Disattivata e non nascosta: la voce resta al suo posto nell'elenco.
      // Un <button disabled> non riceve nemmeno il mousedown, quindi il menu
      // non si chiude se ci si clicca sopra.
      if (it.disabled) b.disabled = true;
      b.innerHTML = (it.ic ? icon(it.ic) : it.color
        ? '<span class="proj-dot" style="--pc:' + U.tint(it.color) + '"></span>'
        : it.emoji ? '<span class="proj-emoji">' + U.esc(it.emoji) + '</span>' : '') +
        '<span class="sp">' + U.esc(it.label) + '</span>' +
        (it.on ? icon('check', 'sm') : '') + (it.right || '');
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!it.keepOpen) Menu.close();
        if (it.onClick) it.onClick(e);
      });
      m.appendChild(b);
    });

    document.body.appendChild(m);
    position(m, anchor, opts);
    Menu.node = m;
    setTimeout(function () {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onMenuKey, true);
    }, 0);
    return m;
  };

  function position(m, anchor, opts) {
    var r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect()
      : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
    var mw = m.offsetWidth, mh = m.offsetHeight;
    var left = opts && opts.alignRight ? r.right - mw : r.left;
    var top = r.bottom + 5;
    if (left + mw > innerWidth - 8) left = innerWidth - mw - 8;
    if (left < 8) left = 8;
    if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 5);
    m.style.left = Math.round(left) + 'px';
    m.style.top = Math.round(top) + 'px';
  }

  /* ---------------- selettore data ---------------- */

  Menu.datePicker = function (anchor, current, onPick) {
    var view = U.fromKey(current) || new Date();
    var m = Menu.open(anchor, [], { width: 258 });

    function draw() {
      var y = view.getFullYear(), mo = view.getMonth();
      var start = U.fromKey(U.startOfWeek(U.toKey(new Date(y, mo, 1))));
      var todayKey = U.today();
      var cells = '';
      var c = new Date(start);
      for (var i = 0; i < 42; i++) {
        var k = U.toKey(c);
        cells += '<button class="dp-day' + (c.getMonth() !== mo ? ' out' : '') +
          (k === todayKey ? ' today' : '') + (k === current ? ' sel' : '') + '" data-k="' + k + '">' + c.getDate() + '</button>';
        c.setDate(c.getDate() + 1);
      }
      m.innerHTML =
        '<div class="dp-head"><button class="icon-btn tiny" data-nav="-1">' + icon('chevronLeft', 'sm') + '</button>' +
        '<span class="dp-title">' + U.MONTHS[mo] + ' ' + y + '</span>' +
        '<button class="icon-btn tiny" data-nav="1">' + icon('chevronRight', 'sm') + '</button></div>' +
        '<div class="dp-dows">' + ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(function (d) {
          return '<span>' + d + '</span>';
        }).join('') + '</div>' +
        '<div class="dp-grid">' + cells + '</div>' +
        '<div class="menu-sep"></div>' +
        '<button class="menu-item" data-quick="0">' + icon('zap') + '<span class="sp">Oggi</span></button>' +
        '<button class="menu-item" data-quick="1">' + icon('arrowRight') + '<span class="sp">Domani</span></button>' +
        '<button class="menu-item" data-quick="7">' + icon('calendar') + '<span class="sp">Tra una settimana</span></button>' +
        (current ? '<button class="menu-item danger" data-quick="none">' + icon('x') + '<span class="sp">Rimuovi scadenza</span></button>' : '');
    }

    m.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) { view.setMonth(view.getMonth() + (+nav.dataset.nav)); draw(); return; }
      var q = e.target.closest('[data-quick]');
      if (q) {
        Menu.close();
        onPick(q.dataset.quick === 'none' ? null : U.addDays(U.today(), +q.dataset.quick));
        return;
      }
      var d = e.target.closest('[data-k]');
      if (d) { Menu.close(); onPick(d.dataset.k); }
    });

    draw();
    position(m, anchor, {});
  };

  /* ================================================================== *
   * MODALI
   * ================================================================== */

  var Modal = { onClose: null };

  Modal.close = function () {
    var host = U.$('#modal');
    host.hidden = true;
    host.innerHTML = '';
    if (Modal.onClose) { var f = Modal.onClose; Modal.onClose = null; f(); }
  };

  Modal.open = function (html, opts) {
    opts = opts || {};
    var host = U.$('#modal');
    host.innerHTML = '<div class="modal-box' + (opts.wide ? ' wide' : '') + '">' + html + '</div>';
    host.hidden = false;
    host.onmousedown = function (e) { if (e.target === host && !opts.sticky) Modal.close(); };
    var box = U.$('.modal-box', host);
    if (opts.onMount) opts.onMount(box);
    var first = U.$('input,textarea,button.primary', box);
    if (first && !opts.noFocus) setTimeout(function () { first.focus(); first.select && first.select(); }, 30);
    return box;
  };

  Modal.confirm = function (title, message, confirmLabel, onYes, danger) {
    Modal.open(
      '<div class="modal-head"><h2>' + U.esc(title) + '</h2></div>' +
      '<div class="modal-body"><p style="font-size:13.5px;color:var(--text-2);line-height:1.6">' + message + '</p></div>' +
      '<div class="modal-foot">' +
      '<button class="btn" data-x="no">Annulla</button>' +
      '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-x="yes">' + U.esc(confirmLabel) + '</button></div>',
      {
        onMount: function (box) {
          box.querySelector('[data-x="no"]').onclick = Modal.close;
          box.querySelector('[data-x="yes"]').onclick = function () { Modal.close(); onYes(); };
          setTimeout(function () { box.querySelector('[data-x="yes"]').focus(); }, 30);
        }
      }
    );
  };

  /* ================================================================== *
   * PANNELLO DETTAGLIO
   * ================================================================== */

  var Detail = { taskId: null };

  // Sotto questa larghezza di finestra il pannello torna sovrapposto con lo
  // scrim: affiancarlo non lascerebbe spazio utile alle sezioni.
  // Lo stesso valore sta nella media query di styles.css.
  var DOCK_MIN = 1101;
  var GRIP_MIN = 320, GRIP_MAX = 720, GRIP_DEFAULT = 440;

  /** Vero quando il pannello sta affiancato al contenuto invece di coprirlo. */
  Detail.isDocked = function () { return innerWidth >= DOCK_MIN; };

  Detail.open = function (id) {
    Detail.taskId = id;
    App.ui.selectedTaskId = id;
    U.$('#detail').classList.add('open');
    U.$('#detail').setAttribute('aria-hidden', 'false');
    U.$('#app').classList.add('detail-open');
    U.$('#scrim').hidden = Detail.isDocked();
    Detail.render();
    App.renderContent();
  };

  Detail.close = function () {
    Detail.taskId = null;
    App.ui.selectedTaskId = null;
    U.$('#detail').classList.remove('open');
    U.$('#detail').setAttribute('aria-hidden', 'true');
    U.$('#app').classList.remove('detail-open');
    U.$('#scrim').hidden = true;
    Menu.close();
    App.renderContent();
  };

  Detail.isOpen = function () { return !!Detail.taskId; };

  /** Scrive la larghezza sul guscio e la ricorda fra le preferenze. */
  Detail.setWidth = function (px, persist) {
    px = Math.max(GRIP_MIN, Math.min(GRIP_MAX, Math.round(px)));
    U.$('#app').style.setProperty('--detail-size', px + 'px');
    if (persist) Store.quiet(function (st) { st.settings.detailWidth = px; });
    return px;
  };

  /** Riallinea scrim e maniglia quando la finestra passa la soglia. */
  Detail.syncDock = function () {
    if (!Detail.isOpen()) return;
    U.$('#scrim').hidden = Detail.isDocked();
  };

  function edit(patch, label) {
    var id = Detail.taskId;
    Store.commit(label || 'modifica', function () { Store.updateTask(id, patch); });
  }

  Detail.render = function () {
    if (!Detail.taskId) return;
    var t = Store.task(Detail.taskId);
    if (!t) { Detail.close(); return; }

    var p = Store.project(t.projectId);
    var s = Store.section(t.projectId, t.sectionId);
    var person = Store.person(t.assignee);
    var subDone = t.subtasks.filter(function (x) { return x.done; }).length;
    // Un'attività creata in questa sessione non è ancora passata da normalize.
    var links = t.links || [];

    var dueCls = t.due && !t.done ? (U.diffDays(t.due) < 0 ? 'style="color:var(--p3)"'
      : U.diffDays(t.due) === 0 ? 'style="color:var(--p2)"' : '') : '';

    var html =
      '<div class="detail-grip" data-d="grip" ' +
      'title="Trascina per ridimensionare · doppio clic per la larghezza predefinita"></div>' +
      '<div class="dt-head">' +
      '<button class="dt-complete' + (t.done ? ' on' : '') + '" data-d="toggle-done">' +
      icon('check', 'sm') + (t.done ? 'Completata' : 'Completa') + '</button>' +
      '<span class="sp"></span>' +
      '<button class="icon-btn" data-d="more" title="Altre azioni">' + icon('more') + '</button>' +
      '<button class="icon-btn" data-d="close" title="Chiudi (Esc)">' + icon('x') + '</button>' +
      '</div>' +

      '<div class="dt-body">' +
      '<textarea class="dt-title' + (t.done ? ' done' : '') + '" rows="1" data-d="title" ' +
      'placeholder="Titolo dell\'attività">' + U.esc(t.title) + '</textarea>' +

      '<div class="dt-fields">' +
      field('folder', 'Progetto',
        '<button class="dt-set" data-d="project">' +
        (p ? (p.icon ? '<span class="proj-emoji">' + U.esc(p.icon) + '</span>'
          : '<span class="proj-dot" style="--pc:' + U.tint(p.color) + '"></span>') + U.esc(p.name) : 'Nessuno') + '</button>') +
      field('board', 'Sezione',
        '<button class="dt-set" data-d="section">' + (s ? U.esc(s.name) : '—') + '</button>') +
      field('calendar', 'Scadenza',
        '<button class="dt-set' + (t.due ? '' : ' empty-v') + '" data-d="due" ' + dueCls + '>' +
        (t.due ? U.esc(U.humanDate(t.due, { weekday: true })) : 'Nessuna scadenza') + '</button>') +
      field('flag', 'Priorità',
        '<button class="dt-set' + (t.priority ? '' : ' empty-v') + '" data-d="priority">' +
        (t.priority ? '<span class="pill prio-' + t.priority + '">' + Views.PRIO_NAME[t.priority] + '</span>' : 'Nessuna') + '</button>') +
      field('user', 'Assegnata a',
        '<button class="dt-set' + (person ? '' : ' empty-v') + '" data-d="assignee">' +
        (person ? Views.avatar(t.assignee) + U.esc(person.name) : 'Nessuno') + '</button>') +
      field('tag', 'Etichette',
        t.tags.map(function (id) {
          var g = Store.tag(id);
          return g ? '<span class="pill tag" style="--tc:' + U.tint(g.color) + '">' + U.esc(g.name) +
            '<button data-d="untag" data-id="' + g.id + '" style="margin-left:2px;color:inherit;opacity:.6">' + icon('x', 'sm') + '</button></span>' : '';
        }).join('') + '<button class="dt-set empty-v" data-d="tags">' + icon('plus', 'sm') + 'Aggiungi</button>') +
      '</div>' +

      '<div class="dt-sec">' +
      '<div class="dt-sec-head"><h4>Note</h4>' +
      '<button class="btn sm ghost" data-d="edit-notes">' + icon('edit', 'sm') + 'Modifica</button></div>' +
      '<div class="notes-view' + (t.notes ? '' : ' placeholder') + '" data-d="notes-view">' +
      (t.notes ? U.miniMarkdown(t.notes) : 'Aggiungi note, link o una lista puntata…') + '</div>' +
      '</div>' +

      '<div class="dt-sec">' +
      '<div class="dt-sec-head"><h4>Sotto-attività</h4>' +
      (t.subtasks.length ? '<span class="tb-sub">' + subDone + '/' + t.subtasks.length + '</span>' : '') + '</div>' +
      (t.subtasks.length ? '<div class="sub-progress"><span class="bar"><i style="width:' +
        Math.round(subDone / t.subtasks.length * 100) + '%"></i></span></div>' : '') +
      '<div class="sub-list">' + t.subtasks.map(function (st) {
        return '<div class="sub-item' + (st.done ? ' done' : '') + '" data-sub="' + st.id + '">' +
          '<button class="check' + (st.done ? ' on' : '') + '" data-d="sub-toggle" data-id="' + st.id + '">' + icon('check') + '</button>' +
          '<textarea class="txt" rows="1" data-d="sub-title" data-id="' + st.id + '">' +
          U.esc(st.title) + '</textarea>' +
          '<button class="del" data-d="sub-del" data-id="' + st.id + '">' + icon('trash', 'sm') + '</button></div>';
      }).join('') + '</div>' +
      '<button class="quick-row" data-d="sub-add" style="min-height:32px;font-size:13px">' +
      icon('plus', 'sm') + 'Aggiungi sotto-attività</button>' +
      '</div>' +

      /* Collegamenti: gli stessi della scheda Note di un progetto, riquadri
         compresi. Qui la delega è data-d, quindi i frammenti condivisi di
         Views ricevono 'd' invece di 'act'. */
      '<div class="dt-sec">' +
      '<div class="dt-sec-head"><h4>Collegamenti</h4>' +
      (links.length ? '<span class="col-count">' + links.length + '</span>' : '') +
      (links.length > 1 ? Views.linkSortBtn(t, 'd') : '') + '</div>' +
      (links.length ? '<div class="link-grid dt-links">' +
        Views.sortLinks(links, t.linksSort).map(function (l) {
          return Views.linkCard(l, 'd');
        }).join('') + '</div>' : '') +
      '<button class="quick-row" data-d="add-link" style="min-height:32px;font-size:13px">' +
      icon('plus', 'sm') + 'Aggiungi collegamento</button>' +
      '</div>' +

      '<div class="dt-meta">' +
      '<span>Creata ' + U.esc(U.relativeTime(t.createdAt)) + '</span>' +
      '<span>Ultima modifica ' + U.esc(U.relativeTime(t.updatedAt)) + '</span>' +
      (t.completedAt ? '<span>Completata ' + U.esc(U.relativeTime(t.completedAt)) + '</span>' : '') +
      '</div></div>';

    function field(ic, label, value) {
      return '<div class="dt-label">' + icon(ic, 'sm') + label + '</div><div class="dt-value">' + value + '</div>';
    }

    var host = U.$('#detail');
    host.innerHTML = html;
    if (!FIELD_SIZING) growAllWhenStable(host);
  };

  /* L'altezza delle textarea (titolo e sotto-attività, che nascono con
     rows="1") la calcola il motore con field-sizing: content, così segue anche
     le larghezze che cambiano. Solo dove non c'è si misura a mano. */
  var FIELD_SIZING = !!(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'));

  function autoGrow(ta) {
    if (!ta || FIELD_SIZING) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  /* Misurare a mano vale solo a impaginazione fatta: in apertura la colonna del
     pannello parte da zero e si allarga in 280ms, e su una colonna larga zero
     il testo sta incolonnato una lettera per riga — il titolo veniva
     altissimo. Si aspetta che la larghezza si sia fermata. */
  function growAllWhenStable(host) {
    var last = -1;
    (function tick() {
      var w = host.clientWidth;
      if (w > 0 && w === last) {
        autoGrow(U.$('.dt-title', host));
        U.$$('.sub-item .txt', host).forEach(function (ta) { autoGrow(ta); });
        return;
      }
      last = w;
      requestAnimationFrame(tick);
    })();
  }

  /* ---------------- chiusura al click fuori ---------------- */

  /* Con settings.detailAutoHide un click fuori dal pannello lo chiude — ma
     soltanto se cade **nel vuoto**: il fondo della bacheca, di una colonna o
     dell'elenco delle sezioni. Prima si chiudeva a ogni click che non fosse su
     un'attività, quindi anche sulla barra laterale, sulla barra in alto, su un
     pulsante o su una testata di sezione: il pannello sparive mentre si stava
     facendo altro.

     Il controllo è su `e.target` e **non** su `closest()`, ed è questo che lo
     rende affidabile senza dover elencare le eccezioni: il fondo di una colonna
     chiude, una scheda che ci sta sopra no, perché il bersaglio del click è la
     scheda e non la colonna. Niente da aggiungere quando nasce un elemento
     nuovo — a meno che non sia un'altra area vuota.

     Si ascolta "click" e non "mousedown": alla pressione del tasto il campo di
     testo del pannello non ha ancora perso il fuoco e il suo "change" — quello
     che salva titolo, note e sotto-attività — non è ancora partito. */
  var VOID_AREAS = '#content, .board, .column, .col-body, .drop-zone, ' +
    '.list-view, .list-section, .dash, .cal, .cal-grid, .notes-page';

  /* Un click che serviva solo a chiudere un menu non deve chiudere anche il
     pannello. Il menu se ne va già sul "mousedown", quindi quando arriva il
     "click" Menu.node è nullo: bisogna annotarselo prima. */
  var menuWasOpen = false;
  document.addEventListener('mousedown', function () { menuWasOpen = !!Menu.node; }, true);

  document.addEventListener('click', function (e) {
    if (!Detail.isOpen() || !Store.state.settings.detailAutoHide) return;
    if (menuWasOpen) return;
    if (!e.target.matches || !e.target.matches(VOID_AREAS)) return;
    Detail.close();
  });

  /* ---------------- maniglia di ridimensionamento ---------------- */

  U.$('#detail').addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.detail-grip') || !Detail.isDocked() || e.button !== 0) return;
    e.preventDefault();
    var app = U.$('#app');
    var startX = e.clientX;
    var startW = U.$('#detail').offsetWidth || GRIP_DEFAULT;
    app.classList.add('detail-resizing');

    function move(ev) {
      // La maniglia sta a sinistra: trascinando verso sinistra il pannello cresce.
      Detail.setWidth(startW + (startX - ev.clientX), false);
    }
    function up() {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      app.classList.remove('detail-resizing');
      Detail.setWidth(U.$('#detail').offsetWidth, true);
    }
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });

  U.$('#detail').addEventListener('dblclick', function (e) {
    if (!e.target.closest('.detail-grip') || !Detail.isDocked()) return;
    Detail.setWidth(GRIP_DEFAULT, true);
  });

  /* ---------------- interazioni del pannello ---------------- */

  U.$('#detail').addEventListener('click', function (e) {
    var el = e.target.closest('[data-d]');
    if (!el) return;
    var act = el.dataset.d;
    var t = Store.task(Detail.taskId);
    if (!t) return;

    // La maniglia si guida con i pointer event qui sopra: il click non fa niente.
    if (act === 'grip') return;
    if (act === 'close') return Detail.close();
    if (act === 'toggle-done') {
      edit({ done: !t.done }, t.done ? 'riapertura' : 'completamento');
      App.toast(t.done ? 'Attività riaperta' : 'Attività completata', 'checkCircle', true);
      return;
    }

    if (act === 'due') {
      return Menu.datePicker(el, t.due, function (k) { edit({ due: k }, 'scadenza'); });
    }

    if (act === 'priority') {
      return Menu.open(el, [0, 3, 2, 1].map(function (n) {
        return {
          label: Views.PRIO_NAME[n], ic: n ? 'flag' : 'x', on: t.priority === n,
          onClick: function () { edit({ priority: n }, 'priorità'); }
        };
      }));
    }

    if (act === 'project') {
      return Menu.open(el, Store.activeProjects().map(function (p) {
        return {
          label: p.name, color: p.color, emoji: p.icon, on: p.id === t.projectId,
          onClick: function () { edit({ projectId: p.id, sectionId: p.sections[0].id }, 'spostamento'); }
        };
      }), { search: 'Cerca progetto…' });
    }

    if (act === 'section') {
      var proj = Store.project(t.projectId);
      if (!proj) return;
      return Menu.open(el, proj.sections.map(function (s) {
        return { label: s.name, ic: 'board', on: s.id === t.sectionId, onClick: function () { edit({ sectionId: s.id }, 'spostamento'); } };
      }));
    }

    if (act === 'assignee') {
      var items = Store.state.people.map(function (p) {
        return {
          label: p.name, color: p.color, on: p.id === t.assignee,
          onClick: function () { edit({ assignee: p.id }, 'assegnazione'); }
        };
      });
      items.push({ sep: true });
      items.push({ label: 'Nessuno', ic: 'x', onClick: function () { edit({ assignee: null }, 'assegnazione'); } });
      return Menu.open(el, items, {
        search: 'Cerca o crea persona…',
        onEnter: function (name) {
          if (!name.trim()) return;
          Menu.close();
          Store.commit('nuova persona', function () {
            var p = Store.ensurePerson(name);
            Store.updateTask(Detail.taskId, { assignee: p.id });
          });
        }
      });
    }

    if (act === 'tags') {
      var list = Store.state.tags.map(function (g) {
        return {
          label: g.name, color: g.color, on: t.tags.indexOf(g.id) >= 0, keepOpen: true,
          onClick: function (ev) {
            var cur = Store.task(Detail.taskId);
            var next = cur.tags.indexOf(g.id) >= 0
              ? cur.tags.filter(function (x) { return x !== g.id; })
              : cur.tags.concat([g.id]);
            edit({ tags: next }, 'etichette');
            var btn = ev.currentTarget || ev.target.closest('.menu-item');
            if (btn) btn.classList.toggle('on');
          }
        };
      });
      return Menu.open(el, list, {
        search: 'Cerca o crea etichetta…',
        onEnter: function (name) {
          if (!name.trim()) return;
          Menu.close();
          Store.commit('etichetta', function () {
            var g = Store.ensureTag(name);
            var cur = Store.task(Detail.taskId);
            if (g && cur.tags.indexOf(g.id) < 0) Store.updateTask(cur.id, { tags: cur.tags.concat([g.id]) });
          });
        }
      });
    }

    if (act === 'untag') {
      var id = el.dataset.id;
      return edit({ tags: t.tags.filter(function (x) { return x !== id; }) }, 'etichette');
    }

    if (act === 'edit-notes' || act === 'notes-view') {
      var holder = U.$('[data-d="notes-view"]');
      if (!holder) return;
      var ta = U.el('textarea', { class: 'notes-edit', 'data-d': 'notes-edit' });
      ta.value = t.notes;
      holder.replaceWith(ta);
      ta.focus();
      var len = ta.value.length;
      ta.setSelectionRange(len, len);
      ta.style.height = Math.max(88, ta.scrollHeight) + 'px';
      ta.addEventListener('blur', function () { edit({ notes: ta.value }, 'note'); Detail.render(); });
      ta.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.stopPropagation(); Detail.render(); }
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); ta.blur(); }
      });
      return;
    }

    if (act === 'sub-toggle') {
      var sid = el.dataset.id;
      return Store.commit('sotto-attività', function () {
        var task = Store.task(Detail.taskId);
        task.subtasks.forEach(function (st) { if (st.id === sid) st.done = !st.done; });
        task.updatedAt = new Date().toISOString();
      });
    }

    if (act === 'sub-del') {
      var did = el.dataset.id;
      return Store.commit('sotto-attività eliminata', function () {
        var task = Store.task(Detail.taskId);
        task.subtasks = task.subtasks.filter(function (st) { return st.id !== did; });
        task.updatedAt = new Date().toISOString();
      });
    }

    if (act === 'sub-add') {
      Store.commit('sotto-attività', function () {
        var task = Store.task(Detail.taskId);
        task.subtasks.push({ id: U.uid('st'), title: '', done: false });
      });
      var inputs = U.$$('.sub-item .txt');
      var last = inputs[inputs.length - 1];
      if (last) last.focus();
      return;
    }

    /* Collegamenti dell'attività. La finestra, il menu e l'ordinamento sono
       quelli della scheda Note: qui si passa solo chi li possiede. */
    if (act === 'add-link') return App.links.modal(t, null);

    if (act === 'open-link') {
      var lk = App.links.of(t, el.dataset.id);
      if (lk) App.links.open(lk);
      return;
    }

    if (act === 'link-menu') {
      // Il riquadro sotto il pulsante è a sua volta un data-d="open-link".
      e.stopPropagation();
      var lm = App.links.of(t, el.dataset.id);
      if (lm) App.links.menu(el, t, lm);
      return;
    }

    if (act === 'links-sort') return App.links.sortMenu(el, t);

    if (act === 'more') {
      return Menu.open(el, [
        {
          label: 'Duplica', ic: 'copy', onClick: function () {
            Store.commit('duplicazione', function () {
              var copy = JSON.parse(JSON.stringify(Store.task(Detail.taskId)));
              copy.id = U.uid('t');
              copy.title += ' (copia)';
              copy.order = copy.order + 1;
              copy.done = false; copy.completedAt = null;
              copy.createdAt = copy.updatedAt = new Date().toISOString();
              copy.subtasks = copy.subtasks.map(function (s) { return { id: U.uid('st'), title: s.title, done: false }; });
              copy.links = (copy.links || []).map(function (l) {
                return Object.assign({}, l, { id: U.uid('l') });
              });
              Store.state.tasks.push(copy);
              Detail.taskId = copy.id;
              App.ui.selectedTaskId = copy.id;
            });
            App.toast('Attività duplicata', 'copy');
          }
        },
        {
          label: 'Copia titolo', ic: 'file', onClick: function () {
            try { navigator.clipboard.writeText(t.title); App.toast('Titolo copiato', 'copy'); } catch (err) {}
          }
        },
        { sep: true },
        {
          label: 'Elimina', ic: 'trash', danger: true, onClick: function () {
            var id = Detail.taskId, title = t.title;
            Detail.close();
            Store.commit('eliminazione', function () { Store.deleteTask(id); });
            App.toast('“' + (title.length > 28 ? title.slice(0, 28) + '…' : title) + '” eliminata', 'trash', true);
          }
        }
      ], { alignRight: true });
    }
  });

  U.$('#detail').addEventListener('input', function (e) {
    if (e.target.matches('.dt-title, .sub-item .txt')) autoGrow(e.target);
  });

  U.$('#detail').addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches('[data-d="title"]')) {
      var v = el.value.trim();
      if (v) edit({ title: v }, 'titolo');
      else el.value = Store.task(Detail.taskId).title;
    }
    if (el.matches('[data-d="sub-title"]')) {
      var sid = el.dataset.id, v2 = el.value.trim();
      Store.commit('sotto-attività', function () {
        var task = Store.task(Detail.taskId);
        if (!v2) task.subtasks = task.subtasks.filter(function (st) { return st.id !== sid; });
        else task.subtasks.forEach(function (st) { if (st.id === sid) st.title = v2; });
      });
    }
  });

  U.$('#detail').addEventListener('keydown', function (e) {
    if (e.target.matches('[data-d="title"]') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
    if (e.target.matches('[data-d="sub-title"]')) {
      // Maiusc+Invio inserisce un ritorno a capo vero; Invio da solo conferma e
      // apre la sotto-attività successiva, come prima del passaggio a textarea.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.target.blur();
        var task = Store.task(Detail.taskId);
        if (task && task.subtasks.every(function (s) { return s.title; })) {
          Store.commit('sotto-attività', function () {
            Store.task(Detail.taskId).subtasks.push({ id: U.uid('st'), title: '', done: false });
          });
          var inputs = U.$$('.sub-item .txt');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
      }
      if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); }
    }
  });

  global.Menu = Menu;
  global.Modal = Modal;
  global.Detail = Detail;
})(window);
