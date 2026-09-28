import { z } from "zod";

export const formSchema = z.object({
    firstname: z.string().min(1, "First name is required").trim(),
    lastname: z.string().min(1, "Last name is required").trim(),
    email: z.string().email("Invalid email address").trim().toLowerCase(),
    phone: z.string().trim().optional(),
    info: z.string().trim().optional(),
    remark: z.string().trim().optional(),
    source: z.string().trim().optional(),
    isVerified: z.boolean().optional(),
});

export type FormSchema = z.infer<typeof formSchema>;
