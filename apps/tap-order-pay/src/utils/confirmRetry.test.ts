import { pollConfirm, type ConfirmResponse } from "@even/payments";
import { describe, expect, it, vi } from "vitest";
import { isTopConfirmRetryable } from "./confirmRetry";

const clock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
};

const CASES: Array<[string, ConfirmResponse<unknown>, boolean]> = [
  ["confirm_in_progress", { success: false, code: "confirm_in_progress", status: 409 }, true],
  ["confirm_conflict", { success: false, code: "confirm_conflict", status: 409 }, true],
  ["red caída (sin status)", { success: false }, true],
  ["429", { success: false, status: 429 }, true],
  ["500", { success: false, status: 500 }, true],
  ["503", { success: false, status: 503 }, true],
  ["402 payment_required", { success: false, code: "payment_required", status: 402 }, false],
  ["404 order_not_found", { success: false, code: "order_not_found", status: 404 }, false],
  ["409 payment_amount_mismatch", { success: false, code: "payment_amount_mismatch", status: 409 }, false],
  ["400", { success: false, status: 400 }, false],
  ["499", { success: false, status: 499 }, false],
];

describe("isTopConfirmRetryable (Tap Order & Pay: superconjunto de confirm_in_progress)", () => {
  it.each(CASES)("%s -> %s", (_name, result, expected) => {
    expect(isTopConfirmRetryable(result)).toBe(expected);
  });

  it.each(CASES)("con pollConfirm: %s reintenta = %s", async (_name, result, expected) => {
    const confirm = vi
      .fn<() => Promise<ConfirmResponse<unknown>>>()
      .mockResolvedValueOnce(result)
      .mockResolvedValue({ success: true, data: { order: { id: "o1" } } });
    await pollConfirm(confirm, { ...clock(), isConfirmRetryable: isTopConfirmRetryable });
    expect(confirm).toHaveBeenCalledTimes(expected ? 2 : 1);
  });
});
