import express from "express";
import pool from "../index.js"; // your index.js exports the pool

const router = express.Router();

// ==========================
// 📌 Total Users Count
// ==========================
router.get("/users/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM users");
        res.json({ total_users: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================
// 📌 Total Devices Count
// ==========================
router.get("/devices/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM smart_device");
        res.json({ total_devices: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================
// 📌 Get All Users
// ==========================
router.get("/users", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users ORDER BY user_id");
        res.json({ success: true, users: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================
// 📌 Get All Devices
// ==========================
router.get("/devices", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM smart_device ORDER BY device_id");
        res.json({ success: true, devices: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================
// 🚀 Export Default (required for ESM)
// ==========================
export default router;
