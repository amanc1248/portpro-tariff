require('../setup');
const request = require('supertest');
const { app } = require('../../app');
const Property = require('../../models/Property');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { createTestUser, createOwnerUser } = require('../helpers/auth.helper');
const { validProperty, fakeObjectId } = require('../helpers/fixtures');

describe('Chat Endpoints', () => {
  let tenantToken, tenantUser, ownerToken, ownerUser, property;

  beforeEach(async () => {
    const tenant = await createTestUser({ email: 'chat-tenant@test.com' });
    tenantToken = tenant.token;
    tenantUser = tenant.user;

    const owner = await createOwnerUser({ email: 'chat-owner@test.com' });
    ownerToken = owner.token;
    ownerUser = owner.user;

    property = await Property.create({
      ...validProperty,
      owner: ownerUser._id
    });
  });

  // ─── START CONVERSATION ───
  describe('POST /api/chat/conversation', () => {
    it('should start a new conversation', async () => {
      const res = await request(app)
        .post('/api/chat/conversation')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ recipientId: ownerUser._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.participants).toHaveLength(2);
    });

    it('should return existing conversation', async () => {
      // Create first
      await request(app)
        .post('/api/chat/conversation')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ recipientId: ownerUser._id.toString() });

      // Should find existing
      const res = await request(app)
        .post('/api/chat/conversation')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ recipientId: ownerUser._id.toString() });

      expect(res.status).toBe(200);
      // Should only be one conversation
      const count = await Conversation.countDocuments({});
      expect(count).toBe(1);
    });

    it('should create separate conversation per property', async () => {
      await request(app)
        .post('/api/chat/conversation')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ recipientId: ownerUser._id.toString(), propertyId: property._id.toString() });

      const property2 = await Property.create({
        ...validProperty,
        title: 'Another Property Rent',
        owner: ownerUser._id
      });

      await request(app)
        .post('/api/chat/conversation')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ recipientId: ownerUser._id.toString(), propertyId: property2._id.toString() });

      const count = await Conversation.countDocuments({});
      expect(count).toBe(2);
    });

    it('should reject missing recipientId', async () => {
      const res = await request(app)
        .post('/api/chat/conversation')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/chat/conversation')
        .send({ recipientId: ownerUser._id.toString() });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET CONVERSATIONS ───
  describe('GET /api/chat/conversations', () => {
    it('should return user conversations', async () => {
      await Conversation.create({
        participants: [tenantUser._id, ownerUser._id],
        lastMessage: { content: 'Hi', sender: tenantUser._id, createdAt: new Date() }
      });

      const res = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].unreadCount).toBeDefined();
    });
  });

  // ─── GET MESSAGES ───
  describe('GET /api/chat/:conversationId/messages', () => {
    it('should return messages for a conversation', async () => {
      const conv = await Conversation.create({
        participants: [tenantUser._id, ownerUser._id],
        lastMessage: { content: 'Hi', sender: tenantUser._id, createdAt: new Date() }
      });

      await Message.create({
        conversationId: conv._id,
        sender: tenantUser._id,
        content: 'Hello!',
        readBy: [tenantUser._id]
      });

      const res = await request(app)
        .get(`/api/chat/${conv._id}/messages`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].content).toBe('Hello!');
    });

    it('should reject non-participant', async () => {
      const conv = await Conversation.create({
        participants: [ownerUser._id, fakeObjectId()],
        lastMessage: { content: 'Hi', sender: ownerUser._id, createdAt: new Date() }
      });

      const res = await request(app)
        .get(`/api/chat/${conv._id}/messages`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── MARK AS READ ───
  describe('PUT /api/chat/:conversationId/read', () => {
    it('should mark messages as read', async () => {
      const conv = await Conversation.create({
        participants: [tenantUser._id, ownerUser._id],
        lastMessage: { content: 'Hi', sender: ownerUser._id, createdAt: new Date() }
      });

      await Message.create({
        conversationId: conv._id,
        sender: ownerUser._id,
        content: 'Hey there!',
        readBy: [ownerUser._id]
      });

      const res = await request(app)
        .put(`/api/chat/${conv._id}/read`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.status).toBe(200);
      expect(res.body.modifiedCount).toBe(1);

      // Verify in DB
      const msg = await Message.findOne({ conversationId: conv._id });
      expect(msg.readBy.map(id => id.toString())).toContain(tenantUser._id.toString());
    });
  });
});
