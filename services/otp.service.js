const Otp = require('../models/Otp');
const bcrypt = require('bcryptjs');

// Constants
const OTP_expiry = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP
 */
const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP via selected channel
 * @param {string} phone - Phone number with country code
 * @param {string} channel - 'whatsapp' or 'viber' (or 'sms')
 * @returns {Promise<boolean>} - Success status
 */
const sendOtp = async (phone, channel = 'whatsapp') => {
    try {
        // 1. Clean phone number if needed (ensure +977 prefix or similar)
        // For now, assume phone comes with correct area code

        // 2. Generate OTP
        const otp = generateOtp();

        // 3. Delete any existing OTP for this phone
        await Otp.deleteMany({ phone });

        // 4. Hash OTP before storing
        const salt = await bcrypt.genSalt(10);
        const hashedOtp = await bcrypt.hash(otp, salt);

        // 5. Store in DB
        await Otp.create({
            phone,
            otp: hashedOtp
        });

        if (process.env.NODE_ENV === 'development') {
            console.log(`🔒 [OTP-SERVICE] OTP generated for ${phone} (Channel: ${channel})`);
        }

        // 6. Send via Channel
        if (process.env.MOCK_OTP === 'true' || !process.env.TWILIO_ACCOUNT_SID) {
            // MOCK MODE
            console.log(`📱 MOCK OTP for ${phone} via ${channel.toUpperCase()} — check DB or use code: ${otp}`);
            return true;
        }

        // REAL MODE (Twilio Implementation)
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const client = require('twilio')(accountSid, authToken);

        if (channel === 'whatsapp') {
            const rawNumber = process.env.TWILIO_WHATSAPP_NUMBER;
            if (!rawNumber) {
                console.error('❌ TWILIO_WHATSAPP_NUMBER is missing in .env');
                return false;
            }

            // Ensure proper format: whatsapp:+1415...
            const from = rawNumber.startsWith('whatsapp:') ? rawNumber : `whatsapp:${rawNumber}`;
            const to = `whatsapp:${phone}`;

            console.log(`🚀 Attempting to send WhatsApp: From [${from}] To [${to}]`);

            await client.messages.create({
                body: `Your Gharbeti verification code is ${otp}`,
                from: from,
                to: to
            });
            console.log(`✅ WhatsApp sent to ${phone}`);
        } else if (channel === 'viber') {
            // For Viber, 'from' should be your Viber Service ID or Twilio number enabled for Viber
            // Note: Viber often requires a verified sender ID.
            // We will try using the generic messaging API.

            const from = process.env.TWILIO_VIBER_ID || process.env.TWILIO_WHATSAPP_NUMBER; // Fallback

            await client.messages.create({
                body: `Your Gharbeti verification code is ${otp}`,
                from: from.startsWith('+') ? from : `viber:${from}`, // If it's a number, use it directly? Or viber: ID? 
                // Twilio Viber usually uses just the ID in 'from', and 'to' as 'viber:+number'
                // But for simplicity/safety with generic numbers let's try standard format first or viber prefix
                to: `viber:${phone}`
            });
            console.log(`✅ Viber message sent to ${phone}`);
        } else {
            // Fallback SMS
            await client.messages.create({
                body: `Your Gharbeti verification code is ${otp}`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phone
            });
            console.log(`✅ SMS sent to ${phone}`);
        }

        return true;
    } catch (error) {
        console.error('❌ OTP Send Error:', error);
        return false;
    }
};

/**
 * Verify OTP
 * @param {string} phone 
 * @param {string} otp 
 * @returns {Promise<boolean>}
 */
const verifyOtp = async (phone, otp) => {
    try {
        const record = await Otp.findOne({ phone });

        if (!record) {
            return false;
        }

        const isMatch = await bcrypt.compare(otp, record.otp);

        if (isMatch) {
            // Delete OTP after successful verification
            await Otp.deleteOne({ _id: record._id });
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ OTP Verify Error:', error);
        return false;
    }
};

module.exports = {
    sendOtp,
    verifyOtp
};
