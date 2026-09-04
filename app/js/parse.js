/* Interpretazione in linguaggio naturale per l'inserimento rapido.
   Esempio: "Chiamare il notaio domani !alta #urgente @Marco +Casa" */
(function (global) {
  'use strict';

  var U = global.U;

  var WEEKDAYS = {
    'domenica': 0, 'dom': 0,
    'lunedi': 1, 'lunedì': 1, 'lun': 1,
    'martedi': 2, 'martedì': 2, 'mar': 2,
    'mercoledi': 3, 'mercoledì': 3, 'mer': 3,
    'giovedi': 4, 'giovedì': 4, 'gio': 4,
    'venerdi': 5, 'venerdì': 5, 'ven': 5,
    'sabato': 6, 'sab': 6
  };

  var MONTHS = {
    'gennaio': 0, 'gen': 0, 'febbraio': 1, 'feb': 1, 'marzo': 2, 'mar': 2,
    'aprile': 3, 'apr': 3, 'maggio': 4, 'mag': 4, 'giugno': 5, 'giu': 5,
    'luglio': 6, 'lug': 6, 'agosto': 7, 'ago': 7, 'settembre': 8, 'set': 8,
    'ottobre': 9, 'ott': 9, 'novembre': 10, 'nov': 10, 'dicembre': 11, 'dic': 11
  };

  var PRIORITIES = {
    'alta': 3, 'urgente': 3, 'alto': 3, 'a': 3, '3': 3,
    'media': 2, 'medio': 2, 'm': 2, '2': 2,
    'bassa': 1, 'basso': 1, 'b': 1, '1': 1,
    'nessuna': 0, '0': 0
  };

  function nextWeekday(target, skipToday) {
    var d = new Date();
    var delta = (target - d.getDay() + 7) % 7;
    if (delta === 0 && skipToday) delta = 7;
    d.setDate(d.getDate() + delta);
    return U.toKey(d);
  }

  /** Riconosce una data a partire dai token `words` in posizione `i`.
      Restituisce { key, len } oppure null. */
  function matchDate(words, i) {
    var w = (words[i] || '').toLowerCase();
    var w1 = (words[i + 1] || '').toLowerCase();
    var w2 = (words[i + 2] || '').toLowerCase();
    var today = U.today();

    if (w === 'oggi') return { key: today, len: 1 };
    if (w === 'domani') return { key: U.addDays(today, 1), len: 1 };
    if (w === 'dopodomani') return { key: U.addDays(today, 2), len: 1 };
    if (w === 'ieri') return { key: U.addDays(today, -1), len: 1 };

    // "fine settimana" / "weekend" -> sabato prossimo
    if ((w === 'fine' && w1 === 'settimana') || w === 'weekend') {
      return { key: nextWeekday(6, false), len: w === 'weekend' ? 1 : 2 };
    }

    // "prossima settimana" / "settimana prossima" -> lunedì successivo
    if ((w === 'prossima' && w1 === 'settimana') || (w === 'settimana' && w1 === 'prossima')) {
      return { key: nextWeekday(1, true), len: 2 };
    }

    // "prossimo lunedì" / "lunedì prossimo"
    if ((w === 'prossimo' || w === 'prossima') && WEEKDAYS[w1] != null) {
      return { key: nextWeekday(WEEKDAYS[w1], true), len: 2 };
    }
    if (WEEKDAYS[w] != null && (w1 === 'prossimo' || w1 === 'prossima')) {
      return { key: nextWeekday(WEEKDAYS[w], true), len: 2 };
    }

    // "tra 3 giorni" / "fra 2 settimane"
    if ((w === 'tra' || w === 'fra') && /^\d+$/.test(w1)) {
      var n = parseInt(w1, 10);
      if (/^giorni?$/.test(w2)) return { key: U.addDays(today, n), len: 3 };
      if (/^settimane?$/.test(w2)) return { key: U.addDays(today, n * 7), len: 3 };
      if (/^mesi?$/.test(w2)) {
        var d = U.fromKey(today); d.setMonth(d.getMonth() + n);
        return { key: U.toKey(d), len: 3 };
      }
    }

    // "12 marzo" / "12 mar"
    if (/^\d{1,2}$/.test(w) && MONTHS[w1] != null) {
      var day = parseInt(w, 10);
      var year = /^\d{4}$/.test(w2) ? parseInt(w2, 10) : null;
      var dt = new Date(year != null ? year : new Date().getFullYear(), MONTHS[w1], day);
      if (year == null && dt < U.fromKey(today)) dt.setFullYear(dt.getFullYear() + 1);
      if (dt.getDate() === day) return { key: U.toKey(dt), len: year != null ? 3 : 2 };
    }

    // 12/03, 12-03-2026, 12.03.26
    var m = w.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
    if (m) {
      var dd = parseInt(m[1], 10), mm = parseInt(m[2], 10) - 1;
      var yy = m[3] ? parseInt(m[3], 10) : null;
      if (yy != null && yy < 100) yy += 2000;
      if (mm >= 0 && mm <= 11 && dd >= 1 && dd <= 31) {
        var date = new Date(yy != null ? yy : new Date().getFullYear(), mm, dd);
        if (yy == null && date < U.fromKey(today)) date.setFullYear(date.getFullYear() + 1);
        if (date.getDate() === dd && date.getMonth() === mm) return { key: U.toKey(date), len: 1 };
      }
    }

    // solo il nome del giorno -> prossima occorrenza (oggi incluso)
    if (WEEKDAYS[w] != null) return { key: nextWeekday(WEEKDAYS[w], false), len: 1 };

    return null;
  }

  /**
   * Analizza il testo e restituisce i campi riconosciuti.
   * `known` è opzionale: { projects:[{id,name}] } per agganciare "+progetto".
   */
  function parse(text, known) {
    var result = {
      title: '', due: null, priority: 0,
      tags: [], assignees: [], projectName: null, projectId: null,
      matched: []
    };
    if (!text) return result;

    var words = String(text).split(/\s+/).filter(Boolean);
    var keep = [];
    var i = 0;

    while (i < words.length) {
      var w = words[i];
      var lower = w.toLowerCase();

      if (w[0] === '#' && w.length > 1) {
        result.tags.push(w.slice(1).toLowerCase());
        result.matched.push({ type: 'tag', text: w });
        i++; continue;
      }

      if (w[0] === '@' && w.length > 1) {
        result.assignees.push(w.slice(1));
        result.matched.push({ type: 'person', text: w });
        i++; continue;
      }

      if (w[0] === '+' && w.length > 1) {
        result.projectName = w.slice(1);
        result.matched.push({ type: 'project', text: w });
        i++; continue;
      }

      if (w[0] === '!' && w.length > 1 && PRIORITIES[lower.slice(1)] != null) {
        result.priority = PRIORITIES[lower.slice(1)];
        result.matched.push({ type: 'priority', text: w });
        i++; continue;
      }

      var d = matchDate(words, i);
      if (d) {
        result.due = d.key;
        result.matched.push({ type: 'due', text: words.slice(i, i + d.len).join(' ') });
        i += d.len; continue;
      }

      keep.push(w);
      i++;
    }

    result.title = keep.join(' ').trim();

    if (result.projectName && known && known.projects) {
      var needle = result.projectName.toLowerCase();
      var hit = known.projects.filter(function (p) {
        return p.name.toLowerCase() === needle;
      })[0] || known.projects.filter(function (p) {
        return p.name.toLowerCase().indexOf(needle) === 0;
      })[0];
      if (hit) result.projectId = hit.id;
    }

    return result;
  }

  global.Parse = { parse: parse, PRIORITIES: PRIORITIES, WEEKDAYS: WEEKDAYS };
})(window);
