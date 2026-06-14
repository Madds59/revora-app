"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

function safeName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot === -1 ? fileName : fileName.slice(0, dot))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ext =
    dot === -1 ? "" : fileName.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${base || "file"}${ext}`;
}

export type UploadResult = { error?: string; message?: string };

/**
 * Uploads a file straight to Supabase Storage (browser client, user's JWT), then
 * hands the resulting object path + metadata to a server action that records it
 * (e.g. a media_assets / complaint_evidence row).
 */
export function FileUpload({
  bucket,
  businessId,
  entity,
  accept = "image/*",
  label,
  onUpload,
}: {
  bucket: string;
  businessId: string;
  entity: string;
  accept?: string;
  label?: string;
  onUpload: (formData: FormData) => Promise<UploadResult>;
}) {
  const t = useTranslations("forms.upload");
  const resolvedLabel = label ?? t("defaultLabel");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const supabase = createClient();
      const objectPath = `${businessId}/${entity}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const fd = new FormData();
      fd.set("object_path", objectPath);
      fd.set("file_name", file.name);
      fd.set("mime_type", file.type || "application/octet-stream");
      fd.set("size_bytes", String(file.size));
      startTransition(async () => {
        const res = await onUpload(fd);
        if (res.error) toast.error(res.error);
        else {
          toast.success(res.message ?? t("uploaded"));
          router.refresh();
        }
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = uploading || pending;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {resolvedLabel}
      </Button>
    </div>
  );
}
