const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── MongoDB ──
const uri = process.env.MONGO_DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log('✅ MongoDB connected successfully!');
    const db = client.db('GymVortex');

    // Collections
    const usersCollection = db.collection('users');
    const classesCollection = db.collection('classes');

    // ── Health Check ──
    app.get('/', (req, res) => {
      res.json({ status: 'running', message: 'GymVortex API is live' });
    });

    // ── Server Start ──
    app.listen(port, () => {
      console.log(` Server running on port ${port}`);
    });

  } catch (error) {
    console.error(' MongoDB connection failed:', error);
  }
}

run();