import { describe, expect, it } from "vitest";
import { buildMpesaStkRequestFields } from "@/lib/mpesa-stk-routing";

describe("buildMpesaStkRequestFields", () => {
  it("routes bank accounts through CustomerPayBillOnline", () => {
    expect(
      buildMpesaStkRequestFields(
        {
          accountType: "bank",
          bank: "522522",
          bankAccount: "1234567890",
        },
        "INV-001"
      )
    ).toEqual({
      transactionType: "CustomerPayBillOnline",
      partyB: "522522",
      accountReference: "1234567890",
    });
  });

  it("routes paybill accounts with the payment reference", () => {
    expect(
      buildMpesaStkRequestFields(
        {
          accountType: "paybill",
          paybillNumber: "400200",
        },
        "TEN-42"
      )
    ).toEqual({
      transactionType: "CustomerPayBillOnline",
      partyB: "400200",
      accountReference: "TEN-42",
    });
  });

  it("routes till accounts through CustomerBuyGoodsOnline", () => {
    expect(
      buildMpesaStkRequestFields(
        {
          accountType: "till",
          buyGoodsNumber: "K123456",
        },
        "BOOK-9"
      )
    ).toEqual({
      transactionType: "CustomerBuyGoodsOnline",
      partyB: "K123456",
      accountReference: "BOOK-9",
    });
  });
});
