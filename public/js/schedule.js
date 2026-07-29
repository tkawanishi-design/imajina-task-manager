// ===== スケジュール機能クライアント =====
function schedDate() {
  const el = document.querySelector('.day-schedule');
  return (el && el.dataset.date) ? el.dataset.date : '';
}
function schedPost(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

// テキスト/OCRテキストの取り込み
function schedImport(replace) {
  const ta = document.getElementById('sched-import-text');
  const text = (ta && ta.value || '').trim();
  if (!text) { alert('予定テキストを入力してください'); return; }
  schedPost('/api/schedule/import', { date: schedDate(), text, replace: !!replace })
    .then(d => {
      if (d.ok) {
        if (d.added === 0) alert('取り込める行がありませんでした。「10:00-10:30 会議名」の形式で入力してください。');
        location.reload();
      } else alert(d.error || '取り込みに失敗しました');
    });
}

// 予定を1件手動追加
function schedAddEvent() {
  const start = document.getElementById('sched-add-start').value;
  const end = document.getElementById('sched-add-end').value;
  const title = document.getElementById('sched-add-title').value;
  if (!start || !end) { alert('開始・終了時刻を入力してください'); return; }
  schedPost('/api/schedule/events', { date: schedDate(), start, end, title })
    .then(d => { if (d.ok) location.reload(); else alert(d.error || '追加に失敗しました'); });
}

// 昼休み(12:00-13:00)をワンタッチ追加
function schedQuickLunch() {
  schedPost('/api/schedule/events', { date: schedDate(), start: '12:00', end: '13:00', title: '昼休み', kind: 'break' })
    .then(d => { if (d.ok) location.reload(); else alert(d.error || '追加に失敗しました'); });
}

// 予定を削除
function schedDeleteEvent(id) {
  fetch('/api/schedule/events/' + id, { method: 'DELETE' })
    .then(r => r.json()).then(d => { if (d.ok) location.reload(); });
}

// 勤務時間の保存
function schedSaveSettings() {
  const work_start = document.getElementById('sched-work-start').value;
  const work_end = document.getElementById('sched-work-end').value;
  schedPost('/api/schedule/settings', { date: schedDate(), work_start, work_end })
    .then(d => { if (d.ok) location.reload(); else alert(d.error || '保存に失敗しました'); });
}
