const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

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

                console.log(`Message sent in ${conversationId}: ${content}`);

                // Optional: Send notification to specific user room if they are not in the chat
                // if (recipientId) {
                //   io.to(recipientId).emit('notification', { ... });
                // }

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
