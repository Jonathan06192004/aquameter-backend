import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

// 🔌 Config
import pool from "./config/db.js";      // MAKE SURE db.js exports: export default pool;
import upload from "./config/multer.js";

// 🧩 Routes
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import homeRoutes from "./routes/home.js";
import profileRoutes from "./routes/profile.js";
import waterBillRoutes from "./routes/waterbill.js";
import deviceRoutes from "./routes/device.js";
import notificationRoutes from "./routes/notifications.js";

const app = express();

/* ==========================
 🛠 Middleware
========================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ==========================
 📂 Static Upload Directory
========================== */
const __dirname = path.resolve();
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

/* ==========================
 🏁 Root Check Route
========================== */
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "🌊 AquaMeter Backend is Running!",
    });
});

/* ==========================
 📌 API ROUTES
========================== */
app.use("/api/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/home", homeRoutes);
app.use("/profile", profileRoutes(upload));   // upload instance passed here
app.use("/water", waterBillRoutes);
app.use("/device", deviceRoutes);
app.use("/notifications", notificationRoutes);

/* ==========================
 🚫 404 Handler
========================== */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route not found",
    });
});

/* ==========================
 🚀 Start Server
========================== */
const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
});

export default app;  // <— Optional but clean, no conflict with pool
