const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { sendChatPush } = require('./fcm.service');

let io;

// Track online users: userId -> Set<socketId>
const onlineUsers = new Map();

// Simple socket rate limiter: socketId:event -> [timestamps]
const socketRates = new Map();
const RATE_LIMITS = {
  send_message: { max: 10, windowMs: 1000 },   // 10 messages/sec
  typing: { max: 5, windowMs: 1000 },           // 5/sec
  get_user_status: { max: 10, windowMs: 5000 }, // 10 per 5sec
  messages_read: { max: 5, windowMs: 1000 },    // 5/sec
  edit_message: { max: 5, windowMs: 5000 },     // 5 per 5sec
  delete_message: { max: 5, windowMs: 5000 },   // 5 per 5sec
};

function checkSocketRate(socketId, event) {
  const config = RATE_LIMITS[event];
  if (!config) return true;

  const key = `${socketId}:${event}`;
  const now = Date.now();
  const timestamps = (socketRates.get(key) || []).filter(t => t > now - config.windowMs);

  if (timestamps.length >= config.max) return false;

  timestamps.push(now);
  socketRates.set(key, timestamps);
  return true;
}

// Clean up stale rate limit entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of socketRates) {
    const filtered = timestamps.filter(t => t > now - 10000);
    if (filtered.length === 0) socketRates.delete(key);
    else socketRates.set(key, filtered);
  }
}, 60000);

