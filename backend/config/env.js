const path = require('path');
const dotenv = require('dotenv');

// Always resolve the backend .env from this file's location so commands work
// regardless of the directory from which node/npm is invoked.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());

if (missing.length) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
    `Create backend/.env from backend/.env.example before starting the server.`
  );
}

module.exports = process.env;
