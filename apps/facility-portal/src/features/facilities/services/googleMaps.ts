"use client";

import type { MapsNamespace, MapWindow, FacilityMapPoint } from "../types/facilityLocationMap";
import { centerOf } from "../utils/mapCoordinates";

export function createFacilityMap(maps: MapsNamespace, element: HTMLElement, selected: FacilityMapPoint | null, onPointChange: (point: FacilityMapPoint | null) => void) {
  const map = new maps.Map(element, {
    center: selected ? { lat: selected.latitude, lng: selected.longitude } : { lat: 20.5937, lng: 78.9629 },
    zoom: selected ? 17 : 5,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false, gestureHandling: "cooperative",
  });
  const dragListener = map.addListener("dragend", () => onPointChange(centerOf(map)));
  try {
    const clickListener = map.addListener("click", (event) => {
      if (!event?.latLng) return;
      const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      map.setCenter(point);
      onPointChange({ latitude: point.lat, longitude: point.lng });
    });
    return { map, dispose() { dragListener.remove(); clickListener.remove(); } };
  } catch (error) {
    dragListener.remove();
    throw error;
  }
}

export let mapsPromise: Promise<MapsNamespace> | null = null;

export function loadMaps(apiKey: string): Promise<MapsNamespace> {
  const browser = window as MapWindow;
  if (browser.google?.maps?.Map) return Promise.resolve(browser.google.maps);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<MapsNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      delete browser.__clinzoFacilityMapReady;
      script.remove();
      mapsPromise = null;
      reject(
        new Error(
          "The map could not load. Check the Maps JavaScript API key and try again."
        )
      );
    };
    browser.__clinzoFacilityMapReady = () => {
      delete browser.__clinzoFacilityMapReady;
      const maps = browser.google?.maps;
      if (maps?.Map) resolve(maps);
      else fail();
    };
    script.async = true;
    script.onerror = fail;
    const url = new URL("https://maps.googleapis.com/maps/api/js");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("loading", "async");
    url.searchParams.set("callback", "__clinzoFacilityMapReady");
    script.src = url.toString();
    document.head.append(script);
  });
  return mapsPromise;
}
