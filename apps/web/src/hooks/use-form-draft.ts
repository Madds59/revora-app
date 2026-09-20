"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
      // Let any React-observed state (controlled selects, char counters) catch up.
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
 * - Clear on submit; if `error` arrives afterwards, re-snapshot so the draft
 *   survives a failed submit + reload.
 */
export function useFormDraft({
  key,
  scope,
  error,
  enabled = true,
}: {
  key: string;
  scope: string | null | undefined;
  /** The action's current error message; a change re-saves the draft. */
  error?: string | null;
  enabled?: boolean;
}) {
  const storageKey = scope && enabled ? draftStorageKey(scope, key) : null;
  const formRef = useRef<HTMLFormElement | null>(null);
  const timer = useRef<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

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
    clear();
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
        clear();
      };
      form.addEventListener("input", onEdit);
      form.addEventListener("change", onEdit);
      form.addEventListener("submit", onSubmit);
      return () => {
        form.removeEventListener("input", onEdit);
        form.removeEventListener("change", onEdit);
        form.removeEventListener("submit", onSubmit);
        if (timer.current) window.clearTimeout(timer.current);
      };
    },
    [storageKey, snapshot, clear],
  );

  // A failed submit cleared the draft on submit; put it back so a reload
  // after the error still restores what was typed.
  useEffect(() => {
    if (error) snapshot();
  }, [error, snapshot]);

  return { ref, restored, savedAt, discard, clear };
}
