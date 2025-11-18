import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../index.js";

const router = express.Router();

/* ============================================
   🔐 REGISTER
============================================ */
router.post("/register", async (req, res) => {
  const {
    username,
    password,
    email,
    first_name,
    last_name,
    middle_initial,
    mobile_number,
  } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, email, first_name, last_name, middle_initial, mobile_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id`,
      [
        username,
        hashedPassword,
        email,
        first_name,
        last_name,
        middle_initial,
        mobile_number,
      ]
    );

    res.json({ success: true, userId: result.rows[0].user_id });
  } catch (err) {
    console.error("❌ Registration error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================
   🔑 LOGIN
============================================ */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ success: false, message: "Missing fields" });

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0)
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });

    const token = jwt.sign(
      { user_id: user.user_id, username: user.username },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================
   🔄 FORGOT PASSWORD (EMAIL MATCH)
============================================ */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });

  try {
    const result = await pool.query(
      "SELECT user_id FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    // User exists → allow resetting password
    res.json({
      success: true,
      message: "Email verified. You may now set a new password.",
      user_id: result.rows[0].user_id,
    });
  } catch (err) {
    console.error("❌ Forgot password error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================
   🔐 RESET PASSWORD (NEW PASSWORD)
============================================ */
router.post("/reset-password", async (req, res) => {
  const { user_id, new_password } = req.body;

  if (!user_id || !new_password) {
    return res.status(400).json({
      success: false,
      message: "Missing user_id or new_password",
    });
  }

  try {
    const hashed = await bcrypt.hash(new_password, 10);

    await pool.query(
      "UPDATE users SET password = $1 WHERE user_id = $2",
      [hashed, user_id]
    );

    res.json({
      success: true,
      message: "Password has been successfully updated",
    });
  } catch (err) {
    console.error("❌ Reset password error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
