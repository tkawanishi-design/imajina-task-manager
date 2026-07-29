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

// 画像からOCR（Tesseract.jsをブラウザ内で実行・API消費なし）
async function schedOCR(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const status = document.getElementById('sched-ocr-status');
  const setStatus = (t) => { if (status) status.textContent = t; };
  try {
    if (!window.Tesseract) {
      setStatus('OCRライブラリを読み込み中…');
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = res; s.onerror = () => rej(new Error('ライブラリの読み込みに失敗しました'));
        document.head.appendChild(s);
      });
    }
    setStatus('画像を解析中…（初回は日本語データのDLで数十秒かかります）');
    const { data } = await Tesseract.recognize(file, 'jpn+eng', {
      logger: m => { if (m.status === 'recognizing text') setStatus('解析中… ' + Math.round(m.progress * 100) + '%'); }
    });
    const ta = document.getElementById('sched-import-text');
    if (ta) ta.value = (ta.value ? ta.value + '\n' : '') + (data.text || '').trim();
    setStatus('読み取り完了。内容を確認・修正して「取り込む」を押してください（認識ミスは手直し前提です）。');
  } catch (e) {
    setStatus('OCRに失敗しました: ' + e.message + ' → テキストを直接入力してください。');
  } finally {
    input.value = '';
  }
}
