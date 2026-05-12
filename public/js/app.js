let pendingTask = null;

function addTask() {
  const title = document.getElementById('new-task-title').value.trim();
  const estimated = parseInt(document.getElementById('new-task-time').value) || 0;
  if (!title) return;

  fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, estimated_minutes: estimated })
  }).then(r => r.json()).then(data => {
    if (data.duplicates && data.duplicates.length > 0) {
      pendingTask = data.task;
      showDuplicateWarning(data.duplicates, data.task);
    } else {
      location.reload();
    }
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
    });
  });

  document.querySelectorAll('.actual-input').forEach(input => {
    input.addEventListener('change', function() {
      updateTask(this.dataset.id, { actual_minutes: parseInt(this.value) || 0 });
    });
  });

  document.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', function() {
      const status = this.value;
      const data = { status };
      if (status === 'completed') data.progress = 100;
      updateTask(this.dataset.id, data);
    });
  });

  const titleInput = document.getElementById('new-task-title');
  if (titleInput) {
    titleInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') addTask();
    });
  }
});

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
