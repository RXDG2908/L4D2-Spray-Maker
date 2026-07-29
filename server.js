import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { router } from './src/routes.js';
import { cleanupExpiredSessions, destroyAllSessions } from './src/sessionStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Arranca el servidor local.
 * Con puerto 0 el sistema elige uno libre, que es lo que usa la app de
 * escritorio para no chocar con otro programa que ya ocupe el 3000.
 */
export function startServer({ port = Number(process.env.PORT) || 3000 } = {}) {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(router);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : (err.code || 'UNKNOWN');
    if (!res.headersSent) {
      res.status(400).json({ error: code, message: err.message || 'Error inesperado.' });
    }
  });

  const cleanupTimer = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
  cleanupTimer.unref();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
    server.on('error', reject);
  });
}

export function stopServer() {
  destroyAllSessions();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    destroyAllSessions();
    process.exit(0);
  });
}

// Ejecutado directamente con `npm start`, sin Electron.
if (process.env.L4D2_SPRAY_EMBEDDED !== '1') {
  const { port } = await startServer();
  console.log(`L4D2 Spray Maker: http://localhost:${port}`);
}
