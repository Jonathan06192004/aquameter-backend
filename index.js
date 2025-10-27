// index.js — Clean & Production-Ready Backend for ClearMeter / AquaMeter
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";

const { Pool } = pkg;
const app = express();

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Serve uploads directory publicly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://aquameter_user:your_password@localhost:5432/aquameter",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ PostgreSQL connection error:", err));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });

// 🟩 ROUTES START HERE

// ✅ Home route
app.get("/", (req, res) => res.send("🌊 AquaMeter Backend Running..."));

// ✅ Register Expo + FCM push token
app.post("/register-push-token", async (req, res) => {
  try {
    const { user_id, expo_push_token, fcm_token } = req.body;

    if (!user_id || !expo_push_token)
      return res.status(400).json({ success: false, message: "Missing tokens or user ID" });

    await pool.query(
      `INSERT INTO user_tokens (user_id, expo_push_token, fcm_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET expo_push_token = EXCLUDED.expo_push_token, fcm_token = EXCLUDED.fcm_token`,
      [user_id, expo_push_token, fcm_token]
    );

    res.json({ success: true, message: "Push token registered" });
  } catch (error) {
    console.error("❌ Error registering push token:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Fetch home data (user info)
app.get("/home/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [id]);

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("❌ Error fetching home data:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Upload profile image
app.post("/profile/:id/upload", upload.single("profile_image"), async (req, res) => {
  try {
    const { id } = req.params;
    const profileImage = `/uploads/${req.file.filename}`;

    await pool.query(
      "UPDATE users SET profile_image = $1 WHERE user_id = $2",
      [profileImage, id]
    );

    res.json({ success: true, profile_image: profileImage });
  } catch (error) {
    console.error("❌ Image upload error:", error);
    res.status(500).json({ success: false, message: "Failed to upload image" });
  }
});

// ✅ Get user profile
app.get("/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [id]);

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("❌ Profile fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Water readings (formerly water_consumption)
app.get("/water-readings/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      "SELECT * FROM water_readings WHERE user_id = $1 ORDER BY reading_date DESC",
      [user_id]
    );
    res.json({ success: true, readings: result.rows });
  } catch (error) {
    console.error("❌ Error fetching water readings:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Estimated water bill (formerly water_bills)
app.get("/estimated-water-bill/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      "SELECT * FROM estimated_water_bill WHERE user_id = $1 ORDER BY billing_date DESC",
      [user_id]
    );
    res.json({ success: true, bills: result.rows });
  } catch (error) {
    console.error("❌ Error fetching estimated bills:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Smart device management (includes device_status)
app.get("/smart-device/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM smart_device WHERE device_id = $1", [id]);
    res.json({ success: true, device: result.rows[0] });
  } catch (error) {
    console.error("❌ Smart device fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🟥 404 fallback for invalid routes
app.use((req, res) => {
  console.warn(`⚠️ Invalid route accessed: ${req.originalUrl}`);
  res.status(404).json({ success: false, message: "Invalid route" });
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
