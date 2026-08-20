require('./src/config/env');

const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./src/config/db');
const createApp = require('./src/app');
const { init: initSocket } = require('./src/socket');

const PORT = process.env.PORT || 5000;
const app = createApp();
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
const io = new Server(server, {
  cors: {
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  },
});

initSocket(io);

async function start() {
  await connectDB();

  // Bind 0.0.0.0 so Dokploy/Traefik can reach the container over IPv4
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
