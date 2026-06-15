import assert from "node:assert/strict";
import test from "node:test";

import {
  businessRatingInputSchema,
  RATING_VALUES,
  summarizeRatings,
} from "../src/lib/ratings.js";

test("rating helper exposes the expected 1-5 values", () => {
  assert.deepEqual(RATING_VALUES, [1, 2, 3, 4, 5]);
});

test("summarizeRatings computes average and count", () => {
  const summary = summarizeRatings([{ rating: 4 }, { rating: 5 }, { rating: 3 }]);
  assert.equal(summary.count, 3);
  assert.equal(summary.average, 4);
  assert.equal(summary.roundedAverage, 4);
});

test("summarizeRatings handles empty inputs", () => {
  assert.deepEqual(summarizeRatings([]), {
    average: 0,
    count: 0,
    roundedAverage: 0,
  });
});

test("businessRatingInputSchema validates rating bounds and trims review text", () => {
  const parsed = businessRatingInputSchema.parse({
    businessId: "11111111-1111-4111-8111-111111111111",
    customerId: "22222222-2222-4222-8222-222222222222",
    rating: "5",
    review: "  Great work  ",
  });

  assert.equal(parsed.rating, 5);
  assert.equal(parsed.review, "Great work");
});

test("businessRatingInputSchema rejects ratings outside 1..5", () => {
  assert.throws(
    () =>
      businessRatingInputSchema.parse({
        businessId: "11111111-1111-4111-8111-111111111111",
        customerId: "22222222-2222-4222-8222-222222222222",
        rating: "7",
      }),
    /expected number to be <=5|greater than or equal to 1|Too big/i,
  );
});
