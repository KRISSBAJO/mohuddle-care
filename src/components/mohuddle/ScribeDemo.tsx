import { Mic, Sparkles } from "lucide-react";

/*
 * A looping picture of the scribe: someone talks, the words appear, and the note's parts fill in.
 * Pure CSS (see .mh-demo in globals.css). It stands still for people who prefer less motion.
 */
export function ScribeDemo() {
  const parts = [
    ["Meals", "Ate all of her oatmeal and drank two cups of water."],
    ["Health", "Took her morning Sertraline with no problem."],
    ["Plan goal", "Made a salad for lunch with one reminder to wash the lettuce."],
    ["Behaviour", "Cried and shouted for about five minutes when the TV channel changed. Staff offered space and headphones; she calmed."],
  ];
  return (
    <div className="mh-demo relative rounded-[28px] bg-white p-5 text-[#173e35] shadow-[0_40px_70px_-34px_rgba(23,62,53,.45)] sm:p-6" aria-label="Example: a spoken note filling in a daily note" role="img">
      <div className="flex items-center gap-3 rounded-2xl bg-[#f3f6ef] px-4 py-3">
        <span className="mh-demo-mic grid h-9 w-9 place-items-center rounded-full bg-[#ab3c2b] text-white"><Mic className="h-4 w-4" /></span>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden="true">
          {Array.from({ length: 34 }, (_, i) => <span key={i} className="mh-demo-bar w-[3px] shrink-0 rounded-full bg-[#286b55]" style={{ animationDelay: `${(i % 9) * 0.11}s` }} />)}
        </div>
        <span className="text-xs font-semibold tabular-nums text-[#5b6b7a]">1:48</span>
      </div>
      <p className="mh-demo-words mt-4 text-sm leading-relaxed text-[#5b6b7a]">
        &ldquo;…she ate all of her oatmeal and two cups of water, took her Sertraline fine. We worked on her cooking goal, she made a salad…&rdquo;
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#286b55]"><Sparkles className="h-3.5 w-3.5" /> Filling in the note</div>
      <ul className="mt-2 space-y-2">
        {parts.map(([title, text], i) => (
          <li key={title} className="mh-demo-part rounded-xl border-l-[3px] border-[#e7b008] bg-[#fffbeb] px-3 py-2" style={{ animationDelay: `${3.2 + i * 0.7}s` }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a5a10]">{title}</p>
            <p className="text-[13px] leading-snug">{text}</p>
          </li>
        ))}
      </ul>
      <div className="mh-demo-sign mt-3 flex items-center justify-between rounded-xl bg-[#173e35] px-4 py-2.5 text-sm text-white">
        <span>Checked by staff</span>
        <span className="font-semibold text-[#dcef98]">Sign and save</span>
      </div>
    </div>
  );
}
