const express = require('express');
const http = require('http');
const RealtimeService = require('./services/RealtimeService');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { errorHandler } = require('./middleware/errorHandler');
const requestContext = require('./middleware/requestContext');

// Importar rutas
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const paymentRoutes = require('./routes/payments');
const receiptRoutes = require('./routes/receipts');
const documentRoutes = require('./routes/documents');
const scheduleRoutes = require('./routes/schedules');
const notificationRoutes = require('./routes/notifications');
const instructorRoutes = require('./routes/instructor');
const meRoutes = require('./routes/me');
const instructorsRoutes = require('./routes/instructors');
const courseCycleRoutes = require('./routes/courseCycles');
const attendanceRoutes = require('./routes/attendance');
const studentPortalRoutes = require('./routes/studentPortal');
const adminRoutes = require('./routes/admin');
const referralCampaignRoutes = require('./routes/referralCampaigns');
const PracticalSessionAutoCloseService = require('./services/PracticalSessionAutoCloseService');

const app = express();
app.set('trust proxy', 1);
app.use(requestContext);

// ════════════════════════════════════════
// MIDDLEWARE DE SEGURIDAD
// ════════════════════════════════════════
app.use(helmet({ contentSecurityPolicy: false }));
const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const publicLandingOrigins = new Set([
  'https://spormancart.netlify.app',
  'https://sportmancar.netlify.app',
]);
const originAllowed = origin => Boolean(origin) && (
  configuredOrigins.includes(origin) || publicLandingOrigins.has(origin)
  || /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)
  || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  || /^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$/.test(origin)
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (configuredOrigins.includes(origin)) return callback(null, true);
    if (publicLandingOrigins.has(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) return callback(null, true);
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
    if (/^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 100,
  // Las pantallas del ERP consultan varios recursos en paralelo. Las
  // respuestas correctas no deben agotar el limite de trabajo normal.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes, intenta más tarde' },
});
app.use(limiter);

// ════════════════════════════════════════
// MIDDLEWARE DE PARSING
// ════════════════════════════════════════
app.use(require('./services/ResourceTelemetryService').middleware);
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ════════════════════════════════════════
// LOGGING
// ════════════════════════════════════════
morgan.token('private-url', req => String(req.originalUrl || req.url).split('?')[0]
  .replace(/(\/mobile-upload(?:-token)?\/)[^/]+/g, '$1[redacted]'));
app.use(morgan(':method :private-url :status :response-time ms - :res[content-length]'));
app.use('/api',require('./middleware/privateApiResponses'));

// ════════════════════════════════════════
// RUTAS
// ════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/instructors', instructorsRoutes);
app.use('/api/course-cycles', courseCycleRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/student-portal', studentPortalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/me', meRoutes);
app.use('/api/referrals', referralCampaignRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    app: process.env.APP_NAME || 'SportmancarERP',
    version: process.env.APP_VERSION || '1.0.0',
    realtime: app.realtime?.ready || false,
    timestamp: new Date().toISOString(),
  });
});

// ════════════════════════════════════════
// 404 - Ruta no encontrada
// ════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// ════════════════════════════════════════
// MANEJO DE ERRORES GLOBAL
// ════════════════════════════════════════
app.use(errorHandler);

// ════════════════════════════════════════
// INICIAR SERVIDOR
// ════════════════════════════════════════
const PORT = process.env.SERVER_PORT || 5000;
const HOST = process.env.SERVER_HOST || '0.0.0.0';

const server = http.createServer(app);
app.realtime = new RealtimeService().attach(server,originAllowed);
require('./services/ResourceTelemetryService').notify = () => app.realtime.publish('resources');
server.listen(PORT, HOST, () => {
  PracticalSessionAutoCloseService.start();
  console.log(`
╔═══════════════════════════════════════╗
║     🏫 SportmancarERP API v1.0.0     ║
║═══════════════════════════════════════║
║  Servidor: http://${HOST}:${PORT}       ║
║  API:     http://${HOST}:${PORT}/api   ║
║  Salud:   http://${HOST}:${PORT}/api/health ║
╚═══════════════════════════════════════╝
  `);
});

module.exports = app;
