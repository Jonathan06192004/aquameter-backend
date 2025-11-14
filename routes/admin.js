const express = require("express");
const router = express.Router();
const pool = require("../db");  // adjust path if needed

// Get total users
router.get("/users/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM users");
        res.json({ total_users: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get total devices
router.get("/devices/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM smart_device");
        res.json({ total_devices: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all users
router.get("/users", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users ORDER BY user_id");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all devices
router.get("/devices", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM smart_device ORDER BY device_id");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
