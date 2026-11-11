const { Pool } = require('pg');

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3, // keep few connections per serverless instance
});