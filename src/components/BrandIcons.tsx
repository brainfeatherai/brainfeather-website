/* Brand marks, inlined from the SVGs in public/brands/.
   All are single-path, 24×24, fill-based — so they survive the
   non-uniform isometric skew without stroke distortion. */

export type BrandId = "claudecode" | "cursor" | "opencode" | "antigravity" | "agents" | "mcp";

/** Raw 24×24 path data, fill-only. */
export const BRAND_PATHS: Record<string, string> = {
  claudecode:
    "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z",
  cursor:
    "M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z",
  opencode: "M16 6H8v12h8V6zm4 16H4V2h16v20z",
  antigravity:
    "M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z",
};

/** Generic marks for non-branded clients — drawn, not borrowed. */
function GenericGlyph({ id }: { id: "agents" | "mcp" }) {
  if (id === "agents") {
    return (
      <>
        <circle cx="12" cy="5.5" r="2.6" />
        <circle cx="5.5" cy="17" r="2.6" />
        <circle cx="18.5" cy="17" r="2.6" />
        <path d="M11 8.2 L7 14.4 h2 L13 8.2 z" />
        <path d="M13 8.2 L17 14.4 h-2 L11 8.2 z" />
      </>
    );
  }
  return (
    <>
      <rect x="2.5" y="6" width="19" height="3" rx="1.2" />
      <rect x="2.5" y="11" width="19" height="3" rx="1.2" />
      <rect x="2.5" y="16" width="12" height="3" rx="1.2" />
    </>
  );
}

/** A brand mark as fill-only geometry in a 24×24 box. */
export default function BrandIcon({ id }: { id: BrandId }) {
  if (id === "agents" || id === "mcp") return <GenericGlyph id={id} />;
  return <path d={BRAND_PATHS[id]} fillRule="evenodd" clipRule="evenodd" />;
}
