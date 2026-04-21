const mongoose = require('mongoose');

const validSignup = {
  name: 'Test User',
  email: 'newuser@test.com',
  password: 'Password123',
  role: 'tenant'
};

const validProperty = {
  title: 'Beautiful Room in Kathmandu',
  description: 'A nice room with a view of the mountains',
  propertyType: 'room',
  rent: 15000,
  location: {
    city: 'Kathmandu',
    area: 'Thamel',
    fullAddress: 'Thamel-26, Kathmandu'
  },
  images: ['https://example.com/image1.jpg'],
  numberOfRooms: 1,
  numberOfBathrooms: 1
};

const validPropertyFlat = {
  title: 'Spacious Flat in Lalitpur',
  description: 'Modern flat near Patan Durbar Square',
  propertyType: 'flat',
  rent: 25000,
  location: {
    city: 'Lalitpur',
    area: 'Mangalbazar',
    fullAddress: 'Mangalbazar-10, Lalitpur'
  },
  images: ['https://example.com/image2.jpg'],
  numberOfRooms: 3,
  numberOfBathrooms: 2
};

const fakeObjectId = () => new mongoose.Types.ObjectId();

module.exports = {
  validSignup,
  validProperty,
  validPropertyFlat,
  fakeObjectId
};
