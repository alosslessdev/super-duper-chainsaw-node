// Load environment variables from .env file
import 'dotenv/config';
import axios from 'axios';
import express from 'express';
import session from 'express-session';
import { jsonrepair } from 'jsonrepair';
import hash from 'pbkdf2-password';
import util from 'util';
import conexion from './db.js'; // Importa la conexión a la base de datos
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json' with { type: "json" };
import https from 'https'; // Aunque importado, no se usa para HTTP estándar
import fs from 'fs'; // Aunque importado, no se usa para HTTP estándar
import cors from 'cors'; // Import CORS middleware


// Obtener claves API y secretos de las variables de entorno
const apiKey = process.env.IA_API_KEY || '';
const secretKeyIdStore = process.env.AWS_S3_KEY_ID || '';
const secretKeyStore = process.env.AWS_S3_SECRET_KEY || '';

const app = express(); // Declaración de la aplicación Express

// Determinar host y puerto basándose en NODE_ENV
const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || (isProd ? 80 : 3000); // Puerto para escuchar
const HOST = isProd ? '0.0.0.0' : 'localhost'; // Host para escuchar (0.0.0.0 para producción escucha en todas las interfaces)
const corsOrigin = isProd ? process.env.CORS_ORIGIN_PROD : 'http://localhost:3000'; // Define el origen de CORS basado en el entorno

var privateKey  = fs.readFileSync('/home/ubuntu/privkey.pem', 'utf8');
var certificate = fs.readFileSync('/home/ubuntu/fullchain.pem', 'utf8');
var credentials = {key: privateKey, cert: certificate};

// Configurar CORS
app.use(cors({
  origin: corsOrigin, // Usar el origen CORS determinado
  credentials: true // Permitir el envío de cookies y cabeceras de autorización
}));

// Usar swagger para documentación de la API
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// Middleware para parsear JSON en el cuerpo de las solicitudes
app.use(express.json());

const hasher = hash(); // Inicializar el hasher de contraseñas

// Configuración de la sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'clave-super-secreta-default', // Usar secreto de env o un default
  resave: false, // No guardar la sesión si no ha cambiado
  saveUninitialized: false // No guardar sesiones nuevas que no han sido modificadas
}));

// 🔐 Middleware de protección para rutas que requieren autenticación
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión primero.' });
  }
  next(); // Continuar al siguiente middleware
}

// Promisificar la query a la conexión de base de datos para usar async/await
const query = util.promisify(conexion.query).bind(conexion);

