import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { Pool } from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import authRoutes from "./routes/auth.js";
import { authenticateToken } from "./middleware/authMiddleware.js";
import adminRoutes from "./routes/admin.js";

const app = express();

// ==========================
// 🛠 Middleware
// ==========================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================
// 📂 File Upload Directory
// ==========================
const __dirname = path.resolve();
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Serve uploaded images
app.use(
  "/uploads",
  express.static(uploadDir, { fallthrough: true })
);

// ==========================
// 📷 Multer Storage
// ==========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

// ==========================
// 🐘 PostgreSQL Connection
// ==========================
const isRender =
  process.env.RENDER === "true" ||
  process.env.DATABASE_URL?.includes("render.com");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://aquameter_user:J2cpNXQznZllOKRSvXv5GGtxQYuzgA3z@dpg-d44qseuuk2gs73fl9e8g-a.singapore-postgres.render.com/aquameter_3fag",
  ssl: isRender ? { rejectUnauthorized: false } : false,
});

pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL database"))
  .catch((err) =>
    console.error("❌ Database connection error:", err.message)
  );

// ⬆ MUST EXPORT POOL **AFTER** pool is created
export default pool;

// ==========================
// 🏁 Root Route
// ==========================
app.get("/", (req, res) => {
  res.json({ success: true, message: "🌊 AquaMeter Backend is Running!" });
});

// ==========================
// 🔐 Authentication Routes (Mobile)
// ==========================
app.use("/api/auth", authRoutes);

// ==========================
// 🧑‍💼 ADMIN ROUTES (Dashboard)
// ==========================
// Examples:
// GET /admin/users
// GET /admin/devices
// GET /admin/users/count
app.use("/admin", adminRoutes);

