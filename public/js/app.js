let pendingTask = null;
let pendingRowHtml = '';

function getViewDate() {
  const params = new URLSearchParams(window.location.search);
  return params.get('date') || '';
}

// ===== 手触り改善の共通部品 =====
// 自分の操作の直後は、サーバーからの更新通知(反響)で画面を再読み込みしない（その場で反映済みのため）
function markSelfMutation() { window.__lastSelfMutation = Date.now(); }

// トースト通知（textContentで描画するのでタイトル等のHTMLは解釈されない）
function toast(msg, opts) {
  opts = opts || {};
  let area = document.getElementById('toast-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'toast-area';
    area.setAttribute('role', 'status');
    area.setAttribute('aria-live', 'polite');
    document.body.appendChild(area);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (opts.type ? ' toast-' + opts.type : '');
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  };
  if (opts.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = opts.action.label;
    b.addEventListener('click', () => { opts.action.onClick(); close(); });
    el.appendChild(b);
  }
  area.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-in'));
  setTimeout(close, opts.duration || 2200);
  return { close };
}
let _savedToastTimer = null;
function toastSaved() {
  clearTimeout(_savedToastTimer);
  _savedToastTimer = setTimeout(() => toast('✓ 保存しました', { duration: 1300 }), 300);
}

function fmtMinJS(min) {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return m + 'm';
  if (m === 0) return h + 'h';
  return h + 'h' + m + 'm';
}

// 上部の数字・進捗バー・ひとことを、画面上のタスクから再計算してその場で更新
function recomputeStats() {
  const list = document.getElementById('task-list');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('.task-item[data-id]')).filter(r => !r.classList.contains('task-pending-delete'));
  const count = rows.length;
  let est = 0, act = 0, prog = 0, done = 0;
  rows.forEach(r => {
    est += parseInt((r.querySelector('.est-input') || {}).value) || 0;
    act += parseInt((r.querySelector('.actual-input') || {}).value) || 0;
    prog += parseInt((r.querySelector('.progress-slider') || {}).value) || 0;
    if (r.classList.contains('completed')) done++;
  });
  const overall = count ? Math.round(prog / count) : 0;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-count', count);
  set('stat-progress', overall + '%');
  set('stat-est', fmtMinJS(est));
  set('stat-actual', fmtMinJS(act));
  set('overall-pct', overall);
  set('overall-done', done);
  set('overall-total', count);
  const statsRow = document.getElementById('stats-row');
  const phase = statsRow ? (parseInt(statsRow.dataset.phase) || 0) : 0;
  const pc = document.getElementById('stat-progress-card');
  if (pc) {
    pc.classList.remove('danger', 'warning', 'success');
    pc.classList.add(overall < 30 && phase >= 3 ? 'danger' : overall < 60 ? 'warning' : 'success');
  }
  const ac = document.getElementById('stat-actual-card');
  if (ac) ac.classList.toggle('danger', act > est);
  const head = document.getElementById('overall-head');
  if (head) head.style.color = overall >= 80 ? 'var(--success)' : overall >= 40 ? 'var(--warning)' : 'var(--danger)';
  const bar = document.getElementById('overall-bar');
  if (bar) {
    bar.style.width = overall + '%';
    bar.classList.remove('low', 'mid', 'high');
    bar.classList.add(overall < 30 ? 'low' : overall < 70 ? 'mid' : 'high');
  }
  const mot = document.getElementById('motivation-msg');
  const op = document.getElementById('overall-progress');
  if (mot && op) {
    let msg;
    if (op.dataset.future === '1') msg = count === 0 ? '明日のタスクを今のうちに準備しよう' : count + '件のタスクを準備済み。明日もいい1日に';
    else if (count === 0) msg = 'タスクを登録して今日をデザインしよう';
    else if (overall === 100) msg = 'All tasks completed. おつかれさまでした';
    else if (overall >= 80) msg = 'ラストスパート。ゴールはすぐそこ';
    else if (overall >= 50) msg = '折り返し地点を通過。この調子で';
    else if (overall >= 25) msg = 'いいペース。自分のリズムで進めよう';
    else if (overall > 0) msg = 'スタートダッシュ。この調子で進めよう';
    else msg = '今日も自分をアップデートしよう';
    mot.textContent = msg;
  }
  let empty = document.getElementById('task-empty');
  if (count === 0 && !empty) {
    empty = document.createElement('p');
    empty.id = 'task-empty';
    empty.style.cssText = 'text-align:center;color:var(--gray-400);padding:40px 0;';
    empty.textContent = 'タスクを追加してください';
    list.appendChild(empty);
  }
  if (empty) empty.style.display = count === 0 ? '' : 'none';
}

