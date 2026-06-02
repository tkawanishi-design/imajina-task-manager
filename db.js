const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')
    ? { rejectUnauthorized: false }
    : false
});

// ============ INIT ============

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        login_id TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        avatar TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        leader_id INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        team_id INTEGER,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT DEFAULT '',
        estimated_minutes INTEGER DEFAULT 0,
        actual_minutes INTEGER DEFAULT 0,
        progress INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 3,
        ai_suggestion TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS task_comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        is_question INTEGER DEFAULT 0,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        date TEXT NOT NULL,
        report_time TEXT NOT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS carryover_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        created_at TEXT,
        UNIQUE(user_id, date)
      );
    `);

    // Seed default users if empty
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const defaultUsers = [
        { name: '河西辰哉', login_id: 'kawanishi', password: 'pass1234', role: 'manager' },
        { name: '平林美咲', login_id: 'hirabayashi', password: 'pass1234', role: 'manager' },
        { name: '青江美波', login_id: 'aoe', password: 'pass1234', role: 'leader' },
        { name: '早川由里子', login_id: 'hayakawa', password: 'pass1234', role: 'leader' },
        { name: '竹村理央', login_id: 'takemura', password: 'pass1234', role: 'leader' },
        { name: '渡邊竣介', login_id: 'watanabe', password: 'pass1234', role: 'member' },
        { name: '尾形海斗', login_id: 'ogata', password: 'pass1234', role: 'member' },
        { name: '熊崎美優', login_id: 'kumazaki', password: 'pass1234', role: 'member' },
        { name: '神崎祐樹', login_id: 'kanzaki', password: 'pass1234', role: 'member' },
        { name: '秋山柚衣', login_id: 'akiyama', password: 'pass1234', role: 'member' },
        { name: '蕪木康成', login_id: 'kaburagi', password: 'pass1234', role: 'member' },
        { name: '青木遥斗', login_id: 'aoki', password: 'pass1234', role: 'member' },
        { name: '横山嶺州多', login_id: 'yokoyama', password: 'pass1234', role: 'member' }
      ];
      for (const u of defaultUsers) {
        await client.query(
          'INSERT INTO users (name, login_id, password, role, avatar) VALUES ($1, $2, $3, $4, $5)',
          [u.name, u.login_id, u.password, u.role, '']
        );
      }
      console.log('Default users seeded.');
    }

    // Migration: carryover_log に UNIQUE 制約を追加（レースコンディション防止）
    try {
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_carryover_user_date ON carryover_log (user_id, date)');
    } catch (e) { /* already exists */ }

    // Migration: carryover_log の重複エントリを削除（最初の1件だけ残す）
    try {
      await client.query(`
        DELETE FROM carryover_log WHERE id NOT IN (
          SELECT MIN(id) FROM carryover_log GROUP BY user_id, date
        )
      `);
    } catch (e) { /* ignore */ }

    // Migration: 重複タスクを削除（同じuser_id, date, titleの組み合わせで最初の1件だけ残す）
    try {
      const { rowCount } = await client.query(`
        DELETE FROM tasks WHERE id NOT IN (
          SELECT MIN(id) FROM tasks GROUP BY user_id, date, title
        )
      `);
      if (rowCount > 0) console.log('Cleaned up ' + rowCount + ' duplicate tasks.');
    } catch (e) { console.error('Duplicate task cleanup failed:', e.message); }
  } finally {
    client.release();
  }
}

// ============ HELPERS ============

function now() {
  const n = new Date();
  const d = new Date(n.getTime() + (9 * 60 + n.getTimezoneOffset()) * 60000);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
    + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
}

// ============ DB MODULE ============

const db = {
  initDB,

  // Users
  async getUser(loginId, password) {
    const { rows } = await pool.query('SELECT * FROM users WHERE login_id = $1 AND password = $2', [loginId, password]);
    return rows[0] || null;
  },
  async getUserById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },
  async getAllUsers() {
    const { rows } = await pool.query(`SELECT * FROM users ORDER BY
      CASE role WHEN 'manager' THEN 0 WHEN 'leader' THEN 1 ELSE 2 END, name`);
    return rows;
  },
  async getNonManagerUsers() {
    const { rows } = await pool.query("SELECT * FROM users WHERE role != 'manager' ORDER BY name");
    return rows;
  },
  async addUser(name, loginId, password, role) {
    const existing = await pool.query('SELECT id FROM users WHERE login_id = $1', [loginId]);
    if (existing.rows.length > 0) throw new Error('このログインIDは既に使われています');
    const { rows } = await pool.query(
      'INSERT INTO users (name, login_id, password, role, avatar) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, loginId, password || 'pass1234', role || 'member', '']
    );
    return rows[0];
  },
  async updateUser(id, updates) {
    const fields = [];
    const values = [];
    let i = 1;
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = $${i}`);
      values.push(val);
      i++;
    }
    if (fields.length === 0) return null;
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values
    );
    return rows[0] || null;
  },

  // Teams
  async getTeamsByDate(date) {
    const { rows } = await pool.query('SELECT * FROM teams WHERE date = $1', [date]);
    return rows;
  },
  async getTeamForUser(userId, date) {
    // Check team_members first
    const { rows: memberRows } = await pool.query(
      `SELECT t.* FROM teams t JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1 AND t.date = $2 LIMIT 1`, [userId, date]
    );
    if (memberRows.length > 0) return memberRows[0];
    // Check as leader
    const { rows: leaderRows } = await pool.query(
      'SELECT * FROM teams WHERE leader_id = $1 AND date = $2 LIMIT 1', [userId, date]
    );
    return leaderRows[0] || null;
  },
  async getTeamMembers(teamId) {
    const { rows } = await pool.query(
      `SELECT DISTINCT u.* FROM users u
       LEFT JOIN team_members tm ON u.id = tm.user_id AND tm.team_id = $1
       LEFT JOIN teams t ON u.id = t.leader_id AND t.id = $1
       WHERE tm.id IS NOT NULL OR t.id IS NOT NULL`, [teamId]
    );
    return rows;
  },
  async addTeam(name, date, leaderId, memberIds) {
    const { rows } = await pool.query(
      'INSERT INTO teams (name, date, leader_id) VALUES ($1, $2, $3) RETURNING *',
      [name, date, leaderId]
    );
    const team = rows[0];
    const allIds = [...new Set([...(memberIds || []), leaderId].filter(Boolean))];
    for (const mid of allIds) {
      await pool.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [team.id, mid]);
    }
    return team;
  },
  async deleteTeam(teamId) {
    await pool.query('DELETE FROM team_members WHERE team_id = $1', [teamId]);
    await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
  },

  // Tasks
  async getTasksByUser(userId, date) {
    const { rows } = await pool.query(
      `SELECT * FROM tasks WHERE user_id = $1 AND date = $2 ORDER BY (CASE WHEN status = 'completed' THEN 1 ELSE 0 END), sort_order, priority`,
      [userId, date]
    );
    return rows;
  },
  async getTasksByDate(date) {
    const { rows } = await pool.query(
      `SELECT t.*, u.name as user_name FROM tasks t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.date = $1`, [date]
    );
    return rows;
  },
  async getTask(id) {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows[0] || null;
  },
  async addTask(userId, teamId, date, title, category, estimatedMinutes, aiSuggestion) {
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM tasks WHERE user_id = $1 AND date = $2',
      [userId, date]
    );
    const sortOrder = (maxRows[0].max_order || 0) + 1;
    const { rows } = await pool.query(
      `INSERT INTO tasks (user_id, team_id, date, title, category, estimated_minutes, actual_minutes, progress, status, priority, ai_suggestion, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'pending', 3, $7, $8, $9, $10) RETURNING *`,
      [userId, teamId, date, title, category || '', estimatedMinutes || 0, aiSuggestion || '', sortOrder, now(), now()]
    );
    return rows[0];
  },
  async updateTask(id, updates) {
    const fields = [];
    const values = [];
    let i = 1;
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = $${i}`);
      values.push(val);
      i++;
    }
    fields.push(`updated_at = $${i}`);
    values.push(now());
    i++;
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values
    );
    return rows[0] || null;
  },
  async deleteTask(id) {
    await pool.query('DELETE FROM task_comments WHERE task_id = $1', [id]);
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  },

  // Comments
  async getComments(taskId) {
    const { rows } = await pool.query(
      `SELECT c.*, u.name as user_name, u.role as user_role FROM task_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.task_id = $1 ORDER BY c.created_at`, [taskId]
    );
    return rows;
  },
  async addComment(taskId, userId, message, isQuestion) {
    const { rows } = await pool.query(
      'INSERT INTO task_comments (task_id, user_id, message, is_question, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [taskId, userId, message, isQuestion ? 1 : 0, now()]
    );
    return rows[0];
  },
  async hasQuestions(userId, date) {
    const { rows } = await pool.query(
      `SELECT 1 FROM task_comments c JOIN tasks t ON c.task_id = t.id
       WHERE t.user_id = $1 AND t.date = $2 AND c.is_question = 1 LIMIT 1`,
      [userId, date]
    );
    return rows.length > 0;
  },

  // Reports
  async getReports(userId, date) {
    const { rows } = await pool.query(
      'SELECT * FROM daily_reports WHERE user_id = $1 AND date = $2', [userId, date]
    );
    return rows;
  },
  async addReport(userId, date, reportTime, notes) {
    const { rows: existing } = await pool.query(
      'SELECT id FROM daily_reports WHERE user_id = $1 AND date = $2 AND report_time = $3',
      [userId, date, reportTime]
    );
    if (existing.length > 0) {
      await pool.query('UPDATE daily_reports SET notes = $1 WHERE id = $2', [notes, existing[0].id]);
    } else {
      await pool.query(
        'INSERT INTO daily_reports (user_id, date, report_time, notes, created_at) VALUES ($1, $2, $3, $4, $5)',
        [userId, date, reportTime, notes || '', now()]
      );
    }
  },

  // Carryover log
  async hasCarryoverDone(userId, date) {
    const { rows } = await pool.query(
      'SELECT id FROM carryover_log WHERE user_id = $1 AND date = $2', [userId, date]
    );
    return rows.length > 0;
  },
  async logCarryover(userId, date, count) {
    await pool.query(
      'INSERT INTO carryover_log (user_id, date, count, created_at) VALUES ($1, $2, $3, $4)',
      [userId, date, count, now()]
    );
  },
  // レースコンディション防止：先にログを書いてロック（INSERT失敗=既に実行済み）
  async tryLockCarryover(userId, date) {
    try {
      await pool.query(
        'INSERT INTO carryover_log (user_id, date, count, created_at) VALUES ($1, $2, 0, $3)',
        [userId, date, now()]
      );
      return true; // ロック取得成功
    } catch (e) {
      return false; // 既にログあり（UNIQUEエラー or 重複）
    }
  },
  async updateCarryoverCount(userId, date, count) {
    await pool.query(
      'UPDATE carryover_log SET count = $3 WHERE user_id = $1 AND date = $2',
      [userId, date, count]
    );
  },

  // Duplicate detection
  async findDuplicates(title, date, userId) {
    const keywords = title.replace(/[さまさん様]/g, '').split(/[\s　・、,]+/).filter(w => w.length >= 2);
    if (keywords.length === 0) return [];
    const { rows: otherTasks } = await pool.query(
      'SELECT t.*, u.name as user_name FROM tasks t LEFT JOIN users u ON t.user_id = u.id WHERE t.date = $1 AND t.user_id != $2',
      [date, userId]
    );
    const dupes = [];
    for (const task of otherTasks) {
      let matchCount = 0;
      for (const kw of keywords) { if (task.title.includes(kw)) matchCount++; }
      if (matchCount >= 2 || (keywords.length === 1 && matchCount === 1 && keywords[0].length >= 3)) {
        dupes.push({ taskId: task.id, title: task.title, userName: task.user_name || '', progress: task.progress });
      }
    }
    return dupes;
  }
};

module.exports = db;
