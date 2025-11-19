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

/* Register new device */
router.post("/register", authenticateToken, async (req, res) => {
  const { user_id, device_serial, location } = req.body;

  if (!user_id || !device_serial || !location)
    return res.status(400).json({ success: false, message: "Missing fields" });

  try {
    const q = `
      INSERT INTO smart_device (user_id, device_serial, location, installed_at, device_status)
      VALUES ($1, $2, $3, NOW(), 'Active')
      RETURNING device_id, device_status
    `;

    const result = await pool.query(q, [user_id, device_serial, location]);

    // Emit WebSocket update
    const io = req.app.get("socketio");
    io.emit(`device-status-${user_id}`, {
      device_id: result.rows[0].device_id,
      status: result.rows[0].device_status,
      serial: device_serial,
      location,
    });

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

/* Example: update device status endpoint (optional) */
router.post("/update-status", authenticateToken, async (req, res) => {
  const { device_id, user_id, new_status } = req.body;

  try {
    await pool.query(
      "UPDATE smart_device SET device_status=$1 WHERE device_id=$2",
      [new_status, device_id]
    );

    // Emit update
    const io = req.app.get("socketio");
    io.emit(`device-status-${user_id}`, {
      device_id,
      status: new_status,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Update device status error:", err.message);
    res.status(500).json({ success: false });
  }
});

export default router;
