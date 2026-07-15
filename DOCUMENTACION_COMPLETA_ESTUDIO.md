# Documentación completa de estudio — TechDesk Pro

## 1. Introducción

TechDesk Pro es una aplicación web de soporte técnico que permite a los usuarios crear tickets, gestionar incidencias y recibir ayuda automática mediante inteligencia artificial. El proyecto está desarrollado con Node.js, Express y SQLite, y cuenta con autenticación, sesiones, protección CSRF, control de roles y conexión con Gemini.

El objetivo de esta documentación es que puedas estudiarla como si fuera una guía técnica completa: explicar qué hace cada archivo, qué técnicas se usan, qué significan los símbolos del código y cómo funciona la aplicación end-to-end.

---

## 2. Qué tecnologías usa la aplicación

### 2.1 Backend
- Node.js: entorno de ejecución para JavaScript en el servidor.
- Express: framework para crear servidores web y rutas HTTP.
- SQLite: base de datos ligera y fácil de usar para almacenar usuarios, tickets y configuraciones.
- Express Session: maneja sesiones de usuario.
- bcryptjs: encripta contraseñas.
- Helmet: añade cabeceras de seguridad.
- express-rate-limit: limita las peticiones para evitar abuso.
- cookie-parser: permite leer cookies.
- better-sqlite3: driver para trabajar con SQLite desde Node.js.
- @google/generative-ai: librería para consumir la API de Gemini.

### 2.2 Frontend
- HTML, CSS y JavaScript puro.
- El frontend está en la carpeta [public](public).
- El navegador consume las APIs del backend y muestra la interfaz.

---

## 3. Estructura del proyecto

- [server.js](server.js): punto principal del servidor.
- [src/db.js](src/db.js): conexión y creación de tablas SQLite.
- [src/controllers](src/controllers): lógica de cada módulo.
- [src/routes](src/routes): rutas de la API.
- [src/middleware](src/middleware): funciones que protegen y validan peticiones.
- [src/gemini.js](src/gemini.js): integración con la IA de Gemini.
- [public](public): archivos HTML, CSS y JS del frontend.
- [data](data): archivos de base de datos y sesiones.

---

## 4. Símbolos y conceptos técnicos usados en el código

### 4.1 `require()`
Sirve para importar módulos o librerías.

Ejemplo:
```js
const express = require('express');
```
Significa: “trae la librería Express y la guarda en la variable express”.

### 4.2 `const`
Declara una variable que no cambia durante la ejecución del programa.

Ejemplo:
```js
const app = express();
```
Aquí `app` representa la aplicación Express.

### 4.3 `let`
Declara una variable que sí puede cambiar después.

### 4.4 `=>`
Es una función flecha. Permite escribir funciones de forma más corta.

Ejemplo:
```js
(req, res) => {
  res.send('Hola');
}
```

### 4.5 `async` y `await`
Se usan para trabajar con operaciones que tardan, como peticiones a APIs o consultas a bases de datos.

Ejemplo:
```js
async function login(req, res) {
  const valid = await bcrypt.compare(password, hash);
}
```
`await` espera a que termine la operación antes de seguir.

### 4.6 `try { } catch (err) { }`
Sirve para manejar errores.

Ejemplo:
```js
try {
  // código que puede fallar
} catch (err) {
  console.error(err);
}
```

### 4.7 `module.exports`
Permite exportar funciones o variables para que otros archivos puedan usarlas.

Ejemplo:
```js
module.exports = { login, logout };
```

### 4.8 `.` y `..`
- `.` significa “la carpeta actual”.
- `..` significa “la carpeta anterior”.
Se usan en rutas de importación y archivos.

### 4.9 `?.`
Es el operador de encadenamiento opcional. Evita errores si una propiedad no existe.

Ejemplo:
```js
req.session?.userId
```
Si `req.session` no existe, no falla.

### 4.10 `` `...` ``
Son template literals o plantillas de texto.

Ejemplo:
```js
const texto = `Hola ${usuario}`;
```
Permiten combinar texto y variables de forma limpia.

### 4.11 `res.json()`
Envía una respuesta en formato JSON al cliente.

### 4.12 `res.sendFile()`
Envía un archivo HTML o estático al navegador.

### 4.13 `req.body`
Contiene los datos enviados en una petición POST o PUT.

### 4.14 `req.session`
Guarda información del usuario durante la sesión activa.