function setSlider(item, value) {
  const slider = item.querySelector('.progress-slider');
  const val = item.querySelector('.progress-val');
  if (slider) slider.value = value;
  if (val) val.textContent = value + '%';
}
function syncStatusSelect(item, status) {
  if (!item) return;
  const sel = item.querySelector('.status-select');
  if (sel) sel.value = status;
  item.classList.toggle('in-progress', status === 'in_progress');
}
// 完了状態（チェック表示・並び位置）をそろえる
function setRowCompleted(item, completed) {
  const check = item.querySelector('.task-check');
  if (check) {
    check.classList.toggle('is-done', completed);
    check.setAttribute('aria-pressed', completed ? 'true' : 'false');
    check.setAttribute('aria-label', completed ? '完了を取り消す' : '完了にする');
    check.title = completed ? '完了を取り消す' : 'クリックで完了';
  }
  const isDone = item.classList.contains('completed');
  if (completed && !isDone) moveCompletedToBottom(item, true);
  else if (!completed && isDone) moveCompletedToBottom(item, false);
}

// ✓ワンタップで完了／取り消し（取り消し時は完了前の進捗に戻す）
function toggleTaskDone(check) {
  const item = check.closest('.task-item');
  if (!item) return;
  const id = check.dataset.id;
  const slider = item.querySelector('.progress-slider');
  if (!item.classList.contains('completed')) {
    item.dataset.prevProgress = slider ? slider.value : '0';
    updateTask(id, { status: 'completed', progress: 100 });
    setSlider(item, 100);
    syncStatusSelect(item, 'completed');
    setRowCompleted(item, true);
    check.classList.add('pop');
    setTimeout(() => check.classList.remove('pop'), 350);
    toast('完了にしました 🎉', { duration: 1600 });
  } else {
    const prev = parseInt(item.dataset.prevProgress || '0');
    const p = prev >= 100 ? 0 : prev;
    const status = p > 0 ? 'in_progress' : 'pending';
    updateTask(id, { status, progress: p });
    setSlider(item, p);
    syncStatusSelect(item, status);
    setRowCompleted(item, false);
    toast('未完了に戻しました', { duration: 1400 });
  }
  recomputeStats();
}

// サーバーが描画したタスク行を、未完了タスクの末尾（完了タスクの上）へ差し込む
function insertTaskRow(html) {
  const list = document.getElementById('task-list');
  if (!list || !html) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = html.trim();
  const row = tmp.firstElementChild;
  if (!row) return null;
  const firstDone = list.querySelector('.task-item.completed');
  if (firstDone) list.insertBefore(row, firstDone); else list.appendChild(row);
  row.classList.add('task-enter');
  requestAnimationFrame(() => requestAnimationFrame(() => row.classList.remove('task-enter')));
  renumberTasks();
  recomputeStats();
  return row;
}
function clearChipActive() {
  document.querySelectorAll('.quick-chips .chip.active').forEach(c => c.classList.remove('active'));
}
function resetAddForm() {
  const titleEl = document.getElementById('new-task-title');
  const timeEl = document.getElementById('new-task-time');
  if (timeEl) timeEl.value = '';
  clearChipActive();
  if (titleEl) { titleEl.value = ''; titleEl.focus(); } // リロードしないのでIMEは日本語のまま
}

