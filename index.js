// index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { Pool } from "pg";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import axios from "axios";
import cron from "node-cron";

const app = express();
app.use(cors());
app.use(express.json());

// ==========================
// 📂 File Upload Setup
// ==========================
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });
app.use("/uploads", express.static(uploadDir));

// ==========================
// 📌 PostgreSQL Connection
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
// 🌐 Root route (for Render test)
// ==========================
app.get("/", (req, res) => {
  res.json({ success: true, message: "🌊 AquaMeter Backend is Running!" });
});

// ==========================
// 📌 HOME Route (fetch user info)
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

    // Add Render URL to profile_image path
    if (user.profile_image && !user.profile_image.startsWith("http")) {
      user.profile_image = `${req.protocol}://${req.get("host")}${user.profile_image}`;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("❌ Error fetching user for /home:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================
// 📌 Register
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
    console.error("❌ Database error:", err);
    res.status(500).json({ success: false, error: "Failed to register user" });
  }
});

// ==========================
// 📌 Login
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
    console.error("❌ Login error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 📌 Save Push Token
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
// 📌 Profile Routes
// ==========================
app.get("/profile/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT user_id, username, email, first_name, last_name, middle_initial, mobile_number, profile_image 
       FROM users WHERE user_id = $1`,
      [user_id]
    );
    if (result.rows.length > 0)
      res.json({ success: true, user: result.rows[0] });
    else res.status(404).json({ success: false, message: "User not found" });
  } catch (err) {
    console.error("❌ Profile fetch error:", err);
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
    console.error("❌ Profile image upload error:", err);
    res.status(500).json({ success: false, error: "Failed to save profile image" });
  }
});

// ==========================
// 📊 Water Bills & Consumption Routes
// ==========================
app.get("/water-bills/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT wb.bill_number, wb.period_start, wb.period_end, wb.due_date, 
              wb.amount_to_pay::FLOAT AS amount_to_pay,
              wc.previous_reading, wc.current_reading, wc.consumption
       FROM water_bills wb
       LEFT JOIN water_consumption wc ON wb.reading_id = wc.reading_id
       WHERE wb.user_id = $1
       ORDER BY wb.period_end DESC`,
      [user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Water bills fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/consumption/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT timestamp, COALESCE(consumption,0)::FLOAT AS consumption
       FROM water_consumption
       WHERE user_id=$1
       ORDER BY timestamp ASC
       LIMIT 12`,
      [user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Consumption fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// ❌ Catch-All for Undefined Routes
// ==========================
app.use((req, res) => {
  console.warn(`⚠️ Invalid route accessed: ${req.originalUrl}`);
  res.status(404).json({ success: false, error: "Route not found" });
});

// ==========================
// 📌 Server Listener
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default pool;
