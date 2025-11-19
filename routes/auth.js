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

  try {
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // 🔎 Check if username already taken
    const checkUser = await pool.query(
      "SELECT username FROM users WHERE username = $1",
      [username]
    );
    if (checkUser.rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "Username already exists" });
    }

    // 🔎 (Optional) Check if email already taken
    if (email) {
      const checkEmail = await pool.query(
        "SELECT email FROM users WHERE email = $1",
        [email]
      );
      if (checkEmail.rows.length > 0) {
        return res
          .status(409)
          .json({ success: false, message: "Email already in use" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, email, first_name, last_name, middle_initial, mobile_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING user_id`,
      [
        username,
        hashedPassword,
        email || null,
        first_name || null,
        last_name || null,
        middle_initial || null,
        mobile_number || null,
      ]
    );

    res.json({
      success: true,
      user_id: result.rows[0].user_id,
      message: "Registration successful",
    });
  } catch (err) {
    console.error("❌ Registration Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================
   🔑 LOGIN
============================================ */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password)
      return res.status(400).json({
        success: false,
        message: "Missing username or password",
      });

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
      },
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
    console.error("❌ Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================
   🔄 FORGOT PASSWORD (VERIFY EMAIL)
============================================ */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    if (!email)
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });

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

    res.json({
      success: true,
      message: "Email verified. Proceed to reset password.",
      user_id: result.rows[0].user_id,
    });
  } catch (err) {
    console.error("❌ Forgot Password Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================
   🔐 RESET PASSWORD
============================================ */
router.post("/reset-password", async (req, res) => {
  const { user_id, new_password } = req.body;

  try {
    if (!user_id || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Missing user_id or new_password",
      });
    }

    const hashed = await bcrypt.hash(new_password, 10);

    await pool.query(
      "UPDATE users SET password = $1 WHERE user_id = $2",
      [hashed, user_id]
    );

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("❌ Reset Password Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
