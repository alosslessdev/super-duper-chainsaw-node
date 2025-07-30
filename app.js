// Load environment variables from .env file
import 'dotenv/config'; 
import axios from 'axios';
import express from 'express';
import session from 'express-session';
import { jsonrepair } from 'jsonrepair';
import hash from 'pbkdf2-password';
import util from 'util';
import conexion from './db.js'; // Importa la conexión
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json' with { type: "json" };
import https from 'https';
import fs  from 'fs';
import cors from 'cors'; // Import CORS

// Get API keys and secrets from environment variables
const apiKey = process.env.IA_API_KEY || '';
const secretKeyIdStore = process.env.AWS_S3_KEY_ID || '';
const secretKeyStore = process.env.AWS_S3_SECRET_KEY || '';

const app = express(); // Declaración de aplicación

// Determine host and port based on NODE_ENV
const isProd = process.env.NODE_ENV === 'production';
const hostAndPort = isProd ? '0.0.0.0:8080' : 'localhost:3000';
const corsOrigin = isProd ? process.env.CORS_ORIGIN_PROD : 'http://localhost:3000'; // Define CORS origin based on env

// Configure CORS
/* app.use(cors({
  origin: corsOrigin, // Use the determined CORS origin
  credentials: true
})); */

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument)); // Usar swagger para documentación
app.use(express.json()); // Middleware para parsear JSON en el cuerpo de las solicitudes

const hasher = hash();

// Configuración de la sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'clave-super-secreta-default', // Usar secreto de env o un default
  resave: false,
  saveUninitialized: false
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

// Crear usuario / agregado lo de hash
app.post('/usuarios', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  hasher({ password }, (err, pass, salt, hashVal) => {
    if (err) return res.status(500).json({ error: 'Error al hashear la contraseña' });

    const sql = 'INSERT INTO usuario (email, password, salt) VALUES (?, ?, ?)';
    conexion.query(sql, [email, hashVal, salt], (error, resultados) => {
      if (error) return res.status(500).json({ error: error.message });
      res.status(201).json({ pk: resultados.insertId, email });
    });
  });
});

// Ruta para iniciar sesión
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log("req.body done");

  if (!email || !password) {
      console.log("no pass done");
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }
  try {
      console.log("enter user search done");
    const resultados = await query('SELECT * FROM usuario WHERE email = ?', [email]);
      console.log("user search done");

    if (resultados.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = resultados[0];
  console.log("entering hash");

    hasher({ password, salt: user.salt }, (err, pass, salt, hashVal) => {
        console.log("ahshing");
      if (err) return res.status(500).json({ error: 'Error al verificar contraseña' });

      if (hashVal === user.password) {
        req.session.user = {
          id: user.pk,
          email: user.email
        };
        req.session.save(function (err) {
          if (err) return res.status(500).json({ error: 'Error al guardar la sesión' });
          // Only send one response after session is saved
          res.json({ mensaje: 'Inicio de sesión exitoso', usuario: req.session.user, secretKeyId: secretKeyIdStore, secretKey: secretKeyStore });
        });
      } else {
        res.status(401).json({ error: 'Contraseña incorrecta' });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para cerrar sesión
app.post('/logout', requireLogin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ mensaje: 'Sesión cerrada' });
  });
});

// RUTAS PARA TAREAS

