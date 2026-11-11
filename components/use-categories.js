"use client";

import { useCallback, useEffect, useState } from "react";
import { api, toApiError } from "@/lib/api-client";

// Loads the read-only category list (OD-19) once the session is ready.
// state.status: "idle" | "loading" | "ready" | "error"
export function useCategories(enabled, onAuthError) {
  const [state, setState] = useState({ status: "idle", categories: [], error: null });

  const load = useCallback(async () => {
    setState({ status: "loading", categories: [], error: null });
    try {
      const { data } = await api.get("/categories");
      setState({ status: "ready", categories: data.categories, error: null });
    } catch (error) {
      const apiError = toApiError(error);
      onAuthError?.(apiError);
      setState({ status: "error", categories: [], error: apiError });
    }
  }, [onAuthError]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { ...state, reload: load };
}
