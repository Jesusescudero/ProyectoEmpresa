const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const zxcvbn = require('zxcvbn');
const { pwnedPassword } = require('hibp');
const axios = require('axios'); // Importar axios para hacer solicitudes HTTP
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sessionId = crypto.randomBytes(16).toString('hex');  // 128 bits
const session = require('express-session');


const app = express();

app.use(express.json());

app.use(cors({
  origin: 'http://localhost:8080', // Cambia esto por el origen de tu frontend
  credentials: true // Permite el uso de cookies
}));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'proyectosindicato'
});

// Conectar a la base de datos
db.connect((err) => {
  if (err) {
    console.error('Error conectando a MySQL:', err);
    return;
  }
  console.log('Conectado a MySQL');
});

// Objeto para almacenar intentos de inicio de sesión
const intentosLogin = {};

// Configurar la sesión
app.use(session({
  secret: 'tu_secreto', // Cambia esto por un secreto real en producción
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,                   // Habilitar HttpOnly para seguridad
    secure: false,                    // Deja en false mientras estés en local
    sameSite: 'Lax',                  // Usa Lax para permitir el envío de cookies
    maxAge: 30 * 60 * 1000            // Duración de la sesión: 30 minutos
  }
}));

const transporter = nodemailer.createTransport({
  service: 'gmail', // O el servicio de tu elección
  auth: {
    user: '20221042@uthh.edu.mx',
    pass: 'izbq sext sumd xkcu', // Considera usar variables de entorno para mayor seguridad
  },
});

async function enviarCodigoVerificacion(correo, codigo) {
  const mailOptions = {
    from: '20221042@uthh.edu.mx',
    to: correo,
    subject: 'Código de verificación',
    text: `Tu código de verificación es: ${codigo}`,
  };

  return transporter.sendMail(mailOptions);
}

app.use((req, res, next) => {
  console.log('Cookies: ', req.cookies); // Muestra las cookies en la consola del servidor
  next();
});

