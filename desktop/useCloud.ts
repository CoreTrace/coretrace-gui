import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, errorMessage } from "./bridge";
import type { Installation, Job, Limits, Me, Repository, Tool } from "./types";

interface Data {
  limits: Limits | null;
  jobs: Job[];
  repositories: Repository[];
  tools: Tool[];
}
const empty = (): Data => ({
  limits: null,
  jobs: [],
  repositories: [],
  tools: [],
});
export function useCloud() {
  const [me, setMe] = useState<Me | null>(null);
  const [org, setOrg] = useState("");
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const epoch = useRef(0);
  const reconnect = useCallback(async () => {
    const status = await desktop.status();
    setBaseUrl(status.baseUrl);
    if (status.signedIn) {
      const identity = await desktop.readCloud<Me>("me");
      setMe(identity);
      setOrg((previous) =>
        identity.orgs.some((o) => o.slug === previous)
          ? previous
          : (identity.orgs[0]?.slug ?? ""),
      );
    } else {
      setMe(null);
      setOrg("");
    }
  }, []);
  useEffect(() => {
    void reconnect().catch((e) => setError(errorMessage(e)));
  }, [reconnect]);
  const refresh = useCallback(async () => {
    const current = ++epoch.current;
    if (!me || !org) {
      setData(empty());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const results = await Promise.allSettled([
        desktop.readCloud<Limits>("limits", org),
        desktop.readCloud<Job[]>("jobs", org),
        desktop
          .readCloud<Installation[]>("installations", org)
          .then(async (installs) => {
            const repos = await Promise.all(
              installs
                .filter(
                  (i) =>
                    i.provider === "github" && i.provider_host === "github.com",
                )
                .map(async (i) => {
                  const rows = await desktop.readCloud<Repository[]>(
                    "repositories",
                    org,
                    i.id,
                  );
                  return rows.map((row) => ({ ...row, installation: i.id }));
                }),
            );
            return repos.flat();
          }),
        desktop.readCloud<Tool[]>("tools", org),
      ] as const);
      if (current !== epoch.current) return;
      const [limits, jobs, repositories, tools] = results;
      setData({
        limits: limits.status === "fulfilled" ? limits.value : null,
        jobs:
          jobs.status === "fulfilled"
            ? jobs.value.sort(
                (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
              )
            : [],
        repositories:
          repositories.status === "fulfilled" ? repositories.value : [],
        tools: tools.status === "fulfilled" ? tools.value : [],
      });
      setError(
        results
          .flatMap((r) =>
            r.status === "rejected" ? [errorMessage(r.reason)] : [],
          )
          .join(" · "),
      );
    } finally {
      if (current === epoch.current) setLoading(false);
    }
  }, [me, org]);
  useEffect(() => {
    setData(empty());
    void refresh();
    return () => {
      epoch.current++;
    };
  }, [refresh]);
  const signOut = async () => {
    epoch.current++;
    setMe(null);
    setOrg("");
    setData(empty());
    await desktop.logout();
  };
  return {
    me,
    org,
    setOrg,
    ...data,
    loading,
    error,
    baseUrl,
    refresh,
    reconnect,
    signOut,
  };
}
export type CloudModel = ReturnType<typeof useCloud>;
