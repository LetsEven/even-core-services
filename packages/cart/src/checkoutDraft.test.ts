import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCheckoutDraft,
  readCheckoutDraft,
  writeCheckoutDraft,
} from "./checkoutDraft";

describe("checkoutDraft", () => {
  beforeEach(() => clearCheckoutDraft());

  it("devuelve lo guardado solo para el mismo scope", () => {
    writeCheckoutDraft({
      scope: "1",
      tipPercentage: 15,
      customTip: "",
      showCustomTipInput: false,
    });
    expect(readCheckoutDraft("1")?.tipPercentage).toBe(15);
    expect(readCheckoutDraft("2")).toBeNull();
    expect(readCheckoutDraft(undefined)).toBeNull();
  });

  it("clear lo descarta", () => {
    writeCheckoutDraft({ scope: "1", tipPercentage: 0, customTip: "5", showCustomTipInput: true });
    clearCheckoutDraft();
    expect(readCheckoutDraft("1")).toBeNull();
  });
});
