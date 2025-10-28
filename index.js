// index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { Pool } from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================
// 📂 File Upload Setup
// ==========================
const __dirname = path.resolve();
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use(
  "/uploads",
  express.static(uploadDir, {
    fallthrough: true,
  })
);

// ==========================
// 📦 Multer setup
// ==========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
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
    "postgresql://aquameter_user:q0JSnRKWQlpJrgHlKostKPTOXN9Rz0xp@dpg-d3ht4abuibrs73b6qkgg-a.singapore-postgres.render.com/aquameter",
  ssl: isRender ? { rejectUnauthorized: false } : false,
});

pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL database"))
  .catch((err) => console.error("❌ Database connection error:", err.message));

// ==========================
// 🌊 Root route
// ==========================
app.get("/", (req, res) => {
  res.json({ success: true, message: "🌊 AquaMeter Backend is Running!" });
});

// ==========================
// 🏠 HOME Route
// ==========================
app.get("/home/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT user_id, username, email, first_name, last_name, middle_initial, mobile_number, profile_image FROM users WHERE user_id = $1",
      [id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = result.rows[0];
    if (user.profile_image && user.profile_image.trim() !== "") {
      if (!user.profile_image.startsWith("http")) {
        user.profile_image = `${req.protocol}://${req.get("host")}${
          user.profile_image.startsWith("/") ? "" : "/"
        }${user.profile_image}`;
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
// 👤 Register
// ==========================
app.post("/register", async (req, res) => {
  const {
    username,
    password,
    email,
    first_name,
    last_name,
    middle_initial,
    mobile_number,
  } = req.body;

  if (!username || !password)
    return res.status(400).json({ success: false, error: "Missing fields" });

  try {
    const result = await pool.query(
      `INSERT INTO users (username, password, email, first_name, last_name, middle_initial, mobile_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id`,
      [
        username,
        password,
        email,
        first_name,
        last_name,
        middle_initial,
        mobile_number,
      ]
    );
    res.json({ success: true, userId: result.rows[0].user_id });
  } catch (err) {
    console.error("❌ Database error:", err.message);
    res.status(500).json({ success: false, error: "Failed to register user" });
  }
});

// ==========================
// 🔑 Login
// ==========================
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, error: "Missing username or password" });

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );
    if (result.rows.length > 0)
      res.json({ success: true, user: result.rows[0] });
    else res.json({ success: false, message: "Invalid username or password" });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 📱 Save Push Token
// ==========================
app.post("/api/save-push-token", async (req, res) => {
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
// 🧑‍💼 Profile Routes
// ==========================
app.get("/profile/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT user_id, username, email, first_name, last_name, middle_initial, mobile_number, profile_image 
       FROM users WHERE user_id = $1`,
      [user_id]
    );
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (!user.profile_image || user.profile_image.trim() === "") {
        delete user.profile_image;
      }
      res.json({ success: true, user });
    } else res.status(404).json({ success: false, message: "User not found" });
  } catch (err) {
    console.error("❌ Profile fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/profile/:user_id/upload", upload.single("profile_image"), async (req, res) => {
  const { user_id } = req.params;
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file uploaded" });

  const filePath = `/uploads/${req.file.filename}`;
  try {
    await pool.query("UPDATE users SET profile_image = $1 WHERE user_id = $2", [
      filePath,
      user_id,
    ]);
    res.json({ success: true, profile_image: filePath });
  } catch (err) {
    console.error("❌ Profile image upload error:", err.message);
    res.status(500).json({ success: false, error: "Failed to save profile image" });
  }
});

// ==========================
// 💧 Estimated Water Bill & Readings
// ==========================
app.get("/estimated-water-bill/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT wb.bill_id, wb.period_start, wb.period_end, wb.due_date, 
              wb.amount_to_pay::FLOAT AS amount_to_pay,
              wc.previous_reading, wc.current_reading, wc.consumption
       FROM estimated_water_bill wb
       LEFT JOIN water_readings wc ON wb.reading_id = wc.reading_id
       WHERE wb.user_id = $1
       ORDER BY wb.period_end DESC`,
      [user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Estimated bill fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/water-readings/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT timestamp, COALESCE(consumption,0)::FLOAT AS consumption
       FROM water_readings
       WHERE user_id=$1
       ORDER BY timestamp ASC
       LIMIT 12`,
      [user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Water readings fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 🧩 POST endpoint for FastAPI bridge
// ==========================
app.post("/api/water-readings", async (req, res) => {
  console.log("Received body:", req.body);

  const { device_id, user_id, reading_value } = req.body;

  if (!device_id || !user_id || reading_value === undefined) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
      received: req.body
    });
  }

  try {
    await pool.query(
      `INSERT INTO water_readings (device_id, user_id, consumption, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [device_id, user_id, reading_value]
    );

    res.status(200).json({
      success: true,
      message: "Reading saved successfully"
    });
  } catch (error) {
    console.error("Error saving water reading:", error.message);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// ==========================
// ⚙️ Smart Device Routes
// ==========================
app.get("/smart-device/:user_id", async (req, res) => {
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

// ✅ Add Smart Device Registration Route
app.post("/smart-device/register", async (req, res) => {
  const { user_id, device_serial, location } = req.body;

  if (!user_id || !device_serial || !location) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO smart_device (user_id, device_serial, location, installed_at, device_status)
       VALUES ($1, $2, $3, NOW(), 'Active') RETURNING device_id`,
      [user_id, device_serial, location]
    );
    res.json({ success: true, message: "Smart device registered successfully", device_id: result.rows[0].device_id });
  } catch (err) {
    console.error("❌ Smart device register error:", err.message);
    res.status(500).json({ success: false, error: "Failed to register smart device" });
  }
});

app.put("/smart-device/:device_id/status", async (req, res) => {
  const { device_id } = req.params;
  const { device_status } = req.body;
  try {
    await pool.query(
      "UPDATE smart_device SET device_status = $1 WHERE device_id = $2",
      [device_status, device_id]
    );
    res.json({ success: true, message: "Device status updated" });
  } catch (err) {
    console.error("❌ Device status update error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 🔔 Notifications Routes
// ==========================
app.get("/notifications/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, message, type, created_at, is_read
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user_id]
    );
    res.json({ success: true, notifications: result.rows });
  } catch (err) {
    console.error("❌ Notifications fetch error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/notifications", async (req, res) => {
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
    console.error("❌ Notification creation error:", err.message);
    res.status(500).json({ success: false, error: "Failed to create notification" });
  }
});

app.put("/notifications/:id/read", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE notifications SET is_read = true WHERE id = $1", [id]);
    res.json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    console.error("❌ Notification update error:", err.message);
    res.status(500).json({ success: false, error: "Failed to update notification" });
  }
});

// ==========================
// 🚫 Catch-All Route
// ==========================
app.use((req, res) => {
  if (!req.originalUrl.startsWith("/uploads") && req.originalUrl !== "/favicon.ico") {
    console.warn(`⚠️ Invalid route accessed: ${req.originalUrl}`);
  }
  res.status(404).json({ success: false, error: "Route not found" });
});

// ==========================
// 🚀 Server Listener
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default pool;
