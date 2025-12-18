import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * ------------------------------------------------------
 * Route 1: Get Estimated Water Bill Records (UNCHANGED)
 * ------------------------------------------------------
 */
router.get("/bill/:user_id", authenticateToken, async (req, res) => {
    const { user_id } = req.params;

    try {
        const q = `
            SELECT 
                MAX(wb.bill_id) AS bill_id,
                wb.period_start,
                wb.period_end,
                MAX(wb.due_date) AS due_date,
                SUM(wb.amount_to_pay)::FLOAT AS amount_to_pay,
                SUM(wc.consumption)::FLOAT AS total_consumption
            FROM estimated_water_bill wb
            LEFT JOIN water_readings wc 
                ON wb.reading_id = wc.reading_id
            WHERE wb.user_id = $1
            GROUP BY wb.period_start, wb.period_end
            ORDER BY wb.period_end DESC
        `;

        const result = await pool.query(q, [user_id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ Estimated bill error:", err.message);
        res.status(500).json({ success: false });
    }
});

/**
 * ------------------------------------------------------
 * Route 2: ROW-BASED Consumption (UPDATED)
 * ------------------------------------------------------
 * - Each row = one water_readings entry
 * - Latest reading first
 * - NO monthly grouping
 */
router.get("/readings/:user_id", authenticateToken, async (req, res) => {
    const { user_id } = req.params;

    try {
        const q = `
            SELECT
                reading_id,
                consumption,
                timestamp
            FROM water_readings
            WHERE user_id = $1
            ORDER BY timestamp DESC, reading_id DESC
        `;

        const result = await pool.query(q, [user_id]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ Readings error:", err.message);
        res.status(500).json({ success: false });
    }
});

/**
 * ------------------------------------------------------
 * Route 3: Latest Meter Reading (UNCHANGED)
 * ------------------------------------------------------
 */
router.get("/latest-reading/:user_id", authenticateToken, async (req, res) => {
    const { user_id } = req.params;

    try {
        const q = `
            SELECT reading_5digit, timestamp
            FROM water_readings
            WHERE user_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
        `;

        const result = await pool.query(q, [user_id]);

        if (result.rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("❌ Latest reading error:", err.message);
        res.status(500).json({ success: false });
    }
});

export default router;
