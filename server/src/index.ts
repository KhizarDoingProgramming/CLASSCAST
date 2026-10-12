import express from 'express';
import http from 'http';
import path from 'path';
import QRCode from 'qrcode';
import { SessionManager } from './session';
import { SignalingServer } from './signaling';
import { getLocalIp, getHostname } from './network';
import { logger, setLogLevel, LogLevel } from './logger';
import { DEFAULT_PORT } from '@classcast/shared';

const PORT = parseInt(process.env.PORT || '', 10) || DEFAULT_PORT;
const HOST = '0.0.0.0';

async function main() {
  if (process.env.DEBUG) {
    setLogLevel(LogLevel.DEBUG);
  }

  const app = express();
  const server = http.createServer(app);
  const sessionManager = new SessionManager();
  const signaling = new SignalingServer(sessionManager);

  // CORS for development
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json());

  // Serve web app - check multiple possible locations (dev monorepo, packaged Electron, root dist)
  const candidateWebPaths = [
    path.join(__dirname, '../../web/dist'),
    path.join(__dirname, '../web/dist'),
    path.join(process.cwd(), 'web/dist'),
    path.join(__dirname, 'web/dist'),
  ];
  const fs = require('fs');
  const webDist = candidateWebPaths.find(p => fs.existsSync(p)) || candidateWebPaths[0];
  app.use(express.static(webDist));

  // API: Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // API: List active sessions (for students to discover)
  app.get('/api/sessions', (_req, res) => {
    const sessions = sessionManager.getActiveSessions();
    res.json({ sessions: sessions.map(s => ({
      id: s.id,
      roomName: s.config.roomName,
      participantCount: Array.from(s.participants.values()).filter(p => p.isConnected && !p.isHost).length,
      maxParticipants: s.config.maxParticipants,
      requireJoinApproval: s.config.requireJoinApproval,
    }))});
  });

  // API: Get local IP and port
  app.get('/api/network', (_req, res) => {
    res.json({ ip: getLocalIp(), port: PORT, hostname: getHostname() });
  });

  // API: Generate QR code for session
  app.get('/api/qr/:sessionId', async (req, res) => {
    try {
      const session = sessionManager.getSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      const localIp = getLocalIp();
      const url = `http://${localIp}:${session.config.port}/join?session=${session.id}`;
      const qr = await QRCode.toDataURL(url, { width: 256, margin: 1 });
      res.json({ qr, url });
    } catch (err) {
      logger.error('QR generation failed', err);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // API: Get attendance
  app.get('/api/attendance/:sessionId', (req, res) => {
    const records = sessionManager.getAttendance(req.params.sessionId);
    const csvHeader = 'Roll No,Name,Join Time,Leave Time,Status\n';
    const csvRows = records.map(r => {
      const joinTime = new Date(r.joinedAt).toISOString();
      const leaveTime = r.leftAt ? new Date(r.leftAt).toISOString() : '';
      const status = r.isConnected ? 'Connected' : 'Left';
      return `"${r.rollNumber}","${r.name}","${joinTime}","${leaveTime}","${status}"`;
    }).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
    res.send(csvHeader + csvRows);
  });

  // SPA fallback — serve index.html for all non-API, non-static routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });

  // Start signaling
  signaling.start(server);

  return new Promise<{ server: http.Server; close: () => Promise<void> }>((resolve, reject) => {
    server.on('error', (err) => {
      logger.error('Server error', err);
      reject(err);
    });

    server.listen(PORT, HOST, () => {
      const localIp = getLocalIp();
      const hostname = getHostname();
      logger.info('');
      logger.info('╔═══════════════════════════════════════════════════╗');
      logger.info('║              ClassCast Server Running             ║');
      logger.info('╠═══════════════════════════════════════════════════╣');
      logger.info(`║  Hostname : ${hostname.padEnd(37)}║`);
      logger.info(`║  Local    : http://localhost:${String(PORT).padEnd(25)}║`);
      logger.info(`║  Network  : http://${localIp}:${String(PORT).padEnd(24)}║`);
      logger.info('╠═══════════════════════════════════════════════════╣');
      logger.info('║  Students connect to the Network address above    ║');
      logger.info('║  Make sure devices are on the same network        ║');
      logger.info('╚═══════════════════════════════════════════════════╝');
      logger.info('');

      const close = () => {
        return new Promise<void>((resClose) => {
          logger.info('Shutting down server...');
          signaling.stop();
          server.close(() => {
            logger.info('Server closed cleanly');
            resClose();
          });
        });
      };

      resolve({ server, close });
    });
  });
}

export { main as startServer };

if (require.main === module) {
  main().then(({ close }) => {
    const shutdown = async () => {
      await close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch((err) => {
    logger.error('Failed to start server', err);
    process.exit(1);
  });
}

