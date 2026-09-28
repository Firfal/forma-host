import { z } from "zod";
import type { SetCommunityInput } from "./community";

export const setCommunityInput: z.ZodType<SetCommunityInput> = z.object({
  schoolId: z.string().min(1).max(128),
  enabled: z.boolean(),
});
