import BrandIcon, { type BrandId } from "./BrandIcons";
import Reveal from "./Reveal";

function BrandTile({ id, label }: { id: BrandId; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-forest/10 bg-paper/90 px-3 py-2 shadow-[0_8px_24px_-18px_rgba(13,38,32,0.45)]">
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-forest" aria-hidden="true">
        <BrandIcon id={id} />
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-forest/65">
        {label}
      </span>
    </div>
  );
}

function ConnectVisual() {
  return (
    <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden bg-forest-deep p-6 sm:min-h-[370px] sm:p-10">
      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(159,216,184,.65)_0.7px,transparent_0.7px)] [background-size:24px_24px]" />
      <div className="relative w-full max-w-[470px] overflow-hidden rounded-xl border border-paper/10 bg-[#0a1713] shadow-2xl">
        <div className="flex h-10 items-center border-b border-paper/10 px-4">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b63]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f2bd4b]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#62c554]" />
          </div>
          <span className="mx-auto font-mono text-[9px] tracking-[0.12em] text-paper/35">
            brainfeather.config
          </span>
        </div>
        <div className="grid grid-cols-[38px_1fr] font-mono text-[11px] leading-7 sm:text-[12px]">
          <div className="border-r border-paper/8 py-5 text-center text-paper/18">
            1<br />2<br />3<br />4<br />5<br />6
          </div>
          <pre className="overflow-x-auto p-5 text-paper/72">
            <code>
              <span className="text-mint">{`{`}</span>{"\n"}
              {`  `}<span className="text-[#8cc9ff]">&quot;mcpServers&quot;</span>: {`{`}{"\n"}
              {`    `}<span className="text-[#8cc9ff]">&quot;brainfeather&quot;</span>: {`{`}{"\n"}
              {`      `}<span className="text-[#8cc9ff]">&quot;command&quot;</span>: <span className="text-[#f5c56b]">&quot;npx&quot;</span>,{"\n"}
              {`      `}<span className="text-[#8cc9ff]">&quot;args&quot;</span>: [<span className="text-[#f5c56b]">&quot;-y&quot;</span>, <span className="text-[#f5c56b]">&quot;@brainfeather/mcp&quot;</span>]{"\n"}
              {`    `}{`}`}{"\n"}
              {`  `}{`}`}{"\n"}
              <span className="text-mint">{`}`}</span>
            </code>
          </pre>
        </div>
      </div>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-7">
        <BrandTile id="claudecode" label="Claude Code" />
        <BrandTile id="cursor" label="Cursor" />
        <BrandTile id="opencode" label="OpenCode" />
      </div>
    </div>
  );
}

