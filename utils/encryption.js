import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

// 32 chars required → yours is OK as fallback
const SECRET_KEY =
  process.env.ENCRYPTION_KEY ||
  "12345678901234567890123456789012"; 

const IV_LENGTH = 16;

// =====================================
// 🔍 Detect if value is already encrypted
// =====================================
export function isEncrypted(text) {
  return (
    typeof text === "string" &&
    text.startsWith("enc:") &&
    text.includes(":") &&
    text.split(":").length === 3 // enc:iv:encrypted
  );
}

// =====================================
// 🔐 Encrypt (adds "enc:" prefix)
// =====================================
export function encrypt(text) {
  if (!text) return text;
  if (isEncrypted(text)) return text; // prevent double-encryption

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `enc:${iv.toString("hex")}:${encrypted}`;
}

// =====================================
// 🔓 Decrypt (only decrypt if truly encrypted)
// =====================================
export function decrypt(text) {
  if (!isEncrypted(text)) return text; // skip plain values

  try {
    const [, ivHex, encryptedText] = text.split(":");

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(SECRET_KEY),
      iv
    );

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("❌ Decrypt error:", err);
    return text; // fallback → don't crash app
  }
}
