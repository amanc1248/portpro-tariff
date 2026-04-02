const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { sendChatPush } = require('./fcm.service');

let io;

// Track online users: userId -> Set<socketId>
const onlineUsers = new Map();

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
        socket.on('join_chat', (room) => {
            socket.join(room);
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
                if (!data.conversationId || !data.senderId || !data.content?.trim()) {
                    return socket.emit('error', { message: 'Invalid message data' });
                }

                const { conversationId, senderId, content } = data;

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
