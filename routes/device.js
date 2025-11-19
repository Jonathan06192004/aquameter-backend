import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Fetch device(s) */
router.get("/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await pool.query(
      "SELECT device_id, device_serial, location, device_status, installed_at FROM smart_device WHERE user_id = $1",
      [user_id]
    );

    res.json({ success: true, devices: result.rows });
  } catch (err) {
    console.error("❌ Device fetch error:", err.message);
    res.status(500).json({ success: false });
  }
});

/* Register device */
router.post("/register", authenticateToken, async (req, res) => {
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
      device_id: result.rows[0].device_id,
    });
  } catch (err) {
    console.error("❌ Register device error:", err.message);
    res.status(500).json({ success: false });
  }
});

export default router;
