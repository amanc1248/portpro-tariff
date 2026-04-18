/**
 * Reset script — wipes ALL data from the database
 *
 * Usage:
 *   node scripts/reset.js
 *   node scripts/reset.js --seed 200   # reset then seed 200 properties
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Property = require('../models/Property');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const BookingRequest = require('../models/BookingRequest');
const Favorite = require('../models/Favorite');
const UserSettings = require('../models/UserSettings');
const Otp = require('../models/Otp');

async function reset() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.\n');

  const collections = [
    { name: 'Messages', model: Message },
    { name: 'Conversations', model: Conversation },
    { name: 'BookingRequests', model: BookingRequest },
    { name: 'Favorites', model: Favorite },
    { name: 'UserSettings', model: UserSettings },
    { name: 'OTPs', model: Otp },
    { name: 'Properties', model: Property },
    { name: 'Users', model: User },
  ];

  for (const { name, model } of collections) {
    const count = await model.countDocuments();
    await model.deleteMany({});
    console.log(`  Deleted ${count} ${name}`);
  }

  console.log('\nAll data cleared.');

  // Optional: seed after reset
  const seedIdx = process.argv.indexOf('--seed');
  if (seedIdx !== -1) {
    const count = parseInt(process.argv[seedIdx + 1]) || 200;
    console.log(`\nSeeding ${count} properties...`);
    const { execSync } = require('child_process');
    execSync(`node scripts/seed.js --count ${count}`, {
      cwd: require('path').resolve(__dirname, '..'),
      stdio: 'inherit',
    });
  }

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
