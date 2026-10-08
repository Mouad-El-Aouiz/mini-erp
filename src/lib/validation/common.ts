import { z } from "zod";

export const entityIdSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);
export const pageNumberSchema = z.string().regex(/^[1-9][0-9]{0,3}$/)
  .default("1").transform(Number);
