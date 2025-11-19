import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js"; // <- correct import

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

    // Check username duplicates
    const checkUser = await pool.query(
      "SELECT username FROM users WHERE username = $1",
      [username]
    );
    if (checkUser.rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "Username already exists" });
    }

    // Check email duplicates
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
  const { username, password, expo_push_token } = req.body; // allow optional expo token

  try {
    if (!username || !password)
      return res.status(400).json({
        success: false,
        message: "Missing username or password",
      });

    // allow login by username OR email
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password",
      });
    }

    const user = result.rows[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password",
      });

    // Optionally save expo push token to users table (so notifications can be sent)
    if (expo_push_token) {
      try {
        await pool.query(
          "UPDATE users SET expo_push_token = $1 WHERE user_id = $2",
          [expo_push_token, user.user_id]
        );
        // keep user.expo_push_token in sync for response
        user.expo_push_token = expo_push_token;
      } catch (e) {
        console.warn("⚠️ Could not update expo_push_token:", e.message);
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
      },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    // Return FULL user object
    res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        middle_initial: user.middle_initial,
        mobile_number: user.mobile_number,
        profile_image: user.profile_image,
        expo_push_token: user.expo_push_token,
        is_hidden: user.is_hidden,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ============================================
   🔄 FORGOT PASSWORD
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
