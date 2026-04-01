require('../setup');
const request = require('supertest');
const { app } = require('../../app');
const User = require('../../models/User');
const { createTestUser, createOwnerUser } = require('../helpers/auth.helper');
const { validSignup } = require('../helpers/fixtures');
const otpService = require('../../services/otp.service');

describe('Auth Endpoints', () => {
  // ─── SIGNUP ───
  describe('POST /api/auth/signup', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send(validSignup);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(validSignup.email);
      expect(res.body.user.name).toBe(validSignup.name);
    });

    it('should reject duplicate email', async () => {
      await request(app).post('/api/auth/signup').send(validSignup);
      const res = await request(app).post('/api/auth/signup').send(validSignup);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'a@b.com', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Test', email: 'a@b.com', password: '12' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Test', email: 'notanemail', password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('should hash the password', async () => {
      await request(app).post('/api/auth/signup').send(validSignup);
      const user = await User.findOne({ email: validSignup.email }).select('+password');
      expect(user.password).not.toBe(validSignup.password);
    });
  });

  // ─── SIGNIN ───
  describe('POST /api/auth/signin', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/signup').send(validSignup);
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: validSignup.email, password: validSignup.password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(validSignup.email);
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: validSignup.email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Invalid email or password/i);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: 'nope@test.com', password: 'password123' });

      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: validSignup.email });

      expect(res.status).toBe(400);
    });

    it('should reject deactivated account', async () => {
      await User.findOneAndUpdate({ email: validSignup.email }, { isActive: false });
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ email: validSignup.email, password: validSignup.password });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/deactivated/i);
    });
  });

  // ─── GET ME ───
  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const { token, user } = await createTestUser();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe(user._id.toString());
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-here');

      expect(res.status).toBe(401);
    });
  });

  // ─── UPDATE PROFILE ───
  describe('PUT /api/auth/profile', () => {
    it('should update user profile', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name', bio: 'Hello world' });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
      expect(res.body.user.bio).toBe('Hello world');
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .put('/api/auth/profile')
        .send({ name: 'Updated' });

      expect(res.status).toBe(401);
    });
  });

  // ─── UPDATE ROLE ───
  describe('PUT /api/auth/role', () => {
    it('should update role to owner', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/auth/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'owner' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('owner');
    });

    it('should reject invalid role', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/auth/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(400);
    });
  });

  // ─── UPDATE PASSWORD ───
  describe('PUT /api/auth/password', () => {
    it('should update password', async () => {
      const { token } = await createTestUser({ password: 'oldpass123' });
      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'oldpass123', newPassword: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should reject wrong current password', async () => {
      const { token } = await createTestUser({ password: 'oldpass123' });
      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpass', newPassword: 'newpass123' });

      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'password123' });

      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE ACCOUNT ───
  describe('DELETE /api/auth/account', () => {
    it('should soft-delete account', async () => {
      const { token, user } = await createTestUser({ password: 'password123' });
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'password123' });

      expect(res.status).toBe(200);
      const updated = await User.findById(user._id);
      expect(updated.isActive).toBe(false);
    });

    it('should reject wrong password', async () => {
      const { token } = await createTestUser({ password: 'password123' });
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'wrongpass' });

      expect(res.status).toBe(401);
    });
  });

  // ─── GOOGLE SIGN-IN ───
  describe('POST /api/auth/google', () => {
    it('should create new user via Google', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: 'fake-google-token' });

      expect(res.status).toBe(201);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('google@test.com');
    });

    it('should login existing Google user', async () => {
      // First call creates user
      await request(app).post('/api/auth/google').send({ idToken: 'fake-google-token' });
      // Second call logs in
      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: 'fake-google-token' });

      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(false);
    });

    it('should reject missing idToken', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── OTP ───
  describe('POST /api/auth/request-otp', () => {
    it('should send OTP', async () => {
      const res = await request(app)
        .post('/api/auth/request-otp')
        .send({ phone: '+9779812345678', channel: 'whatsapp' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(otpService.sendOtp).toHaveBeenCalled();
    });

    it('should reject missing phone', async () => {
      const res = await request(app)
        .post('/api/auth/request-otp')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/verify-otp', () => {
    it('should create new user on first OTP verify', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+9779812345678', otp: '123456', name: 'OTP User' });

      expect(res.status).toBe(201);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should login existing user on OTP verify', async () => {
      // Create user first
      await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+9779812345678', otp: '123456', name: 'OTP User' });

      // Login via OTP
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+9779812345678', otp: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(false);
    });

    it('should reject invalid OTP', async () => {
      otpService.verifyOtp.mockResolvedValueOnce(false);
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+9779812345678', otp: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid or expired/i);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+9779812345678' });

      expect(res.status).toBe(400);
    });
  });

  // ─── FCM TOKEN ───
  describe('PUT /api/auth/fcm-token', () => {
    it('should register FCM token', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/auth/fcm-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ fcmToken: 'test-fcm-token-abc' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/registered/i);
    });

    it('should remove FCM token', async () => {
      const { token, user } = await createTestUser();
      // Register first
      await request(app)
        .put('/api/auth/fcm-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ fcmToken: 'test-fcm-token-abc' });

      // Remove
      const res = await request(app)
        .put('/api/auth/fcm-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ fcmToken: 'test-fcm-token-abc', action: 'remove' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/removed/i);
    });

    it('should reject missing fcmToken', async () => {
      const { token } = await createTestUser();
      const res = await request(app)
        .put('/api/auth/fcm-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
