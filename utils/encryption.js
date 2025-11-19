import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const SECRET_KEY = process.env.ENCRYPTION_KEY || "12345678901234567890123456789012"; 
const IV_LENGTH = 16;

// 🔐 Encrypt text
export function encrypt(text) {
  if (!text) return text;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

// 🔓 Decrypt text
export function decrypt(text) {
  if (!text || !text.includes(":")) return text;

  const [ivHex, encryptedText] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
