import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/bill/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const q = `
      SELECT wb.bill_id, wb.period_start, wb.period_end, wb.due_date,
             wb.amount_to_pay::FLOAT AS amount_to_pay,
             wc.previous_reading, wc.current_reading, wc.consumption
      FROM estimated_water_bill wb
      LEFT JOIN water_readings wc ON wb.reading_id = wc.reading_id
      WHERE wb.user_id = $1
      ORDER BY wb.period_end DESC
    `;
    const result = await pool.query(q, [user_id]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Estimated bill error:", err.message);
    res.status(500).json({ success: false });
  }
});

router.get("/readings/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const q = `
      SELECT timestamp, COALESCE(consumption,0)::FLOAT AS consumption
      FROM water_readings
      WHERE user_id=$1
      ORDER BY timestamp ASC LIMIT 12
    `;
    const result = await pool.query(q, [user_id]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Readings error:", err.message);
    res.status(500).json({ success: false });
  }
});

export default router;