function UnderstandVisual() {
  const signals = [
    ["communication", "Concise first, detail when asked"],
    ["learning", "Examples before theory"],
    ["goal", "Grow into a systems leadership role"],
    ["constraint", "Deep work after 6 PM"],
  ];
  return (
    <div className="relative min-h-[320px] overflow-hidden bg-[linear-gradient(135deg,#e4efe8_0%,#fbf8ee_52%,#dfeee4_100%)] p-6 sm:min-h-[370px] sm:p-9">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(47,122,92,.35)_0.8px,transparent_0.8px)] [background-size:22px_22px]" />
      <div className="relative grid min-h-[270px] grid-cols-[.88fr_1.12fr] items-center gap-4 sm:gap-6">
        <div className="space-y-3">
          <div className="max-w-[210px] rounded-xl rounded-bl-sm border border-forest/10 bg-paper p-3 shadow-[0_16px_36px_-28px_rgba(13,38,32,.55)]">
            <p className="text-[11px] leading-relaxed text-forest/70">
              I understand things faster when I see one concrete example first.
            </p>
          </div>
          <div className="ml-auto max-w-[205px] rounded-xl rounded-br-sm border border-emerald/20 bg-mint/20 p-3">
            <p className="text-[11px] leading-relaxed text-forest/70">
              Keep the first answer short. I&apos;ll ask when I want the deep version.
            </p>
          </div>
          <div className="max-w-[200px] rounded-xl rounded-bl-sm border border-forest/10 bg-paper p-3 shadow-[0_16px_36px_-28px_rgba(13,38,32,.55)]">
            <p className="text-[11px] leading-relaxed text-forest/70">
              My current goal is to become better at systems thinking and leadership.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-forest/10 bg-paper/95 p-4 shadow-[0_24px_55px_-34px_rgba(13,38,32,.6)] sm:p-5">
          <div className="flex items-center justify-between border-b border-forest/8 pb-3">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-forest/32">Understanding</p>
              <p className="mt-1 text-[13px] font-semibold text-forest">How you work</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint/25 text-[13px] font-semibold text-emerald">
              You
            </span>
          </div>
          <div className="mt-3 space-y-2.5">
            {signals.map(([kind, value]) => (
              <div key={kind} className="rounded-lg bg-paper-dim/65 px-3 py-2.5">
                <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-forest/30">{kind}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-forest/72">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContinuityVisual() {
  return (
    <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden bg-[#edf4ef] p-6 sm:min-h-[370px] sm:p-9">
      <div className="absolute inset-0 opacity-28 [background-image:radial-gradient(rgba(47,122,92,.32)_0.75px,transparent_0.75px)] [background-size:22px_22px]" />
      <div className="relative h-[300px] w-full max-w-[500px]">
        <div className="absolute left-1/2 top-5 h-[202px] w-[286px] -translate-x-1/2 rounded-2xl border border-emerald/18 bg-[#d8eadf] shadow-[0_24px_54px_-34px_rgba(13,38,32,.5)]">
          <div className="absolute -top-7 left-0 h-8 w-28 rounded-t-xl border border-b-0 border-emerald/18 bg-[#d8eadf]" />
          <div className="flex h-full flex-col p-5">
            <div className="flex items-center justify-between border-b border-forest/8 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest text-[8px] font-semibold text-paper">BF</span>
                <div>
                  <p className="font-mono text-[7px] uppercase tracking-[0.13em] text-emerald">Living context</p>
                  <p className="mt-0.5 text-[11px] font-medium text-forest">One memory folder</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-[6px] uppercase tracking-[0.08em] text-emerald/65">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> synced
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {[
                ["Preference", "Concise first"],
                ["Goal", "Systems leadership"],
                ["Schedule", "Deep work after 6 PM"],
                ["Decision", "Current context wins"],
              ].map(([kind, memory]) => (
                <div key={kind} className="rounded-lg border border-forest/8 bg-paper/72 px-3 py-2.5">
                  <p className="font-mono text-[6px] uppercase tracking-[0.09em] text-emerald/45">{kind}</p>
                  <p className="mt-1 text-[8.5px] leading-snug text-forest/68">{memory}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-1/2 flex w-[430px] max-w-[96%] -translate-x-1/2 items-center gap-2 rounded-xl border border-forest/10 bg-paper/95 p-3 shadow-[0_18px_38px_-28px_rgba(13,38,32,.5)]">
          <div className="flex-1 text-center">
            <p className="font-mono text-[6px] uppercase tracking-[0.1em] text-forest/25">Session 1</p>
            <p className="mt-1 text-[8.5px] text-forest/52">context fills</p>
          </div>
          <span className="text-emerald/35">→</span>
          <div className="flex-1 text-center">
            <p className="font-mono text-[6px] uppercase tracking-[0.1em] text-forest/25">Compaction</p>
            <p className="mt-1 text-[8.5px] text-forest/52">chat shrinks</p>
          </div>
          <span className="text-emerald/35">→</span>
          <div className="flex-1 rounded-lg bg-mint/20 py-1.5 text-center">
            <p className="font-mono text-[6px] uppercase tracking-[0.1em] text-emerald/55">Session 2</p>
            <p className="mt-1 text-[8.5px] font-medium text-emerald">context restored</p>
          </div>
        </div>

        <p className="absolute bottom-[54px] left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[6.5px] uppercase tracking-[0.12em] text-forest/25">
          MCP keeps the folder current across every connected agent
        </p>
      </div>
    </div>
  );
}

const FAQ = [
  {
    question: "Do I still need AGENTS.md or CLAUDE.md?",
    answer:
      "Static instruction files can still be useful for fixed repository rules. Brainfeather removes the need to keep copying changing context, preferences, goals, and decisions into every client-specific file. Connected agents save those durable updates through MCP and recall them when relevant.",
  },
  {
    question: "What happens when the context window fills up or gets compacted?",
    answer:
      "The chat context may shrink, but Brainfeather memory lives outside the conversation. A connected agent can retrieve the relevant facts again in the same project, after compaction, or in a new session.",
  },
  {
    question: "Does Brainfeather silently remember everything I do?",
    answer:
      "No. Brainfeather is explicit and selective. Connected agents call the MCP tools to save durable facts, and the memory pipeline filters obvious conversational noise. You can inspect, correct, retract, or delete what was stored.",
  },
  {
    question: "Is it only for coding and project context?",
    answer:
      "No. Project memory is the first use case, but Brainfeather can also hold preferences, goals, routines, constraints, recurring people, and communication style when you explicitly choose to save them.",
  },
  {
    question: "What happens when something changes?",
    answer:
      "New corrections can supersede old facts. Brainfeather keeps the history for auditability while active reads return the context that still holds, so stale preferences and decisions do not compete with the current truth.",
  },
  {
    question: "Which assistants can use the same memory?",
    answer:
      "Any MCP-compatible client can connect to the same Brainfeather account. Today that includes tools such as Claude Code, Cursor, OpenCode, and your own agents.",
  },
] as const;

function PersonalizeVisual() {
  return (
    <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#e8efe9_0%,#f7f4ea_48%,#e1ece5_100%)] p-6 sm:min-h-[370px] sm:p-9">
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(47,122,92,.3)_0.8px,transparent_0.8px)] [background-size:22px_22px]" />
      <div className="relative w-full max-w-[510px]">
        <div className="ml-auto max-w-[82%] rounded-xl rounded-br-sm border border-forest/10 bg-paper p-3.5 shadow-[0_18px_42px_-30px_rgba(13,38,32,.55)]">
          <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-forest/30">You</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-forest/72">
            Help me plan this week so I can make progress without burning out.
          </p>
        </div>

        <div className="my-4 flex flex-wrap justify-center gap-2">
          {[
            "concise first",
            "examples help",
            "evenings free",
            "systems goal",
            "protect deep work",
          ].map((memory) => (
            <span
              key={memory}
              className="rounded-md border border-emerald/18 bg-paper/80 px-2.5 py-1.5 font-mono text-[7px] uppercase tracking-[0.08em] text-emerald/75"
            >
              {memory}
            </span>
          ))}
        </div>

        <div className="max-w-[92%] rounded-xl rounded-bl-sm border border-emerald/20 bg-forest-deep p-4 shadow-[0_24px_55px_-34px_rgba(13,38,32,.65)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-mint" />
            <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-mint/70">Personalized response</p>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-paper/76">
            Keep the plan light: three 45-minute evening sessions. Start each with one visual
            example, then build a tiny system-design exercise. Leave Wednesday open so you do
            not lose your deep-work rhythm.
          </p>
          <div className="mt-3 flex gap-2 font-mono text-[7px] uppercase tracking-[0.09em] text-paper/28">
            <span>your pace</span><span>·</span><span>your style</span><span>·</span><span>your goals</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    number: "01",
    eyebrow: "Connect",
    title: "One setup. Every coding agent remembers.",
    body: "Add Brainfeather as an MCP server once. Claude Code, Cursor, OpenCode, and your own agents all work from the same durable memory layer.",
    Visual: ConnectVisual,
  },
  {
    number: "02",
    eyebrow: "Understand",
    title: "It learns the person behind the prompt.",
    body: "From what you explicitly share, Brainfeather remembers how you prefer to communicate, how you learn, what you are working toward, and the constraints shaping your day.",
    Visual: UnderstandVisual,
  },
  {
    number: "03",
    eyebrow: "Continue",
    title: "Stop rebuilding context files every time something changes.",
    body: "Connected agents can write durable updates through MCP instead of repeatedly copying live context into AGENTS.md, CLAUDE.md, or client-specific rules. The relevant memory remains available after compaction and across new sessions.",
    Visual: ContinuityVisual,
  },
  {
    number: "04",
    eyebrow: "Personalize",
    title: "The next response fits how you think and work.",
    body: "Before answering, your assistant recalls the relevant parts of your working style, goals, schedule, relationships, and project context — then responds in a way that feels made for you.",
    Visual: PersonalizeVisual,
  },
] as const;

export default function MemoryJourney() {
  return (
    <section className="rule-t mt-24 pt-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
          Beyond project memory
        </p>
        <h2 className="mt-5 text-[clamp(2rem,4.8vw,3.65rem)] font-light leading-[1.05] tracking-[-0.035em] text-forest">
          It remembers your work.
          <br className="hidden sm:block" /> Then it learns how you work.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[14px] leading-[1.75] text-forest/65">
          Brainfeather can hold your stack and decisions, but personalization goes further:
          preferences, goals, routines, constraints, and the way you want an assistant to respond.
        </p>
      </Reveal>

      <div className="mt-14 overflow-hidden rounded-2xl border border-forest/10 bg-paper">
        <div className="grid lg:grid-cols-2">
          {STEPS.map(({ number, eyebrow, title, body, Visual }, index) => (
            <Reveal
              key={number}
              delay={(index % 2) * 90}
              className={`min-w-0 ${index % 2 === 0 ? "lg:border-r lg:border-forest/10" : ""} ${index >= 2 ? "border-t border-forest/10" : index === 1 ? "border-t border-forest/10 lg:border-t-0" : ""}`}
            >
              <article className="h-full">
                <Visual />
                <div className="min-h-[245px] border-t border-forest/10 px-6 py-7 sm:px-9 sm:py-9">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald">
                    {number} / {eyebrow}
                  </p>
                  <h3 className="mt-5 max-w-xl text-[clamp(1.45rem,2.7vw,2.15rem)] font-medium leading-[1.16] tracking-[-0.025em] text-forest">
                    {title}
                  </h3>
                  <p className="mt-4 max-w-xl text-[13px] leading-[1.75] text-forest/62">{body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>

      <div className="rule-t mt-24 pt-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
            Questions, answered
          </p>
          <h2 className="mt-5 text-[clamp(1.9rem,4vw,3.1rem)] font-light leading-[1.08] tracking-[-0.03em] text-forest">
            How persistent memory actually works.
          </h2>
        </Reveal>

        <div className="mx-auto mt-12 max-w-3xl divide-y divide-forest/10 border-y border-forest/10">
          {FAQ.map(({ question, answer }) => (
            <details key={question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center gap-4 py-5 text-left text-[15px] font-medium text-forest marker:content-none">
                <span className="flex-1">{question}</span>
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 place-items-center rounded-full border border-forest/12 font-mono text-[15px] font-light text-forest/45 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-6 pr-10 text-[13px] leading-[1.8] text-forest/62">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
