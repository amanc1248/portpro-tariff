require('../setup');
const request = require('supertest');
const { app } = require('../../app');
const Property = require('../../models/Property');
const { createTestUser, createOwnerUser } = require('../helpers/auth.helper');
const { validProperty, validPropertyFlat, fakeObjectId } = require('../helpers/fixtures');

describe('Property Endpoints', () => {
  let ownerToken, ownerUser;

  beforeEach(async () => {
    const owner = await createOwnerUser();
    ownerToken = owner.token;
    ownerUser = owner.user;
  });

  // Helper to create a property in DB
  const createProperty = async (overrides = {}) => {
    return Property.create({
      ...validProperty,
      owner: ownerUser._id,
      ...overrides
    });
  };

  // ─── GET ALL PROPERTIES ───
  describe('GET /api/properties', () => {
    it('should return empty list when no properties', async () => {
      const res = await request(app).get('/api/properties');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.properties).toHaveLength(0);
      expect(res.body.pagination).toBeDefined();
    });

    it('should return properties', async () => {
      await createProperty();
      const res = await request(app).get('/api/properties');

      expect(res.status).toBe(200);
      expect(res.body.properties.length).toBeGreaterThan(0);
    });

    it('should filter by city', async () => {
      await createProperty({ location: { city: 'Kathmandu', area: 'Thamel' } });
      await createProperty({
        title: 'Pokhara Room For Rent',
        location: { city: 'Pokhara', area: 'Lakeside' }
      });

      const res = await request(app).get('/api/properties?city=Kathmandu');

      expect(res.status).toBe(200);
      res.body.properties.forEach(p => {
        expect(p.location.city).toBe('Kathmandu');
      });
    });

    it('should filter by price range', async () => {
      await createProperty({ rent: 10000 });
      await createProperty({ title: 'Expensive Room Rent', rent: 50000 });

      const res = await request(app).get('/api/properties?minRent=5000&maxRent=15000');

      expect(res.status).toBe(200);
      res.body.properties.forEach(p => {
        expect(p.rent).toBeGreaterThanOrEqual(5000);
        expect(p.rent).toBeLessThanOrEqual(15000);
      });
    });

    it('should filter by property type', async () => {
      await createProperty({ propertyType: 'room' });
      await createProperty({ ...validPropertyFlat, owner: ownerUser._id });

      const res = await request(app).get('/api/properties?propertyType=room');

      expect(res.status).toBe(200);
      res.body.properties.forEach(p => {
        expect(p.propertyType).toBe('room');
      });
    });

    it('should paginate results', async () => {
      for (let i = 0; i < 5; i++) {
        await createProperty({ title: `Test Property Number ${i + 1}` });
      }
      const res = await request(app).get('/api/properties?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.properties).toHaveLength(2);
      expect(res.body.pagination.pages).toBeGreaterThan(1);
    });
  });

  // ─── GET FEATURED ───
  describe('GET /api/properties/featured', () => {
    it('should return only featured properties', async () => {
      await createProperty({ isFeatured: true });
      await createProperty({ title: 'Normal Room For Rent', isFeatured: false });

      const res = await request(app).get('/api/properties/featured');

      expect(res.status).toBe(200);
      res.body.properties.forEach(p => {
        expect(p.isFeatured).toBe(true);
      });
    });
  });

  // ─── GET EXPLORE ───
  describe('GET /api/properties/explore', () => {
    it('should return explore data grouped by city', async () => {
      await createProperty();
      await createProperty({
        title: 'Lalitpur Flat For Rent',
        location: { city: 'Lalitpur', area: 'Patan' }
      });

      const res = await request(app).get('/api/properties/explore');

      expect(res.status).toBe(200);
      expect(res.body.featured).toBeDefined();
      expect(res.body.cities).toBeDefined();
      expect(Array.isArray(res.body.cities)).toBe(true);
    });
  });

  // ─── GET SINGLE PROPERTY ───
  describe('GET /api/properties/:id', () => {
    it('should return a single property', async () => {
      const property = await createProperty();
      const res = await request(app).get(`/api/properties/${property._id}`);

      expect(res.status).toBe(200);
      expect(res.body.property.title).toBe(validProperty.title);
    });

    it('should return 404 for non-existent property', async () => {
      const id = fakeObjectId();
      const res = await request(app).get(`/api/properties/${id}`);

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid ID format', async () => {
      const res = await request(app).get('/api/properties/invalid-id');

      expect(res.status).toBe(400);
    });
  });

  // ─── CREATE PROPERTY ───
  describe('POST /api/properties', () => {
    it('should create property as owner', async () => {
      const res = await request(app)
        .post('/api/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(validProperty);

      expect(res.status).toBe(201);
      expect(res.body.property.title).toBe(validProperty.title);
      expect(res.body.property.images).toHaveLength(1);
    });

    it('should reject tenant creating property', async () => {
      const { token } = await createTestUser({ role: 'tenant' });
      const res = await request(app)
        .post('/api/properties')
        .set('Authorization', `Bearer ${token}`)
        .send(validProperty);

      expect(res.status).toBe(403);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/properties')
        .send(validProperty);

      expect(res.status).toBe(401);
    });

    it('should reject without images', async () => {
      const { images, ...noImages } = validProperty;
      const res = await request(app)
        .post('/api/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(noImages);

      expect(res.status).toBe(400);
    });

    it('should increment totalListings on user', async () => {
      const before = await require('../../models/User').findById(ownerUser._id);
      const beforeCount = before.totalListings;

      await request(app)
        .post('/api/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(validProperty);

      const after = await require('../../models/User').findById(ownerUser._id);
      expect(after.totalListings).toBe(beforeCount + 1);
    });
  });

  // ─── UPDATE PROPERTY ───
  describe('PUT /api/properties/:id', () => {
    it('should update own property', async () => {
      const property = await createProperty();
      const res = await request(app)
        .put(`/api/properties/${property._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Updated Title Here', images: ['https://example.com/new.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.property.title).toBe('Updated Title Here');
    });

    it('should reject updating another user\'s property', async () => {
      const property = await createProperty();
      const other = await createOwnerUser({ email: 'other@test.com' });

      const res = await request(app)
        .put(`/api/properties/${property._id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'Hacked Title Here' });

      expect(res.status).toBe(403);
    });
  });

  // ─── DELETE PROPERTY ───
  describe('DELETE /api/properties/:id', () => {
    it('should delete own property', async () => {
      const property = await createProperty();
      const res = await request(app)
        .delete(`/api/properties/${property._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const deleted = await Property.findById(property._id);
      expect(deleted).toBeNull();
    });

    it('should reject deleting another user\'s property', async () => {
      const property = await createProperty();
      const other = await createOwnerUser({ email: 'other2@test.com' });

      const res = await request(app)
        .delete(`/api/properties/${property._id}`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── MY LISTINGS ───
  describe('GET /api/properties/me/listings', () => {
    it('should return only the user\'s properties', async () => {
      await createProperty();
      const other = await createOwnerUser({ email: 'other3@test.com' });
      await Property.create({ ...validPropertyFlat, owner: other.user._id });

      const res = await request(app)
        .get('/api/properties/me/listings')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      res.body.properties.forEach(p => {
        const ownerId = p.owner._id || p.owner;
        expect(ownerId.toString()).toBe(ownerUser._id.toString());
      });
    });
  });

  // ─── UPDATE STATUS ───
  describe('PATCH /api/properties/:id/status', () => {
    it('should update property status', async () => {
      const property = await createProperty();
      const res = await request(app)
        .patch(`/api/properties/${property._id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'booked' });

      expect(res.status).toBe(200);
      expect(res.body.property.status).toBe('booked');
    });

    it('should reject invalid status', async () => {
      const property = await createProperty();
      const res = await request(app)
        .patch(`/api/properties/${property._id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'sold' });

      expect(res.status).toBe(400);
    });
  });

  // ─── INCREMENT VIEWS ───
  describe('POST /api/properties/:id/view', () => {
    it('should increment views', async () => {
      const property = await createProperty();
      const res = await request(app).post(`/api/properties/${property._id}/view`);

      expect(res.status).toBe(200);
      expect(res.body.views).toBe(1);
    });
  });

  // ─── INCREMENT CALL CLICKS ───
  describe('POST /api/properties/:id/call', () => {
    it('should increment call clicks', async () => {
      const property = await createProperty();
      const res = await request(app).post(`/api/properties/${property._id}/call`);

      expect(res.status).toBe(200);
      expect(res.body.clicksOnCall).toBe(1);
    });
  });
});
