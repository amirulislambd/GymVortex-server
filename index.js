const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
        const difficulty = req.query.difficulty || "";
        const sortPrice = req.query.sortPrice || ""; // 'low-to-high' or 'high-to-low'

        // Base query: Always fetch approved classes
        let query = { status: "approved" };

        // FIXED Search Logic: Search strictly inside title or trainerName
        if (search) {
          query.$and = [
            { status: "approved" },
            {
              $or: [
                { title: { $regex: search, $options: "i" } },
                { trainerName: { $regex: search, $options: "i" } },
              ],
            },
          ];
        }

        // Category filter
        if (category !== "All") {
          query.category = { $regex: `^${category}`, $options: "i" };
        }

        // Difficulty filter (Optional)
        if (difficulty && difficulty !== "All") {
          query.difficulty = difficulty;
        }

        // Dynamic Sorting Object
        let sortObj = { createdAt: -1 }; // Default sort
        if (sortPrice === "low-to-high") {
          sortObj = { price: 1 }; // Ascending
        } else if (sortPrice === "high-to-low") {
          sortObj = { price: -1 }; // Descending
        }

        // Pagination
        const skip = (page - 1) * limit;
        const totalItems = await classesCollection.countDocuments(query);

        const classesData = await classesCollection
          .find(query)
          .sort(sortObj) // Injected sorting pipeline
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

    app.get("/api/classes/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // ObjectId validation
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid class ID format",
          });
        }

        const result = await classesCollection.findOne({
          _id: new ObjectId(id),
          status: "approved", // only approved classes visible publicly
        });

        if (!result) {
          return res.status(404).json({
            success: false,
            message: "Class not found",
          });
        }

        res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("GET /api/classes/:id error:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
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
