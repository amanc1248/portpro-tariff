const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const propertyRoutes = require('./routes/property.routes');
const favoriteRoutes = require('./routes/favorite.routes');
const errorHandler = require('./middleware/error.middleware');

const http = require('http'); // Import http
const { Server } = require('socket.io'); // Import Socket.io
const socketService = require('./services/socket.service'); // Import Socket Service

// Initialize Express app
const app = express();
const server = http.createServer(app); // Create HTTP server

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

// ====================================
// MIDDLEWARE
// ====================================

// Security middleware
app.use(helmet());

// CORS middleware
const allowedOrigins = (process.env.FRONTEND_URL || '*').split(',').map(o => o.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: true
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting — general
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Rate limiting — stricter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts, please try again later.'
});

// ====================================
// DATABASE CONNECTION
// ====================================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// ====================================
// ROUTES
// ====================================

// Import new Chat Routes
const chatRoutes = require('./routes/chat.routes');
const settingsRoutes = require('./routes/settings.routes');

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
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/chat', chatRoutes); // Register Chat Routes
app.use('/api/settings', settingsRoutes); // Register Settings Routes

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// ====================================
// START SERVER
// ====================================

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => { // Use server.listen instead of app.listen
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   🏠 GHARBETI API SERVER STARTED      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /              - Health check');
  console.log('  POST /api/auth/signup   - User registration');
  console.log('  POST /api/auth/signin   - User login');
  console.log('  GET  /api/properties    - Get all properties');
  console.log('  GET  /api/chat/conversations - Get user chats');
  console.log('');
  console.log('Press CTRL+C to stop the server');
  console.log('');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
  // Close server & exit process
  process.exit(1);
});

