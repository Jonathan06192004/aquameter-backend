import express from "express";
import pool from "../config/db.js";

const router = express.Router();

// ===============================
// UPDATE WATER RATE (INSERT NEW)
// ===============================
router.post("/update", async (req, res) => {
  try {
    const { rate } = req.body;

    if (!rate || isNaN(rate)) {
      return res.status(400).json({
        success: false,
        error: "Invalid rate value",
      });
    }

    const query = `
      INSERT INTO water_rate (rate_per_cubic, updated_at)
      VALUES ($1, NOW())
      RETURNING *;
    `;

    const result = await pool.query(query, [rate]);

    return res.json({
      success: true,
      message: "Water rate updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error updating water rate:", err);
    return res.status(500).json({
      success: false,
      error: "Server error updating water rate",
    });
  }
});

export default router;