### 4.15 Middleware
Es una función que se ejecuta entre la petición y la respuesta.

Ejemplo:
```js
app.use(requireAuth);
```

---

## 5. Explicación de los archivos principales

### 5.1 [server.js](server.js)
Este es el cerebro del proyecto.

#### Bloque de configuración inicial
- `require('dotenv').config();`
  Carga las variables de entorno desde [.env](.env).
- `const express = require('express');`
  Importa Express.
- `const session = require('express-session');`
  Activa sesiones.
- `const helmet = require('helmet');`
  Activa seguridad HTTP.
- `const rateLimit = require('express-rate-limit');`
  Activa limitación de peticiones.

#### Creación de la app
- `const app = express();`
  Crea el servidor.
- `app.set('trust proxy', 1);`
  Permite que Express funcione bien detrás de un proxy reverso como Render.

#### Middlewares globales
- `app.use(helmet(...))`
  Protege la app con cabeceras seguras.
- `app.use(globalLimiter)`
  Limita peticiones.
- `app.use(express.json(...))`
  Permite recibir datos JSON.
- `app.use(cookieParser())`
  Lee cookies.
- `app.use(session(...))`
  Maneja sesiones.

#### Rutas del sistema
- `app.use('/auth', authRoutes);`
  Monta las rutas de autenticación.
- `app.use('/tickets', ticketRoutes);`
  Monta las rutas de tickets.
- `app.use('/admin', adminRoutes);`
  Monta las rutas de administración.
- `app.use('/tic', ticRoutes);`
  Monta las rutas del módulo TIC.

#### Endpoint de IA
- `app.post('/api/generar-ticket', ...)`
  Recibe la descripción del problema y llama a la IA para generar un ticket.

#### Rutas de páginas
- `/login`: muestra la pantalla de login.
- `/dashboard`: muestra el panel principal.
- `/health`: devuelve estado del servidor.

#### Inicio del servidor
- `app.listen(PORT, ...)`
  Inicia la aplicación en el puerto configurado.

---

### 5.2 [src/db.js](src/db.js)
Este archivo conecta la app a SQLite y crea las tablas necesarias.

#### Qué hace
- Crea la carpeta [data](data) si no existe.
- Crea la base de datos [data/techdesk.db](data/techdesk.db).
- Define tablas como:
  - `users`
  - `tickets`
  - `categories`
  - `subcategories`
  - `priorities`
  - `notifications`
  - `audit_logs`

#### Técnica utilizada
- `db.exec(...)`
  Ejecuta consultas SQL para crear tablas.
- `CREATE TABLE IF NOT EXISTS`
  Crea la tabla solo si no existe.
- `db.pragma(...)`
  Ajusta características de SQLite para mejor rendimiento.

---

### 5.3 [src/controllers/auth.controller.js](src/controllers/auth.controller.js)
Aquí está la lógica de autenticación.

#### Función `login`
- Busca el usuario por email.
- Verifica que la cuenta esté activa.
- Compara la contraseña con el hash usando `bcrypt.compare`.
- Si todo está bien, crea una sesión.

#### Función `logout`
- Destruye la sesión y limpia la cookie.

#### Función `forgotPassword`
- Genera un token de recuperación.
- Lo guarda en la base de datos.

#### Función `resetPassword`
- Valida el token.
- Genera un nuevo hash de contraseña.
- Actualiza el registro en la BD.

#### Técnica de seguridad
- Se usa `bcryptjs` para no guardar contraseñas en texto plano.
- Se usa `req.session.regenerate(...)` para crear una sesión limpia.

---

### 5.4 [src/middleware/auth.middleware.js](src/middleware/auth.middleware.js)
Este archivo protege rutas y controla acceso.

#### `requireAuth`
- Revisa si el usuario está autenticado.
- Si no lo está, lo redirige al login.
- Si sí lo está, permite pasar al siguiente paso.

#### `requireRole`
- Revisa el rol del usuario.
- Si no tiene el rol permitido, devuelve error 403.

#### `setNoStoreHeaders`
- Evita que el navegador guarde páginas sensibles en caché.
- Esto mejora la seguridad de páginas privadas.

---

### 5.5 [src/middleware/csrf.middleware.js](src/middleware/csrf.middleware.js)
Protege contra ataques CSRF.

#### `csrfSetToken`
- Crea un token aleatorio.
- Lo guarda en una cookie.

