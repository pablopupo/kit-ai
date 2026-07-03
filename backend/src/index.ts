import "dotenv/config";
import cors from "cors";
import express from "express";
import routes from "./routes.js";
// @ts-ignore
import { connectDB, ensureMeta } from "./db.js";
// @ts-ignore
import medicalRoutes from "./routes/medical.js";
// @ts-ignore
import ttsRoutes from "./routes/tts.js";

const app = express();
const port = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

// Legacy/Gemini routes
app.use(routes);
// Team MongoDB routes
app.use("/api/medical", medicalRoutes);
// TTS routes
app.use("/api/tts", ttsRoutes);

async function start() {
  try {
    // Server starts even if this fails, so offline-only mode still works without Mongo.
    console.log("Connecting to MongoDB...");
    await connectDB();
    await ensureMeta();
    console.log("MongoDB Connected.");
  } catch (e) {
    console.error("MongoDB connection failed (continuing without DB):", e);
  }

  app.listen(port, () => {
    console.log(`Kit AI Backend listening on port ${port}`);
  });
}

start();
