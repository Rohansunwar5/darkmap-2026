import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

// Security and production middleware
app.use(cors({
  origin: true, // Allow requests from everywhere
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware
app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  }, 30000);

  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// Routes
app.use("/api", routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
  }
});

export default app;
