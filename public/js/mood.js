// 気分日記（1日の終わりに気分とひとことを記録）の共通部品。
// サーバー(EJS)からは require して顔アイコンの描画に、ブラウザでは入力部品(MoodUI)として使う。
(function (root) {
  var MOODS = [
    null,
    { v: 1, label: '最悪', color: '#ef4444' },
    { v: 2, label: '悪い', color: '#f59e0b' },
    { v: 3, label: 'ふつう', color: '#38bdf8' },
    { v: 4, label: '良い', color: '#84cc16' },
    { v: 5, label: '最高', color: '#10b981' }
  ];
  // 口の形（5=大きな笑顔 … 1=への字）
  var MOUTH = [
    null,
    'M7.5 17 Q12 12.2 16.5 17',
    'M8.5 16.3 Q12 13.8 15.5 16.3',
    'M8.5 15.2 H15.5',
    'M8.5 14 Q12 16.8 15.5 14',
    'M7.5 13.4 Q12 19 16.5 13.4'
  ];

  function info(v) { return MOODS[v] || null; }
  function label(v) { var m = info(v); return m ? m.label : '未記録'; }
  function color(v) { var m = info(v); return m ? m.color : '#d1d5db'; }

  // 気分の顔アイコン(SVG文字列)。v が無ければ「未記録」の点線丸
  function face(v, size) {
    size = size || 28;
    var m = info(v);
    if (!m) {
      return '<svg class="mood-face mood-face-empty" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="10.5" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="3 2.5"/></svg>';
    }
    var eyes = v === 5
      ? '<path d="M7.6 10.2 Q9 8.6 10.4 10.2 M13.6 10.2 Q15 8.6 16.4 10.2" stroke="#1f2937" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      : '<circle cx="9" cy="10" r="1.3" fill="#1f2937"/><circle cx="15" cy="10" r="1.3" fill="#1f2937"/>';
    var brows = v === 1
      ? '<path d="M7 7.6 L10.4 8.6 M17 7.6 L13.6 8.6" stroke="#1f2937" stroke-width="1.3" stroke-linecap="round"/>'
      : '';
    return '<svg class="mood-face" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" role="img" aria-label="' + m.label + '">'
      + '<circle cx="12" cy="12" r="11" fill="' + m.color + '"/>'
      + brows + eyes
      + '<path d="' + MOUTH[v] + '" stroke="#1f2937" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
  }

  var Mood = { MOODS: MOODS, info: info, label: label, color: color, face: face };
  if (typeof module !== 'undefined' && module.exports) { module.exports = Mood; return; }
  root.Mood = Mood;

  // ===== ブラウザ：気分の入力部品 =====
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function note(msg, type) { if (typeof root.toast === 'function') root.toast(msg, type ? { type: type, duration: 3000 } : undefined); }

  // current: { mood, comment, comment_private } または null
  function pickerHtml(date, current, opts) {
    opts = opts || {};
    var cur = current || {};
    var opt = '';
    for (var v = 5; v >= 1; v--) {
      var sel = cur.mood === v;
      opt += '<button type="button" class="mood-opt' + (sel ? ' is-selected' : '') + '" data-mood="' + v + '" role="radio" aria-checked="' + sel + '">'
        + face(v, 40) + '<span>' + MOODS[v].label + '</span></button>';
    }
    return '<div class="mood-picker" data-date="' + esc(date) + '"' + (cur.mood ? ' data-mood="' + cur.mood + '"' : '') + '>'
      + '<div class="mood-q">' + esc(opts.question || '今日の気分は？') + '</div>'
      + '<div class="mood-opts" role="radiogroup" aria-label="気分">' + opt + '</div>'
      + '<textarea class="mood-comment" maxlength="500" rows="2" placeholder="ひとこと日記（任意）：今日あったこと・感じたこと">' + esc(cur.comment || '') + '</textarea>'
      + '<div class="mood-row">'
      + '<label class="mood-private"><input type="checkbox" class="mood-private-cb"' + (cur.comment_private ? ' checked' : '') + '> コメントは自分だけに表示</label>'
      + '<span class="mood-status" aria-live="polite">' + (cur.mood ? '記録済み' : '') + '</span>'
      + '<button type="button" class="btn btn-primary btn-sm mood-save">' + (cur.mood ? '更新する' : '記録する') + '</button>'
      + '</div>'
      + '<div class="mood-share-note">気分は上司（マネージャー／担当リーダー）にも共有されます。チームの他のメンバーには表示されません。</div>'
      + '</div>';
  }

  function setStatus(p, msg, cls) {
    var s = p.querySelector('.mood-status');
    if (!s) return;
    s.textContent = msg;
    s.className = 'mood-status' + (cls ? ' ' + cls : '');
  }

  // 気分を保存（opts.keepalive: 閉じる/離脱時の取りこぼし防止）
  function save(p, opts) {
    opts = opts || {};
    var mood = parseInt(p.dataset.mood || '0', 10);
    if (!mood) {
      setStatus(p, '気分を選んでください', 'is-error');
      p.classList.remove('mood-shake'); void p.offsetWidth; p.classList.add('mood-shake');
      return Promise.resolve(null);
    }
    var ta = p.querySelector('.mood-comment');
    var cb = p.querySelector('.mood-private-cb');
    var body = { date: p.dataset.date, mood: mood, comment: ta ? ta.value : '', commentPrivate: !!(cb && cb.checked) };
    p.dataset.dirty = '';
    setStatus(p, '保存中…');
    return fetch('/api/moods', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), keepalive: !!opts.keepalive
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || ''); return d; }); })
      .then(function (d) {
        setStatus(p, '✓ 記録しました', 'is-ok');
        var btn = p.querySelector('.mood-save');
        if (btn) btn.textContent = '更新する';
        if (!opts.silent) note('気分を記録しました');
        // 閉じた後(画面から外れた後)に保存完了しても、ページ側が受け取れるよう document に流す
        (p.isConnected ? p : document).dispatchEvent(new CustomEvent('mood-saved', { bubbles: true, detail: d.mood }));
        return d.mood;
      })
      .catch(function (e) {
        p.dataset.dirty = '1';
        setStatus(p, '保存できませんでした', 'is-error');
        note((e && e.message) || '気分の保存に失敗しました。もう一度お試しください', 'error');
        return null;
      });
  }

  // 未保存のコメント等があれば保存（ポップアップを閉じる時に呼ぶ）
  function flush(container) {
    var ps = (container || document).querySelectorAll('.mood-picker');
    Array.prototype.forEach.call(ps, function (p) {
      if (p.dataset.dirty === '1' && p.dataset.mood) save(p, { keepalive: true, silent: true });
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.mood-opt');
    if (b) {
      var p = b.closest('.mood-picker');
      p.dataset.mood = b.dataset.mood;
      Array.prototype.forEach.call(p.querySelectorAll('.mood-opt'), function (o) {
        var on = o === b;
        o.classList.toggle('is-selected', on);
        o.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      save(p); // 顔をタップした時点で記録（閉じても消えない）
      return;
    }
    var s = e.target.closest && e.target.closest('.mood-save');
    if (s) save(s.closest('.mood-picker'));
  });
  function markDirty(e) {
    var p = e.target.closest && e.target.closest('.mood-picker');
    if (!p || !(e.target.matches('.mood-comment') || e.target.matches('.mood-private-cb'))) return;
    p.dataset.dirty = '1';
    setStatus(p, p.dataset.mood ? '未保存の変更があります' : '');
  }
  document.addEventListener('input', markDirty);
  document.addEventListener('change', markDirty);
  // タブを閉じる・移動する時も未保存分を送る
  root.addEventListener('pagehide', function () { flush(); });

  root.MoodUI = { pickerHtml: pickerHtml, save: save, flush: flush };
})(typeof window !== 'undefined' ? window : this);
