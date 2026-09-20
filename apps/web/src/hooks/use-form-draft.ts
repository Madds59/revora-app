"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  decodeDraft,
  draftStorageKey,
  encodeDraft,
  serializeDraftEntries,
} from "@/lib/form-draft.js";

const DEBOUNCE_MS = 400;
const NEVER_PERSIST_TYPES = new Set(["password", "file", "hidden"]);

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota: degrade to no persistence */
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function skipNamesFor(form: HTMLFormElement): Set<string> {
  const skip = new Set<string>();
  for (const el of Array.from(form.elements)) {
    const input = el as HTMLInputElement;
    if (!input.name) continue;
    if (NEVER_PERSIST_TYPES.has(input.type) || input.hasAttribute("data-no-draft")) {
      skip.add(input.name);
    }
  }
  return skip;
}

function applyValues(form: HTMLFormElement, values: Record<string, string | string[]>) {
  for (const [name, value] of Object.entries(values)) {
    const controls = Array.from(form.elements).filter(
      (el) => (el as HTMLInputElement).name === name,
    ) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];
    if (controls.length === 0) continue;
    const wanted = Array.isArray(value) ? value : [value];
    for (const control of controls) {
      const input = control as HTMLInputElement;
      if (input.type === "checkbox" || input.type === "radio") {
        input.checked = wanted.includes(input.value);
      } else if (control instanceof HTMLSelectElement && control.multiple) {
        for (const option of Array.from(control.options)) option.selected = wanted.includes(option.value);
      } else {
        control.value = wanted[0] ?? "";
      }
      // Let native `onInput`/`onChange` listeners and React-controlled <select> handlers observe the restore.
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

/**
 * Persists an uncontrolled <form>'s values to localStorage so a reload or
 * nav-away doesn't lose typed work. Scope by tenant id so shared devices
 * never leak drafts across businesses/customers.
 *
 * - Snapshot on input/change (debounced).
 * - Restore on mount; `restored` flips true so the caller can show a banner.
 * - Clear optimistically on submit. Forms driven by `useActionState` reset
 *   their uncontrolled fields via a native `reset` event fired in the same
 *   commit that delivers the action result, before any passive effect can
 *   run — so we can't reliably re-snapshot from an `error` effect after the
 *   fact. Instead we capture the submitted values into `pendingRef` at
 *   submit time, and on the form's `reset` event, defer to a macrotask (by
 *   which point the latest `error` has landed in `errorRef` via a layout
 *   effect) to check whether the action actually failed. If it did, we
 *   restore both the DOM values and the persisted draft from what was
 *   captured — including when the same error string is delivered twice in a
 *   row. A successful submit's `reset` leaves storage cleared.
 * - `discard()` cancels any pending debounced save and flags its own
 *   `form.reset()` to be ignored by the `reset` listener above.
 */
export function useFormDraft({
  key,
  scope,
  error,
  enabled = true,
}: {
  key: string;
  scope: string | null | undefined;
  /** The action's current error message; checked once the form's `reset` settles. */
  error?: string | null;
  enabled?: boolean;
}) {
  const storageKey = scope && enabled ? draftStorageKey(scope, key) : null;
  const formRef = useRef<HTMLFormElement | null>(null);
  const timer = useRef<number | null>(null);
  const errorRef = useRef(error);
  const pendingRef = useRef<string | null>(null);
  const ignoreResetRef = useRef(false);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useLayoutEffect(() => {
    errorRef.current = error;
  });

  const snapshot = useCallback(() => {
    const form = formRef.current;
    if (!form || !storageKey) return;
    const values = serializeDraftEntries(new FormData(form).entries(), skipNamesFor(form));
    if (Object.values(values).every((v) => (Array.isArray(v) ? v.length === 0 : v === ""))) {
      safeRemove(storageKey);
      return;
    }
    safeSet(storageKey, encodeDraft(values, Date.now()));
  }, [storageKey]);

  const clear = useCallback(() => {
    if (storageKey) safeRemove(storageKey);
  }, [storageKey]);

  const discard = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    clear();
    ignoreResetRef.current = true;
    formRef.current?.reset();
    setRestored(false);
    setSavedAt(null);
  }, [clear]);

  // React 19 ref callbacks may return a cleanup; it runs when the form
  // unmounts or when this callback's identity changes (new scope/key).
  const ref = useCallback(
    (form: HTMLFormElement | null) => {
      formRef.current = form;
      if (!form || !storageKey) return;

      const draft = decodeDraft(safeGet(storageKey), Date.now());
      if (draft) {
        applyValues(form, draft.values);
        setRestored(true);
        setSavedAt(new Date(draft.savedAt));
      } else {
        safeRemove(storageKey); // purge stale / invalid
      }

      const onEdit = () => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(snapshot, DEBOUNCE_MS);
      };
      const onSubmit = () => {
        if (timer.current) window.clearTimeout(timer.current);
        const values = serializeDraftEntries(new FormData(form).entries(), skipNamesFor(form));
        pendingRef.current = Object.values(values).every((v) => (Array.isArray(v) ? v.length === 0 : v === ""))
          ? null
          : encodeDraft(values, Date.now());
        clear();
      };
      const onReset = () => {
        if (ignoreResetRef.current) {
          ignoreResetRef.current = false;
          return;
        }
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending === null) return;
        window.setTimeout(() => {
          if (!errorRef.current) return;
          const decoded = decodeDraft(pending, Date.now());
          const f = formRef.current;
          if (!decoded || !f || !storageKey) return;
          applyValues(f, decoded.values);
          safeSet(storageKey, pending);
        }, 0);
      };
      form.addEventListener("input", onEdit);
      form.addEventListener("change", onEdit);
      form.addEventListener("submit", onSubmit);
      form.addEventListener("reset", onReset);
      return () => {
        form.removeEventListener("input", onEdit);
        form.removeEventListener("change", onEdit);
        form.removeEventListener("submit", onSubmit);
        form.removeEventListener("reset", onReset);
        if (timer.current) window.clearTimeout(timer.current);
      };
    },
    [storageKey, snapshot, clear],
  );

  return { ref, restored, savedAt, discard, clear };
}