// Obtener todas las tareas de un usuario
app.get('/tareas/de/:usuario', requireLogin, async (req, res) => {
  const usuario = req.params.usuario;
  // Solo permitir acceso a los propios datos
  if (!req.session.user || req.session.user.id != usuario) {
    return res.status(403).json({ error: 'No autorizado. Solo puedes acceder a tus propias tareas.' });
  }
  try {
    const resultados = await query('SELECT * FROM tarea WHERE usuario = ?', [usuario]);
    res.json(resultados);
  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
});

// Crear una nueva tarea
app.post('/tareas', requireLogin, async (req, res) => {
  const { fecha_inicio, fecha_fin, descripcion, prioridad, titulo } = req.body;
  // Asignar siempre al usuario logueado
  const usuario = req.session.user?.id;
  const sql = `INSERT INTO tarea (fecha_inicio, fecha_fin, descripcion, prioridad, titulo, usuario)
               VALUES (?, ?, ?, ?, ?, ?)`;
  try {
    const resultados = await query(sql, [fecha_inicio, fecha_fin, descripcion, prioridad, titulo, usuario]);
    res.status(201).json({ pk: resultados.insertId, fecha_inicio, fecha_fin, descripcion, prioridad, titulo, usuario });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar tarea
app.put('/tareas/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  const { fecha_inicio, fecha_fin, descripcion, prioridad, titulo } = req.body; // Eliminar 'usuario' del req.body

  try {
      const resultados = await query('SELECT * FROM tarea WHERE pk = ?', [id]);
      if (resultados.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
      if (!req.session.user || resultados[0].usuario != req.session.user.id) {
        return res.status(403).json({ error: 'No autorizado. Solo puedes modificar tus propias tareas.' });
      }
      const usuario = req.session.user.id; // Obtener el ID del usuario de la sesión
      const sql = `UPDATE tarea SET fecha_inicio = ?, fecha_fin = ?, descripcion = ?, prioridad = ?, titulo = ?, usuario = ?
               WHERE pk = ?`;
  
    const updateResult = await query(sql, [fecha_inicio, fecha_fin, descripcion, prioridad, titulo, usuario, id]);
    if (updateResult.affectedRows === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ mensaje: 'Tarea actualizada' });
  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
});

// RUTA IA CON TAREA POR ID
// hacer que guarde los datos temporalmente antes de modificar la base de datos
// ver tambien como se sube el archivo lo mas probable es que sea en s3 y luego aqui se tome el link desde s3 y se pase al rag
app.post('/tareas/ia/', requireLogin, async (req, res) => {
  try {
    let response, tareasJsonStr;
    let attempt = 0;
    let jsonRepairSuccess = false;
    let lastError;
    while (attempt < 2 && !jsonRepairSuccess) {
      try {
        response = await axios.post(
          `http://0000243.xyz:8000/secure-data`,
          {
            pdf_url: req.body.pdf_url || '',
            question: req.body.question
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey
            }
          }
        );
        let responseString = response.data.replace(/\n/g, "");
        responseString = responseString.replace(/\\/g, "");
        tareasJsonStr = jsonrepair(responseString);
        jsonRepairSuccess = true;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt >= 2) {
          console.error(err);
          return res.status(500).json({ error: 'Error al reparar el JSON de la IA tras 2 intentos' });
        }
      }
    }

    // tareasJsonStr is now a valid JSON string or object
    let tareasJson;
    if (typeof tareasJsonStr === 'string') {
      tareasJson = JSON.parse(tareasJsonStr);
    } else {
      tareasJson = tareasJsonStr;
    }

    let results = [];
    // Iterate over keys and group tarea/tiempoEstimado/horas pairs
    // Example: { "tarea_1": "...", "tiempoEstimado_1": "...", "horasEstimadas_1": "...", ... }
    const tareas = [];
    //console.log('tareasJson keys:', Object.keys(tareasJson));
    for (const key of Object.keys(tareasJson)) {
      if (key.toLowerCase().startsWith('tarea')) {
        // Extract index from key, e.g., tarea_1 -> 1
        const idx = key.split('_')[1] || '';
        const descripcion = tareasJson[key];
        const titulo = tareasJson[key];
        // Find matching tiempoEstimado and horas keys
        const tiempoKey = `tiempoEstimado_${idx}`;
        const horasKey = `horasEstimadas_${idx}`;
        const tiempoEstimado = tareasJson[tiempoKey] || null;
        let horas = tareasJson[horasKey];
        //console.log(`idx: ${idx}, horasKey: ${horasKey}, horas value:`, horas);
        // If horas is not a valid integer, default to 3
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
    // If no key starts with 'tarea', return error
    if (tareas.length === 0) {
      return res.status(400).json({ error: 'La respuesta de la IA no contiene ninguna tarea.' });
    }

    for (const tareaObj of tareas) {
      const { descripcion, titulo, tiempoEstimado, horas } = tareaObj;
      // Calcular fechaInicio y fechaFin según tiempoEstimado
      let fechaInicio, fechaFin;
      const hoy = new Date();
      fechaInicio = hoy.toISOString().slice(0, 10); // formato YYYY-MM-DD
      let dias = 1;
      if (typeof tiempoEstimado === 'string') {
        const match = tiempoEstimado.match(/(\d+)\s*d[ií]as?/i);
        if (match) {
          dias = parseInt(match[1], 10);
        }
      }
      const fin = new Date(hoy);
      fin.setDate(hoy.getDate() + dias);
      fechaFin = fin.toISOString().slice(0, 10);

      const sql = `INSERT INTO tarea (fecha_inicio, fecha_fin, descripcion, titulo, usuario, tiempo_estimado, horas) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      try {
        const insertResult = await query(sql, [fechaInicio, fechaFin, descripcion, titulo, req.session.user?.id || null, tiempoEstimado, horas]);
        results.push({ tarea: descripcion, tiempoEstimado, horas, insertId: insertResult.insertId });
      } catch (err) {
        results.push({ tarea: descripcion, tiempoEstimado, horas, error: err.message });
      }
    }
    // If no tasks were processed, send an error
    if (results.length === 0) {
      return res.status(404).json({ error: 'No task was found.' });
    }
    res.json({ tareasProcesadas: results }); //response
  } catch (error) {
    console.error('Error en /tareas/ia/:id:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

app.listen(hostAndPort, () => {
  console.log(`Servidor corriendo en http://${hostAndPort}`);
});
