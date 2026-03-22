const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { sendChatPush } = require('./fcm.service');

let io;

exports.init = (socketIo) => {
    io = socketIo;

    io.on('connection', (socket) => {
        console.log(`👤 User Connected: ${socket.id}`);

        // Join a room (conversation or user's own room)
        socket.on('join_chat', (room) => {
            socket.join(room);
        });

        // ─── SEND MESSAGE ───
        socket.on('send_message', async (data) => {
            try {
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
            // data: { messageId, conversationId, senderId, newContent }
            try {
                const message = await Message.findById(data.messageId);
                if (!message || message.sender.toString() !== data.senderId) return;
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
            // data: { messageId, conversationId, senderId }
            try {
                const message = await Message.findById(data.messageId);
                if (!message || message.sender.toString() !== data.senderId) return;

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

        socket.on('disconnect', () => {
            // Silent disconnect
        });
    });
};

exports.getIo = () => {
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};
