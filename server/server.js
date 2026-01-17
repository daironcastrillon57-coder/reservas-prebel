// server/server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE NODEMAILER ---
let transporter;

if (process.env.EMAIL_SERVICE === 'outlook' || process.env.EMAIL_SERVICE === 'outlook365') {
  // Configuración específica para Outlook/Microsoft 365
  transporter = nodemailer.createTransport({
    host: 'smtp.outlook.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
} else {
  // Configuración genérica para otros servicios (Gmail, etc)
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

// Función para enviar email de confirmación
async function sendConfirmationEmail(email, nombreCliente, numeroReserva) {
  try {
    if (!email || !process.env.EMAIL_USER) {
      console.warn('Email o credenciales no configuradas. Email no enviado.');
      return false;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reserva Confirmada - Prebel',
      html: `
        <h2>¡Reserva Confirmada!</h2>
        <p>Estimado/a <strong>${nombreCliente}</strong>,</p>
        <p>Su reserva ha sido confirmada exitosamente.</p>
        <p><strong>Número de Reserva:</strong> ${numeroReserva}</p>
        <p>Nos pondremos en contacto con usted pronto para confirmar los detalles.</p>
        <br>
        <p>Saludos,<br>Equipo de Prebel</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email de confirmación enviado a ${email}`);
    return true;
  } catch (err) {
    console.error('Error al enviar email:', err);
    return false;
  }
}

// --- CONFIGURACIÓN DE MULTER Y STORAGE ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// --- MIDDLEWARE PARA PARSEAR BODY Y COOKIES ---
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- MIDDLEWARE DE AUTENTICACIÓN ADMIN ---
function requireAdmin(req, res, next) {
  const token = req.cookies.adminToken;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token de administrador requerido' });
  }
  const admin = db.getAdminByToken(token);
  if (!admin || !admin.token) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
  req.admin = admin;
  next();
}

// -----------------------------
// RUTAS PÚBLICAS
// -----------------------------

// Crear reserva (soporta archivo(s) o sin archivos)
app.post('/api/reservas', upload.array('archivo'), async (req, res) => {
  const uploadedFiles = req.files || [];
  try {
    // soportar ambos nombres de campo de formulario que aparecían en el código
    const {
      numero_reserva,
      nombre,
      email,
      telefono,
      fecha,
      hora,
      servicio,
      notas,
      rango_pedidos_desde,
      rango_pedidos_hasta,
      rango_desde,
      rango_hasta
    } = req.body;

    // validar nombre mínimo
    if (!nombre) {
      throw new Error('Faltan campos requeridos: nombre');
    }

    // Normalizar rangos (aceptar ambos nombres)
    const desde = rango_pedidos_desde || rango_desde || null;
    const hasta = rango_pedidos_hasta || rango_hasta || null;

    const tieneReserva = numero_reserva && String(numero_reserva).trim() !== '';
    const tieneRango = (desde && String(desde).trim() !== '') || (hasta && String(hasta).trim() !== '');

    if (!tieneReserva && !tieneRango) {
      throw new Error('Debe completar el número de reserva o al menos uno de los campos del rango (Desde/Hasta).');
    }

    const numeroReservaFinal = tieneReserva ? String(numero_reserva).trim() : `RANGO-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    const nombres_archivos = uploadedFiles.length > 0 ? uploadedFiles.map(f => f.filename).join(';') : null;
    const fechaActual = fecha || new Date().toISOString().split('T')[0];
    const horaActual = hora || new Date().toTimeString().split(' ')[0];

    const id = db.insertReserva({
      numero_reserva: numeroReservaFinal,
      nombre,
      email: email || null,
      telefono: telefono || null,
      fecha: fechaActual,
      hora: horaActual,
      servicio: servicio || 'Automatizado',
      notas: notas ? String(notas) : null,
      nombre_archivo: nombres_archivos,
      rango_desde: tieneRango ? (desde || null) : null,
      rango_hasta: tieneRango ? (hasta || null) : null
    });

    res.json({ ok: true, id, numero_reserva: numeroReservaFinal, message: 'Reserva creada con éxito.' });
  } catch (err) {
    console.error('Error al crear reserva:', err);
    // limpiar archivos subidos en caso de error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
      });
    }

    let errorMessage = 'Error del servidor al procesar la reserva.';
    if (err.message && err.message.includes('UNIQUE constraint failed: reservas.numero_reserva')) {
      errorMessage = 'El Número de Reserva ingresado ya existe.';
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      errorMessage = 'El tamaño del archivo excede el límite (20MB).';
    } else if (err.message) {
      errorMessage = err.message;
    }

    res.status(400).json({ ok: false, error: errorMessage });
  }
});

// -----------------------------
// RUTAS ADMIN (requieren token)
// -----------------------------

// Login admin
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = db.getAdminByUsername(username);
    if (!admin) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.updateAdminToken(admin.id, token);
    // Enviar token como cookie HttpOnly
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 2 * 60 * 60 * 1000 // 2 horas
    });
    // devolver solo fullName (el token ya está en la cookie)
    res.json({ ok: true, fullName: admin.nombre_completo || admin.username });
  } catch (err) {
    console.error('Error en login admin:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Logout admin (limpia la cookie)
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.json({ ok: true, message: 'Sesión cerrada' });
});

// Crear nuevo admin (requiere admin autenticado)
app.post('/api/admin/create', requireAdmin, async (req, res) => {
  const { username, password, fullName } = req.body;
  if (!username || !password || !fullName) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos: username, password y nombre completo.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.insertAdmin(username, hashedPassword, fullName);
    res.json({ ok: true, message: `Administrador '${username}' creado con éxito.` });
  } catch (err) {
    console.error('Error al crear administrador:', err);
    if (err.message && err.message.includes('UNIQUE constraint failed: admins.username')) {
      return res.status(409).json({ ok: false, error: 'El nombre de usuario ya existe.' });
    }
    res.status(500).json({ ok: false, error: 'Error del servidor al crear el administrador.' });
  }
});

// Obtener lista de administradores
app.get('/api/admin/usuarios', requireAdmin, (req, res) => {
  try {
    const admins = db.getAdmins();
    res.json({ ok: true, admins });
  } catch (err) {
    console.error('Error al obtener lista de administradores:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener la lista de administradores' });
  }
});

// Obtener reservas activas (cliente espera /api/admin/reservas)
app.get('/api/admin/reservas', requireAdmin, (req, res) => {
  try {
    const reservas = db.getReservasActive ? db.getReservasActive() : db.getReservas();
    res.json({ ok: true, reservas });
  } catch (err) {
    console.error('Error al obtener reservas:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener reservas' });
  }
});

// Obtener historial (cliente espera /api/admin/historial)
app.get('/api/admin/historial', requireAdmin, (req, res) => {
  try {
    const historial = db.getHistorial ? db.getHistorial() : [];
    res.json({ ok: true, reservas: historial });
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener historial' });
  }
});

// Actualización genérica de reserva (documento, cajas, responsable, telefono, estado parcial, etc.)
app.put('/api/admin/reservas/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const updates = req.body || {};
    const updated = db.updateReserva ? db.updateReserva(id, updates) : null;
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    }
    res.json({ ok: true, reserva: updated, message: 'Reserva actualizada' });
  } catch (err) {
    console.error('Error actualizando reserva:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar reserva' });
  }
});

// Confirmar reserva (ruta que la UI utiliza: POST /api/admin/reservas/:id/confirm)
app.post('/api/admin/reservas/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = db.updateReservaEstado ? db.updateReservaEstado(id, 'confirmada') : null;
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    }
    
    // Enviar email de confirmación
    if (updated.email) {
      await sendConfirmationEmail(updated.email, updated.nombre, updated.numero_reserva);
    }
    
    // Si tiene rango_desde, cambiar numero_reserva al rango_desde
    if (updated.rango_desde) {
      const finalUpdated = db.updateReserva(id, { numero_reserva: updated.rango_desde });
      res.json({ ok: true, reserva: finalUpdated, message: 'Reserva confirmada. Email enviado.' });
    } else {
      res.json({ ok: true, reserva: updated, message: 'Reserva confirmada. Email enviado.' });
    }
  } catch (err) {
    console.error('Error confirmando reserva:', err);
    res.status(500).json({ ok: false, error: 'Error al confirmar reserva' });
  }
});

// Cancelar reserva (la UI llama PUT /api/admin/reservas/:id/cancel)
app.put('/api/admin/reservas/:id/cancel', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { observacion } = req.body || {};
    if (!observacion || String(observacion).trim() === '') {
      return res.status(400).json({ ok: false, error: 'La observación es obligatoria para cancelar una reserva.' });
    }
    const updated = db.updateReservaEstado ? db.updateReservaEstado(id, 'cancelada') : null;
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    }
    // opcional: agregar la observación a notas (no obligatorio)
    try {
      const newNotas = (updated.notas ? (updated.notas + '\n') : '') + `Cancelación: ${observacion}`;
      db.updateReserva(id, { notas: newNotas });
      const reloaded = db.getReservaById(id);
      return res.json({ ok: true, reserva: reloaded, message: 'Reserva cancelada correctamente.' });
    } catch (e) {
      // si falla al añadir notas, devolvemos la reserva ya cancelada
      return res.json({ ok: true, reserva: updated, message: 'Reserva cancelada correctamente.' });
    }
  } catch (err) {
    console.error('Error cancelando reserva:', err);
    res.status(500).json({ ok: false, error: 'Error interno al cancelar reserva.' });
  }
});

// Eliminar reserva
app.delete('/api/admin/reservas/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = db.deleteReserva(id);
    if (result && result.changes > 0) {
      res.json({ ok: true, message: 'Reserva eliminada' });
    } else {
      res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    }
  } catch (err) {
    console.error('Error eliminando reserva:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar' });
  }
});

// Resetear contraseña (temporal)
app.post('/api/admin/reset-password', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username y password requeridos' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.updateAdminPassword(username, hashedPassword);
    res.json({ ok: true, message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Error reset-password:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// -----------------------------
// SERVIR ARCHIVOS ESTÁTICOS (después de rutas API)
// -----------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`Servidor de reservas corriendo en http://localhost:${PORT}`);
});