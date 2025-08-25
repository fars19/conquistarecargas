// Importar módulos necesarios
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const serverless = require('serverless-http'); // Módulo para Netlify Functions

// **NUEVO LOG DE INICIO**
console.log('🏁 server.js: Iniciando la función Netlify.');

// ATENCIÓN IMPORTANTE DE SEGURIDAD:
// Las contraseñas se están guardando en texto plano. Esto es ALTAMENTE INSEGURO
// y no se recomienda para entornos de producción.
// Si tu videojuego puede ser adaptado para usar hashing (MD5, SHA1, etc.),
// es FUERTEMENTE aconsejable implementarlo aquí para proteger los datos de tus usuarios.

// Configuración de la base de datos
// ¡Las credenciales se leerán de las variables de entorno de Netlify!
// Para probar LOCALMENTE, se usan los valores por defecto (después de ||).
// Cuando se despliegue en Netlify, usará los valores de las variables de entorno de Netlify.
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',       // Netlify: Valor de DB_HOST. LOCAL: '127.0.0.1' (para tu máquina)
    user: process.env.DB_USER || 'localhost_3306',       // Netlify: Valor de DB_USER. LOCAL: 'localhost_3306' (el usuario que te funcionó localmente)
    password: process.env.DB_PASSWORD || '8623262c', // Netlify: Valor de DB_PASSWORD. LOCAL: '8623262c'
    database: process.env.DB_NAME || 'camilo',       // Netlify: Valor de DB_NAME. LOCAL: 'camilo'
    port: process.env.DB_PORT || 3306 // Netlify: Valor de DB_PORT o 3306 por defecto
};

// **NUEVO LOG: CONFIGURACIÓN DE DB**
console.log(`🔌 server.js: Configuración de DB - Host: ${dbConfig.host}, User: ${dbConfig.user}, Database: ${dbConfig.database}, Port: ${dbConfig.port}. (La contraseña no se muestra por seguridad)`);


// Crear una aplicación Express
const app = express();

// Middlewares
app.use(cors()); // Permite que tu frontend haga solicitudes a este backend
app.use(express.json()); // Permite a Express leer JSON en el cuerpo de las solicitudes

let dbConnection;

// Función para inicializar la conexión a la base de datos
async function connectDB() {
    // **NUEVO LOG**
    console.log('Attempting to connect to DB. Current connection status:', !!dbConnection);

    // Reutilizar conexión si ya existe y está activa.
    // En Netlify Functions, las conexiones pueden persistir entre invocaciones (cold start).
    if (dbConnection && dbConnection.connection && !dbConnection.connection._closing) {
        console.log('Reusing existing DB connection.');
        return dbConnection;
    }
    try {
        console.log('Establishing new DB connection...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conexión a la base de datos MySQL establecida correctamente.');
        dbConnection = connection; // Guarda la conexión para posible reutilización
        return connection;
    } catch (error) {
        console.error('❌ Error al conectar con la base de datos:', error);
        // En Netlify Functions, lanzamos el error para que sea capturado.
        throw new Error(`Database connection failed: ${error.message}`);    
    }
}

// Función para crear la tabla de cuentas (accounts) si no existe
async function createAccountsTable() {
    // **NUEVO LOG**
    console.log('Attempting to create/verify accounts table.');
    try {
        const connection = await connectDB(); // Asegúrate de que la conexión esté establecida antes de usarla
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS accounts (
                Username VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY,
                Password VARCHAR(255) NOT NULL, /* Se guardará en texto plano */
                Email VARCHAR(255) NOT NULL UNIQUE,
                Question VARCHAR(255),
                Answer VARCHAR(255),
                Creation DATETIME DEFAULT CURRENT_TIMESTAMP
                /* Otros campos de tu tabla accounts pueden ir aquí si los necesitas */
            );
        `;
        await connection.execute(createTableQuery); // Usar la conexión devuelta por connectDB
        console.log('👍 Tabla "accounts" verificada/creada exitosamente.');
    } catch (error) {
        console.error('❌ Error al crear/verificar la tabla "accounts":', error);
        throw new Error(`Table creation/verification failed: ${error.message}`);
    }
}

// Asegúrate de que la tabla se cree cuando la función sea inicializada.
// Esto se ejecutará en el "cold start" de la función en Netlify.
createAccountsTable().catch(err => console.error("Initial table setup failed:", err));


// Ruta para el registro de usuarios
app.post('/register', async (req, res) => {
    // **NUEVO LOG**
    console.log('🚀 /register: Solicitud POST recibida.');
    console.log('Body de la solicitud:', req.body);

    // Obtener los datos del cuerpo de la solicitud (frontend)
    const { username, password, email, securityQuestion, securityAnswer } = req.body;

    // Validación básica de datos
    if (!username || !password || !email || !securityQuestion || !securityAnswer) {
        console.log('⚠️ /register: Campos obligatorios incompletos.');
        return res.status(400).json({ message: 'Todos los campos obligatorios deben ser completados.' });
    }

    try {
        await connectDB(); // Asegura que tenemos una conexión activa
        const plainTextPassword = password;    

        // Preparar la consulta SQL para insertar la nueva cuenta
        const insertAccountQuery = `
            INSERT INTO accounts (Username, Password, Email, Question, Answer)
            VALUES (?, ?, ?, ?, ?);
        `;
        // **NUEVO LOG**
        console.log('Executing INSERT query for username:', username);
        const [result] = await dbConnection.execute(
            insertAccountQuery,
            [username, plainTextPassword, email, securityQuestion, securityAnswer]
        );
        // **NUEVO LOG**
        console.log('✨ /register: Cuenta registrada exitosamente. Result:', result);
        res.status(201).json({ message: 'Cuenta registrada exitosamente (contraseña guardada en texto plano)', userId: username });

    } catch (error) {
        console.error('❌ Error durante el registro de cuenta:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'El nombre de usuario o el correo electrónico ya están registrados.' });
        }
        res.status(500).json({ message: `Error interno del servidor al registrar cuenta: ${error.message}` });
    }
});

// Exporta la aplicación Express envuelta para Netlify Functions
module.exports.handler = serverless(app);

// Si quieres probar LOCALMENTE tu función de Netlify, necesitas un entorno
// como `netlify-cli` y ejecutar `netlify dev`.
// Para pruebas unitarias o si NO usas `netlify-cli` y quieres `node server.js`
// puedes añadir un servidor de escucha condicional, pero `serverless-http`
// ya abstrae gran parte de esto.
/*
if (process.env.NODE_ENV !== 'production' && !process.env.LAMBDA_TASK_ROOT && !module.parent) {
    app.listen(3000, () => {
        console.log('Servidor backend corriendo localmente en http://localhost:3000 (para pruebas con Express puro)');
    });
}
*/
