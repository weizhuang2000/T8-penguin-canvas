'use strict';

const mysql = require('mysql2/promise');

let pool = null;
let userColumns = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || process.env.DB_PORT) || 3306,
      user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'design_team_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function getUserColumns() {
  if (userColumns) return userColumns;
  const rows = await query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
  );
  userColumns = new Set(rows.map((row) => String(row.COLUMN_NAME)));
  return userColumns;
}

async function getColumnNames() {
  try {
    const columns = await getUserColumns();
    const pick = (candidates, fallback) => candidates.find((item) => columns.has(item)) || fallback;
    return {
      name: pick(['real_name', 'name'], 'real_name'),
      dailyCost: pick(['daily_cost', 'dailyCost'], 'daily_cost'),
      designLevelCoefficient: pick(['design_level_coefficient', 'designLevelCoefficient'], 'design_level_coefficient'),
      lastLoginAt: pick(['last_login_at', 'lastLoginAt'], 'last_login_at'),
    };
  } catch {
    return {
      name: 'real_name',
      dailyCost: 'daily_cost',
      designLevelCoefficient: 'design_level_coefficient',
      lastLoginAt: 'last_login_at',
    };
  }
}

function normalizeUser(row) {
  if (!row) return null;
  const name = row.real_name ?? row.name ?? '';
  return {
    id: String(row.id),
    username: String(row.username || ''),
    email: String(row.email || ''),
    password: String(row.password || ''),
    name: String(name || row.username || ''),
    realName: String(name || row.username || ''),
    avatarUrl: row.avatar ? String(row.avatar) : null,
    phone: row.phone ? String(row.phone) : null,
    role: String(row.role || 'designer'),
    status: String(row.status || 'active'),
    position: String(row.position || ''),
    dailyCost: Number(row.daily_cost ?? row.dailyCost ?? 0),
    designLevelCoefficient: Number(row.design_level_coefficient ?? row.designLevelCoefficient ?? 1),
  };
}

async function findActiveUserByLogin(usernameOrEmail) {
  const rows = await query(
    "SELECT * FROM users WHERE (username = ? OR email = ?) AND status = 'active' LIMIT 1",
    [usernameOrEmail, usernameOrEmail]
  );
  return normalizeUser(rows[0]);
}

async function findUserById(id) {
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [Number(id)]);
  return normalizeUser(rows[0]);
}

async function listActiveUsers(search = '', limit = 20) {
  const q = String(search || '').trim();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const params = [];
  let where = "status = 'active'";
  if (q) {
    let searchable = ['username', 'email'];
    try {
      const columns = await getUserColumns();
      searchable = searchable.filter((column) => columns.has(column));
      if (columns.has('real_name')) searchable.push('real_name');
      if (columns.has('name')) searchable.push('name');
    } catch {
      searchable = ['username', 'email', 'real_name'];
    }
    if (searchable.length > 0) {
      where += ` AND (${searchable.map((column) => `${column} LIKE ?`).join(' OR ')})`;
      const like = `%${q}%`;
      params.push(...searchable.map(() => like));
    }
  }
  params.push(safeLimit);
  const rows = await query(
    `SELECT * FROM users WHERE ${where} ORDER BY id ASC LIMIT ?`,
    params
  );
  return rows.map(normalizeUser).filter(Boolean);
}

async function touchLastLogin(userId) {
  const columns = await getColumnNames();
  await query(`UPDATE users SET ${columns.lastLoginAt} = NOW() WHERE id = ?`, [Number(userId)]);
}

module.exports = {
  findActiveUserByLogin,
  findUserById,
  listActiveUsers,
  touchLastLogin,
};
