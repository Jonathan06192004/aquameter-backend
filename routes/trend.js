// aquameter-backend/routes/trend.js
import express from 'express'; 
const router = express.Router();
import pool from '../config/db.js'; 

import { authenticateToken } from '../middleware/authMiddleware.js'; 

// Helper function to generate a complete weekly series (Sunday to Saturday)
const getTrendSqlWeekly = (user_id) => {
    // 1. Find the date of the most recent Sunday (start of the week)
    const recent_sunday = `date_trunc('week', NOW()::date)`;

    return `
        WITH date_series AS (
            -- Generate a series of 7 days starting from the most recent Sunday
            SELECT generate_series(
                ${recent_sunday},
                ${recent_sunday} + interval '6 days',
                interval '1 day'
            ) AS day
        ),
        user_consumption AS (
            -- Actual water consumption data for the user in the past 7 days
            SELECT
                DATE(timestamp) AS consumption_day,
                SUM(consumption) AS daily_consumption
            FROM water_readings
            WHERE 
                user_id = $1 
                AND DATE(timestamp) >= ${recent_sunday}
                AND DATE(timestamp) <= ${recent_sunday} + interval '6 days'
            GROUP BY 1
        )
        SELECT
            TO_CHAR(ds.day, 'DY') AS label, -- Use Day Name (Sun, Mon, etc.) as label
            COALESCE(uc.daily_consumption, 0) AS consumption_sum, -- Use 0 for missing days
            ds.day AS timestamp_sort -- Field for client-side sorting if needed
        FROM date_series ds
        LEFT JOIN user_consumption uc
        -- Join the full date series with the actual data
        ON ds.day = uc.consumption_day
        ORDER BY ds.day ASC; -- Ensure data is ordered from Sunday to Saturday
    `;
};

// Helper function to generate a complete monthly series (last 30 days)
const getTrendSqlMonthly = (user_id) => {
    const start_date = `(NOW() - INTERVAL '30 days')::date`;
    const end_date = `NOW()::date`;

    return `
        WITH date_series AS (
            SELECT generate_series(
                ${start_date},
                ${end_date},
                interval '1 day'
            ) AS day
        ),
        user_consumption AS (
            SELECT
                DATE(timestamp) AS consumption_day,
                SUM(consumption) AS daily_consumption
            FROM water_readings
            WHERE 
                user_id = $1 
                AND DATE(timestamp) >= ${start_date}
            GROUP BY 1
        )
        SELECT
            TO_CHAR(ds.day, 'DD') AS label, -- Use Day of Month (e.g., 01, 15) as label
            COALESCE(uc.daily_consumption, 0) AS consumption_sum
        FROM date_series ds
        LEFT JOIN user_consumption uc
        ON ds.day = uc.consumption_day
        ORDER BY ds.day ASC;
    `;
};

// Helper function to generate a complete yearly series (last 12 months)
const getTrendSqlYearly = (user_id) => {
    const start_date = `date_trunc('month', NOW() - INTERVAL '11 months')`;
    const end_date = `date_trunc('month', NOW())`;

    return `
        WITH month_series AS (
            SELECT generate_series(
                ${start_date},
                ${end_date},
                interval '1 month'
            ) AS month_start
        ),
        user_consumption AS (
            SELECT
                date_trunc('month', timestamp) AS consumption_month,
                SUM(consumption) AS monthly_consumption
            FROM water_readings
            WHERE 
                user_id = $1 
                AND date_trunc('month', timestamp) >= ${start_date}
            GROUP BY 1
        )
        SELECT
            TO_CHAR(ms.month_start, 'Mon') AS label, -- Use short month name (Jan, Feb, etc.)
            COALESCE(uc.monthly_consumption, 0) AS consumption_sum
        FROM month_series ms
        LEFT JOIN user_consumption uc
        ON ms.month_start = uc.consumption_month
        ORDER BY ms.month_start ASC;
    `;
};

// Function to choose the correct SQL generator
const getTrendSql = (range) => {
    if (range === 'weekly') {
        return getTrendSqlWeekly;
    } else if (range === 'monthly') {
        return getTrendSqlMonthly;
    } else if (range === 'yearly') {
        return getTrendSqlYearly;
    }
    // Default to monthly if range is invalid
    return getTrendSqlMonthly;
};


// 🎯 IMPLEMENT THE TREND ROUTE
router.get('/trend/:user_id', authenticateToken, async (req, res) => {
    const { user_id } = req.params;
    const { range } = req.query; 

    if (req.user.user_id !== Number(user_id)) {
        return res.status(403).json({ success: false, message: 'Unauthorized access to user data.' });
    }
    
    try {
        const sqlGenerator = getTrendSql(range);
        const sqlQuery = sqlGenerator(user_id); // Pass user_id to the generator if needed

        const result = await pool.query(sqlQuery, [user_id]);

        return res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Database Error fetching trend:', err);
        res.status(500).json({ success: false, message: 'Server error fetching water trend data.' });
    }
});

export default router;