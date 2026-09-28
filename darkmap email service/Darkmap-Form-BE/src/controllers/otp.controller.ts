import type { Request, Response } from "express";
import OTP from "../models/otp.model.js";
import nodemailer from "nodemailer";
import { z } from "zod";

const otpRequestSchema = z.object({
    email: z.string().email(),
});

const verifyOtpSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6),
});

export const sendOTP = async (req: Request, res: Response) => {
    try {
        const validation = otpRequestSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({ error: "Invalid email address" });
        }

        const { email } = validation.data;

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save to DB (upsert)
        await OTP.deleteMany({ email }); // Clear invalid/old OTPs for this email
        await OTP.create({ email, otp });

        // Send Email
        if (process.env.SMTP_USER) {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || "587"),
                secure: process.env.SMTP_SECURE === "true",
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            const mailOptions = {
                from: process.env.EMAIL_FROM || '"Darkmap" <noreply@darkmap.com>',
                to: email,
                subject: "Your Verification Code - Darkmap",
                text: `Your verification code is: ${otp}. It expires in 5 minutes.`,
                html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
    <div style="background-color: #1e3a8a; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0;">Verification Code</h2>
    </div>
    <div style="padding: 30px; text-align: center;">
        <p style="font-size: 16px; color: #333;">Use the following code to verify your email address:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e3a8a; margin: 20px 0;">${otp}</div>
        <p style="font-size: 14px; color: #666;">This code expires in 5 minutes.</p>
    </div>
</div>
                `,
            };

            await transporter.sendMail(mailOptions);
        }

        res.status(200).json({ message: "OTP sent successfully" });

    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const verifyOTP = async (req: Request, res: Response) => {
    try {
        const validation = verifyOtpSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({ error: "Invalid input" });
        }

        const { email, otp } = validation.data;

        // Find OTP
        const record = await OTP.findOne({ email, otp });

        if (!record) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        // Setup for verification (optional: verify once and delete, or keep for session)
        // For this flow, we will delete it to prevent reuse
        await OTP.deleteOne({ _id: record._id });

        res.status(200).json({ message: "Email verified successfully" });

    } catch (error) {
        console.error("Error verifying OTP:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
