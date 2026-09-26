// Vercel's Express entry point. Local development uses server/index.js.
import express from "express";
import { app, prepare } from "./server/app.js";

const handler = express();
handler.get("/", (req, res) => res.redirect(302, "/index.html"));
let ready;
handler.use(async (req, res, next) => {
  try {
    await (ready ??= prepare().catch((error) => {
      ready = undefined;
      throw error;
    }));
    next();
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    res
      .status(503)
      .json({
        error: "The database is not configured. Please contact the teacher.",
      });
  }
});
handler.use(app);
export default handler;
