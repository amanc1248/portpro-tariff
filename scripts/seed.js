/**
 * Seed script — populates the database with realistic test properties
 *
 * Usage:
 *   node scripts/seed.js              # Add ~200 properties
 *   node scripts/seed.js --count 500  # Add ~500 properties
 *   node scripts/seed.js --clear      # Delete all seeded data first, then seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../models/Property');
const User = require('../models/User');

// ─── Config ───

const DEFAULT_COUNT = 200;

// ─── Location Data (realistic coordinates per city/area) ───

const LOCATIONS = {
  Kathmandu: {
    center: [85.3240, 27.7172],
    areas: [
      { name: 'Thamel', lat: 27.7154, lng: 85.3123 },
      { name: 'New Baneshwor', lat: 27.6915, lng: 85.3420 },
      { name: 'Koteshwor', lat: 27.6785, lng: 85.3490 },
      { name: 'Chabahil', lat: 27.7180, lng: 85.3400 },
      { name: 'Balaju', lat: 27.7270, lng: 85.3050 },
      { name: 'Kalimati', lat: 27.6990, lng: 85.3020 },
      { name: 'Maharajgunj', lat: 27.7350, lng: 85.3280 },
      { name: 'Buddhanagar', lat: 27.6910, lng: 85.3350 },
      { name: 'Sitapaila', lat: 27.7150, lng: 85.2780 },
      { name: 'Naxal', lat: 27.7170, lng: 85.3240 },
      { name: 'Lazimpat', lat: 27.7200, lng: 85.3200 },
      { name: 'Durbarmarg', lat: 27.7118, lng: 85.3185 },
      { name: 'Putalisadak', lat: 27.7039, lng: 85.3220 },
      { name: 'Asan', lat: 27.7061, lng: 85.3148 },
      { name: 'Basantapur', lat: 27.7042, lng: 85.3067 },
    ],
  },
  Lalitpur: {
    center: [85.3247, 27.6588],
    areas: [
      { name: 'Jawalakhel', lat: 27.6720, lng: 85.3140 },
      { name: 'Pulchowk', lat: 27.6790, lng: 85.3190 },
      { name: 'Sanepa', lat: 27.6850, lng: 85.3080 },
      { name: 'Kupondole', lat: 27.6880, lng: 85.3120 },
      { name: 'Mangal Bazaar', lat: 27.6720, lng: 85.3250 },
      { name: 'Lagankhel', lat: 27.6650, lng: 85.3250 },
      { name: 'Satdobato', lat: 27.6520, lng: 85.3270 },
      { name: 'Dhobighat', lat: 27.6780, lng: 85.3080 },
      { name: 'Ekantakuna', lat: 27.6630, lng: 85.3130 },
      { name: 'Nakhipot', lat: 27.6680, lng: 85.3180 },
      { name: 'Imadol', lat: 27.6460, lng: 85.3370 },
    ],
  },
  Bhaktapur: {
    center: [85.4298, 27.6710],
    areas: [
      { name: 'Durbar Square', lat: 27.6720, lng: 85.4280 },
      { name: 'Suryabinayak', lat: 27.6620, lng: 85.4430 },
      { name: 'Madhyapur Thimi', lat: 27.6810, lng: 85.3870 },
      { name: 'Changunarayan', lat: 27.7100, lng: 85.4300 },
      { name: 'Katunje', lat: 27.6740, lng: 85.4100 },
      { name: 'Sallaghari', lat: 27.6770, lng: 85.4200 },
      { name: 'Lokanthali', lat: 27.6820, lng: 85.3700 },
    ],
  },
  Pokhara: {
    center: [83.9856, 28.2096],
    areas: [
      { name: 'Lakeside', lat: 28.2080, lng: 83.9580 },
      { name: 'Damside', lat: 28.1980, lng: 83.9550 },
      { name: 'Bagar', lat: 28.2200, lng: 83.9900 },
      { name: 'Mahendrapul', lat: 28.2150, lng: 83.9850 },
      { name: 'Prithvi Chowk', lat: 28.2100, lng: 83.9880 },
      { name: 'Nadipur', lat: 28.2300, lng: 83.9750 },
      { name: 'Ramghat', lat: 28.2250, lng: 83.9700 },
      { name: 'Zero Kilometer', lat: 28.2050, lng: 83.9950 },
    ],
  },
  Biratnagar: {
    center: [87.2718, 26.4525],
    areas: [
      { name: 'Main Road', lat: 26.4550, lng: 87.2700 },
      { name: 'Bargachhi', lat: 26.4620, lng: 87.2800 },
      { name: 'Rani', lat: 26.4400, lng: 87.2650 },
      { name: 'Tankisinwari', lat: 26.4480, lng: 87.2750 },
    ],
  },
  Birgunj: {
    center: [84.8821, 27.0104],
    areas: [
      { name: 'Ghantaghar', lat: 27.0120, lng: 84.8800 },
      { name: 'Adarshnagar', lat: 27.0050, lng: 84.8850 },
      { name: 'Powerhouse', lat: 27.0180, lng: 84.8780 },
    ],
  },
  Dharan: {
    center: [87.2846, 26.8065],
    areas: [
      { name: 'Putali Line', lat: 26.8100, lng: 87.2850 },
      { name: 'Bhanu Chowk', lat: 26.8050, lng: 87.2830 },
      { name: 'Chatara Road', lat: 26.8000, lng: 87.2900 },
    ],
  },
  Bharatpur: {
    center: [84.4333, 27.6833],
    areas: [
      { name: 'Narayanghat', lat: 27.6950, lng: 84.4350 },
      { name: 'Pulchowk', lat: 27.6800, lng: 84.4280 },
      { name: 'Sharadanagar', lat: 27.6750, lng: 84.4400 },
    ],
  },
  Janakpur: {
    center: [85.9263, 26.7288],
    areas: [
      { name: 'Station Road', lat: 26.7300, lng: 85.9250 },
      { name: 'Bhanu Chowk', lat: 26.7280, lng: 85.9280 },
    ],
  },
  Hetauda: {
    center: [85.0322, 27.4287],
    areas: [
      { name: 'Hetauda Heights', lat: 27.4300, lng: 85.0350 },
      { name: 'Bus Park', lat: 27.4270, lng: 85.0300 },
    ],
  },
  Butwal: {
    center: [83.4483, 27.7006],
    areas: [
      { name: 'Traffic Chowk', lat: 27.7020, lng: 83.4500 },
      { name: 'Milanchowk', lat: 27.6980, lng: 83.4460 },
    ],
  },
  Nepalgunj: {
    center: [81.6167, 28.0500],
    areas: [
      { name: 'Surkhet Road', lat: 28.0520, lng: 81.6180 },
      { name: 'Tribhuvan Chowk', lat: 28.0480, lng: 81.6150 },
    ],
  },
  Dhangadhi: {
    center: [80.6000, 28.6833],
    areas: [
      { name: 'Campus Road', lat: 28.6850, lng: 80.6020 },
      { name: 'Chauraha', lat: 28.6810, lng: 80.5980 },
    ],
  },
  Itahari: {
    center: [87.2833, 26.6667],
    areas: [
      { name: 'Dharan Road', lat: 26.6680, lng: 87.2850 },
      { name: 'Bus Park', lat: 26.6650, lng: 87.2810 },
    ],
  },
};

// ─── Property Templates ───

const PROPERTY_TYPES = ['room', 'flat', 'house', 'apartment', 'hostel'];
const PURPOSES = ['living', 'business', 'both'];
const FACINGS = ['north', 'south', 'east', 'west', 'north-east', 'north-west', 'south-east', 'south-west'];

const TITLES = {
  room: [
    'Bright Single Room in {area}',
    'Spacious Room with Attached Bath in {area}',
    'Affordable Room near {area} Market',
    'Cozy Room for Students in {area}',
    'Furnished Room with Balcony in {area}',
    'Room with Kitchen Access in {area}',
    'Well-Ventilated Room in {area}',
    'Premium Room in {area} - Great Location',
  ],
  flat: [
    'Modern 2BHK Flat in {area}',
    'Spacious 3BHK Flat with Parking in {area}',
    'Newly Built Flat in {area}',
    'Family-Friendly Flat near {area} School',
    'Semi-Furnished 2BHK in {area}',
    'Flat with Rooftop Access in {area}',
    'Affordable Flat in Prime {area} Location',
    'Luxurious Flat with City View in {area}',
  ],
  house: [
    'Beautiful House for Rent in {area}',
    'Full House with Garden in {area}',
    'Newly Painted House in {area}',
    'Spacious Family House in {area}',
    'House with Large Compound in {area}',
    '2-Story House in {area} - Prime Location',
    'Modern House with Parking in {area}',
  ],
  apartment: [
    'Premium Apartment in {area}',
    'Furnished Apartment with Amenities in {area}',
    'Studio Apartment in {area}',
    'Luxury Apartment with Gym Access in {area}',
    'Modern Apartment in {area} Complex',
    'Apartment with 24/7 Security in {area}',
  ],
  hostel: [
    'Student Hostel in {area}',
    'Working Professional Hostel in {area}',
    'Clean Hostel with WiFi in {area}',
    'Hostel near {area} Campus',
    'Budget Hostel in {area}',
    'Girls Hostel with Security in {area}',
    'Boys Hostel near {area} Market',
  ],
};

const DESCRIPTIONS = [
  'Well-maintained property in a peaceful neighborhood. Close to public transportation, schools, and hospitals. 24/7 water supply and backup electricity available.',
  'This property is located in a prime area with easy access to shopping centers and restaurants. The owner is cooperative and responsive.',
  'Perfect for families looking for a comfortable living space. The area is safe and well-connected. Ample natural light and ventilation.',
  'Ideal for working professionals. Located near major offices and business hubs. Good connectivity and modern amenities.',
  'Recently renovated with modern fixtures. Surrounded by greenery and away from the main road noise. Parking available.',
  'Walking distance from major landmarks. Suitable for both students and working professionals. Clean and well-maintained.',
  'Great value for money in one of the most sought-after locations. The neighborhood is friendly and the area is developing rapidly.',
  'Newly constructed property with earthquake-resistant design. Modern kitchen and bathroom fittings. Spacious rooms with proper ventilation.',
];

// Placeholder images (using picsum for realistic property photos)
const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
  'https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=800',
  'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1560185127-6a06e6e5b0e4?w=800',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
  'https://images.unsplash.com/photo-1560185008-a33f5c7b1844?w=800',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800',
];

// ─── Helpers ───

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

function jitter(val, range) {
  return val + (Math.random() - 0.5) * 2 * range;
}

function generateRent(type) {
  const ranges = {
    room:      [3000, 15000],
    flat:      [10000, 45000],
    house:     [20000, 80000],
    apartment: [15000, 60000],
    hostel:    [2000, 8000],
  };
  const [min, max] = ranges[type];
  return Math.round(rand(min, max) / 500) * 500; // round to nearest 500
}

function generateAmenities(type) {
  const amenities = {
    water24x7: Math.random() > 0.3,
    parking: Math.random() > 0.5,
    bikeParking: Math.random() > 0.4,
    carParking: Math.random() > 0.6,
    wifi: Math.random() > 0.4,
    furnished: Math.random() > 0.6,
    semiFurnished: false,
    kitchen: type !== 'hostel' ? Math.random() > 0.3 : Math.random() > 0.8,
    attachedBathroom: Math.random() > 0.4,
    balcony: type !== 'hostel' ? Math.random() > 0.5 : false,
    garden: type === 'house' ? Math.random() > 0.4 : false,
    lift: ['apartment', 'flat'].includes(type) ? Math.random() > 0.7 : false,
    security: Math.random() > 0.5,
    cctv: Math.random() > 0.6,
    generator: Math.random() > 0.7,
    solarPanel: Math.random() > 0.8,
  };
  // Can't be both furnished and semi-furnished
  if (!amenities.furnished) {
    amenities.semiFurnished = Math.random() > 0.5;
  }
  return amenities;
}

function generateProperty(owner, city, area) {
  const type = pick(PROPERTY_TYPES);
  const titleTemplate = pick(TITLES[type]);
  const title = titleTemplate.replace(/{area}/g, area.name);
  const rent = generateRent(type);

  const numImages = rand(2, 5);
  const images = pickN(PLACEHOLDER_IMAGES, numImages);

  const roomsMap = { room: 1, flat: rand(2, 4), house: rand(3, 7), apartment: rand(1, 4), hostel: 1 };
  const bathMap = { room: rand(0, 1), flat: rand(1, 2), house: rand(1, 3), apartment: rand(1, 2), hostel: rand(0, 1) };
  const sizeMap = { room: rand(100, 250), flat: rand(500, 1200), house: rand(800, 2500), apartment: rand(400, 1500), hostel: rand(80, 200) };

  return {
    owner: owner._id,
    title,
    description: pick(DESCRIPTIONS),
    propertyType: type,
    purpose: pick(PURPOSES),
    location: {
      city,
      area: area.name,
      fullAddress: `${area.name}, ${city}, Nepal`,
      landmark: `Near ${area.name} ${pick(['Chowk', 'Bus Stop', 'Temple', 'School', 'Hospital', 'Market', 'Park'])}`,
      coordinates: [jitter(area.lng, 0.005), jitter(area.lat, 0.005)],
    },
    rent,
    securityDeposit: Math.random() > 0.3 ? rent : 0,
    negotiable: Math.random() > 0.5,
    electricityIncluded: Math.random() > 0.7,
    waterIncluded: Math.random() > 0.5,
    numberOfRooms: roomsMap[type],
    numberOfBathrooms: bathMap[type],
    numberOfFloors: type === 'house' ? rand(1, 4) : undefined,
    floorNumber: ['flat', 'apartment', 'room'].includes(type) ? rand(0, 6) : undefined,
    size: sizeMap[type],
    facing: pick(FACINGS),
    amenities: generateAmenities(type),
    images,
    status: 'available',
    isActive: true,
    views: rand(0, 500),
    totalFavorites: rand(0, 50),
    clicksOnCall: rand(0, 30),
    isVerified: Math.random() > 0.5,
    isPremium: Math.random() > 0.85,
    isFeatured: Math.random() > 0.9,
  };

  // Compute rank score inline (insertMany skips save middleware)
  const engagementScore = prop.views * 1 + prop.totalFavorites * 3 + prop.clicksOnCall * 5;
  const ageInDays = (Date.now() - new Date(prop.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(0, 50 - (ageInDays * (50 / 30)));
  const verifiedBoost = prop.isVerified ? 20 : 0;
  prop.rankScore = Math.round(engagementScore + recencyBoost + verifiedBoost);

  return prop;
}

// ─── Main ───

async function seed() {
  const args = process.argv.slice(2);
  const shouldClear = args.includes('--clear');
  const countIndex = args.indexOf('--count');
  const count = countIndex !== -1 ? parseInt(args[countIndex + 1]) || DEFAULT_COUNT : DEFAULT_COUNT;

  console.log(`\n🌱 Gharbetibaa Seed Script`);
  console.log(`   Target: ${count} properties across ${Object.keys(LOCATIONS).length} cities\n`);

  // Connect
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Get or create a seed owner
  let seedOwner = await User.findOne({ email: 'seedowner@gharbetibaa.com' });
  if (!seedOwner) {
    seedOwner = await User.create({
      name: 'Gharbetibaa Properties',
      email: 'seedowner@gharbetibaa.com',
      password: 'seed123456',
      phone: '9800000000',
      role: 'owner',
      isActive: true,
    });
    console.log('✅ Created seed owner account');
  }

  // Optionally clear previous seed data
  if (shouldClear) {
    const deleted = await Property.deleteMany({ owner: seedOwner._id });
    console.log(`🗑️  Cleared ${deleted.deletedCount} existing seed properties`);
  }

  // Distribute properties across cities (weighted by size)
  const cityWeights = {
    Kathmandu: 0.25, Lalitpur: 0.15, Bhaktapur: 0.08, Pokhara: 0.12,
    Biratnagar: 0.06, Birgunj: 0.04, Dharan: 0.05, Bharatpur: 0.05,
    Janakpur: 0.04, Hetauda: 0.03, Butwal: 0.04, Nepalgunj: 0.03,
    Dhangadhi: 0.03, Itahari: 0.03,
  };

  const properties = [];
  let created = 0;

  for (const [city, data] of Object.entries(LOCATIONS)) {
    const cityCount = Math.max(2, Math.round(count * (cityWeights[city] || 0.03)));

    for (let i = 0; i < cityCount; i++) {
      const area = pick(data.areas);
      const property = generateProperty(seedOwner, city, area);
      properties.push(property);
    }
  }

  // Shuffle and insert in batches
  properties.sort(() => Math.random() - 0.5);

  const BATCH_SIZE = 50;
  for (let i = 0; i < properties.length; i += BATCH_SIZE) {
    const batch = properties.slice(i, i + BATCH_SIZE);
    await Property.insertMany(batch, { ordered: false });
    created += batch.length;
    process.stdout.write(`\r   Inserting... ${created}/${properties.length}`);
  }

  console.log(`\n\n✅ Seeded ${created} properties across ${Object.keys(LOCATIONS).length} cities`);

  // Summary
  const summary = {};
  for (const p of properties) {
    summary[p.location.city] = (summary[p.location.city] || 0) + 1;
  }
  console.log('\n📊 Distribution:');
  for (const [city, cnt] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${city}: ${cnt}`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Done!\n');
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