// ===== 削除：確認ダイアログの代わりに「元に戻す」付きで数秒待ってから確定 =====
const pendingDeletes = new Map();
function commitDelete(id) {
  const entry = pendingDeletes.get(String(id));
  if (!entry) return;
  pendingDeletes.delete(String(id));
  markSelfMutation();
  fetch('/api/tasks/' + id, { method: 'DELETE', keepalive: true })
    .then(r => { if (!r.ok) throw new Error(); entry.row.remove(); })
    .catch(() => {
      entry.row.style.display = '';
      entry.row.classList.remove('task-pending-delete', 'task-exit');
      renumberTasks();
      recomputeStats();
      toast('削除に失敗しました。もう一度お試しください', { type: 'error', duration: 3000 });
    });
}
function undoDelete(id) {
  const entry = pendingDeletes.get(String(id));
  if (!entry) return;
  clearTimeout(entry.timer);
  pendingDeletes.delete(String(id));
  entry.row.style.display = '';
  entry.row.classList.remove('task-pending-delete');
  requestAnimationFrame(() => entry.row.classList.remove('task-exit'));
  renumberTasks();
  recomputeStats();
  toast('元に戻しました', { duration: 1400 });
}
function flushPendingDeletes() {
  const ps = [];
  pendingDeletes.forEach((entry, id) => {
    clearTimeout(entry.timer);
    ps.push(fetch('/api/tasks/' + id, { method: 'DELETE', keepalive: true }).catch(() => {}));
  });
  pendingDeletes.clear();
  if (ps.length) markSelfMutation();
  return Promise.all(ps);
}
// 待機中の削除があるままページを離れても、削除は確実に確定させる
window.addEventListener('pagehide', function () { if (pendingDeletes.size) flushPendingDeletes(); });
function reloadAfterFlush() {
  const go = () => location.reload();
  if (pendingDeletes.size) flushPendingDeletes().then(go, go); else go();
}

let addingTask = false;
let splitConfirmed = false;
function addTask() {
  if (addingTask) return;
  const title = document.getElementById('new-task-title').value.trim();
  const estimated = parseInt(document.getElementById('new-task-time').value) || 0;
  const priorityEl = document.getElementById('new-task-priority');
  const priority = priorityEl ? parseInt(priorityEl.value) : 3;
  if (!title) return;
  const viewDate = getViewDate();

  // 60分超えで細分化サジェスト（確認済みならスキップ）
  if (estimated > 60 && !splitConfirmed) {
    showSplitSuggestion(title, estimated, priority);
    return;
  }
  splitConfirmed = false;

  addingTask = true;
  const addBtn = document.getElementById('add-task-btn');
  if (addBtn) { addBtn.disabled = true; addBtn.textContent = '追加中...'; }
  const resetBtn = () => {
    addingTask = false;
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = '追加'; }
  };

  markSelfMutation();
  fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, estimated_minutes: estimated, date: viewDate || undefined, priority })
  }).then(r => r.json()).then(data => {
    if (data.error === 'duplicate_title') {
      resetBtn();
      toast('同じタスクが既に登録されています', { type: 'error', duration: 2600 });
      return;
    }
    if (data.duplicates && data.duplicates.length > 0) {
      resetBtn();
      pendingTask = data.task;
      pendingRowHtml = data.rowHtml || '';
      showDuplicateWarning(data.duplicates, data.task);
      return;
    }
    if (data.rowHtml && insertTaskRow(data.rowHtml)) {
      resetBtn();
      resetAddForm();
      toast('追加しました', { duration: 1400 });
    } else {
      // 行の描画に失敗した場合だけ従来どおり再読み込み
      sessionStorage.setItem('taskJustAdded', '1');
      location.reload();
    }
  }).catch(() => {
    resetBtn();
    toast('追加に失敗しました。通信を確認してください', { type: 'error', duration: 3000 });
  });
}

function showDuplicateWarning(dupes, task) {
  const body = document.getElementById('duplicate-modal-body');
  let html = '<p style="margin-bottom:12px;">以下のメンバーが類似タスクを登録しています：</p>';
  dupes.forEach(d => {
    html += `<div class="duplicate-warning">
      <strong>${d.userName}</strong>さんが「${d.title}」を登録中（進捗: ${d.progress}%）
    </div>`;
  });
  html += `<p style="margin-top:12px;font-size:13px;color:var(--gray-500);">タスク「${task.title}」を追加しますか？</p>`;
  body.innerHTML = html;
  document.getElementById('duplicate-modal').classList.add('active');
}

function closeDuplicateModal() {
  document.getElementById('duplicate-modal').classList.remove('active');
  if (pendingTask) {
    // 取りやめ：サーバー側で作られたタスクを消すだけ（画面には差し込んでいないので再読み込み不要）
    markSelfMutation();
    fetch('/api/tasks/' + pendingTask.id, { method: 'DELETE' });
    pendingTask = null;
  }
  pendingRowHtml = '';
}

function confirmAddTask() {
  document.getElementById('duplicate-modal').classList.remove('active');
  const html = pendingRowHtml;
  pendingTask = null;
  pendingRowHtml = '';
  if (html && insertTaskRow(html)) {
    resetAddForm();
    toast('追加しました', { duration: 1400 });
  } else {
    location.reload();
  }
}

