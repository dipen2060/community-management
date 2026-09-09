const mongoose = require('mongoose');

const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()]);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
