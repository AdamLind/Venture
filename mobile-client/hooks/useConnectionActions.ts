// hooks/useConnectionActions.ts
// What you can do with a connection (#35), from their sheet
// (components/connections/ConnectionSheet.tsx): make them your person or
// unlink them, forget (or forget and block) them, report them. Shared by
// Connections and Profile (your partner's photo opens their sheet there).

import {useCallback} from "react";
import Toast from "@/src/lib/toast";
import type {SheetAction} from "@/components/connections/ConnectionSheet";
import {type Connection, endPartner, forgetConnection, requestPartner} from "@/src/lib/connections";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";
import {usePartnerDatesStore} from "@/src/store/usePartnerDatesStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import {choose, confirm} from "@/src/lib/sheets";
import {showError} from "@/src/lib/notify";
import {reportPerson} from "@/src/lib/reportPerson";

const toast = (text1: string, type: "success" | "error" = "success", text2?: string) =>
  Toast.show({type, text1, text2});

/**
 * `onBusy` hears which person an action is running for (null when done),
 * for a spinner on their row.
 */
export function useConnectionActions(onBusy?: (key: string | null) => void) {
  const connections = useConnectionsStore((s) => s.connections);
  const outgoing = useConnectionsStore((s) => s.outgoing);
  const partner = connections.find((c) => c.is_partner) ?? null;
  const outgoingPartner = outgoing.find((r) => r.kind === "PARTNER");

  // The lists, then your partner's dates (their birthday shows up as soon
  // as they share it)
  const reload = useCallback(async () => {
    await useConnectionsStore.getState().reload();
    const partnerNow = useConnectionsStore.getState().connections.find((c) => c.is_partner);
    await usePartnerDatesStore.getState().load(partnerNow?.user_id ?? null);
  }, []);

  // Runs an action, then refreshes the lists
  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    onBusy?.(key);
    try {
      await action();
      if (done) toast(done);
      await reload();
    } catch (e) {
      showError("Couldn't do that", e);
    } finally {
      onBusy?.(null);
    }
  };

  /** Asks over their sheet; true once it's decided (the sheet can close) */
  const confirmForget = async (c: Connection) => {
    const who = `@${c.username}`;
    const how = await choose({
      title: `Forget ${who}?`,
      message: `You'll be removed from each other's connections${
        c.is_partner ? " and you're no longer each other's person" : ""
      }. They can't send you requests again unless you scan their code. Past dates stay. They aren't told.`,
      options: [
        {label: "Forget", icon: "person-remove-outline", value: "FORGET" as const},
        {
          label: "Forget and block",
          hint: "Their ideas are hidden from you too",
          icon: "ban-outline",
          destructive: true,
          value: "BLOCK" as const,
        },
      ],
    });
    if (!how) return false;
    if (how === "FORGET") {
      run(c.user_id, () => forgetConnection(c.user_id, false), `Forgot ${who}`);
    } else {
      run(
        c.user_id,
        async () => {
          await forgetConnection(c.user_id, true);
          // Their ideas leave Discover now, not on the next load
          const blocks = useBlockStore.getState();
          if (blocks.userId) await blocks.load(blocks.userId);
        },
        `Forgot and blocked ${who}`,
      );
    }
    return true;
  };

  const confirmEndPartner = async (c: Connection) => {
    const ok = await confirm({
      title: `Unlink @${c.username} as your person?`,
      message: "You stay connected, and you each keep the dates you've been on.",
      confirmLabel: "End it",
      destructive: true,
      icon: "heart-dislike-outline",
    });
    if (ok) run(c.user_id, endPartner, "Unlinked");
    return ok;
  };

  const askPartner = (c: Connection) =>
    run(c.user_id, async () => {
      const result = await requestPartner(c.user_id);
      toast(result === "LINKED" ? `You and @${c.username} are linked` : `Asked @${c.username}`);
    });

  // Report them (#76). Its sheets show over theirs; it closes once you've
  // sent it (or backed out of what comes after)
  const report = async (c: Connection) => {
    const outcome = await reportPerson(
      {id: c.user_id, username: c.username},
      {context: "CONNECTION"},
      {connected: true},
    );
    if (outcome === "CANCELLED") return false;
    if (outcome === "FORGOT") await reload();
    return true;
  };

  /**
   * The actions in `c`'s sheet. A confirmation shows over the sheet (#86);
   * `close` closes it once you've decided.
   */
  const actionsFor = (c: Connection, close: () => void): SheetAction[] => {
    const then = (fn: () => unknown) => async () => {
      const decided = await fn();
      if (decided !== false) close();
    };
    return [
      ...(c.is_partner
        ? []
        : !partner && !outgoingPartner
          ? [{label: `Make @${c.username} your person`, icon: "heart-outline" as const, run: then(() => askPartner(c))}]
          : []),
      ...(c.is_partner
        ? [
            {
              label: "Unlink as your person",
              icon: "heart-dislike-outline" as const,
              destructive: true,
              run: then(() => confirmEndPartner(c)),
            },
          ]
        : []),
      {
        label: `Forget @${c.username}`,
        icon: "person-remove-outline" as const,
        destructive: true,
        run: then(() => confirmForget(c)),
      },
      {label: `Report @${c.username}`, icon: "flag-outline" as const, destructive: true, run: then(() => report(c))},
    ];
  };

  return {actionsFor, run, reload};
}
