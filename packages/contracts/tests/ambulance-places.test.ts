import { expect, test } from "bun:test";
import {
  isHospital,
  normalizeHospital,
} from "../../../supabase/functions/ambulance-hospitals/places";

const point = { latitude: 12.9, longitude: 77.5 };

const hospital = {
  id: "FixturePlaceId",
  displayName: { text: "Real provider result" },
  formattedAddress: "Provider street address",
  location: point,
  types: ["hospital"],
  businessStatus: "OPERATIONAL",
};

test("only hospital/clinic results qualify, closed places and other businesses do not", () => {
  expect(isHospital(hospital)).toBe(true);
  expect(isHospital({ ...hospital, types: ["doctor"] })).toBe(true);
  expect(isHospital({ ...hospital, types: ["restaurant"] })).toBe(false);
  expect(
    isHospital({ ...hospital, businessStatus: "CLOSED_PERMANENTLY" })
  ).toBe(false);
  expect(isHospital(null)).toBe(false);
});

test("provider result coordinates and attribution remain separate from Clinzo IDs", () => {
  const result = normalizeHospital(
    {
      ...hospital,
      attributions: [
        { provider: "Provider", providerUri: "https://example.com" },
      ],
    },
    point
  )!;
  expect(result.source).toBe("google");
  expect(result.id).toBe("google:FixturePlaceId");
  expect(result.place_id).toBe("FixturePlaceId");
  expect(result.distance_meters).toBe(0);
  expect(result.attributions[0].uri).toBe("https://example.com");
  expect(
    normalizeHospital(
      { ...hospital, location: { latitude: NaN, longitude: 77 } },
      point
    )
  ).toBeNull();
  expect(
    normalizeHospital({ ...hospital, id: "../invalid" }, point)
  ).toBeNull();
});

import { normalizeMapPlace } from "../../../supabase/functions/search-map-places/places";

test("location search maps address components without treating a division as a neighbourhood", () => {
  const result = normalizeMapPlace({
    id: "Place",
    formattedAddress: "Actual address",
    location: point,
    addressComponents: [
      { longText: "City", types: ["locality"] },
      {
        longText: "Bengaluru Division",
        types: ["administrative_area_level_2"],
      },
      { longText: "Karnataka", types: ["administrative_area_level_1"] },
      { longText: "560001", types: ["postal_code"] },
    ],
  })!;
  expect(result.city).toBe("City");
  expect(result.locality).toBe("");
  expect(result.pincode).toBe("560001");
  expect(
    normalizeMapPlace({
      id: "bad",
      formattedAddress: "Bad address",
      location: { latitude: Infinity, longitude: 77 },
    })
  ).toBeNull();
});
