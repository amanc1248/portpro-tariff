const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const { xss } = require('express-xss-sanitizer');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth.routes');
const propertyRoutes = require('./routes/property.routes');
const favoriteRoutes = require('./routes/favorite.routes');
const chatRoutes = require('./routes/chat.routes');
const settingsRoutes = require('./routes/settings.routes');
const bookingRoutes = require('./routes/booking.routes');
const errorHandler = require('./middleware/error.middleware');
const socketService = require('./services/socket.service');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const socketOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:5173').split(',').map(o => o.trim());
const socketIsWildcard = socketOrigins.includes('*');
const io = new Server(server, {
  cors: {
    origin: socketIsWildcard ? '*' : socketOrigins,
    methods: ['GET', 'POST'],
    credentials: !socketIsWildcard
  }
});

// Initialize Socket Service
socketService.init(io);

// Initialize Firebase Admin for push notifications
const { initFirebase } = require('./services/fcm.service');
initFirebase();

// ====================================
// MIDDLEWARE
// ====================================

// Security middleware
app.use(helmet());

// CORS middleware
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:5173').split(',').map(o => o.trim());
const isWildcard = allowedOrigins.includes('*');
app.use(cors({
  origin: isWildcard ? '*' : allowedOrigins,
  credentials: !isWildcard
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against NoSQL injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Response compression
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting (disabled in test environment)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth attempts, please try again in a few minutes.' }
  });
  app.use('/api/auth', authLimiter);
}

// ====================================
// ROUTES
// ====================================

// Health check route
const mongoose = require('mongoose');

app.get('/', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbOk = dbState === 1; // 1 = connected

  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    message: dbOk ? 'Gharbeti API Server is Running' : 'Service degraded',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? 'connected' : 'disconnected',
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/bookings', bookingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = { app, server, io };
