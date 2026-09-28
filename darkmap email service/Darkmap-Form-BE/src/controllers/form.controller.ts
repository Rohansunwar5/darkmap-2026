import type { Request, Response } from "express";
import FormRequest from "../models/form.model.js";
import nodemailer from "nodemailer";

import { formSchema } from "../schemas/form.schema.js";

export const submitForm = async (req: Request, res: Response) => {
  try {
    console.log("=> Received form submission request");

    // Zod Validation
    const validationResult = formSchema.safeParse(req.body);

    if (!validationResult.success) {
      console.error("X => Validation failed:", JSON.stringify(validationResult.error.format(), null, 2));
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.flatten().fieldErrors
      });
    }

    const { firstname, lastname, email, phone, info, remark, source, isVerified } = validationResult.data;

    console.log(`=> Validation successful for: ${email}`);

    // Save to database
    const newRequest = await FormRequest.create({
      firstname,
      lastname,
      email,
      phone,
      info,
      remark,
      source,
      isVerified: isVerified || false,
    });

    console.log(`=> Form request saved to DB with ID: ${newRequest._id}`);

    // Send email to admin
    if (process.env.ADMIN_EMAIL) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        const mailOptions = {
          from: process.env.EMAIL_FROM, // Sender address
          to: process.env.ADMIN_EMAIL,
          subject: `New Request: ${firstname} ${lastname}`,
          text: `
New Demo Request
----------------
Name: ${firstname} ${lastname}
Email: ${email}
Phone: ${phone || "N/A"}
Source: ${source || "N/A"}
Info: ${info || "N/A"}
Remark: ${remark || "N/A"}

Sent from Darkmap Form
          `,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Arial', sans-serif; background-color: #f4f4f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background-color: #1e3a8a; padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; }
    .content { padding: 30px; color: #333333; }
    .field { margin-bottom: 20px; border-bottom: 1px solid #eeeeee; padding-bottom: 10px; }
    .label { font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; display: block; }
    .value { font-size: 16px; font-weight: 500; color: #111111; }
    .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #666666; border-top: 1px solid #eeeeee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Demo Request</h1>
    </div>
    <div class="content">
      <div class="field">
        <span class="label">Full Name</span>
        <div class="value">${firstname} ${lastname}</div>
      </div>
      <div class="field">
        <span class="label">Email Address</span>
        <div class="value"><a href="mailto:${email}" style="color: #1e3a8a; text-decoration: none;">${email}</a></div>
      </div>
      <div class="field">
        <span class="label">Phone Number</span>
        <div class="value">${phone || "Not Provided"}</div>
      </div>
      <div class="field">
        <span class="label">Referral Source</span>
        <div class="value">${source || "Not Provided"}</div>
      </div>
      <div class="field">
        <span class="label">Additional Info</span>
        <div class="value">${info || "No additional info"}</div>
      </div>
      <div class="field">
        <span class="label">Message/Remark</span>
        <div class="value">${remark || "No remarks provided"}</div>
      </div>
    </div>
    <div class="footer">
      <p>This request was sent securely from the Darkmap website.</p>
      <p>&copy; ${new Date().getFullYear()} Darkmap. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`=> Email notification sent to ${process.env.ADMIN_EMAIL}`);
      } catch (emailError) {
        console.error("X => Failed to send email notification:", emailError);
        // Continue, don't fail the request just because email failed
      }
    }

    res.status(200).json({ message: "Form submitted successfully", id: newRequest._id });
  } catch (error) {
    console.error("Error processing form submission:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
