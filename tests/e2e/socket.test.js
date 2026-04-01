require('../setup');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const socketService = require('../../services/socket.service');

describe('Socket.io Events', () => {
  let httpServer, io, clientSocket1, clientSocket2;
  let user1, user2, token1, token2, conversation;
  let serverPort;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: '*' }
    });
    socketService.init(io);

    httpServer.listen(() => {
      serverPort = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (clientSocket1?.connected) clientSocket1.disconnect();
    if (clientSocket2?.connected) clientSocket2.disconnect();
    io.close();
    httpServer.close(done);
  });

  beforeEach(async () => {
    // Create test users
    user1 = await User.create({
      name: 'Socket User 1',
      email: `socket1-${Date.now()}@test.com`,
      password: 'password123',
      role: 'tenant'
    });
    user2 = await User.create({
      name: 'Socket User 2',
      email: `socket2-${Date.now()}@test.com`,
      password: 'password123',
      role: 'owner'
    });

    token1 = jwt.sign({ id: user1._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    token2 = jwt.sign({ id: user2._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // Create a conversation
    conversation = await Conversation.create({
      participants: [user1._id, user2._id],
      lastMessage: { content: 'Hi', sender: user1._id, createdAt: new Date() }
    });
  });

  afterEach(async () => {
    if (clientSocket1?.connected) clientSocket1.disconnect();
    if (clientSocket2?.connected) clientSocket2.disconnect();
  });

  const connectClient = (token) => {
    return new Promise((resolve, reject) => {
      const socket = Client(`http://localhost:${serverPort}`, {
        auth: { token },
        transports: ['websocket']
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  };

  // ─── CONNECTION ───
  describe('Connection', () => {
    it('should connect with valid token', async () => {
      clientSocket1 = await connectClient(token1);
      expect(clientSocket1.connected).toBe(true);
    });

    it('should reject connection without token', async () => {
      await expect(
        connectClient(undefined)
      ).rejects.toThrow();
    });

    it('should reject connection with invalid token', async () => {
      await expect(
        connectClient('bad-token')
      ).rejects.toThrow();
    });
  });

  // ─── SEND MESSAGE ───
  describe('send_message', () => {
    it('should send and receive a message', async () => {
      clientSocket1 = await connectClient(token1);
      clientSocket2 = await connectClient(token2);

      // Both join the conversation room
      clientSocket1.emit('join_chat', conversation._id.toString());
      clientSocket2.emit('join_chat', conversation._id.toString());

      // Wait a moment for join to process
      await new Promise(r => setTimeout(r, 100));

      const receivedMessage = new Promise((resolve) => {
        clientSocket2.on('receive_message', (data) => {
          resolve(data);
        });
      });

      clientSocket1.emit('send_message', {
        conversationId: conversation._id.toString(),
        senderId: user1._id.toString(),
        content: 'Hello from socket test!'
      });

      const msg = await receivedMessage;
      expect(msg.content).toBe('Hello from socket test!');
      expect(msg.conversationId).toBe(conversation._id.toString());

      // Verify persisted in DB
      const dbMsg = await Message.findOne({ conversationId: conversation._id });
      expect(dbMsg).not.toBeNull();
      expect(dbMsg.content).toBe('Hello from socket test!');
    });
  });

  // ─── TYPING INDICATORS ───
  describe('typing indicators', () => {
    it('should broadcast typing event', async () => {
      clientSocket1 = await connectClient(token1);
      clientSocket2 = await connectClient(token2);

      clientSocket1.emit('join_chat', conversation._id.toString());
      clientSocket2.emit('join_chat', conversation._id.toString());

      await new Promise(r => setTimeout(r, 100));

      const typingReceived = new Promise((resolve) => {
        clientSocket2.on('user_typing', (data) => {
          resolve(data);
        });
      });

      clientSocket1.emit('typing', {
        conversationId: conversation._id.toString(),
        userId: user1._id.toString(),
        userName: user1.name
      });

      const data = await typingReceived;
      expect(data.userId).toBe(user1._id.toString());
    });

    it('should broadcast stop_typing event', async () => {
      clientSocket1 = await connectClient(token1);
      clientSocket2 = await connectClient(token2);

      clientSocket1.emit('join_chat', conversation._id.toString());
      clientSocket2.emit('join_chat', conversation._id.toString());

      await new Promise(r => setTimeout(r, 100));

      const stopTypingReceived = new Promise((resolve) => {
        clientSocket2.on('user_stop_typing', (data) => {
          resolve(data);
        });
      });

      clientSocket1.emit('stop_typing', {
        conversationId: conversation._id.toString(),
        userId: user1._id.toString()
      });

      const data = await stopTypingReceived;
      expect(data.userId).toBe(user1._id.toString());
    });
  });

  // ─── READ RECEIPTS ───
  describe('messages_read', () => {
    it('should mark messages as read and notify', async () => {
      // Create unread message from user1
      await Message.create({
        conversationId: conversation._id,
        sender: user1._id,
        content: 'Unread message',
        readBy: [user1._id]
      });

      clientSocket1 = await connectClient(token1);
      clientSocket2 = await connectClient(token2);

      clientSocket1.emit('join_chat', conversation._id.toString());
      clientSocket2.emit('join_chat', conversation._id.toString());

      await new Promise(r => setTimeout(r, 100));

      const ackReceived = new Promise((resolve) => {
        clientSocket1.on('messages_read_ack', (data) => {
          resolve(data);
        });
      });

      clientSocket2.emit('messages_read', {
        conversationId: conversation._id.toString(),
        userId: user2._id.toString()
      });

      const ack = await ackReceived;
      expect(ack.readBy).toBe(user2._id.toString());

      // Verify DB
      const msg = await Message.findOne({ conversationId: conversation._id });
      expect(msg.readBy.map(id => id.toString())).toContain(user2._id.toString());
    });
  });

  // ─── EDIT MESSAGE ───
  describe('edit_message', () => {
    it('should edit own message', async () => {
      const message = await Message.create({
        conversationId: conversation._id,
        sender: user1._id,
        content: 'Original message',
        readBy: [user1._id]
      });

      clientSocket1 = await connectClient(token1);
      clientSocket2 = await connectClient(token2);

      clientSocket1.emit('join_chat', conversation._id.toString());
      clientSocket2.emit('join_chat', conversation._id.toString());

      await new Promise(r => setTimeout(r, 100));

      const editReceived = new Promise((resolve) => {
        clientSocket2.on('message_edited', (data) => {
          resolve(data);
        });
      });

      clientSocket1.emit('edit_message', {
        messageId: message._id.toString(),
        conversationId: conversation._id.toString(),
        newContent: 'Edited message'
      });

      const data = await editReceived;
      expect(data.newContent).toBe('Edited message');
      expect(data.isEdited).toBe(true);

      // Verify DB
      const updated = await Message.findById(message._id);
      expect(updated.content).toBe('Edited message');
      expect(updated.isEdited).toBe(true);
    });
  });

  // ─── DELETE MESSAGE ───
  describe('delete_message', () => {
    it('should soft-delete own message', async () => {
      const message = await Message.create({
        conversationId: conversation._id,
        sender: user1._id,
        content: 'To be deleted',
        readBy: [user1._id]
      });

      clientSocket1 = await connectClient(token1);
      clientSocket2 = await connectClient(token2);

      clientSocket1.emit('join_chat', conversation._id.toString());
      clientSocket2.emit('join_chat', conversation._id.toString());

      await new Promise(r => setTimeout(r, 100));

      const deleteReceived = new Promise((resolve) => {
        clientSocket2.on('message_deleted', (data) => {
          resolve(data);
        });
      });

      clientSocket1.emit('delete_message', {
        messageId: message._id.toString(),
        conversationId: conversation._id.toString()
      });

      const data = await deleteReceived;
      expect(data.messageId).toBe(message._id.toString());

      // Verify DB
      const deleted = await Message.findById(message._id);
      expect(deleted.isDeleted).toBe(true);
      expect(deleted.content).toBe('This message was deleted');
    });
  });
});
