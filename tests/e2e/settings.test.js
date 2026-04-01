require('../setup');
const request = require('supertest');
const { app } = require('../../app');
const { createTestUser } = require('../helpers/auth.helper');

describe('Settings Endpoints', () => {
  let token;

  beforeEach(async () => {
    const user = await createTestUser({ email: 'settings@test.com' });
    token = user.token;
  });

  // ─── GET SETTINGS ───
  describe('GET /api/settings', () => {
    it('should create and return default settings', async () => {
      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.user).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(401);
    });
  });

  // ─── UPDATE SETTINGS ───
  describe('PUT /api/settings', () => {
    it('should update settings', async () => {
      // Ensure settings exist first
      await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          preferredFirstName: 'Nick',
          emergencyContact: {
            name: 'Mom',
            phone: '+9779800000000',
            relationship: 'Mother'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.preferredFirstName).toBe('Nick');
      expect(res.body.data.emergencyContact.name).toBe('Mom');
    });

    it('should partially update settings', async () => {
      await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`);

      await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ preferredFirstName: 'Original' });

      const res = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          residentialAddress: {
            city: 'Kathmandu',
            country: 'Nepal'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.residentialAddress.city).toBe('Kathmandu');
    });
  });
});
