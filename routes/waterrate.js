import express from "express";
import pool from "../config/db.js";

const router = express.Router();

/*
===========================================
 UPDATE USER WATER RATE
===========================================
 Body:
 {
   "user_id": 12,
   "rate": 50
 }
===========================================
*/
router.post("/update", async (req, res) => {
  try {
    const { user_id, rate } = req.body;

    if (!user_id || !rate || isNaN(rate)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid user_id or rate",
      });
    }

    const query = `
      UPDATE users
      SET water_rate = $1
      WHERE id = $2
      RETURNING id, fullname, water_rate;
    `;

    const result = await pool.query(query, [rate, user_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

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
