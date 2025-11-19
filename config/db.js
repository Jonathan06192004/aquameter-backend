import pkg from "pg";
const { Pool } = pkg;

const isRender =
  process.env.RENDER === "true" ||
  process.env.DATABASE_URL?.includes("render.com");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://aquameter_user:J2cpNXQznZllOKRSvXv5GGtxQYuzgA3z@dpg-d44qseuuk2gs73fl9e8g-a.singapore-postgres.render.com/aquameter_3fag",
  ssl: isRender ? { rejectUnauthorized: false } : false,
});

pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ DB Connection Error:", err.message));

export default pool;