function showSplitSuggestion(title, estimated, priority) {
  fetch('/api/tasks/suggest-split', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, estimated_minutes: estimated })
  }).then(r => r.json()).then(data => {
    const modal = document.getElementById('split-modal');
    const body = document.getElementById('split-modal-body');
    let html = `<div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:10px;padding:14px;margin-bottom:16px;">
      <div style="font-weight:700;color:#92400e;font-size:15px;">⚠️ 見積り${estimated}分は長すぎます！</div>
      <div style="font-size:13px;color:#a16207;margin-top:4px;">30〜45分単位に分けて登録すると、進捗が把握しやすくなります</div>
    </div>`;
    html += `<p style="font-weight:700;margin-bottom:10px;">💡 こんな風に分けてみては？</p>`;
    data.suggestions.forEach((s, i) => {
      html += `<label class="split-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--gray-50);border-radius:8px;margin-bottom:6px;cursor:pointer;border:1px solid var(--gray-200);">
        <input type="checkbox" class="split-check" checked data-title="${s.title}" data-est="${s.minutes}" style="width:18px;height:18px;">
        <span style="flex:1;font-size:14px;font-weight:500;">${s.title}</span>
        <span style="font-size:13px;color:var(--gray-500);">${s.minutes}分</span>
      </label>`;
    });
    body.innerHTML = html;
    modal.classList.add('active');
    // Store priority for split registration
    modal.dataset.priority = priority;
  });
}

function closeSplitModal() {
  document.getElementById('split-modal').classList.remove('active');
}

function addSplitTasks() {
  const modal = document.getElementById('split-modal');
  const checks = modal.querySelectorAll('.split-check:checked');
  if (checks.length === 0) { alert('1つ以上選択してください'); return; }
  const viewDate = getViewDate();
  const priority = parseInt(modal.dataset.priority) || 3;
  const tasks = [];
  checks.forEach(c => {
    tasks.push({ title: c.dataset.title, estimated_minutes: parseInt(c.dataset.est), priority });
  });
  modal.classList.remove('active');
  addingTask = true;
  const addBtn = document.getElementById('add-task-btn');
  if (addBtn) { addBtn.disabled = true; addBtn.textContent = '追加中...'; }

  Promise.all(tasks.map(t =>
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: t.title, estimated_minutes: t.estimated_minutes, date: viewDate || undefined, priority: t.priority })
    })
  )).then(() => location.reload()).catch(() => location.reload());
}

function skipSplitAndAdd() {
  document.getElementById('split-modal').classList.remove('active');
  splitConfirmed = true;
  addTask();
}

function deleteTask(id) {
  const row = document.querySelector('#task-list .task-item[data-id="' + id + '"]');
  if (!row) {
    // 一覧外から呼ばれた場合は従来どおり確認して削除
    if (!confirm('このタスクを削除しますか？')) return;
    markSelfMutation();
    fetch('/api/tasks/' + id, { method: 'DELETE' }).then(() => location.reload());
    return;
  }
  if (pendingDeletes.has(String(id))) return;
  const titleEl = row.querySelector('.task-title');
  let title = titleEl ? titleEl.textContent.replace(/^\d+\.\s*/, '').trim() : '';
  if (title.length > 18) title = title.slice(0, 18) + '…';
  row.classList.add('task-pending-delete', 'task-exit');
  const entry = { row };
  setTimeout(() => { if (pendingDeletes.get(String(id)) === entry) row.style.display = 'none'; }, 220);
  entry.timer = setTimeout(() => commitDelete(id), 5000);
  pendingDeletes.set(String(id), entry);
  renumberTasks();
  recomputeStats();
  toast('「' + title + '」を削除しました', { duration: 5000, action: { label: '元に戻す', onClick: () => undoDelete(id) } });
}

const inflightSaves = new Set(); // 保存中の通信（業務終了の分析前に完了を待つため）
function updateTask(id, data) {
  markSelfMutation();
  const p = fetch('/api/tasks/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => {
    if (!r.ok) throw new Error('save failed');
    return r.json();
  }).catch(() => {
    toast('保存に失敗しました。通信を確認して再読み込みしてください', { type: 'error', duration: 3500 });
  });
  inflightSaves.add(p);
  p.finally(() => inflightSaves.delete(p));
  return p;
}

