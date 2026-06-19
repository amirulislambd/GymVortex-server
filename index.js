const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

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
    console.log(" MongoDB connected successfully!");
    const db = client.db("GymVortex");

    // Database Collections
    const usersCollection = db.collection("users");
    const classesCollection = db.collection("classes");
    // API Routes
    // ── Health Check ──
    app.get("/", (req, res) => {
      res.json({ status: "running", message: "GymVortex API is live" });
    });

    // ── Classes Routes ──

    app.get("/api/classes", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || "";
        const category = req.query.category || "All";

        let query = { status: "approved" };
        // search logic
        if (search) {
          query.$or = [
            { status: "approved" },
            { title: { $regex: search, $options: "i" } },
            { trainerName: { $regex: search, $options: "i" } },
          ];
        }
        // category logic
        if (category !== "All") {
          query.category = { $regex: `^${category}`, $options: "i" };
        }
        // pagination
        const skip = (page - 1) * limit;
        const totalItems = await classesCollection.countDocuments(query);
        const classesData = await classesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        const totalPages = Math.ceil(totalItems / limit);

        res.status(200).json({
          success: true,
          data: classesData,
          pagination: {
            totalItems,
            totalPages,
            currentPage: page,
            limit,
          },
        });
      } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({
          success: false,
          message: "Error fetching classes",
          error: error.message,
        });
      }
    });

    app.post("/api/classes", async (req, res) => {
      try {
        const classData = req.body;
        // validation

        const data = req.body;
        const newClass = {
          ...data,
          status: "pending",
          bookingCount: 0,
          createdAt: new Date(),
        };
        const result = await classesCollection.insertOne(newClass);
        res.status(201).json({
          success: true,
          message: "Class added successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error adding class:", error);
        res.status(500).json({
          success: false,
          message: "Error adding class",
          error: error.message,
        });
      }
    });

    // ── Server Start ──
    app.listen(port, () => {
      console.log(` Server running on port ${port}`);
    });
  } catch (error) {
    console.error(" MongoDB connection failed:", error);
  }
}

run();
