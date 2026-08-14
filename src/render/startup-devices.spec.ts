import {
  getStartupImageKey,
  getStartupImageName,
  startupDevices,
} from "./startup-devices";

describe("startupDevices", () => {
  it("lists only unique dimension and ratio combinations", () => {
    const seen = startupDevices.map(getStartupImageName);

    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("getStartupImageName", () => {
  it("multiplies the logical size by the pixel ratio", () => {
    expect(getStartupImageName({ width: 390, height: 844, ratio: 3 })).toBe(
      "1170x2532",
    );
  });
});

describe("getStartupImageKey", () => {
  /* The site's manifest builds the same string from its own copy of the
     device list. If these ever disagree, it advertises images that were
     never produced. */
  it("matches the path the site's manifest advertises", () => {
    expect(
      getStartupImageKey("cv", { width: 375, height: 667, ratio: 2 }),
    ).toBe("startup-cv-750x1334.png");
  });
});
