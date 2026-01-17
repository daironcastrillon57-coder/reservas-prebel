// server/db.js
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'reservas.db');
const db = new Database(dbPath);

// Inicialización de tablas (si no existen)
const initReservas = `
CREATE TABLE IF NOT EXISTS reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_reserva TEXT UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  servicio TEXT,
  notas TEXT,
  rango_desde TEXT,
  rango_hasta TEXT,
  nombre_archivo TEXT,
  cajas TEXT,
  responsable TEXT,
  documento TEXT,
  estado TEXT DEFAULT 'pendiente',
  fecha_confirmacion DATETIME,
  fecha_cancelacion DATETIME,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const initAdmins = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nombre_completo TEXT,
  token TEXT
);
`;

// Ejecutamos las consultas para inicializar las tablas
db.exec(initReservas);
db.exec(initAdmins);

// Crear admin por defecto si no existe
const initialAdmin = db.prepare(
  `SELECT COUNT(*) AS count FROM admins WHERE username = ?`
).get('admin');

if (initialAdmin.count === 0) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO admins (username, password, nombre_completo)
    VALUES (?, ?, ?)
  `).run('admin', hashedPassword, 'Administrador Principal');
}

// Helper: comprobar si columna existe (útil para migraciones simples)
function columnExists(table, column) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return info.some(c => c.name === column);
  } catch (e) {
    return false;
  }
}

// Asegurar columna fecha_confirmacion por compatibilidad
try {
  if (!columnExists('reservas', 'fecha_confirmacion')) {
    db.prepare(`ALTER TABLE reservas ADD COLUMN fecha_confirmacion DATETIME`).run();
  }
} catch (e) {
  console.warn('No se pudo asegurar columna fecha_confirmacion:', e && e.message);
}

// Asegurar columna fecha_cancelacion por compatibilidad
try {
  if (!columnExists('reservas', 'fecha_cancelacion')) {
    db.prepare(`ALTER TABLE reservas ADD COLUMN fecha_cancelacion DATETIME`).run();
  }
} catch (e) {
  console.warn('No se pudo asegurar columna fecha_cancelacion:', e && e.message);
}

// Asegurar columna cajas por compatibilidad
try {
  if (!columnExists('reservas', 'cajas')) {
    db.prepare(`ALTER TABLE reservas ADD COLUMN cajas TEXT`).run();
  }
} catch (e) {
  console.warn('No se pudo asegurar columna cajas:', e && e.message);
}

// Asegurar columna responsable por compatibilidad
try {
  if (!columnExists('reservas', 'responsable')) {
    db.prepare(`ALTER TABLE reservas ADD COLUMN responsable TEXT`).run();
  }
} catch (e) {
  console.warn('No se pudo asegurar columna responsable:', e && e.message);
}

// Asegurar columna documento por compatibilidad
try {
  if (!columnExists('reservas', 'documento')) {
    db.prepare(`ALTER TABLE reservas ADD COLUMN documento TEXT`).run();
  }
} catch (e) {
  console.warn('No se pudo asegurar columna documento:', e && e.message);
}

module.exports = {
  // --- Funciones de Reservas ---
  insertReserva: ({ numero_reserva, nombre, email, telefono, fecha, hora, servicio, notas, nombre_archivo, rango_desde, rango_hasta }) => {
    const stmt = db.prepare(`
      INSERT INTO reservas 
      (numero_reserva, nombre, email, telefono, fecha, hora, servicio, notas, nombre_archivo, rango_desde, rango_hasta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      numero_reserva || null,
      nombre,
      email || null,
      telefono || null,
      fecha,
      hora,
      servicio || null,
      notas || null,
      nombre_archivo || null,
      rango_desde || null,
      rango_hasta || null
    );

    return info.lastInsertRowid;
  },

  // Devuelve todas las reservas (sin filtrar)
  getReservas: () => {
    return db.prepare(`SELECT * FROM reservas ORDER BY creado_en DESC`).all();
  },

  // Devuelve reservas activas (solo pendientes)
  getReservasActive: () => {
    return db.prepare(`SELECT * FROM reservas WHERE LOWER(coalesce(estado,'pendiente')) = 'pendiente' ORDER BY creado_en DESC`).all();
  },

  // Devuelve historial (confirmadas y canceladas)
  getHistorial: () => {
    return db.prepare(`SELECT * FROM reservas WHERE LOWER(coalesce(estado,'pendiente')) IN ('confirmada', 'cancelada') ORDER BY COALESCE(fecha_confirmacion, fecha_cancelacion, creado_en) DESC`).all();
  },

  // Obtener por id, numero o rango
  getReservaById: (id) => {
    return db.prepare(`SELECT * FROM reservas WHERE id = ?`).get(id);
  },

  getReservaByNumero: (numero_reserva) => {
    return db.prepare(`SELECT * FROM reservas WHERE numero_reserva = ?`).get(numero_reserva);
  },

  // Consulta de rango (retorna filas que intersecten)
  getReservaByRango: (desde, hasta) => {
    return db.prepare(`
      SELECT * FROM reservas 
      WHERE rango_desde <= ? AND rango_hasta >= ?
    `).get(hasta, desde);
  },

  // Actualiza estado y devuelve la fila actualizada
  updateReservaEstado: (id, estado) => {
    const now = new Date().toLocaleString('sv-SE');
    if (String(estado).toLowerCase() === 'confirmada') {
      db.prepare(`UPDATE reservas SET estado = ?, fecha_confirmacion = ? WHERE id = ?`).run(estado || 'confirmada', now, id);
    } else if (String(estado).toLowerCase() === 'cancelada') {
      db.prepare(`UPDATE reservas SET estado = ?, fecha_cancelacion = ? WHERE id = ?`).run(estado || 'cancelada', now, id);
    } else {
      db.prepare(`UPDATE reservas SET estado = ? WHERE id = ?`).run(estado || 'pendiente', id);
    }
    return db.prepare(`SELECT * FROM reservas WHERE id = ?`).get(id);
  },

  // Update genérico: updates is an object with allowed fields. Returns updated row.
  updateReserva: (id, updates) => {
    const allowed = ['estado','documento','cajas','responsable','nombre_archivo','notas','telefono','numero_reserva','fecha','hora','servicio'];
    const setClauses = [];
    const values = [];
    for (const key of Object.keys(updates || {})) {
      if (allowed.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }
    if (setClauses.length === 0) {
      return db.prepare(`SELECT * FROM reservas WHERE id = ?`).get(id);
    }

    const lowerEstado = (updates.estado || '').toString().toLowerCase();
    if (lowerEstado === 'confirmada' && !columnExists('reservas','fecha_confirmacion')) {
      try { db.prepare(`ALTER TABLE reservas ADD COLUMN fecha_confirmacion DATETIME`).run(); } catch (e) {}
    }

    const sql = `UPDATE reservas SET ${setClauses.join(', ')} WHERE id = ?`;
    values.push(id);
    db.prepare(sql).run(...values);

    if (lowerEstado === 'confirmada') {
      const now = new Date().toLocaleString('sv-SE');
      db.prepare(`UPDATE reservas SET fecha_confirmacion = ? WHERE id = ?`).run(now, id);
    }

    return db.prepare(`SELECT * FROM reservas WHERE id = ?`).get(id);
  },

  deleteReserva: (id) => {
    return db.prepare(`DELETE FROM reservas WHERE id = ?`).run(id);
  },

  // --- Funciones Admin ---
  insertAdmin: (username, password, nombre_completo) => {
    return db.prepare(`
      INSERT INTO admins (username, password, nombre_completo)
      VALUES (?, ?, ?)
    `).run(username, password, nombre_completo);
  },

  getAdminByUsername: (username) => {
    const stmt = db.prepare(`SELECT * FROM admins WHERE username = ?`);
    return stmt.get(username);
  },

  getAdminByToken: (token) => {
    return db.prepare(`SELECT * FROM admins WHERE token = ?`).get(token);
  },

  updateAdminToken: (id, token) => {
    return db.prepare(`UPDATE admins SET token = ? WHERE id = ?`).run(token, id);
  },

  getAdmins: () => {
    return db.prepare(`
      SELECT id, username, nombre_completo 
      FROM admins ORDER BY id
    `).all();
  },

  updateAdminPassword: (username, hashedPassword) => {
    return db.prepare(`
      UPDATE admins SET password = ? WHERE username = ?
    `).run(hashedPassword, username);
  },

  // Raw DB access (opcional)
  _raw: db
};