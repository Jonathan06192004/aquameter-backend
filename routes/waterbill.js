import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Route 1: Get Estimated Water Bill Records (MODIFIED FOR AGGREGATION)
router.get("/bill/:user_id", authenticateToken, async (req, res) => {
const { user_id } = req.params;

try {
 const q = `
 SELECT 
   MAX(wb.bill_id) AS bill_id,       -- Use the MAX ID for reference
   wb.period_start,
   wb.period_end,
   MAX(wb.due_date) AS due_date,       -- Use the MAX due date
   SUM(wb.amount_to_pay)::FLOAT AS amount_to_pay, -- SUM the amounts
   SUM(wc.consumption)::FLOAT AS total_consumption   -- SUM the consumption
 FROM estimated_water_bill wb
 LEFT JOIN water_readings wc ON wb.reading_id = wc.reading_id
 WHERE wb.user_id = $1
 -- Group by the billing period to consolidate all records for that period
 GROUP BY wb.period_start, wb.period_end
 -- Order by the end date to ensure the newest consolidated bill is first
 ORDER BY wb.period_end DESC
 `;
 const result = await pool.query(q, [user_id]);

 res.json({ success: true, data: result.rows });
} catch (err) {
 console.error("❌ Estimated bill aggregation error:", err.message);
 res.status(500).json({ success: false, message: "Server failed to aggregate bill data." });
}
});

// Route 2: Get Water Readings AGGREGATED BY MONTH (No Change - still correct)
router.get("/readings/:user_id", authenticateToken, async (req, res) => {
const { user_id } = req.params;

try {
 const q = `
 SELECT
  DATE_TRUNC('month', timestamp) AS billing_month,
  SUM(COALESCE(consumption, 0))::FLOAT AS monthly_consumption
 FROM water_readings
 WHERE user_id = $1
 GROUP BY billing_month
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