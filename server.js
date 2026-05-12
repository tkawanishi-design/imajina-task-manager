const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('./db');

// Avatar: use memory storage, convert to base64 for DB
const uploadAvatar = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.avatarHtml = function(user, size) {
    size = size || '';
    if (user.avatar) {
      return `<div class="avatar ${size}"><img src="${user.avatar}" alt="${user.name}"></div>`;
    }
    const initial = user.name.charAt(0);
    return `<div class="avatar ${size}">${initial}</div>`;
  };
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'imajina-task-2026', resave: false, saveUninitialized: false }));

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireManager(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'manager') return res.status(403).send('権限がありません');
  next();
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function currentPhase() {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  const t = h * 60 + m;
  if (t < 600) return { label: '業務開始前', next: '10:00 タスク登録', phase: 0 };
  if (t < 780) return { label: 'タスク実行中', next: '13:00 中間報告', phase: 1 };
  if (t < 900) return { label: '中間報告', next: '15:00 進捗確認', phase: 2 };
  if (t < 1080) return { label: '午後タスク実行中', next: '18:00 最終確認', phase: 3 };
  if (t < 1200) return { label: '最終追い込み', next: '20:00 退勤', phase: 4 };
  return { label: '業務終了', next: '', phase: 5 };
}

function generateSuggestion(title) {
  const t = title;
  const suggestions = [];
  if (/メール|返信|送付/.test(t)) {
    suggestions.push('テンプレートがあれば活用。複数件はまとめて処理すると効率的。');
    suggestions.push('件名・宛先を先に整理してから本文作成に入ると手戻りが減ります。');
  }
  if (/資料|提案書|レポート|報告/.test(t)) {
    suggestions.push('まずアウトライン(目次)を作成→内容を埋める順序で進めましょう。');
    suggestions.push('過去の類似資料があれば参考にすると時短になります。');
  }
  if (/打ち合わせ|ミーティング|会議|mtg/i.test(t)) {
    suggestions.push('事前にアジェンダと目的を整理。終了時にネクストアクションを確認。');
  }
  if (/電話|TEL|tel/.test(t)) {
    suggestions.push('要件を箇条書きにしてから架電すると漏れを防げます。');
  }
  if (/見積|請求/.test(t)) {
    suggestions.push('テンプレートと過去実績を確認してから作成開始。数字のダブルチェックを忘れずに。');
  }
  if (/研修|カリキュラム|セミナー/.test(t)) {
    suggestions.push('ゴール(受講者が何を得るか)を先に定義→逆算で内容を構成。');
  }
  if (/デザイン|制作|フライヤー|チラシ/.test(t)) {
    suggestions.push('ラフ案を先に作成→方向性確認→本制作の順で手戻りを防止。');
  }
  if (/アンケート|集計|分析/.test(t)) {
    suggestions.push('集計フォーマットを先に決めてからデータ整理に入ると効率的です。');
  }
  if (/座席|名札/.test(t)) {
    suggestions.push('参加者リストを最新版で確認してから作成開始。');
  }
  if (/撮影|動画|リニューアル/.test(t)) {
    suggestions.push('撮影は台本・絵コンテを準備してから。機材チェックも事前に。');
  }
  if (/採用|面接|ページ/.test(t)) {
    suggestions.push('掲載内容のファクトチェックを忘れずに。数字や実績は最新に更新。');
  }
  if (/プロファイル|面談|宿題/.test(t)) {
    suggestions.push('過去の記録を先に読み込んでから整理に入ると漏れを防げます。');
  }
  if (suggestions.length === 0) {
    suggestions.push('作業前に完了イメージとゴールを明確にしてから取り掛かりましょう。');
  }
  return suggestions.join('\n');
}

function autoCategory(title) {
  if (/メール|返信|送付/.test(title)) return 'メール対応';
  if (/資料|提案書|レポート|報告/.test(title)) return '資料作成';
  if (/打ち合わせ|ミーティング|会議|mtg/i.test(title)) return '打ち合わせ';
  if (/電話|TEL|tel/.test(title)) return '電話対応';
  if (/見積|請求/.test(title)) return '見積・請求';
  if (/研修|カリキュラム|セミナー/.test(title)) return '研修関連';
  if (/デザイン|制作|フライヤー|チラシ/.test(title)) return 'デザイン・制作';
  if (/アンケート|集計|分析/.test(title)) return '集計・分析';
  if (/採用|面接/.test(title)) return '採用関連';
  if (/撮影|動画/.test(title)) return '撮影・動画';
  return 'その他';
}

