// Load environment variables from .env file
require('dotenv').config();

const mysql = require('mysql2');

// Get database connection parameters from environment variables
const host = process.env.DB_HOST || 'localhost';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'gestion_tareas';
const port = process.env.DB_PORT || '3306';

const conexion = mysql.createConnection({
  host,
  user,
  password,
  database,
  port, 
  connectTimeout : 60000,
  keepAliveInitialDelay: 10000, // 0 by default.
  enableKeepAlive: true, // false by default.
});

conexion.connect(error => {
  if (error) {
    console.error('Error al conectar a la base de datos:', error);
  } else {
    console.log('Conectado a la base de datos MySQL');
  }
});

module.exports = conexion;
