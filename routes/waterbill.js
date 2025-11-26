import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Route 1: Get Estimated Water Bill Records (NO CHANGE - This correctly fetches generated bills)
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

// Route 2: Get Water Readings AGGREGATED BY MONTH (MODIFIED)
router.get("/readings/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const q = `
      SELECT
        -- Date truncated to the start of the month (for grouping/sorting)
        DATE_TRUNC('month', timestamp) AS billing_month,
        -- Sum all consumption values for that month
        SUM(COALESCE(consumption, 0))::FLOAT AS monthly_consumption
      FROM water_readings
      WHERE user_id = $1
      -- Group the results by the month/year
      GROUP BY billing_month
      -- Order by newest month first (DESC)
      ORDER BY billing_month DESC
    `;
    const result = await pool.query(q, [user_id]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Readings aggregation error:", err.message);
    res.status(500).json({ success: false, message: "Server failed to aggregate consumption." });
  }
});

export default router;