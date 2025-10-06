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
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

app.use("/uploads", express.static(uploadDir));

// ==========================
// 📌 PostgreSQL Connection (Render)
// ==========================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log("✅ Connected to Render PostgreSQL"))
  .catch((err) => console.error("❌ Database connection error:", err));

// ==========================
// 📌 Register
// ==========================
app.post("/register", async (req, res) => {
  const { username, password, email, first_name, last_name, middle_initial, mobile_number } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO users (username, password, email, first_name, last_name, middle_initial, mobile_number) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id`,
      [username, password, email, first_name, last_name, middle_initial, mobile_number]
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
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );
    if (result.rows.length > 0) res.json({ success: true, user: result.rows[0] });
    else res.json({ success: false, message: "Invalid username or password" });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 📌 Forgot Password
// ==========================
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query("SELECT user_id FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.json({ success: false, message: "Email not found" });

    const resetToken = crypto.randomBytes(20).toString("hex");
    const expiry = new Date(Date.now() + 3600000);

    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3",
      [resetToken, expiry, email]
    );

    res.json({ success: true, resetToken });
  } catch (err) {
    console.error("❌ Forgot password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 📌 Reset Password
// ==========================
app.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const result = await pool.query(
      "SELECT user_id FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()",
      [token]
    );
    if (result.rows.length === 0) return res.json({ success: false, message: "Invalid or expired token" });

    const userId = result.rows[0].user_id;
    await pool.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = $2",
      [newPassword, userId]
    );
    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 📌 Profile Fetch & Upload
// ==========================
app.get("/profile/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT user_id, username, email, first_name, last_name, middle_initial, mobile_number, profile_image 
       FROM users WHERE user_id = $1`,
      [user_id]
    );
    if (result.rows.length > 0) res.json({ success: true, user: result.rows[0] });
    else res.json({ success: false, message: "User not found" });
  } catch (err) {
    console.error("❌ Profile fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/profile/:user_id/upload", upload.single("profile_image"), async (req, res) => {
  const { user_id } = req.params;
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

  const filePath = `/uploads/${req.file.filename}`;
  try {
    await pool.query("UPDATE users SET profile_image = $1 WHERE user_id = $2", [filePath, user_id]);
    res.json({ success: true, profile_image: filePath });
  } catch (err) {
    console.error("❌ Profile image upload error:", err);
    res.status(500).json({ success: false, error: "Failed to save profile image" });
  }
});

// ==========================
// 📌 Add Reading + Auto Bill
// ==========================
app.post("/add-reading", async (req, res) => {
  const { user_id, device_id, reading_5digit } = req.body;

  try {
    const lastReading = await pool.query(
      `SELECT reading_5digit FROM water_consumption 
       WHERE user_id = $1 AND device_id = $2 
       ORDER BY timestamp DESC LIMIT 1`,
      [user_id, device_id]
    );

    const previous_reading = lastReading.rows.length > 0 ? lastReading.rows[0].reading_5digit : 0;
    const current_reading = reading_5digit;
    const consumption = Math.max(current_reading - previous_reading, 0);
    const ratePerCubic = 15.0;
    const amount_to_pay = consumption * ratePerCubic;

    const consumptionResult = await pool.query(
      `INSERT INTO water_consumption 
       (user_id, device_id, reading_5digit, previous_reading, current_reading, consumption) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING reading_id, timestamp`,
      [user_id, device_id, reading_5digit, previous_reading, current_reading, consumption]
    );

    const reading_id = consumptionResult.rows[0].reading_id;
    const timestamp = consumptionResult.rows[0].timestamp;
    const bill_number = `BILL-${user_id}-${reading_id}-${new Date().getFullYear()}`;
    const period_start = new Date(new Date(timestamp).setDate(new Date(timestamp).getDate() - 29));
    const period_end = timestamp;
    const due_date = new Date(new Date(timestamp).setDate(new Date(timestamp).getDate() + 5));

    await pool.query(
      `INSERT INTO water_bills 
       (user_id, reading_id, bill_number, period_start, period_end, due_date, amount_to_pay) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user_id, reading_id, bill_number, period_start, period_end, due_date, amount_to_pay]
    );

    res.json({
      success: true,
      message: "Reading and bill added successfully",
      data: {
        bill_number,
        previous_reading,
        current_reading,
        consumption,
        amount_to_pay,
        period_start,
        period_end,
        due_date,
      },
    });
  } catch (err) {
    console.error("❌ Add reading error:", err);
    res.status(500).json({ success: false, error: "Failed to add reading" });
  }
});

// ==========================
// 📌 Water Bills API
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

// ==========================
// 📌 Expo Push Notifications + Leak Detection
// ==========================
function isValidExpoPushToken(token) {
  return typeof token === "string" && token.startsWith("ExponentPushToken");
}

async function sendExpoPushAndStore(expoToken, user_id, title, body, extra = {}) {
  if (!expoToken || !isValidExpoPushToken(expoToken)) return;

  try {
    await axios.post("https://exp.host/--/api/v2/push/send", {
      to: expoToken,
      sound: "default",
      title,
      body,
      data: extra,
    });

    await pool.query(
      `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)`,
      [user_id, body, (extra && extra.type) || "alert"]
    );
  } catch (err) {
    console.error("❌ Expo push error:", err.message);
  }
}

cron.schedule("*/10 * * * *", async () => {
  console.log("🔎 Running leak detection...");
  try {
    const users = await pool.query(
      "SELECT user_id, expo_push_token FROM users WHERE expo_push_token IS NOT NULL AND expo_push_token <> ''"
    );

    for (const user of users.rows) {
      const readings = await pool.query(
        "SELECT consumption FROM water_consumption WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5",
        [user.user_id]
      );

      const data = readings.rows.map(r => Number(r.consumption) || 0);
      if (data.length < 2) continue;

      const latest = data[0];
      const avg = data.slice(1).reduce((a, b) => a + b, 0) / (data.length - 1);

      if (latest > avg * 1.5) {
        console.log(`⚠️ Leak suspected for user ${user.user_id}`);
        await sendExpoPushAndStore(
          user.expo_push_token,
          user.user_id,
          "🚨 Water Leak Alert",
          `Your latest consumption (${latest} cu.m.) is higher than average (${avg.toFixed(1)} cu.m.).`,
          { type: "leak_alert" }
        );
      }
    }
  } catch (err) {
    console.error("❌ Leak detection error:", err);
  }
});

// ==========================
// 📊 Consumption Data
// ==========================
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
// 📌 Server Listener
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default pool;
