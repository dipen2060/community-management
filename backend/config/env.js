const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

// Always resolve the backend .env from this file's location so commands work
// regardless of the directory from which node/npm is invoked.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_EXPIRE'];
const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());

if (missing.length) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
    `Create backend/.env from backend/.env.example before starting the server.`
  );
}

if (!/^mongodb(?:\+srv)?:\/\//i.test(String(process.env.MONGO_URI).trim())) {
  throw new Error(
    'Invalid MONGO_URI. It must be a MongoDB connection string beginning with mongodb:// or mongodb+srv://.'
  );
}

const jwtSecret = String(process.env.JWT_SECRET).trim();
const placeholderSecrets = [
  'change-this-to-a-long-random-secret',
  'your-jwt-secret',
  'your-secret',
  'secret',
  'example',
  'changeme',
  'password'
];

if (
  jwtSecret.length < 32 ||
  placeholderSecrets.some((placeholder) => jwtSecret.toLowerCase() === placeholder)
) {
  throw new Error(
    'Invalid JWT_SECRET. It must be at least 32 characters and must not be a placeholder or example value.'
  );
}

try {
  // jsonwebtoken validates both duration strings (for example, 7d) and numeric seconds.
  jwt.sign({}, jwtSecret, { expiresIn: String(process.env.JWT_EXPIRE).trim() });
} catch (error) {
  throw new Error(
    `Invalid JWT_EXPIRE "${process.env.JWT_EXPIRE}". Use a valid jsonwebtoken duration such as 7d or 1h.`
  );
}

module.exports = process.env;
