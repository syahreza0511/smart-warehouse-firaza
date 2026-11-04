"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, requiresLogin, toApiError } from "@/lib/api-client";

// Loads the signed-in user from GET /api/v1/auth/session. Sends the user to
// /login when the API says the session is missing or no longer authorized;
// network and server errors are shown instead, never treated as a logout.
//
// state.status: "loading" | "ready" | "redirecting" | "error"
export function useSession() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ status: "loading", user: null, error: null });

  const load = useCallback(async () => {
    setState({ status: "loading", user: null, error: null });
    try {
      const { data } = await api.get("/auth/session");
      setState({ status: "ready", user: data.user, error: null });
    } catch (error) {
      const apiError = toApiError(error);
      if (requiresLogin(apiError)) {
        setState({ status: "redirecting", user: null, error: apiError });
        redirectToLogin(router, pathname, apiError);
      } else {
        setState({ status: "error", user: null, error: apiError });
      }
    }
  }, [router, pathname]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export function redirectToLogin(router, pathname, apiError) {
  const params = new URLSearchParams({ next: pathname });
  if (apiError?.code === "SESSION_NOT_AUTHORIZED") {
    params.set("reason", "session");
  }
  router.replace(`/login?${params.toString()}`);
}
