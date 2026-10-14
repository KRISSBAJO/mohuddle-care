import Link from "next/link";
import { CheckCircle2, Clock, FileSignature, RotateCcw, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import type { schema } from "@/server/db";
import { FileUpload } from "./FileUpload";

type Item = typeof schema.documentRequestItems.$inferSelect;

/*
 * What a request asks for, with a way to send or sign each one. Used on the private link page and on
 * the staff member's own Hub page. Shows only the status of what was asked, never a stored file.
 */
export function RequestChecklist({ items, token, signHref, maxMb, instructions = {} }: { items: Item[]; token: string | null; signHref: (itemId: string) => string; maxMb: number; instructions?: Record<string, string> }) {
  return (
    <ul className="space-y-3">
      {items.map(item => {
        const done = item.status === "approved";
        const waiting = item.status === "submitted";
        const redo = item.status === "rejected";
        return (
          <li key={item.id} className={cn("card px-4 py-3", done && "opacity-80", redo && "ring-2 ring-flag/30")}>
            <div className="flex flex-wrap items-start gap-3">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", done ? "bg-sage-soft text-sage" : waiting ? "bg-sky text-brand-deep" : redo ? "bg-flag-soft text-flag" : item.kind === "sign" ? "bg-plum-soft text-plum" : "bg-panel text-mute")}>
                {done ? <CheckCircle2 className="h-5 w-5" /> : waiting ? <Clock className="h-5 w-5" /> : redo ? <RotateCcw className="h-5 w-5" /> : item.kind === "sign" ? <FileSignature className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.label}</p>
                <p className="text-sm text-mute">
                  {done ? (item.kind === "sign" ? "Signed. Thank you." : "Received and approved. Thank you.") : waiting ? "Received. Waiting for review." : redo ? "Please send it again." : item.kind === "sign" ? "Read and sign online." : "Upload a clear PDF or photo."}
                </p>
                {redo && item.reviewNote && <p className="mt-1 rounded-lg bg-flag-soft px-3 py-2 text-sm text-flag">{item.reviewNote}</p>}
                {!done && !waiting && item.typeId && instructions[item.typeId] && <p className="mt-1 text-xs text-mute">{instructions[item.typeId]}</p>}
              </div>
              {!done && !waiting && item.kind === "sign" && (
                <Link href={signHref(item.id)} className="btn-brand btn-sm"><FileSignature className="h-4 w-4" /> Review and sign</Link>
              )}
            </div>
            {!done && !waiting && item.kind === "upload" && (
              <div className="mt-3">
                <FileUpload endpoint="/api/docs/submit" fields={{ itemId: item.id, ...(token ? { token } : {}) }} label={redo ? "Upload it again" : "Choose a file or take a photo"} maxMb={maxMb} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
