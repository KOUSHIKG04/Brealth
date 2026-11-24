"use client";

import { userErrorMessage } from "@startup/contracts";
import { loadMaps, createFacilityMap } from "../services/googleMaps";
import type { FacilityLocationMapProps } from "../types/facilityLocationMap";
import type {
  FacilityMapPoint,
  SearchPlace,
  MapInstance,
} from "../types/facilityLocationMap";
import { useEffect, useRef, useState } from "react";

export function useFacilityLocationMap({
  apiKey,
  selected,
  getCurrentLocation,
  onConfirm,
  onUnavailable,
  disabled = false,
}: FacilityLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const initialSelected = useRef(selected);
  const [draft, setDraft] = useState<FacilityMapPoint | null>(selected);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchPlace[]>([]);

  useEffect(() => {
    let active = true;
    let disposeMap: (() => void) | undefined;
    void loadMaps(apiKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;
        const startingPoint = initialSelected.current;
        const { map, dispose } = createFacilityMap(
          maps,
          containerRef.current,
          startingPoint,
          setDraft
        );
        disposeMap = dispose;
        mapRef.current = map;
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setMapError(userErrorMessage(cause, "The map could not load."));
        onUnavailable(true);
        setLoading(false);
      });
    return () => {
      active = false;
      disposeMap?.();
      mapRef.current = null;
    };
  }, [apiKey, onUnavailable]);

  useEffect(() => {
    if (!selected || !mapRef.current) return;
    mapRef.current.setCenter({
      lat: selected.latitude,
      lng: selected.longitude,
    });
    mapRef.current.setZoom(17);
    setDraft(selected);
  }, [selected]);

  async function useCurrentLocation() {
    setLocationError("");
    setLocating(true);
    try {
      const point = await getCurrentLocation();
      mapRef.current?.setCenter({ lat: point.latitude, lng: point.longitude });
      mapRef.current?.setZoom(17);
      setDraft(point);
    } catch (cause) {
      setLocationError(userErrorMessage(cause, "Could not get your location."));
    } finally {
      setLocating(false);
    }
  }

  async function searchAddress() {
    if (
      disabled ||
      loading ||
      mapError ||
      searching ||
      search.trim().length < 2
    )
      return;
    setSearching(true);
    setLocationError("");
    setSearchResults([]);
    try {
      const response = await fetch("/api/facility-address/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: search.trim() }),
      });
      const result = (await response.json()) as {
        places?: SearchPlace[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Address search failed.");
      setSearchResults(result.places ?? []);
      if (!result.places?.length)
        setLocationError(
          "No matching address found. Try a more complete address or move the map."
        );
    } catch (cause) {
      setLocationError(userErrorMessage(cause, "Address search failed."));
    } finally {
      setSearching(false);
    }
  }

  function chooseSearchResult(place: SearchPlace) {
    mapRef.current?.setCenter({ lat: place.latitude, lng: place.longitude });
    mapRef.current?.setZoom(17);
    setDraft({ latitude: place.latitude, longitude: place.longitude });
    setSearchResults([]);
    setSearch(place.address);
    setLocationError("");
  }

  async function confirmPin() {
    if (!draft) return;
    setConfirming(true);
    try {
      await onConfirm(draft);
    } finally {
      setConfirming(false);
    }
  }

  return {
    containerRef,
    draft,
    loading,
    locating,
    confirming,
    mapError,
    locationError,
    search,
    setSearch,
    searching,
    searchResults,
    setSearchResults,
    useCurrentLocation,
    searchAddress,
    chooseSearchResult,
    confirmPin,
  };
}
