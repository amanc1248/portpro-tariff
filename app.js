const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth.routes');
const propertyRoutes = require('./routes/property.routes');
const favoriteRoutes = require('./routes/favorite.routes');
const chatRoutes = require('./routes/chat.routes');
const settingsRoutes = require('./routes/settings.routes');
const errorHandler = require('./middleware/error.middleware');
const socketService = require('./services/socket.service');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
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
const allowedOrigins = (process.env.FRONTEND_URL || '*').split(',').map(o => o.trim());
const isWildcard = allowedOrigins.includes('*');
app.use(cors({
  origin: isWildcard ? '*' : allowedOrigins,
  credentials: !isWildcard
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
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
    max: 10,
    message: 'Too many auth attempts, please try again later.'
  });
  app.use('/api/auth', authLimiter);
}

// ====================================
// ROUTES
// ====================================

// Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏠 Gharbeti API Server is Running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/settings', settingsRoutes);

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