// Utility function to format date for MySQL DATETIME
function formatForMySQLDateTime(date) {
  if (!date) return null;
  const d = new Date(date);
  // Check if the date is valid
  if (isNaN(d.getTime())) {
    return null; // Return null for invalid dates
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Crear usuario / agregado lo de hash
app.post('/usuarios', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  hasher({ password }, (err, pass, salt, hashVal) => {
    if (err) {
      console.error('Error al hashear la contraseña:', err);
      return res.status(500).json({ error: 'Error al hashear la contraseña' });
    }

    const sql = 'INSERT INTO usuario (email, password, salt) VALUES (?, ?, ?)';
    conexion.query(sql, [email, hashVal, salt], (error, resultados) => {
      if (error) {
        console.error('Error al insertar usuario en la BD:', error);
        return res.status(500).json({ error: error.message });
      }
      res.status(201).json({ pk: resultados.insertId, email });
    });
  });
});

// Ruta para iniciar sesión
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log("Intentando iniciar sesión para:", email);

  if (!email || !password) {
    console.log("Email o contraseña no proporcionados.");
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }
  try {
    console.log("Buscando usuario en la base de datos...");
    const resultados = await query('SELECT * FROM usuario WHERE email = ?', [email]);
    console.log("Búsqueda de usuario completada.");

    if (resultados.length === 0) {
      console.log("Usuario no encontrado para el email:", email);
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = resultados[0];
    console.log("Verificando contraseña...");

    hasher({ password, salt: user.salt }, (err, pass, salt, hashVal) => {
      console.log("Hash de contraseña completado.");
      if (err) {
        console.error('Error al verificar contraseña:', err);
        return res.status(500).json({ error: 'Error al verificar contraseña' });
      }

      if (hashVal === user.password) {
        req.session.user = {
          id: user.pk,
          email: user.email
        };
        req.session.save(function (err) {
          if (err) {
            console.error('Error al guardar la sesión:', err);
            return res.status(500).json({ error: 'Error al guardar la sesión' });
          }
          // Solo enviar una respuesta después de que la sesión se haya guardado
          res.json({ mensaje: 'Inicio de sesión exitoso', usuario: req.session.user, secretKeyId: secretKeyIdStore, secretKey: secretKeyStore });
        });
      } else {
        console.log("Contraseña incorrecta para el usuario:", email);
        res.status(401).json({ error: 'Contraseña incorrecta' });
      }
    });
  } catch (error) {
    console.error('Error en la ruta /login:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta para cerrar sesión
app.post('/logout', requireLogin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid'); // Limpiar la cookie de sesión
    res.json({ mensaje: 'Sesión cerrada' });
  });
});

// --- RUTAS PARA TAREAS ---

// Obtener todas las tareas de un usuario
app.get('/tareas/de/:usuario', requireLogin, async (req, res) => {
  const usuarioId = req.params.usuario;
  // Solo permitir acceso a los propios datos
  if (!req.session.user || req.session.user.id != usuarioId) {
    return res.status(403).json({ error: 'No autorizado. Solo puedes acceder a tus propias tareas.' });
  }
  try {
    const resultados = await query('SELECT * FROM tarea WHERE usuario = ?', [usuarioId]);
    res.json(resultados);
  } catch (error) {
    console.error('Error al obtener tareas por usuario:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener tarea por ID
app.get('/tareas/por/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  try {
    const resultados = await query('SELECT * FROM tarea WHERE pk = ?', [id]);
    if (resultados.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    // Solo permitir acceso a los propios datos
    if (!req.session.user || resultados[0].usuario != req.session.user.id) {
      return res.status(403).json({ error: 'No autorizado. Solo puedes acceder a tus propias tareas.' });
    }
    res.json(resultados[0]);
  } catch (error) {
    console.error('Error al obtener tarea por ID:', error);
    res.status(500).json({ error: error.message });
  }
});

// Crear una nueva tarea
app.post('/tareas', requireLogin, async (req, res) => {
  const { fecha_inicio, fecha_fin, descripcion, prioridad, titulo, horas } = req.body;
  // Asignar siempre al usuario logueado
  const usuario = req.session.user?.id;

  // Format dates to MySQL DATETIME format
  const formattedFechaInicio = formatForMySQLDateTime(fecha_inicio);
  const formattedFechaFin = formatForMySQLDateTime(fecha_fin);

    const sql = `INSERT INTO tarea (fecha_inicio, fecha_fin, descripcion, prioridad, titulo, usuario, horas)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

  try {
    const resultados = await query(sql, [formattedFechaInicio, formattedFechaFin, descripcion, prioridad, titulo, usuario, horas]);
    res.status(201).json({ pk: resultados.insertId, fecha_inicio: formattedFechaInicio, fecha_fin: formattedFechaFin, descripcion, prioridad, titulo, usuario });
  } catch (error) {
    console.error('Error al crear nueva tarea:', error);
    res.status(500).json({ error: error.message });
  }
});

// Actualizar tarea
app.put('/tareas/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  const { fecha_inicio, fecha_fin, descripcion, prioridad, titulo } = req.body;

  try {
    const resultados = await query('SELECT * FROM tarea WHERE pk = ?', [id]);
    if (resultados.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!req.session.user || resultados[0].usuario != req.session.user.id) {
      return res.status(403).json({ error: 'No autorizado. Solo puedes modificar tus propias tareas.' });
    }
    const usuario = req.session.user.id; // Obtener el ID del usuario de la sesión

    // Format dates to MySQL DATETIME format
    const formattedFechaInicio = formatForMySQLDateTime(fecha_inicio);
    const formattedFechaFin = formatForMySQLDateTime(fecha_fin);

    const sql = `UPDATE tarea SET fecha_inicio = ?, fecha_fin = ?, descripcion = ?, prioridad = ?, titulo = ?, usuario = ?
               WHERE pk = ?`;

    const updateResult = await query(sql, [formattedFechaInicio, formattedFechaFin, descripcion, prioridad, titulo, usuario, id]);
    if (updateResult.affectedRows === 0) return res.status(404).json({ error: 'Tarea no encontrada o no se realizaron cambios' });
    res.json({ mensaje: 'Tarea actualizada' });
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    res.status(500).json({ error: error.message });
  }
});

// Eliminar tarea
app.delete('/tareas/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  // Solo permitir eliminar si la tarea pertenece al usuario
  try {
    const resultados = await query('SELECT * FROM tarea WHERE pk = ?', [id]);
    if (resultados.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!req.session.user || resultados[0].usuario != req.session.user.id) {
      return res.status(403).json({ error: 'No autorizado. Solo puedes eliminar tus propias tareas.' });
    }
    const deleteResult = await query('DELETE FROM tarea WHERE pk = ?', [id]);
    if (deleteResult.affectedRows === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ mensaje: 'Tarea eliminada' });
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    res.status(500).json({ error: error.message });
  }
});

// RUTA IA CON TAREA POR ID

app.post('/tareas/ia/', requireLogin, async (req, res) => {
  try {
    let response, tareasJsonStr;
    let attempt = 0;
    let jsonRepairSuccess = false;
    let lastError;

    // Process pdf_url and question from the request body
    let pdfUrl = req.body.pdf_url;
    let question = req.body.question;

    // Trim leading/trailing spaces and consider empty if only spaces
    if (typeof pdfUrl === 'string') {
      pdfUrl = pdfUrl.trim();
      if (pdfUrl === '') pdfUrl = '';
    }
    if (typeof question === 'string') {
      question = question.trim();
      if (question === '') question = 'Por favor extrae todos los pasos que debo hacer para completar lo que se plantea en este documento. Si hay una lista de puntos a hacer, muestra la lista.';
    } else { //if the if expression is false
      question = 'Por favor extrae todos los pasos que debo hacer para completar lo que se plantea en este documento. Si hay una lista de puntos a hacer, muestra la lista.';
    }

    // Intentar hasta 2 veces para obtener y reparar la respuesta JSON de la IA
    while (attempt < 2 && !jsonRepairSuccess) {
      try {
        response = await axios.post(
          `https://octopus-app-jjamd.ondigitalocean.app:8000/secure-data`, // URL del servicio de IA
          {
            pdf_url: pdfUrl, // URL del PDF (opcional)
            question: question // Pregunta para la IA
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey // Clave API para autenticación con el servicio de IA
            }
          }
        );
        // Limpiar la cadena de respuesta de la IA (eliminar saltos de línea y barras invertidas)
        let responseString = response.data.replace(/\n/g, "");
        responseString = responseString.replace(/\\/g, "");
        // Intentar reparar el JSON
        tareasJsonStr = jsonrepair(responseString);
        jsonRepairSuccess = true; // Si la reparación es exitosa, salir del bucle
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt >= 2) {
          console.error('Error al reparar el JSON de la IA tras 2 intentos:', err);
          return res.status(500).json({ error: 'Error al reparar el JSON de la IA tras 2 intentos' });
        }
      }
    }

    // Parsear el JSON reparado
    let tareasJson;
    if (typeof tareasJsonStr === 'string') {
      tareasJson = JSON.parse(tareasJsonStr);
    } else {
      tareasJson = tareasJsonStr;
    }

    let results = [];
    const tareas = [];
    // Iterar sobre las claves del objeto JSON de la IA para extraer las tareas
    for (const key of Object.keys(tareasJson)) {
      if (key.toLowerCase().startsWith('tarea')) {
        const idx = key.split('_')[1] || ''; // Extraer el índice de la clave (ej. tarea_1 -> 1)
        const descripcion = tareasJson[key];
        const titulo = tareasJson[key];

        // Buscar las claves de tiempo estimado y horas correspondientes
        const tiempoKey = `tiempoEstimado_${idx}`;
        const horasKey = `horasEstimadas_${idx}`;
        const tiempoEstimado = tareasJson[tiempoKey] || null;
        let horas = tareasJson[horasKey];

        // Validar y convertir 'horas' a un entero, o asignar un valor por defecto (3)
        if (typeof horas === 'string') {
          const horasInt = parseInt(horas, 10);
          if (isNaN(horasInt)) {
            horas = 3;
          } else {
            horas = horasInt;
          }
        } else if (typeof horas !== 'number' || isNaN(horas)) {
          horas = 3;
        }
        tareas.push({ descripcion, titulo, tiempoEstimado, horas });
      }
    }
    // Si la respuesta de la IA no contiene ninguna tarea, retornar un error
    if (tareas.length === 0) {
      return res.status(400).json({ error: 'La respuesta de la IA no contiene ninguna tarea.' });
    }

    // Procesar cada tarea y guardarla en la base de datos
    for (const tareaObj of tareas) {
      const { descripcion, titulo, tiempoEstimado, horas } = tareaObj;
      // Calcular fechaInicio y fechaFin según tiempoEstimado
      const hoy = new Date();
      let dias = 1; // Por defecto, 1 día
      if (typeof tiempoEstimado === 'string') {
        const match = tiempoEstimado.match(/(\d+)\s*d[ií]as?/i);
        if (match) {
          dias = parseInt(match[1], 10);
        }
      }
      const fin = new Date(hoy);
      fin.setDate(hoy.getDate() + dias);

      const fechaInicio = formatForMySQLDateTime(hoy);
      const fechaFin = formatForMySQLDateTime(fin);

      const sql = `INSERT INTO tarea (fecha_inicio, fecha_fin, descripcion, titulo, usuario, tiempo_estimado, horas) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      try {
        const insertResult = await query(sql, [fechaInicio, fechaFin, descripcion, titulo, req.session.user?.id || null, tiempoEstimado, horas]);
        results.push({ tarea: descripcion, tiempoEstimado, horas, insertId: insertResult.insertId });
      } catch (err) {
        console.error('Error al insertar tarea generada por IA:', err);
        results.push({ tarea: descripcion, tiempoEstimado, horas, error: err.message });
      }
    }
    // Si no se procesó ninguna tarea, enviar un error
    if (results.length === 0) {
      return res.status(404).json({ error: 'No se encontró ninguna tarea para procesar.' });
    }
    res.json({ tareasProcesadas: results }); // Enviar las tareas procesadas como respuesta
  } catch (error) {
    console.error('Error general en /tareas/ia/:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Error al procesar la solicitud de IA' });
  }
});

// Iniciar el servidor
app.listen(PORT, HOST, () => {
  console.log(`Servidor corriendo en https://${HOST}:${PORT}`);
});

var httpsServer = https.createServer(credentials, app);

httpsServer.listen(443);


// Manejo de errores del servidor (ej. puerto ya en uso)
app.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Intenta con otro puerto o cierra la aplicación que lo está usando.`);
  } else {
    console.error('Error del servidor:', error);
  }
});
