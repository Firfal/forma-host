import { z } from "zod";
import { certificateNameError, type IssueCertificateInput } from "./certificates";

/** Demande de certificat (callable issueCertificate). */
export const issueCertificateInput: z.ZodType<IssueCertificateInput> = z.object({
  courseId: z.string().min(1).max(128),
  name: z
    .string()
    .trim()
    .superRefine((name, ctx) => {
      const error = certificateNameError(name);
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
});
