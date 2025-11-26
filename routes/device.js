import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Fetch device(s) and calculate real-time status */
router.get("/:user_id", authenticateToken, async (req, res) => {
    // NOTE: Changed parameter to user_id for consistency
    const { user_id } = req.params; 

    try {
        // ⭐ MODIFIED QUERY to calculate device status based on last reading time
        const q = `
            WITH latest_reading AS (
                -- Find the maximum (most recent) timestamp for all water readings
                SELECT 
                    device_id, 
                    MAX(timestamp) AS last_timestamp
                FROM 
                    water_readings
                GROUP BY 
                    device_id
            )
            SELECT 
                sd.device_id,
                sd.device_serial,
                sd.location,
                sd.installed_at,
                lr.last_timestamp,
                CASE
                    -- If a timestamp exists AND the time difference between NOW() and the last reading is less than 180 seconds (3 minutes)
                    WHEN lr.last_timestamp IS NOT NULL 
                    AND EXTRACT(EPOCH FROM (NOW() - lr.last_timestamp)) < 180
                    THEN 'Active' -- Corresponds to "Online" on frontend
                    ELSE 'Offline' -- Corresponds to "Offline" on frontend
                END as device_status
            FROM 
                smart_device sd
            -- LEFT JOIN to include devices even if they have no readings yet
            LEFT JOIN 
                latest_reading lr ON sd.device_id = lr.device_id
            WHERE 
                sd.user_id = $1;
        `;

        const result = await pool.query(q, [user_id]);

        // Note: The device_status column from the smart_device table is no longer needed 
        // as it is now calculated and overwritten by the CASE statement in the query.

        res.json({ success: true, devices: result.rows });
    } catch (err) {
        console.error("❌ Device fetch error:", err.message);
        res.status(500).json({ success: false, error: "Server error fetching device status" });
    }
});

/* Register new device */
router.post("/register", authenticateToken, async (req, res) => {
    const { user_id, device_serial, location } = req.body;

    if (!user_id || !device_serial || !location)
        return res.status(400).json({ success: false, message: "Missing fields" });

    try {
        // NOTE: New device is set to 'Active' status upon registration
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
        // This endpoint can technically be ignored now for real-time status 
        // since the GET route dynamically calculates it. 
        // However, it remains for legacy or manual updates.
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