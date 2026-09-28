import { Router } from "express";
import { submitForm } from "../controllers/form.controller.js";
import { sendOTP, verifyOTP } from "../controllers/otp.controller.js";
import { rateLimit } from "express-rate-limit";

const router = Router();

const otpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 3, // Limit each IP to 3 OTP requests per `window` (here, per minute)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many OTP requests from this IP, please try again after a minute"
});

const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 5, // Limit each IP to 5 submissions per hour
    message: "Too many form submissions, please try again later"
});

router.post("/send-otp", otpLimiter, sendOTP);
router.post("/verify-otp", verifyOTP);

router.post("/submit-form", submitLimiter, submitForm);
router.post("/requestDemo", submitLimiter, submitForm);

export default router;
