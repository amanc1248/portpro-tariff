const admin = require('firebase-admin');
const User = require('../models/User');

// Initialize Firebase Admin
// Uses GOOGLE_APPLICATION_CREDENTIALS env var or default credentials on GCP
let firebaseInitialized = false;

const initFirebase = () => {
  if (firebaseInitialized) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.log('⚠️  FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
    return;
  }

  try {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
    } catch (parseErr) {
      // Render may wrap the value in extra quotes
      serviceAccount = JSON.parse(raw.replace(/^['"]|['"]$/g, ''));
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized — push notifications enabled');
  } catch (error) {
    console.error('❌ Firebase Admin init failed:', error.message);
    console.log('Push notifications will be disabled');
  }
};

/**
 * Send push notification to a specific user
 * @param {string} userId - Recipient user ID
 * @param {object} notification - { title, body }
 * @param {object} data - Custom data payload for deep linking
 */
const sendPushToUser = async (userId, notification, data = {}) => {
  if (!firebaseInitialized) {
    console.log('⚠️  Push skipped — Firebase not initialized');
    return;
  }

  try {
    const user = await User.findById(userId).select('fcmTokens');
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return; // No tokens, user hasn't enabled notifications
    }

    const tokens = user.fcmTokens.filter(Boolean);
    if (tokens.length === 0) {
      console.log(`⚠️  No FCM tokens for user ${userId}`);
      return;
    }

    console.log(`📱 Sending push to user ${userId} (${tokens.length} devices)`);

    // Send to all user's devices
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        // All values must be strings
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        notification: {
          channelId: 'gharbetibaa_messages',
          priority: 'high',
          sound: 'default',
          icon: 'ic_launcher',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    // Send to each token, remove invalid ones
    const invalidTokens = [];

    for (const token of tokens) {
      try {
        await admin.messaging().send({
          ...message,
          token,
        });
      } catch (err) {
        console.log(`❌ Push failed for token: ${err.code || err.message}`);
        if (
          err.code === 'messaging/invalid-registration-token' ||
          err.code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(token);
        }
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      await User.findByIdAndUpdate(userId, {
        $pull: { fcmTokens: { $in: invalidTokens } },
      });
    }
  } catch (error) {
    console.error('Push notification error:', error.message);
  }
};

/**
 * Send chat message push notification
 * @param {string} recipientId - Who to notify
 * @param {string} senderName - Sender's display name
 * @param {string} messageContent - Message text
 * @param {string} conversationId - For deep linking
 */
const sendChatPush = async (recipientId, senderName, messageContent, conversationId, propertyTitle) => {
  const truncated =
    messageContent.length > 100
      ? messageContent.substring(0, 100) + '...'
      : messageContent;

  const title = propertyTitle
    ? `${senderName} · ${propertyTitle}`
    : senderName;

  await sendPushToUser(
    recipientId,
    {
      title,
      body: truncated,
    },
    {
      type: 'chat',
      conversationId,
      senderName,
    }
  );
};

module.exports = {
  initFirebase,
  sendPushToUser,
  sendChatPush,
};
