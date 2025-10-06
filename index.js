// index.js
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios"); // For sending Expo push notifications
const cron = require("node-cron"); // For scheduling leak detection checks

const app = express();
app.use(cors());
app.use(express.json());

// ==========================
// 📂 File Upload Setup
// ==========================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// ==========================
// 📌 PostgreSQL connection
// ==========================
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "aquameter",
  password: "jonathanayop",
  port: 5432,
});

// ==========================
// 📌 Register endpoint
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
// 📌 Login endpoint
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
    const expiry = new Date(Date.now() + 3600000); // 1 hour expiry

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
// 📌 Home endpoint
// ==========================
app.get("/home/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT first_name, profile_image FROM users WHERE user_id = $1",
      [user_id]
    );
    if (result.rows.length > 0) res.json({ success: true, user: result.rows[0] });
    else res.json({ success: false, message: "User not found" });
  } catch (err) {
    console.error("❌ Home fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================
// 📌 Profile fetch
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

// ==========================
// 📌 Profile image upload
// ==========================
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
    // 1. Get last reading for user/device
    const lastReading = await pool.query(
      `SELECT reading_5digit FROM water_consumption 
       WHERE user_id = $1 AND device_id = $2 
       ORDER BY timestamp DESC LIMIT 1`,
      [user_id, device_id]
    );

    let previous_reading = 0;
    if (lastReading.rows.length > 0) {
      previous_reading = lastReading.rows[0].reading_5digit;
    }

    // 2. Calculate
    const current_reading = reading_5digit;
    const consumption = Math.max(current_reading - previous_reading, 0);
    const ratePerCubic = 15.0;
    const amount_to_pay = consumption * ratePerCubic;

    // 3. Insert into water_consumption
    const consumptionResult = await pool.query(
      `INSERT INTO water_consumption 
       (user_id, device_id, reading_5digit, previous_reading, current_reading, consumption) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING reading_id, timestamp`,
      [user_id, device_id, reading_5digit, previous_reading, current_reading, consumption]
    );

    const reading_id = consumptionResult.rows[0].reading_id;
    const timestamp = consumptionResult.rows[0].timestamp;

    // 4. Create bill details
    const bill_number = `BILL-${user_id}-${reading_id}-${new Date().getFullYear()}`;
    const period_start = new Date(new Date(timestamp).setDate(new Date(timestamp).getDate() - 29));
    const period_end = timestamp;
    const due_date = new Date(new Date(timestamp).setDate(new Date(timestamp).getDate() + 5));

    // 5. Insert into water_bills
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
// 📌 Expo Push Notifications
// ==========================

// Endpoint to save Expo push tokens
app.post("/register-push-token", async (req, res) => {
  const { user_id, expo_push_token } = req.body;
  try {
    await pool.query(
      "UPDATE users SET expo_push_token = $1 WHERE user_id = $2",
      [expo_push_token, user_id]
    );
    res.json({ success: true, message: "Push token registered successfully" });
  } catch (err) {
    console.error("❌ Push token registration error:", err);
    res.status(500).json({ success: false, error: "Failed to register push token" });
  }
});

// helper: safe check for expo token format
function isValidExpoPushToken(token) {
  return typeof token === "string" && token.startsWith("ExponentPushToken");
}

// helper: send expo push and store notification (safe, won't crash backend if notifications table missing)
async function sendExpoPushAndStore(expoToken, user_id, title, body, extra = {}) {
  if (!expoToken || !isValidExpoPushToken(expoToken)) {
    console.warn("⚠️ Invalid expo push token for user", user_id, expoToken);
    return null;
  }

  try {
    const payload = {
      to: expoToken,
      sound: "default",
      title,
      body,
      data: extra,
    };

    const resp = await axios.post("https://exp.host/--/api/v2/push/send", payload, {
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      timeout: 10000,
    });

    // try to store notification record (optional table); swallow errors so it doesn't break the flow
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, title, body, data) VALUES ($1, $2, $3, $4)`,
        [user_id, title, body, JSON.stringify(extra || {})]
      );
    } catch (storeErr) {
      // If notifications table doesn't exist or insert fails, do not throw — just log.
      console.warn("⚠️ Could not store notification record (notifications table maybe missing):", storeErr.message || storeErr);
    }

    console.log("✅ Expo push sent for user", user_id, "response:", resp.data);
    return resp.data;
  } catch (err) {
    console.error("❌ Error sending expo push for user", user_id, err.response ? err.response.data : err.message || err);
    return null;
  }
}

// Leak detection job — runs every 10 minutes
// For faster local testing you can change the schedule to "*/1 * * * *" (every minute)
cron.schedule("*/10 * * * *", async () => {
  console.log("🔎 Running leak detection...");

  try {
    // Get users that have expo tokens saved (non-null and not empty)
    const usersResult = await pool.query(
      "SELECT user_id, expo_push_token FROM users WHERE expo_push_token IS NOT NULL AND expo_push_token <> ''"
    );

    for (const user of usersResult.rows) {
      try {
        const { user_id, expo_push_token } = user;

        // get last 5 readings for user, newest first
        const readingsResult = await pool.query(
          `SELECT consumption FROM water_consumption WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5`,
          [user_id]
        );

        const rows = readingsResult.rows || [];
        if (rows.length < 2) continue; // not enough data

        // convert to numbers safely
        const consumptions = rows.map(r => {
          const n = Number(r.consumption);
          return isNaN(n) ? 0 : n;
        });

        const latest = consumptions[0];
        const others = consumptions.slice(1);
        const sumOthers = others.reduce((a, b) => a + b, 0);
        const avg = others.length > 0 ? sumOthers / others.length : 0;

        // If the average is zero we cannot compare meaningfully
        if (avg <= 0) continue;

        // If latest > avg * 1.5 then suspect leak
        if (latest > avg * 1.5) {
          console.log(`⚠️ Leak suspected for user ${user_id} — latest ${latest}, avg ${avg.toFixed(2)}`);

          const title = "🚨 Water Leak Alert";
          const body = `Your latest consumption (${latest} cu.m.) is much higher than recent average (${avg.toFixed(1)} cu.m.). Please check for leaks.`;
          const extra = { type: "leak_alert", latest, avg };

          await sendExpoPushAndStore(expo_push_token, user_id, title, body, extra);
        }
      } catch (perUserErr) {
        // protect the cron loop from crashing on a single user
        console.error("❌ Error processing user in leak detection loop:", perUserErr);
      }
    }
  } catch (err) {
    console.error("❌ Leak detection error:", err);
  }
});

// ==========================
// 📊 Consumption API (fixed)
// ==========================
app.get("/consumption/:user_id", async (req, res) => {
  const { user_id } = req.params;
  console.log("📡 GET /consumption for user:", user_id);
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
// 📌 Default 404 Handler (avoid <html> responses)
// ==========================
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

// ==========================
// 📌 Server Listener
// ==========================
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
  console.log(`👉 Emulator: http://10.0.2.2:${PORT}`);
});