// ==========================
// 🏠 USER HOME (Protected)
// ==========================
app.get("/home/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const q = `
      SELECT user_id, username, email, first_name, last_name,
             middle_initial, mobile_number, profile_image
      FROM users WHERE user_id = $1
    `;
    const result = await pool.query(q, [id]);

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = result.rows[0];
    const BASE_URL =
      process.env.RENDER_EXTERNAL_URL ||
      "https://aquameter-backend-8u1x.onrender.com";

    if (user.profile_image?.trim()) {
      if (!user.profile_image.startsWith("http")) {
        user.profile_image = `${BASE_URL}${user.profile_image.startsWith("/") ? "" : "/"}${user.profile_image}`;
      }
    } else {
      delete user.profile_image;
    }

    res.json({ success: true, user });

  } catch (error) {
    console.error("❌ Error fetching user for /home:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================
// 🔔 PUSH TOKEN SAVE
// ==========================
app.post("/api/save-push-token", authenticateToken, async (req, res) => {
  const { user_id, expo_token, fcm_token } = req.body;

  if (!user_id)
    return res.status(400).json({ success: false, error: "Missing user_id" });

  try {
    const existing = await pool.query(
      "SELECT * FROM user_tokens WHERE user_id = $1",
      [user_id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        "UPDATE user_tokens SET expo_token = $1, fcm_token = $2 WHERE user_id = $3",
        [expo_token, fcm_token, user_id]
      );
    } else {
      await pool.query(
        "INSERT INTO user_tokens (user_id, expo_token, fcm_token) VALUES ($1, $2, $3)",
        [user_id, expo_token, fcm_token]
      );
    }

    res.json({ success: true, message: "Push token saved successfully" });

  } catch (err) {
    console.error("❌ Save token error:", err.message);
    res.status(500).json({ success: false, error: "Failed to save token" });
  }
});

// ==========================
// 👤 PROFILE ROUTES
// ==========================
app.get("/profile/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT user_id, username, email, first_name, last_name,
              middle_initial, mobile_number, profile_image
       FROM users WHERE user_id = $1`,
      [user_id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = result.rows[0];

    if (user.profile_image?.trim()) {
      if (!user.profile_image.startsWith("http")) {
        user.profile_image = `${req.protocol}://${req.get("host")}${user.profile_image.startsWith("/") ? "" : "/"}${user.profile_image}`;
      }
    } else {
      delete user.profile_image;
    }

    res.json({ success: true, user });

  } catch (err) {
    console.error("❌ Profile fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post(
  "/profile/:user_id/upload",
  authenticateToken,
  upload.single("profile_image"),
  async (req, res) => {
    const { user_id } = req.params;

    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded" });

    const filePath = `/uploads/${req.file.filename}`;

    try {
      await pool.query(
        "UPDATE users SET profile_image = $1 WHERE user_id = $2",
        [filePath, user_id]
      );
      res.json({ success: true, profile_image: filePath });

    } catch (err) {
      console.error("❌ Profile upload error:", err.message);
      res.status(500).json({ success: false, error: "Failed to save profile image" });
    }
  }
);

// ==========================
// 💧 WATER BILL ROUTES
// ==========================
app.get("/estimated-water-bill/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const q = `
      SELECT wb.bill_id, wb.period_start, wb.period_end, wb.due_date,
             wb.amount_to_pay::FLOAT AS amount_to_pay,
             wc.previous_reading, wc.current_reading, wc.consumption
      FROM estimated_water_bill wb
      LEFT JOIN water_readings wc ON wb.reading_id = wc.reading_id
      WHERE wb.user_id = $1
      ORDER BY wb.period_end DESC
    `;
    const result = await pool.query(q, [user_id]);

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error("❌ Estimated bill fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/water-readings/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const q = `
      SELECT timestamp, COALESCE(consumption,0)::FLOAT AS consumption
      FROM water_readings WHERE user_id=$1
      ORDER BY timestamp ASC LIMIT 12
    `;
    const result = await pool.query(q, [user_id]);

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error("❌ Water readings fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// ⚙️ SMART DEVICE ROUTES
// ==========================
app.get("/smart-device/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await pool.query(
      "SELECT device_id, device_serial, location, device_status, installed_at FROM smart_device WHERE user_id = $1",
      [user_id]
    );
    res.json({ success: true, devices: result.rows });

  } catch (err) {
    console.error("❌ Smart device fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/smart-device/register", authenticateToken, async (req, res) => {
  const { user_id, device_serial, location } = req.body;

  if (!user_id || !device_serial || !location)
    return res.status(400).json({ success: false, message: "Missing fields" });

  try {
    const q = `
      INSERT INTO smart_device (user_id, device_serial, location, installed_at, device_status)
      VALUES ($1, $2, $3, NOW(), 'Active')
      RETURNING device_id
    `;

    const result = await pool.query(q, [user_id, device_serial, location]);

    res.json({
      success: true,
      message: "Smart device registered successfully",
      device_id: result.rows[0].device_id
    });

  } catch (err) {
    console.error("❌ Smart device register error:", err.message);
    res.status(500).json({ success: false, error: "Failed to register device" });
  }
});

// ==========================
// 🔔 NOTIFICATIONS
// ==========================
app.get("/notifications/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const q = `
      SELECT id, message, type, created_at, is_read
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(q, [user_id]);

    res.json({ success: true, notifications: result.rows });

  } catch (err) {
    console.error("❌ Notifications fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/notifications", authenticateToken, async (req, res) => {
  const { user_id, message, type } = req.body;

  if (!user_id || !message || !type)
    return res.status(400).json({ success: false, message: "Missing fields" });

  try {
    await pool.query(
      `INSERT INTO notifications (user_id, message, type, created_at, is_read)
       VALUES ($1, $2, $3, NOW(), false)`,
      [user_id, message, type]
    );

    res.json({ success: true, message: "Notification sent successfully" });

  } catch (err) {
    console.error("❌ Notification error:", err.message);
    res.status(500).json({ success: false, error: "Failed to create notification" });
  }
});

// ==========================
// 🚫 404 Handler
// ==========================
app.use((req, res) => {
  if (
    !req.originalUrl.startsWith("/uploads") &&
    req.originalUrl !== "/favicon.ico"
  ) {
    console.warn(`⚠️ Invalid route accessed: ${req.originalUrl}`);
  }
  res.status(404).json({ success: false, error: "Route not found" });
});

// ==========================
// 🚀 Server Start
// ==========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