// ============ ROUTES ============

app.get('/login', (req, res) => { res.render('login', { error: null }); });

app.post('/login', async (req, res) => {
  try {
    const { login_id, password } = req.body;
    const user = await db.getUser(login_id, password);
    if (!user) return res.render('login', { error: 'IDまたはパスワードが正しくありません' });
    req.session.user = user;
    if (user.role === 'manager') return res.redirect('/manager');
    res.redirect('/member');
  } catch (e) { console.error(e); res.render('login', { error: 'エラーが発生しました' }); }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.get('/', (req, res) => res.redirect('/login'));
app.get('/manual', (req, res) => { res.render('manual'); });

// --- Member page ---
app.get('/member', requireLogin, async (req, res) => {
  try {
    const d = today();
    const user = req.session.user;
    const myTeam = await db.getTeamForUser(user.id, d);
    const tasks = await db.getTasksByUser(user.id, d);
    const totalEst = tasks.reduce((s, t) => s + t.estimated_minutes, 0);
    const totalActual = tasks.reduce((s, t) => s + t.actual_minutes, 0);
    const overallProgress = tasks.length > 0 ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;
    let teamMembers = myTeam ? await db.getTeamMembers(myTeam.id) : [];
    const reports = await db.getReports(user.id, d);
    res.render('member', { user, tasks, myTeam, teamMembers, totalEst, totalActual, overallProgress, phase: currentPhase(), today: d, reports });
  } catch (e) { console.error(e); res.status(500).send('エラーが発生しました'); }
});

// --- Manager page ---
app.get('/manager', requireManager, async (req, res) => {
  try {
    const d = req.query.date || today();
    const teams = await db.getTeamsByDate(d);
    const allUsers = await db.getAllUsers();

    const teamData = [];
    for (const team of teams) {
      const leader = await db.getUserById(team.leader_id);
      const members = await db.getTeamMembers(team.id);
      const allMemberIds = [...new Set(members.map(m => m.id))];
      const memberTasks = [];
      for (const uid of allMemberIds) {
        const u = await db.getUserById(uid);
        const tasks = await db.getTasksByUser(uid, d);
        const totalEst = tasks.reduce((s, t) => s + t.estimated_minutes, 0);
        const totalActual = tasks.reduce((s, t) => s + t.actual_minutes, 0);
        const progress = tasks.length > 0 ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;
        const hasDelay = tasks.some(t => t.actual_minutes > t.estimated_minutes && t.progress < 100);
        const hasQuestions = await db.hasQuestions(uid, d);
        memberTasks.push({ user: u, tasks, totalEst, totalActual, progress, hasDelay, hasQuestions });
      }
      teamData.push({ team, leader, members, memberTasks });
    }

    const alerts = [];
    for (const td of teamData) {
      for (const mt of td.memberTasks) {
        if (mt.hasDelay) alerts.push({ type: 'delay', message: `${mt.user.name}さんのタスクに遅れが出ています`, userId: mt.user.id, teamName: td.team.name });
        if (mt.hasQuestions) alerts.push({ type: 'question', message: `${mt.user.name}さんからの質問があります`, userId: mt.user.id, teamName: td.team.name });
        for (const task of mt.tasks) {
          if (task.progress < 30 && currentPhase().phase >= 3) {
            alerts.push({ type: 'warning', message: `${mt.user.name}「${task.title}」進捗${task.progress}%（15時以降）`, userId: mt.user.id, teamName: td.team.name });
          }
        }
      }
    }

    res.render('manager', { user: req.session.user, teams: teamData, allUsers, alerts, phase: currentPhase(), selectedDate: d, today: today() });
  } catch (e) { console.error(e); res.status(500).send('エラーが発生しました'); }
});

// --- Team setup ---
app.get('/team-setup', requireManager, async (req, res) => {
  try {
    const d = req.query.date || today();
    const allUsers = await db.getNonManagerUsers();
    const existingTeams = await db.getTeamsByDate(d);
    const teamsWithMembers = [];
    for (const t of existingTeams) {
      const members = await db.getTeamMembers(t.id);
      teamsWithMembers.push({ ...t, members });
    }
    res.render('team-setup', { user: req.session.user, allUsers, teams: teamsWithMembers, selectedDate: d });
  } catch (e) { console.error(e); res.status(500).send('エラーが発生しました'); }
});

// ============ API ============

app.post('/api/teams', requireManager, async (req, res) => {
  try {
    const { name, date, leader_id, member_ids } = req.body;
    const team = await db.addTeam(name, date, leader_id, member_ids || []);
    io.emit('team-updated', { date });
    res.json({ ok: true, teamId: team.id });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/teams/:id', requireManager, async (req, res) => {
  try {
    await db.deleteTeam(parseInt(req.params.id));
    io.emit('team-updated', {});
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks', requireLogin, async (req, res) => {
  try {
    const { title, estimated_minutes, date } = req.body;
    const user = req.session.user;
    const d = date || today();
    const category = autoCategory(title);
    const ai_suggestion = generateSuggestion(title);
    const dupes = await db.findDuplicates(title, d, user.id);
    const myTeam = await db.getTeamForUser(user.id, d);
    const task = await db.addTask(user.id, myTeam ? myTeam.id : null, d, title, category, estimated_minutes || 0, ai_suggestion);
    io.emit('task-updated', { userId: user.id, date: d });
    res.json({ ok: true, task, duplicates: dupes });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/tasks/:id', requireLogin, async (req, res) => {
  try {
    const { progress, actual_minutes, status, title, estimated_minutes, priority } = req.body;
    const task = await db.getTask(parseInt(req.params.id));
    if (!task) return res.status(404).json({ error: 'not found' });

    const updates = {};
    if (progress !== undefined) updates.progress = progress;
    if (actual_minutes !== undefined) updates.actual_minutes = actual_minutes;
    if (status !== undefined) updates.status = status;
    if (title !== undefined) {
      updates.title = title;
      updates.category = autoCategory(title);
      updates.ai_suggestion = generateSuggestion(title);
    }
    if (estimated_minutes !== undefined) updates.estimated_minutes = estimated_minutes;
    if (priority !== undefined) updates.priority = priority;

    const updated = await db.updateTask(parseInt(req.params.id), updates);
    io.emit('task-updated', { userId: task.user_id, date: task.date });
    res.json({ ok: true, task: updated });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/tasks/:id', requireLogin, async (req, res) => {
  try {
    const task = await db.getTask(parseInt(req.params.id));
    if (task) {
      await db.deleteTask(parseInt(req.params.id));
      io.emit('task-updated', { userId: task.user_id, date: task.date });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks/:id/comments', requireLogin, async (req, res) => {
  try {
    const { message, is_question } = req.body;
    await db.addComment(parseInt(req.params.id), req.session.user.id, message, is_question);
    const comments = await db.getComments(parseInt(req.params.id));
    io.emit('comment-added', { taskId: req.params.id });
    res.json({ ok: true, comments });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks/:id/comments', requireLogin, async (req, res) => {
  try {
    const comments = await db.getComments(parseInt(req.params.id));
    res.json(comments);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/reports', requireLogin, async (req, res) => {
  try {
    const { report_time, notes } = req.body;
    await db.addReport(req.session.user.id, today(), report_time, notes || '');
    io.emit('report-submitted', { userId: req.session.user.id, date: today(), report_time });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireManager, async (req, res) => {
  try {
    const { name, login_id, password, role } = req.body;
    await db.addUser(name, login_id, password, role);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/users/:id/avatar', requireLogin, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
    // Convert to base64 data URL and store in DB
    const mimeType = req.file.mimetype || 'image/png';
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    await db.updateUser(parseInt(req.params.id), { avatar: dataUrl });
    if (req.session.user.id === parseInt(req.params.id)) {
      req.session.user.avatar = dataUrl;
    }
    res.json({ ok: true, avatar: dataUrl });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

io.on('connection', (socket) => {
  socket.on('join', (data) => { socket.join(`user-${data.userId}`); });
});

const PORT = process.env.PORT || 3001;

// Initialize DB then start server
db.initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`imajina Task Manager running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('DB initialization failed:', err);
  process.exit(1);
});