// Ruta de registro sin reCAPTCHA
app.post('/register', async (req, res) => {

  const {
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    telefono,
    correo,
    puesto,
    tieneMaestria,
    nombreMaestria,
    tieneDoctorado,
    nombreDoctorado,
    estatus,
    numeroTrabajador,
    numeroSindicalizado,
    usuarios,
    password,
  } = req.body;

  if (!usuarios || !password || !nombre || !apellidoPaterno || !apellidoMaterno || !telefono || !correo || !puesto) {
    return res.status(400).send('Todos los campos son requeridos.');
  }

  // Validaciones de entrada
  if (!usuarios || !password) {
    return res.status(400).send('Usuario y contraseña son requeridos.');
  }

  // Validación de la fortaleza de la contraseña
  const passwordStrength = zxcvbn(password);
  if (passwordStrength.score < 3) {
    console.warn('Advertencia: La contraseña es débil.');
    // Opcionalmente, puedes enviar un aviso al frontend pero sin impedir el registro.
    // return res.status(200).send('Advertencia: La contraseña es débil.');
  }
  // Verificar si la contraseña ha sido comprometida usando HIBP
  try {
    const pwnedCount = await pwnedPassword(password);
    if (pwnedCount > 0) {
      return res.status(400).send(`La contraseña ha sido comprometida en ${pwnedCount} filtraciones. Por favor, elige una diferente.`);
    }
  } catch (error) {
    console.error('Error al verificar la contraseña en HIBP:', error);
    return res.status(500).send('Error al verificar la seguridad de la contraseña.');
  }

  // Encriptar contraseña
  // Encriptar contraseña
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).send('Error al encriptar la contraseña');

    const sql = `INSERT INTO users 
    (nombre, apellido_paterno, apellido_materno, telefono, correo, puesto, tiene_maestria, maestrias, tiene_doctorado, doctorados, esta_titulado, numero_trabajador, numero_sindicalizado, usuarios, password) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;


    db.query(sql, [
      nombre, apellidoPaterno, apellidoMaterno, telefono, correo, puesto,
      tieneMaestria, nombreMaestria, tieneDoctorado, nombreDoctorado, estatus,
      numeroTrabajador, numeroSindicalizado, usuarios, hash
    ], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).send('El usuario ya está registrado.');
        }
        console.error('Error en la consulta a la base de datos:', err);
        return res.status(500).send('Error en la base de datos');
      }
      res.status(200).send('Usuario registrado con éxito');
    });
  });
});

// Ruta de inicio de sesión
// Ruta de inicio de sesión
app.post('/login', (req, res) => {
  const { usuarios, password, recaptchaToken } = req.body;

  // Verificar el token reCAPTCHA con Google
  const secretKey = '6Lfgu14qAAAAALXwGe_wlKoyN3dc7HT1pU-RRWl7'; // Reemplazar con tu clave secreta de reCAPTCHA
  const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;

  axios.post(verificationUrl)
    .then(response => {
      if (!response.data.success) {
        return res.status(400).send('reCAPTCHA fallido. Inténtalo nuevamente.');
      }

      // Si reCAPTCHA es válido, continuar con el proceso de inicio de sesión
      const sql = 'SELECT * FROM users WHERE usuarios = ?';
      db.query(sql, [usuarios], (err, results) => {
        if (err || results.length === 0) {
          return res.status(400).send('Usuario no encontrado');
        }

        const user = results[0];

        // Verificar si la cuenta está bloqueada
        if (user.bloqueadoHasta && new Date(user.bloqueadoHasta) > new Date()) {
          return res.status(403).send('Cuenta bloqueada. Intenta de nuevo más tarde.');
        }

        // Comparar contraseñas
        bcrypt.compare(password, user.password, (err, isMatch) => {
          if (!isMatch) {
            // Incrementar el contador de intentos fallidos
            const intentosFallidos = user.intentosFallidos ? user.intentosFallidos + 1 : 1;

            // Bloquear la cuenta si se superan los intentos permitidos
            let bloqueadoHasta = null;
            if (intentosFallidos >= 5) {
              bloqueadoHasta = new Date(Date.now() + 30 * 60 * 1000); // Bloquear por 30 minutos
            }

            // Actualizar los intentos fallidos y el estado de bloqueo
            const sqlUpdate = 'UPDATE users SET intentosFallidos = ?, bloqueadoHasta = ? WHERE usuarios = ?';
            db.query(sqlUpdate, [intentosFallidos, bloqueadoHasta, usuarios], (err) => {
              if (err) {
                return res.status(500).send('Error al actualizar los intentos fallidos.');
              }
              return res.status(400).send('Contraseña incorrecta');
            });
          } else {
            // Reiniciar intentos fallidos y bloqueos si la contraseña es correcta
            const sqlReset = 'UPDATE users SET intentosFallidos = 0, bloqueadoHasta = NULL WHERE usuarios = ?';
            db.query(sqlReset, [usuarios], (err) => {
              if (err) {
                return res.status(500).send('Error al reiniciar los intentos fallidos.');
              }

              // Regenerar la sesión después de un inicio de sesión exitoso
  req.session.regenerate(function (err) {
    if (err) {
      return res.status(500).send('Error al regenerar la sesión.');
    }
    console.log('ID de sesión generado:', req.sessionID);

    // Almacenar información relevante en la sesión
    req.session.userId = user.id; // Almacena el ID del usuario
    req.session.username = user.usuarios; // Almacena el nombre de usuario

    // Establecer el tiempo de expiración de la sesión
    req.session.cookie.expires = new Date(Date.now() + 30 * 60 * 1000);  // 30 minutos
    req.session.cookie.maxAge = 30 * 60 * 1000;  // Sesiones basadas en actividad

               // Generar el código de verificación
  const codigoVerificacion = Math.floor(100000 + Math.random() * 900000);
  const expiracion = new Date(Date.now() + 5 * 60 * 1000);

                // Actualiza la base de datos con el código y la expiración
                const sqlUpdate = 'UPDATE users SET codigo_verificacion = ?, codigo_expiracion = ? WHERE usuarios = ?';
                db.query(sqlUpdate, [codigoVerificacion, expiracion, usuarios], (err) => {
                  if (err) {
                    return res.status(500).send('Error al actualizar el código de verificación.');
                  }

                  // Enviar el código de verificación por correo
                  const mailOptions = {
                    from: '20221042@uthh.edu.mx', // Tu correo electrónico
                    to: user.correo, // Correo del usuario
                    subject: 'Código de verificación',
                    text: `Tu código de verificación es: ${codigoVerificacion}`
                  };

                  transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                      console.error('Error al enviar el correo:', error);
                      return res.status(500).send('Error al enviar el correo de verificación.');
                    }

                    // Continúa el flujo aquí...
                  });


                  

                  // Establecer el tiempo de expiración de la sesión
                  req.session.cookie.expires = new Date(Date.now() + 30 * 60 * 1000);  // 30 minutos
                  req.session.cookie.maxAge = 30 * 60 * 1000;  // Sesiones basadas en actividad

                  // Generar un token JWT
                  const token = jwt.sign({ id: user.id, usuarios: user.usuarios }, process.env.JWT_SECRET || 'mi_secreto', {
                    expiresIn: '1h'
                  });

                  return res.status(200).json({
                    token,
                    codigoVerificacion, // Opcionalmente, puedes enviar el código de verificación al frontend para validarlo después
                    message: 'Inicio de sesión exitoso. ¡Revisa tu correo para el código de verificación!'
                  });
                });
              });
            });
          }
        });
      });
    })
    .catch(error => {
      console.error('Error en la verificación de reCAPTCHA:', error);
      res.status(500).send('Error en la verificación de reCAPTCHA');
    });
});

app.get('/session-info', (req, res) => {
  res.json(req.session);
});

// Ruta para verificar el código de verificación
app.post('/verify-code', (req, res) => {
  const { usuarios, codigoVerificacion } = req.body;

  const sql = 'SELECT codigo_verificacion, codigo_expiracion FROM users WHERE usuarios = ?';
  db.query(sql, [usuarios], (err, results) => {
    if (err) {
      return res.status(500).send('Error en la consulta de la base de datos.');
    }

    if (results.length === 0) {
      return res.status(400).send('Usuario no encontrado.');
    }

    const user = results[0];

    // Comprobar si el código de verificación es correcto
    if (user.codigo_verificacion !== codigoVerificacion) {
      return res.status(400).send('Código de verificación incorrecto.');
    }

    // Comprobar si el código ha expirado
    if (new Date() > new Date(user.codigo_expiracion)) {
      return res.status(400).send('El código de verificación ha expirado.');
    }

    // Aquí puedes realizar acciones adicionales, como confirmar el inicio de sesión.
    return res.status(200).send('Código de verificación correcto. Bienvenido!');
  });
});

// Ruta para cambiar contraseña
app.put('/change-password', (req, res) => {
  const { oldPassword, newPassword, usuarios } = req.body;

  const sql = 'SELECT * FROM users WHERE usuarios = ?';
  db.query(sql, [usuarios], (err, results) => {
    if (err || results.length === 0) {
      return res.status(400).send('Usuario no encontrado');
    }

    const users = results[0];

    // Verificar la contraseña actual
    bcrypt.compare(oldPassword, users.password, (err, isMatch) => {
      if (!isMatch) {
        return res.status(400).send('Contraseña actual incorrecta');
      }

      // Encriptar la nueva contraseña
      bcrypt.hash(newPassword, 10, (err, hash) => {
        if (err) return res.status(500).send('Error al encriptar la nueva contraseña');

        const updateSql = 'UPDATE users SET password = ? WHERE usuarios = ?';
        db.query(updateSql, [hash, usuarios], (err, result) => {
          if (err) {
            return res.status(500).send('Error al actualizar la contraseña');
          }
          res.status(200).send('Contraseña cambiada con éxito');
        });
      });
    });
  });
});

// Puerto del servidor
app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
