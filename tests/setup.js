const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Set env vars before any app module is imported
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_EXPIRE = '1d';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
process.env.GOOGLE_CLIENT_IDS = 'test-google-client-id';
process.env.FRONTEND_URL = '*';

// Mock external services
jest.mock('../config/cloudinary', () => ({
  uploadToCloudinary: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
    publicId: 'test/test',
    width: 800,
    height: 600
  }),
  deleteFromCloudinary: jest.fn().mockResolvedValue({ result: 'ok' }),
  cloudinary: { config: jest.fn() }
}));

jest.mock('../services/fcm.service', () => ({
  initFirebase: jest.fn(),
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  sendChatPush: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../services/otp.service', () => ({
  sendOtp: jest.fn().mockResolvedValue(true),
  verifyOtp: jest.fn().mockResolvedValue(true)
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        email: 'google@test.com',
        email_verified: true,
        name: 'Google User',
        picture: 'https://photo.url/pic.jpg',
        sub: 'google-id-123'
      })
    })
  }))
}));

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
