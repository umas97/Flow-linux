/* Utility condivise: date, DOM, id, formattazione. */
(function (global) {
  'use strict';

  /* ---------- id ---------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- date (sempre in ora locale, chiave "YYYY-MM-DD") ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fromKey(k) {
    if (!k) return null;
    var p = String(k).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function today() { return toKey(new Date()); }

  function addDays(key, n) {
    var d = fromKey(key) || new Date();
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function diffDays(key, from) {
    var a = fromKey(key), b = fromKey(from || today());
    if (!a || !b) return null;
    return Math.round((a - b) / 86400000);
  }

  var MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var DAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  /** Etichetta amichevole: "Oggi", "Ieri", "mer 12 mar". */
  function humanDate(key, opts) {
    var d = fromKey(key);
    if (!d) return '';
    var delta = diffDays(key);
    if (delta === 0) return 'Oggi';
    if (delta === 1) return 'Domani';
    if (delta === -1) return 'Ieri';
    if (delta > 1 && delta < 7) return DAYS[d.getDay()].replace(/^./, function (c) { return c.toUpperCase(); });
    var sameYear = d.getFullYear() === new Date().getFullYear();
    var s = d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
    if (!sameYear) s += ' ' + d.getFullYear();
    if (opts && opts.weekday) s = DAYS_SHORT[d.getDay()] + ' ' + s;
    return s;
  }

  function longDate(key) {
    var d = fromKey(key);
    if (!d) return '';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /** Lunedì della settimana contenente `key`. */
  function startOfWeek(key) {
    var d = fromKey(key) || new Date();
    var dow = (d.getDay() + 6) % 7; // lunedì = 0
    d.setDate(d.getDate() - dow);
    return toKey(d);
  }

  function relativeTime(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'adesso';
    if (s < 3600) return Math.floor(s / 60) + ' min fa';
    if (s < 86400) return Math.floor(s / 3600) + ' h fa';
    var d = Math.floor(s / 86400);
    if (d < 30) return d + ' g fa';
    return humanDate(toKey(new Date(t)));
  }

  /* ---------- testo ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Markdown minimale e sicuro: **grassetto**, *corsivo*, `codice`, link, elenchi, righe. */
  function miniMarkdown(src) {
    if (!src) return '';
    var lines = String(src).split(/\r?\n/);
    var out = [], inList = false;

    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      t = t.replace(/\bhttps?:\/\/[^\s<]+/g, function (u) {
        return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
      });
      return t;
    }

    lines.forEach(function (raw) {
      var line = raw.trimEnd();
      var m = line.match(/^\s*[-*•]\s+(.*)$/);
      if (m) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(m[1]) + '</li>');
        return;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      if (!line.trim()) { out.push(''); return; }
      var h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { out.push('<h4>' + inline(h[2]) + '</h4>'); return; }
      out.push('<p>' + inline(line) + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }

  function bytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '')[0] || '?').toUpperCase() + (p.length > 1 ? (p[p.length - 1][0] || '').toUpperCase() : '');
  }

  /** Colore stabile derivato da una stringa (per avatar / etichette). */
  function hashHue(s) {
    var h = 0;
    for (var i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360;
    return h;
  }

  /* ---------- DOM ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'dataset') Object.assign(n.dataset, attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    if (html != null) n.innerHTML = html;
    return n;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  /** Un elemento a caso da una lista. */
  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Ordinamento stabile con chiavi frazionarie per il drag & drop. */
  function orderBetween(before, after) {
    if (before == null && after == null) return 1000;
    if (before == null) return after - 1000;
    if (after == null) return before + 1000;
    return (before + after) / 2;
  }

  global.U = {
    uid: uid, toKey: toKey, fromKey: fromKey, today: today, addDays: addDays, diffDays: diffDays,
    humanDate: humanDate, longDate: longDate, startOfWeek: startOfWeek, relativeTime: relativeTime,
    MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT, DAYS: DAYS, DAYS_SHORT: DAYS_SHORT,
    esc: esc, miniMarkdown: miniMarkdown, initials: initials, hashHue: hashHue, bytes: bytes,
    $: $, $$: $$, el: el, debounce: debounce, pick: pick, orderBetween: orderBetween
  };
})(window);
