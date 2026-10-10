import { z } from "zod";

export const createMemberSchema = z.strictObject({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
});
export const updateMemberSchema = z.strictObject({
  version: z.number().int().min(1).max(2_147_483_646),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  isActive: z.boolean(),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
