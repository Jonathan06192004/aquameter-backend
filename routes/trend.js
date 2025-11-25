// aquameter-backend/routes/trend.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // ⚠️ Verify this path to your db connection
const { protect } = require('../middleware/authMiddleware'); // ⚠️ Verify this path to your middleware

// Function to construct the SQL query based on the range
const getTrendSql = (range) => {
    let interval;
    let format;
    let group_by;

    if (range === 'weekly') {
        // Daily trend for the last 7 days
        interval = '7 days';
        format = 'DY'; // Day of the week (e.g., Mon, Tue)
        group_by = `TO_CHAR(timestamp, 'DY')`;
    } else if (range === 'monthly') {
        // Weekly trend for the last 4 weeks (approximation)
        interval = '28 days';
        format = 'W'; // Week of the month
        group_by = `EXTRACT(WEEK FROM timestamp)`;
    } else if (range === 'yearly') {
        // Monthly trend for the last 12 months
        interval = '12 months';
        format = 'Mon'; // Short month name (e.g., Jan, Feb)
        group_by = `TO_CHAR(timestamp, 'Mon')`;
    } else {
        // Default to monthly if range is invalid
        interval = '1 month'; 
        format = 'DD';
        group_by = `TO_CHAR(timestamp, 'DD')`;
    }

    return `
        SELECT 
            ${group_by} AS label,
            COALESCE(SUM(consumption), 0) AS consumption_sum
        FROM water_readings
        WHERE user_id = $1 AND timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY label
        ORDER BY MIN(timestamp) ASC;
    `;
};


// 🎯 IMPLEMENT THE TREND ROUTE
// This route matches the frontend fetch: /water/trend/:user_id?range=...
router.get('/trend/:user_id', protect, async (req, res) => {
    const { user_id } = req.params;
    const { range } = req.query; // 'weekly', 'monthly', or 'yearly'

    // Simple authorization check (assuming req.user is set by protect middleware)
    if (req.user.user_id !== Number(user_id)) {
        return res.status(403).json({ success: false, message: 'Unauthorized access to user data.' });
    }
    
    try {
        const sqlQuery = getTrendSql(range);
        const result = await pool.query(sqlQuery, [user_id]);

        return res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Database Error fetching trend:', err);
        res.status(500).json({ success: false, message: 'Server error fetching water trend data.' });
    }
});

module.exports = router;