exports.init = (socketIo) => {
    io = socketIo;

    // Socket authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            next();
        } catch (err) {
            return next(new Error('Invalid or expired token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`👤 User Connected: ${socket.id} (userId: ${socket.userId})`);

        // Track online status
        if (socket.userId) {
            if (!onlineUsers.has(socket.userId)) {
                onlineUsers.set(socket.userId, new Set());
            }
            onlineUsers.get(socket.userId).add(socket.id);
        }

        // Join a room (conversation or user's own room)
        socket.on('join_chat', async (room) => {
            try {
                const conversation = await Conversation.findOne({
                    _id: room,
                    participants: socket.userId
                });
                if (conversation) {
                    socket.join(room);
                } else {
                    socket.emit('error', { message: 'Not authorized to join this conversation' });
                }
            } catch (err) {
                socket.emit('error', { message: 'Invalid conversation' });
            }
        });

        // ─── USER STATUS ───
        socket.on('get_user_status', async (data) => {
            // data: { userId }
            const targetUserId = data?.userId;
            if (!targetUserId) return;

            const isOnline = onlineUsers.has(targetUserId) && onlineUsers.get(targetUserId).size > 0;

            if (isOnline) {
                socket.emit('user_status', { userId: targetUserId, isOnline: true });
            } else {
                try {
                    const user = await User.findById(targetUserId).select('lastActive');
                    socket.emit('user_status', {
                        userId: targetUserId,
                        isOnline: false,
                        lastActive: user?.lastActive || null,
                    });
                } catch (_) {
                    socket.emit('user_status', { userId: targetUserId, isOnline: false, lastActive: null });
                }
            }
        });

        // ─── SEND MESSAGE ───
        socket.on('send_message', async (data) => {
            try {
                if (!checkSocketRate(socket.id, 'send_message')) {
                    return socket.emit('error', { message: 'Too many messages, slow down' });
                }
                if (!data.conversationId || !data.content?.trim()) {
                    return socket.emit('error', { message: 'Invalid message data' });
                }
                // Validate content length
                if (typeof data.content !== 'string' || data.content.trim().length > 5000) {
                    return socket.emit('error', { message: 'Message too long (max 5000 chars)' });
                }

                const { conversationId, content } = data;
                const senderId = socket.userId;

                const newMessage = await Message.create({
                    conversationId,
                    sender: senderId,
                    content,
                    readBy: [senderId]
                });

                const messageForClient = await newMessage.populate('sender', 'name photoURL');

                await Conversation.findByIdAndUpdate(conversationId, {
                    lastMessage: {
                        content,
                        sender: senderId,
                        createdAt: newMessage.createdAt
                    }
                });

                io.to(conversationId).emit('receive_message', {
                    ...messageForClient.toObject(),
                    conversationId
                });

                // Push notification
                const conversation = await Conversation.findById(conversationId)
                    .populate('participants', 'name')
                    .populate('propertyId', 'title');
                if (conversation) {
                    const senderUser = conversation.participants.find(
                        p => p._id.toString() === senderId
                    );
                    const senderName = senderUser?.name || 'Someone';
                    const propertyTitle = conversation.propertyId?.title || null;

                    for (const participant of conversation.participants) {
                        if (participant._id.toString() !== senderId) {
                            sendChatPush(
                                participant._id.toString(),
                                senderName,
                                content,
                                conversationId,
                                propertyTitle
                            );
                        }
                    }
                }
            } catch (error) {
                console.error('Socket send_message error:', error);
            }
        });

        // ─── TYPING INDICATORS ───
        socket.on('typing', (data) => {
            if (!checkSocketRate(socket.id, 'typing')) return;
            // data: { conversationId, userId, userName }
            socket.to(data.conversationId).emit('user_typing', {
                conversationId: data.conversationId,
                userId: data.userId,
                userName: data.userName,
            });
        });

        socket.on('stop_typing', (data) => {
            socket.to(data.conversationId).emit('user_stop_typing', {
                conversationId: data.conversationId,
                userId: data.userId,
            });
        });

        // ─── READ RECEIPTS ───
        socket.on('messages_read', async (data) => {
            if (!checkSocketRate(socket.id, 'messages_read')) return;
            // data: { conversationId, userId }
            try {
                await Message.updateMany(
                    {
                        conversationId: data.conversationId,
                        sender: { $ne: data.userId },
                        readBy: { $ne: data.userId }
                    },
                    { $addToSet: { readBy: data.userId } }
                );

                socket.to(data.conversationId).emit('messages_read_ack', {
                    conversationId: data.conversationId,
                    readBy: data.userId,
                });
            } catch (error) {
                console.error('Socket messages_read error:', error);
            }
        });

        // ─── EDIT MESSAGE ───
        socket.on('edit_message', async (data) => {
            if (!checkSocketRate(socket.id, 'edit_message')) return;
            // data: { messageId, conversationId, newContent }
            try {
                const message = await Message.findById(data.messageId);
                if (!message || message.sender.toString() !== socket.userId) return;
                if (message.isDeleted) return;

                message.content = data.newContent;
                message.isEdited = true;
                await message.save();

                io.to(data.conversationId).emit('message_edited', {
                    messageId: data.messageId,
                    conversationId: data.conversationId,
                    newContent: data.newContent,
                    isEdited: true,
                });
            } catch (error) {
                console.error('Socket edit_message error:', error);
            }
        });

        // ─── DELETE MESSAGE ───
        socket.on('delete_message', async (data) => {
            if (!checkSocketRate(socket.id, 'delete_message')) return;
            // data: { messageId, conversationId }
            try {
                const message = await Message.findById(data.messageId);
                if (!message || message.sender.toString() !== socket.userId) return;

                message.isDeleted = true;
                message.content = 'This message was deleted';
                await message.save();

                io.to(data.conversationId).emit('message_deleted', {
                    messageId: data.messageId,
                    conversationId: data.conversationId,
                });
            } catch (error) {
                console.error('Socket delete_message error:', error);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.userId) {
                const sockets = onlineUsers.get(socket.userId);
                if (sockets) {
                    sockets.delete(socket.id);
                    if (sockets.size === 0) {
                        onlineUsers.delete(socket.userId);
                        // Update lastActive in DB
                        try {
                            await User.findByIdAndUpdate(socket.userId, { lastActive: new Date() });
                        } catch (_) {}
                    }
                }
            }
        });
    });
};

exports.getIo = () => {
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};
