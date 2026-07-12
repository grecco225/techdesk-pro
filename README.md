# 🎫 Generador de Tickets de Soporte con IA (Gemini)

Aplicación web que recibe la descripción de un problema técnico y usa **Gemini AI**
(gratuito) para generar automáticamente un ticket de soporte con título, categoría,
prioridad y solución sugerida.

## 📁 Estructura del proyecto

```
ticket-ia/
├── Dockerfile              # Receta para construir la imagen
├── deployment.yaml         # Kubernetes: 3 réplicas de la app
├── service.yaml             # Kubernetes: puerta de entrada (NodePort)
├── package.json             # Dependencias del proyecto
├── .env.example              # Ejemplo de variables de entorno
├── .gitignore
├── .dockerignore
├── server.js                # Servidor Express (backend)
├── src/
│   └── gemini.js            # Lógica que llama a la API de Gemini
└── public/                  # Frontend (lo que ve el usuario)
    ├── index.html
    ├── style.css
    └── script.js
```

## 1. Consigue tu API Key gratuita de Gemini

1. Entra a https://aistudio.google.com/apikey
2. Inicia sesión con tu cuenta de Google.
3. Haz clic en **"Create API Key"**. Es gratis (con límites de uso por minuto/día,
   suficientes para esta práctica).
4. Copia la key.

## 2. Configura el proyecto localmente

```bash
cd ticket-ia
cp .env.example .env
```

Abre `.env` y pega tu key:

```
GEMINI_API_KEY=AIzaSy...tu_key_real
PORT=3000
```

Instala dependencias y corre local (sin Docker) para probar rápido:

```bash
npm install
npm start
```

Abre http://localhost:3000

## 3. Construye la imagen de Docker

> Nota: la API key **no** va dentro de la imagen. Se inyecta en tiempo de ejecución.

```bash
docker build -t ticket-ia:v1 .
```

## 4. Ejecuta el contenedor localmente (probando con Docker)

```bash
docker run -d -p 8080:80 --env-file .env ticket-ia:v1
```

Abre http://localhost:8080

## 5. Despliega en Kubernetes

Primero crea un **Secret** con tu API key (nunca la pongas directo en el YAML):

```bash
kubectl create secret generic gemini-secret --from-literal=GEMINI_API_KEY=tu_key_real
```

Luego aplica el Deployment y el Service:

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

Verifica:

```bash
kubectl get pods
kubectl get deployments
kubectl get services
```

Abre http://localhost:30080

## 6. Escala la aplicación

```bash
kubectl scale deployment ticket-ia --replicas=5
kubectl get pods
```

## 7. Limpieza

```bash
kubectl delete -f service.yaml
kubectl delete -f deployment.yaml
kubectl delete secret gemini-secret
```

## 🧠 Cómo funciona (resumen)

1. El usuario escribe la descripción del problema en el formulario web.
2. El frontend (`script.js`) envía esa descripción a `POST /api/generar-ticket`.
3. `server.js` recibe la petición y llama a `src/gemini.js`.
4. `gemini.js` arma un *prompt* pidiéndole a Gemini que devuelva **solo JSON**
   con título, categoría, prioridad, descripción y solución sugerida.
5. El backend responde ese JSON al frontend, que lo muestra como una tarjeta de ticket.
