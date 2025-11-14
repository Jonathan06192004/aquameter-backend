import express from "express";
import pool from "../index.js"; // your index.js exports the pool

const router = express.Router();

/* =====================================================
   📌 TOTAL COUNTS
===================================================== */

// Total users
router.get("/users/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM users");
        res.json({ total_users: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Total devices
router.get("/devices/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM smart_device");
        res.json({ total_devices: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   📌 USERS LIST (GET ALL USERS)
===================================================== */
router.get("/users", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT user_id, username, email, first_name, last_name FROM users ORDER BY user_id"
        );
        res.json({ success: true, users: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   📌 DEVICES LIST (GET ALL DEVICES)
===================================================== */
router.get("/devices", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM smart_device ORDER BY device_id"
        );
        res.json({ success: true, devices: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ✏️ UPDATE USER (EDIT USER)
   PUT /admin/users/:id
===================================================== */
router.put("/users/:id", async (req, res) => {
    const { id } = req.params;
    const { username, email, first_name, last_name } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users 
             SET username = $1, email = $2, first_name = $3, last_name = $4 
             WHERE user_id = $5 
             RETURNING *`,
            [username, email, first_name, last_name, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, user: result.rows[0] });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ❌ DELETE USER
   DELETE /admin/users/:id
===================================================== */
router.delete("/users/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query("DELETE FROM users WHERE user_id = $1", [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, message: "User deleted successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   🚀 EXPORT ROUTER
===================================================== */
export default router;