function moveCompletedToBottom(taskItem, isCompleted) {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  if (isCompleted) {
    // Add completed class and animate to bottom
    taskItem.classList.add('completed');
    taskItem.style.transition = 'opacity 0.3s, transform 0.3s';
    taskItem.style.opacity = '0.5';
    taskItem.style.transform = 'translateX(10px)';
    setTimeout(() => {
      taskList.appendChild(taskItem);
      taskItem.style.opacity = '';
      taskItem.style.transform = '';
      renumberTasks();
    }, 300);
  } else {
    // Uncompleted: move back above completed tasks
    taskItem.classList.remove('completed');
    const firstCompleted = taskList.querySelector('.task-item.completed');
    if (firstCompleted) {
      taskList.insertBefore(taskItem, firstCompleted);
    }
    renumberTasks();
  }
}

function renumberTasks() {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  let n = 0;
  taskList.querySelectorAll('.task-item').forEach(item => {
    if (item.classList.contains('task-pending-delete')) return; // 削除待ちは番号から除外
    n++;
    const titleEl = item.querySelector('.task-title');
    if (titleEl && !titleEl.querySelector('input')) { // タイトル編集中は上書きしない
      const text = titleEl.textContent.replace(/^\d+\.\s*/, '');
      titleEl.textContent = n + '. ' + text;
    }
  });
}

// ===== タスク操作はイベント委譲で受ける（あとから差し込んだ行もそのまま動く） =====
document.addEventListener('input', function (e) {
  const t = e.target;
  if (t.matches && t.matches('.progress-slider')) {
    const actions = t.closest('.task-actions');
    const val = actions && actions.querySelector('.progress-val');
    if (val) val.textContent = t.value + '%';
  } else if (t.id === 'new-task-time') {
    clearChipActive();
  }
});

document.addEventListener('change', function (e) {
  const t = e.target;
  if (!t.matches) return;
  const item = t.closest('.task-item');
  if (t.matches('.progress-slider')) {
    const progress = parseInt(t.value);
    const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';
    updateTask(t.dataset.id, { progress, status });
    if (item) { syncStatusSelect(item, status); setRowCompleted(item, progress === 100); }
    recomputeStats();
    toastSaved();
  } else if (t.matches('.est-input')) {
    updateTask(t.dataset.id, { estimated_minutes: parseInt(t.value) || 0 });
    recomputeStats();
    toastSaved();
  } else if (t.matches('.actual-input')) {
    updateTask(t.dataset.id, { actual_minutes: parseInt(t.value) || 0 });
    recomputeStats();
    toastSaved();
  } else if (t.matches('.status-select')) {
    const status = t.value;
    const data = { status };
    if (status === 'completed') data.progress = 100;
    updateTask(t.dataset.id, data);
    if (item) {
      if (status === 'completed') setSlider(item, 100);
      syncStatusSelect(item, status);
      setRowCompleted(item, status === 'completed');
    }
    recomputeStats();
    toastSaved();
  }
});

document.addEventListener('click', function (e) {
  if (!e.target.closest) return;
  const check = e.target.closest('.task-check');
  if (check) { toggleTaskDone(check); return; }
  const chip = e.target.closest('.quick-chips .chip');
  if (chip) {
    const input = document.getElementById('new-task-time');
    if (input) input.value = chip.dataset.min;
    document.querySelectorAll('.quick-chips .chip').forEach(c => c.classList.toggle('active', c === chip));
    const title = document.getElementById('new-task-title');
    if (title && !title.value.trim()) title.focus();
  }
});

// タイトル欄・分数欄どちらでもEnterで追加（日本語変換の確定Enterでは追加しない）
document.addEventListener('keypress', function (e) {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (e.target.id === 'new-task-title' || e.target.id === 'new-task-time') {
    e.preventDefault();
    addTask();
  }
});

function editTitle(el, taskId) {
  if (el.querySelector('input')) return; // already editing
  const currentText = el.textContent.replace(/^\d+\.\s*/, '').trim();
  const num = el.textContent.match(/^(\d+)\./)?.[1] || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = 'title-edit-input';
  input.style.cssText = 'width:100%;padding:4px 8px;font-size:14px;font-weight:600;border:2px solid var(--primary);border-radius:6px;outline:none;';
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();

  function save() {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentText) {
      updateTask(taskId, { title: newTitle });
      el.textContent = num + '. ' + newTitle;
    } else {
      el.textContent = num + '. ' + currentText;
    }
  }
  input.addEventListener('blur', save);
  input.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { input.blur(); }
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      input.removeEventListener('blur', save);
      el.textContent = num + '. ' + currentText;
    }
  });
}

