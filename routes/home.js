import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/:id", authenticateToken, async (req, res) => {
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
      `${req.protocol}://${req.get("host")}`;

    if (user.profile_image?.trim() && !user.profile_image.startsWith("http")) {
      user.profile_image = `${BASE_URL}${user.profile_image.startsWith("/") ? "" : "/"}${user.profile_image}`;
    } else if (!user.profile_image) {
      delete user.profile_image;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("❌ /home error:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
