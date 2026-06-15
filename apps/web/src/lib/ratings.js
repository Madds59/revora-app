import { z } from "zod";

export const RATING_VALUES = [1, 2, 3, 4, 5];

export const businessRatingInputSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  review: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value?.length ? value : undefined)),
});

export function summarizeRatings(rows) {
  const count = rows.length;
  if (count === 0) {
    return {
      average: 0,
      count,
      roundedAverage: 0,
    };
  }

  const total = rows.reduce((sum, row) => sum + Number(row.rating ?? 0), 0);
  const average = total / count;
  return {
    average,
    count,
    roundedAverage: Number(average.toFixed(1)),
  };
}
