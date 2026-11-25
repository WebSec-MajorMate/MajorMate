import { z } from "zod";

const activityUrlSchema = z.string().max(3000).pipe(
  z.url({ protocol: /^https?$/, hostname: z.regexes.domain }),
);

export const profileActivityIdSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const activityFavoriteSchema = z.strictObject({
  url: activityUrlSchema,
  selected: z.boolean(),
});

export const profileActivitySelectionSchema = z.strictObject({
  url: activityUrlSchema,
  editId: profileActivityIdSchema.nullable(),
});
