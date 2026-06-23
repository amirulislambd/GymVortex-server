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
    const userCollection = db.collection("user");
    const classesCollection = db.collection("classes");
    const bookingsCollection = db.collection("bookings");
    const applyToTrainerCollection = db.collection("applyToTrainer");
    const favoriteClassesCollection = db.collection("favoriteClasses");
    const forumPostCollection = db.collection("forumPost");

    // API Routes
    // ── Health Check ──
    app.get("/", (req, res) => {
      res.json({ status: "running", message: "GymVortex API is live" });
    });

    // ================CLASSES RELATED ROUTES=================

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

    app.get("/api/trainer/class", async (req, res) => {
      try {
        const { email, search } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Trainer email is required",
          });
        }
        let query = { trainerEmail: email };
        if (search && search.trim() !== "") {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
          ];
        }

        const result = await classesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("GET /api/trainer/class error:", error);
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

    app.put("/api/classes/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const classData = req.body;
        delete classData._id;
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: classData },
        );

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .json({ success: true, message: "Class updated successfully" });
        } else {
          res.status(404).json({ success: false, message: "Class not found" });
        }
      } catch (error) {
        console.error("Error updating class:", error);
        res
          .status(500)
          .json({ success: false, message: "Error updating class" });
      }
    });

    app.delete("/api/trainer/class/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await classesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 1) {
          res
            .status(200)
            .json({ success: true, message: "Class deleted successfully" });
        } else {
          res.status(404).json({ success: false, message: "Class not found" });
        }
      } catch (error) {
        console.error("Error deleting class:", error);
        res
          .status(500)
          .json({ success: false, message: "Error deleting class" });
      }
    });

    // ==================BOOKINGS RELATED ROUTES=================
    //ADD NEW BOOKING
    app.post("/api/bookings", async (req, res) => {
      try {
        const {
          className,
          classImage,
          priceAmount,
          userEmail,
          userName,
          userImage,
          classId,
          stripeSessionId,
        } = req.body;
        const existingBooking = await bookingsCollection.findOne({
          classId,
          userEmail,
        });
        if (existingBooking) {
          return res.status(409).json({
            success: true,
            message: "Booking already exists with this session ID",
          });
        }

        // create a new booking to the database
        const newBooking = {
          className,
          priceAmount,
          userEmail,
          userName,
          userImage,
          classId,
          classImage,
          stripeSessionId,
          createdAt: new Date(),
        };
        const result = await bookingsCollection.insertOne(newBooking);
        res.status(201).json({
          success: true,
          message: "Booking recorded successfully in GymVortex DB!",
          data: result,
        });
      } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).json({
          success: false,
          message: "Error creating booking",
          error: error.message,
        });
      }
    });

    // ── GET Booking Class by email ──
    app.get("/api/bookings", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email query parameter is required",
          });
        }

        const userBookings = await bookingsCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          count: userBookings.length,
          data: userBookings,
        });
      } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).json({
          success: false,
          message: "Error fetching bookings",
          error: error.message,
        });
      }
    });
    //  GET BOOKING BY CLASS ID
    app.get("/api/bookings/classId", async (req, res) => {
      try {
        const { classId } = req.query;
        if (!classId) {
          return res.status(400).json({
            success: false,
            message: "Class ID query parameter is required",
          });
        }
        const bookings = await bookingsCollection
          .find({ classId })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: bookings });
      } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).json({
          success: false,
          message: "Error fetching bookings",
          error: error.message,
        });
      }
    });

    //  ──── CHECK BOOKING CLASS ────
    app.get("/api/bookings/check", async (req, res) => {
      try {
        const { userEmail, classId } = req.query;
        if (!userEmail || !classId) {
          return res
            .status(400)
            .json({ success: false, message: "Email and classId required" });
        }
        const booking = await bookingsCollection.findOne({
          userEmail,
          classId,
        });
        res.json({ success: true, isBooked: !!booking });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // =================FAVORITE RELATED ROUTES=================
    // ──── ADD FAVORITE CLASSES  ────
    app.post("/api/favoriteClasses", async (req, res) => {
      try {
        const favoriteData = req.body;
        const { userEmail, classId } = favoriteData; // Extract userEmail and classId from the request body

        if (!userEmail || !classId) {
          return res.status(400).json({
            success: false,
            message: "User email and class ID are required",
          });
        }

        const existing = await favoriteClassesCollection.findOne({
          userEmail,
          classId,
        });

        if (existing) {
          return res.status(409).json({
            success: false,
            message: "You have already favorited this class",
          });
        }

        const newFavoriteClass = {
          ...favoriteData,
          createdAt: new Date(),
        };

        const result =
          await favoriteClassesCollection.insertOne(newFavoriteClass);

        res.status(201).json({
          success: true,
          message: "Class favorited successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error favoriting class:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    });

    // ─── GET Favorite Classes by email ──
    app.get("/api/favoriteClasses", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email query parameter is required",
          });
        }

        const userFavorites = await favoriteClassesCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          count: userFavorites.length,
          data: userFavorites,
        });
      } catch (error) {
        console.error("Error fetching favorite classes:", error);
        res.status(500).json({
          success: false,
          message: "Error fetching favorite classes",
          error: error.message,
        });
      }
    });

    // Check if user already favorited a class
    app.get("/api/favoriteClasses/check", async (req, res) => {
      try {
        const { userEmail, classId } = req.query;
        if (!userEmail || !classId) {
          return res
            .status(400)
            .json({ success: false, message: "Email and classId required" });
        }
        const favorite = await favoriteClassesCollection.findOne({
          userEmail,
          classId,
        });
        res.json({ success: true, isFavorite: !!favorite });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // DELETE Favorite Class
    app.delete("/api/favoriteClasses/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // ObjectId validation
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid ID format",
          });
        }

        const result = await favoriteClassesCollection.deleteOne({
          _id: new ObjectId(id), // ← ObjectId convert
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Favorite not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Class unfavorited successfully",
        });
      } catch (error) {
        console.error("DELETE /api/favoriteClasses/:id error:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // ===================TRAINER RELATED ROUTES============
    // ── Apply to Trainer ──
    app.post("/api/applyToTrainer", async (req, res) => {
      try {
        const data = req.body;
        const { userEmail } = data;

        if (!userEmail) {
          return res.status(400).json({
            success: false,
            message: "User email is required",
          });
        }

        const existing = await applyToTrainerCollection.findOne({
          userEmail,
          status: "pending",
        });

        if (existing) {
          return res.status(409).json({
            success: false,
            message: "You already have a pending application",
          });
        }

        const newApplication = {
          ...data,
          status: "pending",
          adminFeedback: "",
          appliedAt: new Date(),
        };

        const result = await applyToTrainerCollection.insertOne(newApplication);

        res.status(201).json({
          success: true,
          message: "Application submitted successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error applying to trainer:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });
    // ─── Get all applications ──
    app.get("/api/applyToTrainer", async (req, res) => {
      try {
        const result = await applyToTrainerCollection.find().toArray();
        res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });
    // ─── Get application by ID ──
    app.get("/api/applyToTrainer/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid ID format provided. Must be a 24-character hex string.",
            data: null,
          });
        }

        const result = await applyToTrainerCollection.findOne({
          applicantId: id,
        });

        if (!result) {
          return res.status(200).json({
            success: false,
            message: "No document found matching this ID",
            data: null,
          });
        }

        res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching application by ID:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // ─── FORUM POST RELATED ROUTES ───

    //  FORUM POST
    app.post("/api/forumPost", async (req, res) => {
      try {
        const data = req.body;
        const result = await forumPostCollection.insertOne({
          ...data,
          likes: [],
          dislikes: [],
          commentsCount: 0,
          createdAt: new Date(),
        });
        res.status(201).json({
          success: true,
          message: "Forum post created successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error creating forum post:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });
    // GET TRAINER FORUM POST WITH SEARCH AND PAGINATION
    app.get("/api/myForumPosts", async (req, res) => {
      try {
        const { email, page = 1, limit = 9, search = "" } = req.query;
        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        const currentPage = parseInt(page);
        const perPage = parseInt(limit);
        const skip = (currentPage - 1) * limit;

        const query = { authorEmail: email };

        if (search) {
          query.title = { $regex: search, $options: "i" };
        }
        const totalPosts = await forumPostCollection.countDocuments(query);
        const totalPages = Math.ceil(totalPosts / perPage);
        const posts = await forumPostCollection
          .find(query)
          .skip(skip)
          .limit(perPage)
          .toArray();
        res.status(200).json({
          success: true,
          posts,
          meta: {
            currentPage,
            totalPages,
            perPage,
            totalPosts,
          },
        });
      } catch (error) {
        console.error("Error fetching forum posts:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
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
