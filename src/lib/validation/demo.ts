import { z } from "zod";

export const demoSignupSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(12).max(128),
  consent: z.literal(true),
});
export type DemoSignupInput = z.infer<typeof demoSignupSchema>;
