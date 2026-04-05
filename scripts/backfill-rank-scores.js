/**
 * Backfill rank scores for all existing properties.
 * Run: node scripts/backfill-rank-scores.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../models/Property');
require('../models/User'); // Required for Property's auto-populate middleware

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const updated = await Property.recalculateRankScores();
  console.log(`Updated rank scores for ${updated} properties`);

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