function toggleComments(taskId) {
  const el = document.getElementById('comments-' + taskId);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block') loadComments(taskId, 'comments-list-' + taskId);
}

function loadComments(taskId, containerId) {
  fetch('/api/tasks/' + taskId + '/comments')
    .then(r => r.json())
    .then(comments => renderComments(comments, containerId));
}

function renderComments(comments, containerId) {
  const container = document.getElementById(containerId);
  if (comments.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--gray-400);padding:8px 0;">コメントなし</p>';
    return;
  }
  container.innerHTML = comments.map(c =>
    `<div class="comment ${c.is_question ? 'is-question' : ''}">
      <span class="comment-author">${c.user_name}${c.user_role === 'manager' ? '(MGR)' : ''}</span>
      <span>${c.is_question ? '❓ ' : ''}${c.message}</span>
      <span style="font-size:11px;color:var(--gray-400);margin-left:auto;white-space:nowrap;">${c.created_at.slice(11,16)}</span>
    </div>`
  ).join('');
}

function addComment(taskId) {
  const input = document.getElementById('comment-text-' + taskId);
  const isQuestion = document.getElementById('is-question-' + taskId).checked;
  if (!input.value.trim()) return;
  fetch('/api/tasks/' + taskId + '/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: input.value, is_question: isQuestion })
  }).then(r => r.json()).then(d => {
    input.value = '';
    document.getElementById('is-question-' + taskId).checked = false;
    renderComments(d.comments, 'comments-list-' + taskId);
  });
}

function submitReport(reportTime) {
  const notes = prompt('報告メモ (任意):') || '';
  fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_time: reportTime, notes })
  }).then(r => r.json()).then(d => {
    if (d.ok) location.reload();
  });
}

function uploadAvatar(input, userId) {
  if (!input.files[0]) return;
  const formData = new FormData();
  formData.append('avatar', input.files[0]);
  fetch('/api/users/' + userId + '/avatar', { method: 'POST', body: formData })
    .then(r => r.json()).then(d => { if (d.ok) location.reload(); });
}

// ===== タスク一括追加（貼り付け） =====
function taskBulkKey() { return 'taskBulkDraft:' + (getViewDate() || ''); }

function taskBulkImport() {
  const ta = document.getElementById('task-bulk-text');
  const text = (ta && ta.value || '').trim();
  if (!text) { alert('タスクを1行ずつ入力してください'); return; }
  const viewDate = getViewDate();
  markSelfMutation();
  fetch('/api/tasks/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: viewDate || undefined, text })
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      try { sessionStorage.removeItem(taskBulkKey()); } catch (e) {}
      if (d.added === 0) alert('追加できるタスクがありませんでした（既に同じ名前がある／空 など）。');
      reloadAfterFlush();
    } else alert(d.error || '追加に失敗しました');
  }).catch(() => alert('通信エラーが発生しました'));
}

