import { normalizeAddress } from "@/lib/address";

describe("Address normalization", () => {
  test("uppercases and normalizes suffixes", () => {
    expect(normalizeAddress("123 Main Street")).toBe("123 MAIN ST");
    expect(normalizeAddress("456 Oak Avenue, Apt 2")).toBe("456 OAK AVE APT 2");
  });

  test("collapses whitespace and removes punctuation", () => {
    expect(normalizeAddress("789  Elm   Road.")).toBe("789 ELM RD");
  });

  test("handles directionals", () => {
    expect(normalizeAddress("100 North Maple Drive")).toBe("100 N MAPLE DR");
  });
});
