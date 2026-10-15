import { CloudOff, FileText, Lock, Server, Smartphone } from "lucide-react";

/*
 * "Private by design", drawn: the voice travels from the phone to the agency's own server and
 * comes back as a note; the cloud outside is crossed out. The dots move along the lines in CSS.
 */
export function PrivacyFlow() {
  const node = "relative z-10 flex flex-col items-center gap-3 text-center";
  const disc = "grid h-20 w-20 place-items-center rounded-3xl border border-white/15 bg-white/[0.07] backdrop-blur sm:h-24 sm:w-24";
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-[#0f2c25] px-6 py-12 text-white sm:px-12 sm:py-16">
      <div className="mh-grid absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#dcef98]"><Lock className="h-3.5 w-3.5" /> Private by design</p>
          <h3 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Your voice never leaves your building.</h3>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">Speech becomes words, and words become the note, on your own server. The recording is never saved, and nothing is sent to another company.</p>
        </div>
        <div className="relative">
          <div className="grid grid-cols-3 items-center gap-2">
            <div className={node}>
              <span className={disc}><Smartphone className="h-8 w-8 text-[#dcef98]" /></span>
              <span className="text-sm font-semibold">Staff phone</span>
            </div>
            <div className={node}>
              <span className={`${disc} mh-server`}><Server className="h-8 w-8 text-[#dcef98]" /></span>
              <span className="text-sm font-semibold">Your server</span>
            </div>
            <div className={node}>
              <span className={disc}><FileText className="h-8 w-8 text-[#dcef98]" /></span>
              <span className="text-sm font-semibold">Signed note</span>
            </div>
          </div>
          <svg className="pointer-events-none absolute left-0 top-0 h-24 w-full sm:h-28" viewBox="0 0 600 112" preserveAspectRatio="none" aria-hidden="true">
            <path className="mh-flow-line" d="M110 48 L 245 48" />
            <path className="mh-flow-line" d="M355 48 L 490 48" />
            <circle className="mh-flow-dot" r="5"><animateMotion dur="2.2s" repeatCount="indefinite" path="M110 48 L 245 48" /></circle>
            <circle className="mh-flow-dot" r="5"><animateMotion dur="2.2s" begin="1.1s" repeatCount="indefinite" path="M355 48 L 490 48" /></circle>
          </svg>
          <div className="mt-10 flex items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 px-5 py-4 text-sm text-white/70">
            <CloudOff className="h-5 w-5 shrink-0 text-[#f5a38f]" /> No outside AI company, no audio files kept, names passed as hints so they are spelled right.
          </div>
        </div>
      </div>
    </div>
  );
}
