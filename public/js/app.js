let pendingTask = null;

function getViewDate() {
  const params = new URLSearchParams(window.location.search);
  return params.get('date') || '';
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

  fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, estimated_minutes: estimated, date: viewDate || undefined, priority })
  }).then(r => r.json()).then(data => {
    if (data.error === 'duplicate_title') {
      addingTask = false;
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = '追加'; }
      alert('同じタスクが既に登録されています');
      return;
    }
    if (data.duplicates && data.duplicates.length > 0) {
      addingTask = false;
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = '追加'; }
      pendingTask = data.task;
      showDuplicateWarning(data.duplicates, data.task);
    } else {
      // リロード後にタスク入力欄へ自動フォーカスするフラグ
      sessionStorage.setItem('taskJustAdded', '1');
      location.reload();
    }
  }).catch(() => {
    addingTask = false;
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = '追加'; }
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
    fetch('/api/tasks/' + pendingTask.id, { method: 'DELETE' });
    pendingTask = null;
  }
  location.reload();
}

function confirmAddTask() {
  pendingTask = null;
  document.getElementById('duplicate-modal').classList.remove('active');
  location.reload();
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
  if (!confirm('このタスクを削除しますか？')) return;
  fetch('/api/tasks/' + id, { method: 'DELETE' }).then(() => location.reload());
}

function updateTask(id, data) {
  fetch('/api/tasks/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
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
  taskList.querySelectorAll('.task-item').forEach((item, i) => {
    const titleEl = item.querySelector('.task-title');
    if (titleEl) {
      const text = titleEl.textContent.replace(/^\d+\.\s*/, '');
      titleEl.textContent = (i + 1) + '. ' + text;
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.progress-slider').forEach(slider => {
    slider.addEventListener('input', function() {
      const val = this.value;
      this.closest('.task-actions').querySelector('.progress-val').textContent = val + '%';
    });
    slider.addEventListener('change', function() {
      const id = this.dataset.id;
      const progress = parseInt(this.value);
      const status = progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';
      updateTask(id, { progress, status });
      // Move completed tasks to bottom
      const taskItem = this.closest('.task-item');
      if (taskItem) {
        if (progress === 100) {
          moveCompletedToBottom(taskItem, true);
        } else if (taskItem.classList.contains('completed')) {
          moveCompletedToBottom(taskItem, false);
        }
      }
    });
  });

  document.querySelectorAll('.actual-input').forEach(input => {
    input.addEventListener('change', function() {
      updateTask(this.dataset.id, { actual_minutes: parseInt(this.value) || 0 });
    });
  });

  document.querySelectorAll('.est-input').forEach(input => {
    input.addEventListener('change', function() {
      updateTask(this.dataset.id, { estimated_minutes: parseInt(this.value) || 0 });
    });
  });

  document.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', function() {
      const status = this.value;
      const data = { status };
      if (status === 'completed') data.progress = 100;
      updateTask(this.dataset.id, data);
      // Move completed tasks to bottom
      const taskItem = this.closest('.task-item');
      if (taskItem) {
        if (status === 'completed') {
          // Also update the slider to 100%
          const slider = taskItem.querySelector('.progress-slider');
          const valSpan = taskItem.querySelector('.progress-val');
          if (slider) slider.value = 100;
          if (valSpan) valSpan.textContent = '100%';
          moveCompletedToBottom(taskItem, true);
        } else if (taskItem.classList.contains('completed')) {
          moveCompletedToBottom(taskItem, false);
        }
      }
    });
  });

  const titleInput = document.getElementById('new-task-title');
  if (titleInput) {
    titleInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') addTask();
    });
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