#### `csrfValidate`
- Comprueba que el token recibido en el header `x-csrf-token` coincida con la cookie.
- Si no coinciden, rechaza la petición.

---

### 5.6 [src/gemini.js](src/gemini.js)
Este archivo integra la aplicación con Gemini.

#### Qué hace
- Lee categorías, subcategorías y prioridades desde la base de datos.
- Construye un prompt para la IA.
- Envía la solicitud a Gemini.
- Recibe la respuesta y la transforma en una estructura útil para crear un ticket.

#### Concepto clave
- `generateContent(...)` es la función que hace la petición a la IA.

---

### 5.7 [src/routes/auth.routes.js](src/routes/auth.routes.js)
Define las rutas relacionadas con autenticación.

#### Rutas principales
- `/auth/login`
- `/auth/logout`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/me`

#### Técnica utilizada
- `express.Router()` crea un grupo de rutas independiente.

---

### 5.8 [src/routes/tickets.routes.js](src/routes/tickets.routes.js)
Define las rutas para trabajar con tickets.

#### Funcionalidades
- Listar tickets.
- Crear tickets.
- Ver un ticket por id.
- Agregar comentarios.
- Subir archivos.
- Cambiar estado o asignación.

#### Técnica utilizada
- `upload.single('file')` permite recibir un archivo en la petición.

---

## 6. Flujo completo de login

1. El navegador entra a [public/login.html](public/login.html).
2. El usuario envía email y contraseña.
3. El frontend manda la información a `/auth/login`.
4. El backend busca el usuario en la base de datos.
5. Se valida la contraseña con `bcrypt.compare`.
6. Si todo es correcto, se crea una sesión.
7. El usuario es redirigido al dashboard.

---

## 7. Flujo completo de creación de un ticket

1. El usuario llena el formulario en [public/dashboard.html](public/dashboard.html).
2. El frontend envía los datos al backend vía API.
3. El backend valida que el usuario esté autenticado.
4. Se guarda el ticket en la base de datos.
5. Si el usuario usa la IA, el sistema llama a [src/gemini.js](src/gemini.js).
6. La IA devuelve una propuesta de título, categoría, prioridad y solución.
7. El sistema la adapta y la muestra al usuario.

---

## 8. Seguridad aplicada en la aplicación

### 8.1 Encriptación
- Contraseñas protegidas con `bcryptjs`.

### 8.2 Sesiones
- Se usa `express-session`.
- Las sesiones se guardan de forma segura.

### 8.3 CSRF
- Se protege con tokens para evitar falsificaciones.

### 8.4 Cabeceras de seguridad
- Se usa `helmet`.

### 8.5 Limitación de peticiones
- Se usa `express-rate-limit`.

---

## 9. Despliegue en Render

### 9.1 Importancia del proxy
- La línea `app.set('trust proxy', 1);` en [server.js](server.js) es clave.
- Permite que Express funcione correctamente cuando el servidor está detrás de un proxy reverso como Render.

### 9.2 Puerto dinámico
- El servidor usa `process.env.PORT`.
- Render asigna un puerto automáticamente.

### 9.3 Health check
- El endpoint `/health` sirve para comprobar si la app está viva.

---

## 10. Glosario de términos importantes

- API: interfaz que permite que el frontend hable con el backend.
- Middleware: función intermedia entre petición y respuesta.
- Session: información guardada mientras el usuario navega.
- CSRF: protección contra peticiones falsificadas.
- Hash: valor cifrado irreversible de una contraseña.
- Route: dirección o endpoint de la aplicación.
- Controller: archivo que contiene la lógica de negocio.
- Model: estructura lógica de datos, en este caso representada por tablas SQLite.
- Proxy reverso: servidor que recibe peticiones y las reenvía a la app.

---

## 11. Resumen general para estudiar

La aplicación funciona así:
1. El usuario entra a la web.
2. El backend valida su autenticación.
3. El sistema guarda datos en SQLite.
4. Las APIs permiten gestionar tickets y usuarios.
5. La IA de Gemini ayuda a construir tickets automáticamente.
6. La app está protegida con seguridad básica y preparada para correr en Render.

---

## 12. Conclusión

TechDesk Pro es un ejemplo completo de una aplicación web moderna porque combina:
- frontend web,
- backend con Express,
- autenticación,
- seguridad,
- base de datos,
- IA,
- y despliegue en la nube.

Este proyecto sirve como excelente ejemplo para estudiar desarrollo web full stack, seguridad, APIs y despliegue.
