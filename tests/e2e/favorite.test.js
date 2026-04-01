require('../setup');
const request = require('supertest');
const { app } = require('../../app');
const Property = require('../../models/Property');
const Favorite = require('../../models/Favorite');
const { createTestUser, createOwnerUser } = require('../helpers/auth.helper');
const { validProperty, fakeObjectId } = require('../helpers/fixtures');

describe('Favorite Endpoints', () => {
  let tenantToken, tenantUser, property;

  beforeEach(async () => {
    const tenant = await createTestUser();
    tenantToken = tenant.token;
    tenantUser = tenant.user;

    const owner = await createOwnerUser({ email: 'fav-owner@test.com' });
    property = await Property.create({
      ...validProperty,
      owner: owner.user._id
    });
  });

  // ─── GET FAVORITES ───
  describe('GET /api/favorites', () => {
    it('should return empty favorites initially', async () => {
      const res = await request(app)
        .get('/api/favorites')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.favorites).toHaveLength(0);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/favorites');
      expect(res.status).toBe(401);
    });
  });

  // ─── ADD TO FAVORITES ───
  describe('POST /api/favorites', () => {
    it('should add property to favorites', async () => {
      const res = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ propertyId: property._id });

      expect(res.status).toBe(201);
      expect(res.body.favorite.property).toBeDefined();
    });

    it('should reject duplicate favorite', async () => {
      await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ propertyId: property._id });

      const res = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ propertyId: property._id });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already in favorites/i);
    });

    it('should reject non-existent property', async () => {
      const res = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ propertyId: fakeObjectId() });

      expect(res.status).toBe(404);
    });

    it('should reject missing propertyId', async () => {
      const res = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── CHECK IF FAVORITED ───
  describe('GET /api/favorites/check/:propertyId', () => {
    it('should return true when favorited', async () => {
      await Favorite.create({ user: tenantUser._id, property: property._id });

      const res = await request(app)
        .get(`/api/favorites/check/${property._id}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isFavorited).toBe(true);
    });

    it('should return false when not favorited', async () => {
      const res = await request(app)
        .get(`/api/favorites/check/${property._id}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isFavorited).toBe(false);
    });
  });

  // ─── REMOVE BY FAVORITE ID ───
  describe('DELETE /api/favorites/:id', () => {
    it('should remove a favorite by ID', async () => {
      const fav = await Favorite.create({ user: tenantUser._id, property: property._id });
      const res = await request(app)
        .delete(`/api/favorites/${fav._id}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject removing another user\'s favorite', async () => {
      const other = await createTestUser({ email: 'other-fav@test.com' });
      const fav = await Favorite.create({ user: other.user._id, property: property._id });

      const res = await request(app)
        .delete(`/api/favorites/${fav._id}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── REMOVE BY PROPERTY ID ───
  describe('DELETE /api/favorites/property/:propertyId', () => {
    it('should remove favorite by property ID', async () => {
      await Favorite.create({ user: tenantUser._id, property: property._id });
      const res = await request(app)
        .delete(`/api/favorites/property/${property._id}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 if not favorited', async () => {
      const res = await request(app)
        .delete(`/api/favorites/property/${property._id}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── UPDATE NOTES ───
  describe('PUT /api/favorites/:id/notes', () => {
    it('should update notes on a favorite', async () => {
      const fav = await Favorite.create({ user: tenantUser._id, property: property._id });
      const res = await request(app)
        .put(`/api/favorites/${fav._id}/notes`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ notes: 'Great location, follow up' });

      expect(res.status).toBe(200);
      expect(res.body.favorite.notes).toBe('Great location, follow up');
    });
  });

  // ─── CLEAR ALL ───
  describe('DELETE /api/favorites/clear', () => {
    it('should clear all favorites for user', async () => {
      await Favorite.create({ user: tenantUser._id, property: property._id });

      const owner2 = await createOwnerUser({ email: 'fav-owner2@test.com' });
      const property2 = await Property.create({
        ...validProperty,
        title: 'Another Room For Rent',
        owner: owner2.user._id
      });
      await Favorite.create({ user: tenantUser._id, property: property2._id });

      const res = await request(app)
        .delete('/api/favorites/clear')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deletedCount).toBe(2);
    });
  });
});
