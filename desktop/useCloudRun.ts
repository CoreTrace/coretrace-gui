import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, errorMessage, native } from "./bridge";
import type { CloudPhase } from "./types";

const IDLE: CloudPhase = { phase: "idle" };

/** Phases where something is happening and the reader may want out. */
export function running(phase: CloudPhase): boolean {
  return (
    phase.phase === "packing" ||
    phase.phase === "uploading" ||
    phase.phase === "verifying" ||
    phase.phase === "quoting" ||
    phase.phase === "running"
  );
}

export type CloudRunModel = {
  phase: CloudPhase;
  /** Seconds since the current phase began. */
  seconds: number;
  busy: boolean;
  start: (workspace: string, org: string) => Promise<void>;
  approve: (org: string) => Promise<void>;
  cancel: () => Promise<void>;
};

/**
 * The one cloud run the application has, wherever it was started from.
 *
 * It lives above the pages because a run outlives the panel that began it: the
 * reader starts one from the editor and expects to be told its price and its
 * result there, not to go looking for the tab that owns it.
 */
export function useCloudRun({
  notify,
  onFinished,
}: {
  notify: (message: string) => void;
  /** Called once per run, when its results are ready to be opened. */
  onFinished: (job: string) => void;
}): CloudRunModel {
  const [phase, setPhase] = useState<CloudPhase>(IDLE);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(Date.now());
  // Runs already announced. A run finishes once, however many times the status
  // is polled afterwards.
  const announced = useRef(new Set<string>());
  const finished = useRef(onFinished);
  finished.current = onFinished;

  const poll = useCallback(async () => {
    try {
      setPhase(await desktop.cloudRunStatus());
    } catch {
      // A status that cannot be read is not worth interrupting the run for.
    }
  }, []);

  useEffect(() => {
    if (!native) return;
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (!running(phase)) {
      setSeconds(0);
      startedAt.current = Date.now();
      return;
    }
    // Animations may be switched off system-wide, and then nothing can turn. A
    // count that ticks every second is motion the reader can trust: it is the
    // real elapsed time, not decoration.
    const tick = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, [phase]);

  useEffect(() => {
    if (phase.phase === "done" && !announced.current.has(phase.job)) {
      announced.current.add(phase.job);
      finished.current(phase.job);
    }
  }, [phase]);

  const guard = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
      } catch (e) {
        notify(errorMessage(e));
      } finally {
        setBusy(false);
        await poll();
      }
    },
    [notify, poll],
  );

  return {
    phase,
    seconds,
    busy,
    start: (workspace, org) =>
      guard(() => desktop.startCloudRun(workspace, org)),
    approve: (org) => guard(() => desktop.confirmCloudRun(org)),
    cancel: () => guard(() => desktop.cancelCloudRun()),
  };
}
