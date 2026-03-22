const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { sendChatPush } = require('./fcm.service');

let io;

exports.init = (socketIo) => {
    io = socketIo;

    io.on('connection', (socket) => {
        console.log(`👤 User Connected: ${socket.id}`);

        // Join a conversation room
        // Valid for: specific conversation ID or user's own ID (for notifications)
        socket.on('join_chat', (room) => {
            socket.join(room);
            console.log(`User joined room: ${room}`);
        });

        // Send a message
        socket.on('send_message', async (data) => {
            // data: { conversationId, senderId, content, recipientId (optional for creating conv on fly) }
            try {
                const { conversationId, senderId, content } = data;

                // 1. Save to DB
                const newMessage = await Message.create({
                    conversationId,
                    sender: senderId,
                    content,
                    readBy: [senderId] // Sender has read it
                });

                // 2. Update Conversation's lastMessage
                // We need to populate sender info for the frontend
                const messageForClient = await newMessage.populate('sender', 'name photoURL');

                await Conversation.findByIdAndUpdate(conversationId, {
                    lastMessage: {
                        content,
                        sender: senderId,
                        createdAt: new Date()
                    }
                });

                // 3. Emit to room (everyone in this conversation)
                // 'receive_message' event
                io.to(conversationId).emit('receive_message', {
                    ...messageForClient.toObject(),
                    conversationId: conversationId
                });

                // 4. Send push notification to other participants
                const conversation = await Conversation.findById(conversationId)
                    .populate('participants', 'name');
                if (conversation) {
                    const senderUser = conversation.participants.find(
                        p => p._id.toString() === senderId
                    );
                    const senderName = senderUser?.name || 'Someone';

                    for (const participant of conversation.participants) {
                        if (participant._id.toString() !== senderId) {
                            // Check if recipient is in the socket room (online in this chat)
                            const recipientRoom = io.sockets.adapter.rooms.get(conversationId);
                            const recipientSocketRoom = io.sockets.adapter.rooms.get(participant._id.toString());

                            // Send push if recipient likely not viewing this chat
                            // (We always send — FCM handles dedup, and foreground handling is on client)
                            sendChatPush(
                                participant._id.toString(),
                                senderName,
                                content,
                                conversationId
                            );
                        }
                    }
                }

            } catch (error) {
                console.error('Socket send_message error:', error);
            }
        });

        // Typing Indicator
        socket.on('typing', (room) => {
            socket.to(room).emit('display_typing', room);
        });

        socket.on('stop_typing', (room) => {
            socket.to(room).emit('hide_typing', room);
        });

        socket.on('disconnect', () => {
            console.log('User Disconnected', socket.id);
        });
    });
};

// Optional: Export io to use in controllers (e.g. for notifications triggered by REST API)
exports.getIo = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};