// テキストをクリップボードにコピー（プロンプト用・共通）
function copyTextToClipboard(text, btn) {
  const done = () => {
    const orig = btn.textContent;
    btn.textContent = '✓ コピーしました';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { alert('コピーに失敗しました。手動で選択してコピーしてください。'); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
}
function taskCopyPrompt(btn) {
  const el = document.getElementById('task-prompt');
  copyTextToClipboard(el ? el.textContent : '', btn);
}

// 一括貼り付けの下書き自動保存・復元（リロードで消えないように）
document.addEventListener('DOMContentLoaded', function () {
  const box = document.getElementById('task-bulk-text');
  if (!box) return;
  const key = taskBulkKey();
  try { const saved = sessionStorage.getItem(key); if (saved && !box.value.trim()) box.value = saved; } catch (e) {}
  box.addEventListener('input', function () {
    try {
      if (box.value.trim()) sessionStorage.setItem(key, box.value);
      else sessionStorage.removeItem(key);
    } catch (e) {}
  });
});

// タスク追加後、入力欄に自動フォーカス（IMEリセット対策）
document.addEventListener('DOMContentLoaded', function() {
  if (sessionStorage.getItem('taskJustAdded')) {
    sessionStorage.removeItem('taskJustAdded');
    const titleInput = document.getElementById('new-task-title');
    if (titleInput) {
      // スクロールして入力欄を見える位置に
      titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 少し遅延してフォーカス（IMEが安定するのを待つ）
      setTimeout(function() { titleInput.focus(); }, 300);
    }
  }
});

// 強制退勤CAUTIONバナー：設定時刻(JST)を過ぎたら表示、30秒ごとに再判定
document.addEventListener('DOMContentLoaded', function() {
  const el = document.getElementById('force-leave-banner');
  if (!el) return;
  const parts = (el.dataset.flTime || '20:00').split(':');
  const target = (parseInt(parts[0], 10) || 20) * 60 + (parseInt(parts[1], 10) || 0);
  function check() {
    const now = new Date();
    const jst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
    const cur = jst.getHours() * 60 + jst.getMinutes();
    el.style.display = (cur >= target) ? 'flex' : 'none';
  }
  check();
  setInterval(check, 30000);
});

// スケジュール等を入力中かどうか（入力中は自動リロードを抑止して入力消失を防ぐ）
function isEditingScheduleArea() {
  var a = document.activeElement;
  if (!a) return false;
  if (a.id === 'sched-import-text' || a.id === 'task-bulk-text') return true;
  return !!(a.closest && a.closest('.day-schedule') && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT'));
}
// 個人タスク画面用の安全リロード：自分に関係する更新のみ、かつ入力中でなければ再読み込み
function safeSocketReload(data, myId) {
  if (myId != null && data && data.userId != null && Number(data.userId) !== Number(myId)) return;
  if (isEditingScheduleArea()) return;
  // 自分の操作の"反響"は無視（画面はその場で反映済み）。別端末での変更のときだけ再読み込み
  if (Date.now() - (window.__lastSelfMutation || 0) < 5000) return;
  if (typeof pendingDeletes !== 'undefined' && pendingDeletes.size) return;
  location.reload();
}

// スケジュール/タスクのタブ切替（スクロール不要に）
function showDayTab(name) {
  document.querySelectorAll('.day-pane').forEach(function(p) {
    p.style.display = (p.dataset.pane === name) ? '' : 'none';
  });
  document.querySelectorAll('.day-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.pane === name);
  });
  try { sessionStorage.setItem('dayTab', name); } catch (e) {}
}
// 「タスクをスケジュールに反映」：最新タスクで再計算するためリロードし、スケジュールタブを開く
function reflectToSchedule() {
  try { sessionStorage.setItem('dayTab', 'schedule'); } catch (e) {}
  reloadAfterFlush(); // 削除待ちがあれば確定させてから再計算
}
document.addEventListener('DOMContentLoaded', function() {
  if (!document.querySelector('.day-tabs')) return;
  var tab = 'tasks';
  try { tab = sessionStorage.getItem('dayTab') || 'tasks'; } catch (e) {}
  showDayTab(tab);
});

// ===== 業務終了：今日のふり返り（仕事分析ポップアップ） =====
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const DS_COLORS = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#4b5563', '#ca8a04', '#0d9488', '#9333ea'];

// 押した瞬間に「集計中」を出す（サーバー応答まで数秒かかっても、反応が無いと感じさせない）
function showDaySummaryLoading() {
  closeDaySummary();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active ds-overlay';
  overlay.id = 'day-summary-modal';
  overlay.innerHTML = '<div class="modal ds-modal" role="dialog" aria-modal="true" aria-busy="true" aria-label="今日のふり返りを集計中">'
    + '<div class="ds-hero"><div class="ds-emoji">🍵</div><h3>今日のふり返りを集計しています…</h3>'
    + '<div class="ds-spinner" aria-hidden="true"></div></div></div>';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDaySummary(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', dsEscHandler);
}

function openDaySummary() {
  const btn = document.getElementById('day-end-btn');
  if (btn) btn.disabled = true;
  showDaySummaryLoading();
  const date = getViewDate();
  const fetchSummary = () => fetch('/api/day-summary' + (date ? '?date=' + encodeURIComponent(date) : ''))
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(d => {
      if (!d.ok) throw new Error();
      // 集計中に閉じられていたら出さない
      if (document.getElementById('day-summary-modal')) renderDaySummary(d);
    })
    .catch(() => {
      closeDaySummary();
      toast('ふり返りの取得に失敗しました。もう一度お試しください', { type: 'error', duration: 3000 });
    })
    .finally(() => { if (btn) btn.disabled = false; });
  // 保存中の変更・削除待ちを確定させてから集計する
  Promise.all(Array.from(inflightSaves))
    .then(() => (pendingDeletes.size ? flushPendingDeletes() : null))
    .then(fetchSummary, fetchSummary);
}

function renderDaySummary(d) {
  closeDaySummary();
  const f = fmtMinJS;
  let accHtml;
  if (!d.loggedCount) {
    accHtml = '<p class="ds-muted">実績時間が入力されたタスクがないため、見積との比較はできません。</p>';
  } else {
    const badge = Math.abs(d.diff) <= 5 ? '<span class="ds-badge ok">ほぼ見積どおり</span>'
      : d.diff > 0 ? `<span class="ds-badge over">${f(d.diff)} オーバー</span>`
      : `<span class="ds-badge ok">${f(-d.diff)} 早く終了</span>`;
    accHtml = `<div class="ds-acc"><span>見積 <b>${f(d.estLogged)}</b></span><span class="ds-arrow">→</span><span>実績 <b>${f(d.actLogged)}</b></span>${badge}</div>`
      + `<div class="ds-muted ds-small">実績を入力した${d.loggedCount}件で比較</div>`;
    if (d.overTasks && d.overTasks.length) {
      accHtml += '<div class="ds-subhead">オーバーが大きかったタスク</div><ul class="ds-over">'
        + d.overTasks.map(t => `<li><span class="ds-over-title">${escHtml(t.title)}</span><span class="ds-over-num">${f(t.est)} → ${f(t.act)}（<b>+${f(t.over)}</b>）</span></li>`).join('')
        + '</ul>';
    }
  }
  let catHtml;
  if (!d.catTotal) {
    catHtml = '<p class="ds-muted">記録された作業時間がまだありません。</p>';
  } else {
    const color = i => DS_COLORS[i % DS_COLORS.length];
    const bar = d.categories.map((c, i) => `<span style="width:${c.pct}%;background:${color(i)}" title="${escHtml(c.name)} ${c.pct}%"></span>`).join('');
    const list = d.categories.map((c, i) => `<li><span class="ds-dot" style="background:${color(i)}"></span><span class="ds-cat-name">${escHtml(c.name)}</span><span class="ds-cat-pct">${c.pct}%</span><span class="ds-cat-min">${f(c.min)}</span></li>`).join('');
    catHtml = `<div class="ds-stack" aria-hidden="true">${bar}</div><ul class="ds-cats">${list}</ul>`
      + (d.usedEstimate ? '<div class="ds-muted ds-small">※実績が未入力のタスクは「見積×進捗」で推定しています</div>' : '');
  }
  const tips = (d.suggestions || []).map(t => `<li>${escHtml(t)}</li>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active ds-overlay';
  overlay.id = 'day-summary-modal';
  overlay.innerHTML = `<div class="modal ds-modal" role="dialog" aria-modal="true" aria-labelledby="ds-title">
    <button type="button" class="modal-close ds-close" aria-label="閉じる" onclick="closeDaySummary()">×</button>
    <div class="ds-hero">
      <div class="ds-emoji">🍵</div>
      <h3 id="ds-title">${escHtml(d.name)}さん、今日もお疲れさまでした</h3>
      <div class="ds-date">${escHtml(d.date)} のふり返り</div>
    </div>
    <div class="ds-stats">
      <div><b>${d.completed}<small>/${d.total}</small></b><span>完了タスク</span></div>
      <div><b>${f(d.catTotal - d.meetingMin)}</b><span>作業時間</span></div>
      <div><b>${f(d.meetingMin)}</b><span>会議・予定</span></div>
    </div>
    <section class="ds-sec"><h4>⏱ 見積との比較</h4>${accHtml}</section>
    <section class="ds-sec"><h4>📊 作業の内訳</h4>${catHtml}</section>
    <section class="ds-sec ds-tips"><h4>💡 明日への改善ポイント</h4><ul>${tips}</ul></section>
    <div class="ds-foot"><button type="button" class="btn btn-primary" onclick="closeDaySummary()">閉じる</button></div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDaySummary(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', dsEscHandler);
  const closeBtn = overlay.querySelector('.ds-foot .btn');
  if (closeBtn) closeBtn.focus();
}
function dsEscHandler(e) { if (e.key === 'Escape') closeDaySummary(); }
function closeDaySummary() {
  const m = document.getElementById('day-summary-modal');
  if (m) m.remove();
  document.removeEventListener('keydown', dsEscHandler);
}

// 強制退勤CAUTION表示の切替（マネージャー／担当リーダーがメンバー別に設定）
function setForceLeave(userId, enabled) {
  fetch('/api/users/' + userId + '/force-leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !!enabled })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (!d.ok) alert(d.error || '変更に失敗しました');
  }).catch(function() { alert('通信エラーが発生しました'); });
}
