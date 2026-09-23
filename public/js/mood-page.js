// 気分の記録ページ（週・月）：日付を選ぶと詳細を表示。本人なら過去日も含めてその場で記録・修正できる
(function () {
  var P = window.MOOD_PAGE;
  var detail = document.getElementById('mood-detail');
  if (!P || !detail) return;
  var CELLS = '.mood-cal-cell[data-date], .mood-week-row[data-date]';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(date) {
    var e = P.byDate[date] || null;
    Array.prototype.forEach.call(document.querySelectorAll(CELLS), function (el) {
      el.classList.toggle('is-sel', el.dataset.date === date);
    });
    var head = '<div class="mood-detail-head">' + esc(P.labels[date] || date)
      + (date === P.today ? ' <span class="mood-today-badge">今日</span>' : '') + '</div>';
    if (P.isSelf && date <= P.today) {
      detail.innerHTML = head + MoodUI.pickerHtml(date, e, { question: date === P.today ? '今日の気分は？' : 'この日の気分は？' });
    } else if (e) {
      detail.innerHTML = head + '<div class="mood-detail-view">' + Mood.face(e.mood, 44)
        + '<div><b>' + esc(Mood.label(e.mood)) + '</b>'
        + (e.comment ? '<p class="mood-detail-comment"></p>' : '<p class="ds-muted">コメントはありません</p>')
        + '</div></div>';
      var c = detail.querySelector('.mood-detail-comment');
      if (c) c.textContent = e.comment;
    } else {
      detail.innerHTML = head + '<p class="ds-muted">この日の記録はありません</p>';
    }
  }

  document.addEventListener('click', function (ev) {
    var cell = ev.target.closest && ev.target.closest(CELLS);
    if (!cell || cell.disabled) return;
    if (P.isSelf) MoodUI.flush(detail); // 別の日に移る前に書きかけを保存
    render(cell.dataset.date);
    if (window.innerWidth < 900) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // 記録したら：その日のマスを更新し、集計・グラフは同じページを取り直して差し替える（再読み込みなし）
  document.addEventListener('mood-saved', function (ev) {
    var m = ev.detail;
    if (!m) return;
    P.byDate[m.date] = m;
    var cell = document.querySelector('.mood-cal-cell[data-date="' + m.date + '"], .mood-week-row[data-date="' + m.date + '"]');
    if (cell) {
      var f = cell.querySelector('.mood-cal-face');
      if (f) f.innerHTML = Mood.face(m.mood, cell.classList.contains('mood-week-row') ? 34 : 30);
      var note = cell.querySelector('.mood-cal-note');
      if (note) note.classList.toggle('is-hidden', !m.comment);
      var lb = cell.querySelector('.mood-week-label');
      if (lb) lb.textContent = Mood.label(m.mood);
      var cm = cell.querySelector('.mood-week-comment');
      if (cm) cm.textContent = m.comment || '';
      cell.setAttribute('aria-label', (P.labels[m.date] || m.date) + ' ' + Mood.label(m.mood));
    }
    fetch(location.href, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (html) {
        if (!html) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.getElementById('mood-summary');
        var cur = document.getElementById('mood-summary');
        if (fresh && cur) cur.innerHTML = fresh.innerHTML;
      })
      .catch(function () {});
  });

  if (P.sel) render(P.sel);
})();
