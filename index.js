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
    const commentsCollection = db.collection("forumComments");
    const sessionCollection = db.collection("session");

    // ─── Middlewares ──────────────────────────────────────────────────────────────
    const verifyToken = async (req, res, next) => {
      const authorizationHeader = req.headers.authorization;
      if (!authorizationHeader) {
        return res.status(401).json({ error: "Unauthorized access" });
      }
      const token = authorizationHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Unauthorized access" });
      }
      try {
        const session = await sessionCollection.findOne({ token });
        if (!session)
          return res.status(401).json({ error: "Unauthorized access" });

        const user = await userCollection.findOne({
          _id: new ObjectId(session.userId),
        });
        if (!user)
          return res.status(401).json({ error: "Unauthorized access" });

        // Blocked users cannot perform write operations
        if (user.banned && req.method !== "GET") {
          return res.status(403).json({
            error: "Your account has been restricted by an administrator.",
            blocked: true,
          });
        }
        req.user = user;
        next();
      } catch (error) {
        res.status(401).json({ error: "Unauthorized access" });
      }
    };

    // const checkBanned = async (req, res, next) => {
    //   if (req.user.banned) {
    //     return res.status(403).json({
    //       success: false,
    //       error: "Action restricted by Admin.",
    //       code: "ACCOUNT_BANNED",
    //     });
    //   }

    //   next();
    // };

    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden access" });
      }
      next();
    };

    const verifyTrainer = async (req, res, next) => {
      const user = req.user;
      if (user.role !== "trainer") {
        return res.status(403).json({ error: "Forbidden access" });
      }
      next();
    };

    const verifyUser = async (req, res, next) => {
      const user = req.user;
      if (user.role !== "user") {
        return res.status(403).json({ error: "Forbidden access" });
      }
      next();
    };
    console.log("verifyToken:", verifyToken);
    // API Routes
    // ── Health Check ──
    app.get("/", (req, res) => {
      res.json({ status: "running", message: "GymVortex API is live" });
    });

    // ==========TRAINER SPECIFIC DASHBOARD METRICS==============
    app.get(
      "/api/trainer/dashboard-metrics",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        try {
          const { email } = req.query;

          if (!email) {
            return res.status(400).json({
              success: false,
              message: "Trainer email is required",
            });
          }

          const trainerEmail = email.trim().toLowerCase();

          // 1. All classes by this trainer
          const myClasses = await classesCollection
            .find({ trainerEmail })
            .toArray();

          const totalClasses = myClasses.length;
          const myClassIds = myClasses.map((c) => c._id.toString());

          // No classes yet — return zeros
          if (myClassIds.length === 0) {
            return res.status(200).json({
              success: true,
              data: {
                totalStudents: 0,
                totalClasses: 0,
                totalEnrolled: 0,
                bookingsTodayCount: 0,
              },
            });
          }

          // 2. FIXED: Unique students enrolled using aggregation ($group) instead of .distinct()
          const uniqueStudentsResult = await bookingsCollection
            .aggregate([
              {
                $match: {
                  classId: { $in: myClassIds },
                },
              },
              {
                $group: {
                  _id: "$userEmail", // Grouping by userEmail filters out duplicates automatically
                },
              },
            ])
            .toArray();

          const totalStudents = uniqueStudentsResult.length;

          // 3. Total enrolled (all bookings count)
          const totalEnrolled = await bookingsCollection.countDocuments({
            classId: { $in: myClassIds },
          });

          // 4. Bookings made today
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const bookingsTodayCount = await bookingsCollection.countDocuments({
            classId: { $in: myClassIds },
            createdAt: { $gte: today },
          });

          res.status(200).json({
            success: true,
            data: {
              totalStudents,
              totalClasses,
              totalEnrolled,
              bookingsTodayCount,
            },
          });
        } catch (error) {
          console.error("GET /api/trainer/dashboard-metrics error:", error);
          res.status(500).json({
            success: false,
            message: "Internal server error",
          });
        }
      },
    );

    // ============ USER DASHBOARD OVERVIEW METRICS =============
    app.get("/api/user/overview-metrics", verifyToken, async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res
            .status(400)
            .json({ success: false, message: "User email is required" });
        }

        const userEmailNormalized = email.trim().toLowerCase();

        // 1. Fetch user from the original userCollection
        const userDetails = await userCollection.findOne({
          email: userEmailNormalized,
        });

        if (!userDetails) {
          return res
            .status(404)
            .json({ success: false, message: "User not found in database" });
        }

        // 2. Fetch the latest application status from applyToTrainerCollection
        const trainerApplication = await applyToTrainerCollection.findOne({
          userEmail: userEmailNormalized,
        });

        // 3. Count total booked classes from bookingsCollection
        const totalBooked = await bookingsCollection.countDocuments({
          userEmail: userEmailNormalized,
        });

        // 4. Count total favorite classes from favoriteClassesCollection
        const totalFavorites = await favoriteClassesCollection.countDocuments({
          userEmail: userEmailNormalized,
        });

        // 5. Generate cyberpunk username from email prefix
        const emailPrefix = userEmailNormalized.split("@")[0].toUpperCase();
        const generatedUsername = `${emailPrefix}_01`;

        // 6. Dynamically set membership badge based on user plan
        const membershipBadge =
          userDetails.plan === "free_user" ? "FREE MEMBER" : "ELITE MEMBER";

        // Send the combined response object to frontend
        res.status(200).json({
          success: true,
          data: {
            banner: {
              version: "V2.4",
              username: generatedUsername,
              rank: userDetails.rank || "TITAN II",
              streak:
                typeof userDetails.streak === "number" ? userDetails.streak : 1,
            },
            stats: {
              totalBooked,
              totalFavorites,
              role: userDetails.role || "user",
            },
            profile: {
              name: userDetails.name,
              email: userDetails.email,
              image: userDetails.image,
              roleBadge: membershipBadge,
              trainerStatus: trainerApplication
                ? trainerApplication.status
                : "none",
              adminFeedback: trainerApplication
                ? trainerApplication.adminFeedback
                : "",
            },
          },
        });
      } catch (error) {
        console.error("Error fetching user overview metrics:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });
    // ==================== UPDATE USER STREAK & RANK AUTOMATICALLY ====================
    app.put(
      "/api/user/update-activity",
      verifyToken,

      async (req, res) => {
        try {
          const { email } = req.body;

          if (!email) {
            return res.status(400).json({
              success: false,
              message: "User email is required",
            });
          }

          const normalizedEmail = email.trim().toLowerCase();

          const user = await userCollection.findOne({ email: normalizedEmail });
          if (!user) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }

          const now = new Date();
          const todayStr = now.toISOString().split("T")[0]; // "2026-06-24"

          const lastCheckIn = user.lastActiveDate
            ? new Date(user.lastActiveDate).toISOString().split("T")[0]
            : null;

          const currentStreak =
            typeof user.streak === "number" ? user.streak : 0;

          // Already visited today — return without touching DB
          if (lastCheckIn === todayStr) {
            return res.status(200).json({
              success: true,
              message: "Activity already recorded today",
              streak: currentStreak,
              rank: user.rank || "RECRUIT",
            });
          }

          // Calculate new streak
          let newStreak;
          if (!lastCheckIn) {
            newStreak = 1; // First ever check-in
          } else {
            const diffDays = Math.round(
              (new Date(todayStr) - new Date(lastCheckIn)) /
                (1000 * 60 * 60 * 24),
            );
            newStreak = diffDays === 1 ? currentStreak + 1 : 1;
          }

          // Rank thresholds
          let newRank = "RECRUIT";
          if (newStreak >= 30) newRank = "TITAN II";
          else if (newStreak >= 15) newRank = "PRO ATHLETE";
          else if (newStreak >= 5) newRank = "WARRIOR";

          // Simple updateOne — no findOneAndUpdate complexity
          const updateResult = await userCollection.updateOne(
            { email: normalizedEmail },
            {
              $set: {
                streak: newStreak,
                rank: newRank,
                lastActiveDate: now,
              },
            },
          );

          console.log("Activity update result:", updateResult);

          if (updateResult.modifiedCount === 0) {
            return res.status(500).json({
              success: false,
              message: "Database update failed — document not modified",
            });
          }

          return res.status(200).json({
            success: true,
            message: "Streak and rank updated successfully",
            streak: newStreak,
            rank: newRank,
          });
        } catch (error) {
          console.error("Error updating user activity:", error);
          return res.status(500).json({
            success: false,
            message: "Internal server error",
          });
        }
      },
    );

    // ===============ADMIN RELATED ROUTES=================

    app.get("/api/admin/user", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";

        let query = {};
        if (search) {
          query = {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
            ],
          };
        }
        const skip = (page - 1) * limit;
        const totalUsers = await userCollection.countDocuments(query);

        const users = await userCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        const totalPages = Math.ceil(totalUsers / limit);

        res.status(200).json({
          success: true,
          users,
          currentPage: page,
          totalPages: totalPages || 1,
          totalUsers,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get(
      "/api/admin/user/manage",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.query;
          const { bannedStatus } = req.query;

          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                banned: bannedStatus,
              },
            },
          );
          if (result.modifiedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "User not found or no changes made",
            });
          }
          res.status(200).json({
            success: true,
            message: `User ${bannedStatus ? "blocked" : "unblocked"} successfully`,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Internal server error",
          });
        }
      },
    );

    app.get(
      "/api/admin/manage/trainers",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { page = 1, limit = 10, search, role } = req.query;
        const skip = (page - 1) * limit;

        let query = {};
        if (search) {
          query.fullName = { $regex: search, $options: "i" };
        }
        if (role) {
          query.specialty = role;
        }

        const total = await userCollection.countDocuments(query);
        const data = await userCollection
          .find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ createdAt: -1 })
          .toArray();

        res.send({
          data,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
        });
      },
    );

    app.patch(
      "/api/admin/user/block/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { banned } = req.body;

          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                banned: banned,
                ...(banned && {
                  blockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
                }),
              },
              ...(!banned && { $unset: { blockedUntil: "" } }),
            },
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }

          res.status(200).json({
            success: true,
            message: `User ${banned ? "blocked" : "unblocked"} successfully`,
          });
        } catch (error) {
          console.error("Block error:", error);
          res
            .status(500)
            .json({ success: false, message: "Internal server error" });
        }
      },
    );
    app.patch(
      "/api/admin/user/make-admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid user ID",
            });
          }

          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "admin" } },
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }

          res.status(200).json({
            success: true,
            message: "User promoted to admin successfully",
          });
        } catch (error) {
          console.error("Make admin error:", error);
          res.status(500).json({
            success: false,
            message: "Internal server error",
          });
        }
      },
    );

    app.patch(
      "/api/admin/update/trainer/action/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status, adminFeedback, userEmail } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid application ID format",
            });
          }

          const result = await applyToTrainerCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status, adminFeedback } },
          );

          if (result.modifiedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Application not found",
            });
          }

          if (status === "approved") {
            await userCollection.updateOne(
              { email: userEmail },
              { $set: { role: "trainer" } },
            );
          }

          res.status(200).json({
            success: true,
            message: `Trainer application ${status} successfully`,
          });
        } catch (error) {
          console.error("Trainer action error:", error);
          res.status(500).json({
            success: false,
            message: "Internal server error",
          });
        }
      },
    );

    app.patch(
      "/api/admin/demote/trainer",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { email } = req.body;

          if (!email) {
            return res.status(400).json({
              success: false,
              message: "Email is required",
            });
          }

          const result = await userCollection.updateOne(
            { email: email.trim().toLowerCase() },
            { $set: { role: "user" } },
          );

          // User not found
          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }

          // Already user role — still success
          if (result.modifiedCount === 0) {
            return res.status(200).json({
              success: true,
              message: "User was already a regular user",
            });
          }

          res.status(200).json({
            success: true,
            message: "Trainer demoted successfully",
          });
        } catch (error) {
          console.error("Demote trainer error:", error);
          res.status(500).json({
            success: false,
            message: "Internal server error",
          });
        }
      },
    );
    // ================CLASSES RELATED ROUTES=================

    app.get("/api/classes", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || "";
        const category = req.query.category || "All";
        const difficulty = req.query.difficulty || "";
        const sortPrice = req.query.sortPrice || "";
        const status = req.query.status || "approved";

        let query = {};

        if (status.toLocaleUpperCase() !== "ALL") {
          query.status = { $regex: `^${status}`, $options: "i" };
        }

        // FIXED Search Logic: Search strictly inside title or trainerName
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { trainerName: { $regex: search, $options: "i" } },
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
        let sortObj = { createdAt: -1 };
        if (sortPrice === "low-to-high") {
          sortObj = { price: 1 };
        } else if (sortPrice === "high-to-low") {
          sortObj = { price: -1 };
        }

        // Pagination
        const skip = (page - 1) * limit;

        const totalItems = await classesCollection.countDocuments(query);

        const classesData = await classesCollection
          .find(query)
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .toArray();

        const totalPages = Math.ceil(totalItems / limit);
        const pendingCount = await classesCollection.countDocuments({
          status: { $regex: "^pending$", $options: "i" },
        });
        const approvedCount = await classesCollection.countDocuments({
          status: { $regex: "^approved$", $options: "i" },
        });
        const rejectedCount = await classesCollection.countDocuments({
          status: { $regex: "^rejected$", $options: "i" },
        });

        res.status(200).json({
          success: true,
          data: classesData,
          pagination: {
            totalItems,
            totalPages,
            currentPage: page,
            limit,
          },
          stats: {
            pendingCount,
            approvedCount,
            rejectedCount,
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

    app.get(
      "/api/trainer/class",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
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
      },
    );

    app.post("/api/classes", verifyToken, async (req, res) => {
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

    app.put("/api/classes/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const classData = req.body;
        delete classData._id;

        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              ...classData,
              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount > 0) {
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

    app.patch("/api/classes/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } },
        );
        if (result.matchedCount > 0) {
          res.status(200).json({
            success: true,
            message: "Class status updated successfully",
          });
        } else {
          res.status(404).json({ success: false, message: "Class not found" });
        }
      } catch (error) {}
    });
    app.delete("/api/classes/:id", verifyToken, async (req, res) => {
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
    app.delete(
      "/api/trainer/class/:id",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
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
            res
              .status(404)
              .json({ success: false, message: "Class not found" });
          }
        } catch (error) {
          console.error("Error deleting class:", error);
          res
            .status(500)
            .json({ success: false, message: "Error deleting class" });
        }
      },
    );

    // ===========BOOKINGS RELATED ROUTES=============
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
    app.get("/api/bookings", verifyToken, async (req, res) => {
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

    app.get("/api/transactions", verifyToken, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const totalItems = await bookingsCollection.countDocuments();
        const totalPages = Math.ceil(totalItems / limit);

        const transactions = await bookingsCollection
          .find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        // Stats
        const totalRevenue = await bookingsCollection
          .aggregate([
            { $group: { _id: null, total: { $sum: "$priceAmount" } } },
          ])
          .toArray();

        res.status(200).json({
          success: true,
          data: transactions,
          pagination: { totalItems, totalPages, currentPage: page, limit },
          stats: {
            totalRevenue: totalRevenue[0]?.total || 0,
            totalTransactions: totalItems,
          },
        });
      } catch (error) {
        console.error("GET /api/transactions error:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });
    //  GET BOOKING BY CLASS ID
    app.get("/api/bookings/classId", verifyToken, async (req, res) => {
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
    app.get("/api/bookings/check", verifyToken, async (req, res) => {
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
    app.post("/api/favoriteClasses", verifyToken, async (req, res) => {
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
    app.get("/api/favoriteClasses", verifyToken, async (req, res) => {
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
    app.get("/api/favoriteClasses/check", verifyToken, async (req, res) => {
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
    app.delete("/api/favoriteClasses/:id", verifyToken, async (req, res) => {
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
    app.post(
      "/api/applyToTrainer",
      verifyToken,
      verifyUser,
      async (req, res) => {
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

          const result =
            await applyToTrainerCollection.insertOne(newApplication);

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
      },
    );
    // ─── Get all applications ──
    app.get("/api/applyToTrainer", verifyToken, async (req, res) => {
      try {
        const result = await applyToTrainerCollection
          .find({ status: "pending" })
          .toArray();
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

    //

    // ─── Get application by ID ──
    app.get("/api/applyToTrainer/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

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

    app.delete("/api/applyToTrainer/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid application ID",
          });
        }

        const result = await applyToTrainerCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Application deleted successfully",
        });
      } catch (error) {
        console.error(error);

        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // ─── FORUM POST RELATED ROUTES ───
    //  FORUM POST
    app.post("/api/forumPost", verifyToken, async (req, res) => {
      try {
        const data = req.body;
        const result = await forumPostCollection.insertOne({
          ...data,
          likes: [],
          dislikes: [],
          commentsCount: 0,
          views: 0,
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

    // GET ALL FORUM POSTS WITH PAGINATION, SEARCH, AND FILTER
    app.get("/api/forumPost", verifyToken, async (req, res) => {
      try {
        const { page = 1, limit = 10, search, role } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = {};

        // 1. Searching by Title (Case-insensitive)
        if (search) {
          query.title = { $regex: search, $options: "i" };
        }

        // 2. Filtering by Role (Admin or Trainer)
        if (role) {
          query.role = role;
        }

        // Fetch data with limit and skip
        const posts = await forumPostCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        // Get total count for pagination calculation
        const totalPosts = await forumPostCollection.countDocuments(query);

        res.status(200).json({
          success: true,
          data: posts,
          pagination: {
            totalPosts,
            totalPages: Math.ceil(totalPosts / limit),
            currentPage: parseInt(page),
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

    // GET TRAINER FORUM POST WITH SEARCH AND PAGINATION
    app.get("/api/myForumPosts", verifyToken, async (req, res) => {
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
    // GET FORUM BY ID
    app.get("/api/forumPost/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await forumPostCollection.findOne({
          _id: new ObjectId(id),
        });
        await forumPostCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { views: 1 } },
        );
        if (!result) {
          return res.status(404).json({
            success: false,
            message: "Forum post not found",
          });
        }
        res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching forum post:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    //  UPDATE FORUM POST
    app.put("/api/forumPost/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const data = req.body;
        delete data._id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...data,
            updatedAt: new Date(),
          },
        };
        const result = await forumPostCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Forum post not found",
          });
        }
        res.status(200).json({
          success: true,
          message: "Forum post updated successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error updating forum post:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // DELETE FORUM POST
    app.delete("/api/forumPost/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await forumPostCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Forum post not found",
          });
        }
        res.status(200).json({
          success: true,
          message: "Forum post deleted successfully",
          data: result,
        });
      } catch (error) {
        console.error("Error deleting forum post:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // ===== FORUM COMMENT RELATED ROUTES =====
    // ADD A NEW COMMENT
    app.post("/api/comments", verifyToken, async (req, res) => {
      try {
        const { postId, userId, content, authorName, authorImage } = req.body;
        const newComment = {
          postId: new ObjectId(postId),
          userId: new ObjectId(userId),
          content,
          authorName,
          authorImage,
          replies: [],
          createdAt: new Date(),
        };
        const result = await commentsCollection.insertOne(newComment);
        await forumPostCollection.updateOne(
          { _id: new ObjectId(postId) },
          {
            $inc: {
              commentsCount: 1,
            },
          },
        );
        res.status(201).json({ success: true, data: result });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Failed to add comment" });
      }
    });
    // ADD A REPLY TO A COMMENT
    app.post(
      "/api/comments/:commentId/reply",
      verifyAdmin,
      async (req, res) => {
        try {
          const { commentId } = req.params;
          const { userId, content, authorName, authorImage } = req.body;
          const reply = {
            replyId: new ObjectId(),
            userId: new ObjectId(userId),
            content,
            authorName,
            authorImage,
            createdAt: new Date(),
          };

          await commentsCollection.updateOne(
            { _id: new ObjectId(commentId) },
            { $push: { replies: reply } },
          );
          res
            .status(200)
            .json({ success: true, message: "Reply added successfully" });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Failed to add reply" });
        }
      },
    );

    // EDIT A COMMENT
    app.put("/api/comments/:commentId", async (req, res) => {
      try {
        const { commentId } = req.params;
        const { content } = req.body;
        await commentsCollection.updateOne(
          { _id: new ObjectId(commentId) },
          { $set: { content, updatedAt: new Date() } },
        );
        res.status(200).json({ success: true, message: "Comment updated" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Update failed" });
      }
    });

    // DELETE A COMMENT OR REPLY
    // DELETE A COMMENT
    app.delete("/api/comments/:commentId", async (req, res) => {
      try {
        const { commentId } = req.params;

        const comment = await commentsCollection.findOne({
          _id: new ObjectId(commentId),
        });

        if (!comment) {
          return res.status(404).json({
            success: false,
            message: "Comment not found",
          });
        }

        await commentsCollection.deleteOne({
          _id: new ObjectId(commentId),
        });

        await forumPostCollection.updateOne(
          {
            _id: new ObjectId(comment.postId),
          },
          {
            $inc: {
              commentsCount: -1,
            },
          },
        );

        res.status(200).json({
          success: true,
          message: "Comment deleted",
        });
      } catch (error) {
        console.log(error);

        res.status(500).json({
          success: false,
          message: "Delete failed",
        });
      }
    });
    // ===== GET ALL COMMENTS FOR A POST========
    app.get("/api/comments/:postId", async (req, res) => {
      try {
        const comments = await commentsCollection
          .find({ postId: new ObjectId(req.params.postId) })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: comments });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error fetching comments" });
      }
    });

    // EDIT A REPLY COMMENT
    app.put("/api/comments/:commentId/reply/:replyId", async (req, res) => {
      try {
        const { commentId, replyId } = req.params;
        const { content } = req.body;

        const result = await commentsCollection.updateOne(
          {
            _id: new ObjectId(commentId),
            "replies.replyId": new ObjectId(replyId),
          },
          {
            $set: {
              "replies.$.content": content,
            },
          },
        );

        if (!result.modifiedCount) {
          return res.status(404).json({
            success: false,
            message: "Reply not found",
          });
        }

        res.json({
          success: true,
          message: "Reply updated",
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          message: "Failed to update reply",
        });
      }
    });

    // DELETE A REPLY
    app.delete("/api/comments/:commentId/reply/:replyId", async (req, res) => {
      try {
        const { commentId, replyId } = req.params;

        const result = await commentsCollection.updateOne(
          {
            _id: new ObjectId(commentId),
          },
          {
            $pull: {
              replies: {
                replyId: new ObjectId(replyId),
              },
            },
          },
        );

        if (!result.modifiedCount) {
          return res.status(404).json({
            success: false,
            message: "Reply not found",
          });
        }

        res.json({
          success: true,
          message: "Reply deleted",
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          message: "Failed to delete reply",
        });
      }
    });

    // LIKE A POST
    app.patch("/api/forumPost/:id/like", async (req, res) => {
      try {
        const { id } = req.params;

        const { userId, name, email, image } = req.body;

        const post = await forumPostCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!post) {
          return res.status(404).json({
            success: false,
            message: "Post not found",
          });
        }

        const alreadyLiked = post.likes?.some((user) => user.email === email);

        if (alreadyLiked) {
          await forumPostCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $pull: {
                likes: {
                  email: email,
                },
              },
            },
          );
        } else {
          await forumPostCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $addToSet: {
                likes: {
                  userId,
                  name,
                  email,
                  image,
                },
              },
              $pull: {
                dislikes: {
                  email: email,
                },
              },
            },
          );
        }

        const updatedPost = await forumPostCollection.findOne({
          _id: new ObjectId(id),
        });

        res.json({
          success: true,
          likes: updatedPost.likes,
          dislikes: updatedPost.dislikes,
        });
      } catch (error) {
        console.log(error);

        res.status(500).json({
          success: false,
          message: "Like failed",
        });
      }
    });

    // DISLIKE A POST
    app.patch("/api/forumPost/:id/dislike", async (req, res) => {
      try {
        const { id } = req.params;

        const { userId, name, email, image } = req.body;

        const post = await forumPostCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!post) {
          return res.status(404).json({
            success: false,
            message: "Post not found",
          });
        }

        const alreadyDisliked = post.dislikes?.some(
          (user) => user.email === email,
        );

        if (alreadyDisliked) {
          // remove dislike

          await forumPostCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $pull: {
                dislikes: {
                  email: email,
                },
              },
            },
          );
        } else {
          // add dislike + remove like

          await forumPostCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $addToSet: {
                dislikes: {
                  userId,
                  name,
                  email,
                  image,
                },
              },

              $pull: {
                likes: {
                  email: email,
                },
              },
            },
          );
        }

        const updatedPost = await forumPostCollection.findOne({
          _id: new ObjectId(id),
        });

        res.json({
          success: true,

          action: alreadyDisliked ? "undisliked" : "disliked",

          likes: updatedPost.likes,

          dislikes: updatedPost.dislikes,
        });
      } catch (error) {
        console.log(error);

        res.status(500).json({
          success: false,
          message: "Dislike failed",
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
