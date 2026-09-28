import { Router } from "express";
import { healthCheck } from "../controllers/health.controller.js";
import formRoutes from "./form.routes.js";

const router = Router();

router.get("/health", healthCheck);
router.use("/", formRoutes);

export default router;
