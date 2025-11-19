import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Fetch notifications */
router.get("/:user_id", authenticateToken, async (req, res) => {
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
    console.error("❌ Notification fetch error:", err.message);
    res.status(500).json({ success: false });
  }
});

/* Create notification */
router.post("/", authenticateToken, async (req, res) => {
  const { user_id, message, type } = req.body;

  if (!user_id || !message || !type)
    return res.status(400).json({ success: false, message: "Missing fields" });

  try {
    await pool.query(
      `INSERT INTO notifications (user_id, message, type, created_at, is_read)
       VALUES ($1, $2, $3, NOW(), false)`,
      [user_id, message, type]
    );

    res.json({ success: true, message: "Notification sent" });
  } catch (err) {
    console.error("❌ Create notification error:", err.message);
    res.status(500).json({ success: false });
  }
});

export default router;
