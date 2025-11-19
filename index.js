import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import http from "http";
import { Server } from "socket.io";

// 🔌 Config
import pool from "./config/db.js";
import upload from "./config/multer.js";

// Routes
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import homeRoutes from "./routes/home.js";
import profileRoutes from "./routes/profile.js";
import waterBillRoutes from "./routes/waterbill.js";
import deviceRoutes from "./routes/device.js";
import notificationRoutes from "./routes/notifications.js";

const app = express();
const server = http.createServer(app);

// ========== SOCKET.IO SERVER ==========
const io = new Server(server, {
  cors: { origin: "*" },
});

// Store io globally so routes can emit events
app.set("socketio", io);

io.on("connection", (socket) => {
  console.log("🟢 WebSocket client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

// ======================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload directory
const __dirnameResolved = path.resolve();
const uploadDir = path.join(__dirnameResolved, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

// Root
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🌊 AquaMeter Backend is Running!",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/home", homeRoutes);
app.use("/profile", profileRoutes(upload));
app.use("/water", waterBillRoutes);
app.use("/device", deviceRoutes);
app.use("/notifications", notificationRoutes);

// ❌ REMOVE THIS!
// app.use("/api/users", privacyRoutes); // DELETE — not used in Option B

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Start server WITH WebSocket
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 WebSocket active`);
});

export default app;
