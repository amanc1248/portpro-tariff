const jwt = require('jsonwebtoken');
const User = require('../../models/User');

const createTestUser = async (overrides = {}) => {
  const defaults = {
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    password: 'Password123',
    role: 'tenant'
  };
  const user = await User.create({ ...defaults, ...overrides });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  return { user, token };
};

const createOwnerUser = async (overrides = {}) => {
  return createTestUser({ role: 'owner', ...overrides });
};

module.exports = { createTestUser, createOwnerUser };
