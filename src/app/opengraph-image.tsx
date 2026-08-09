import { ImageResponse } from "next/og";
import { SITE_DOMAIN } from "@/lib/site";

/* The card that renders when the site is shared in Slack, iMessage,
   LinkedIn, X, Discord.

   Generated rather than a static PNG so the copy stays in sync with the
   page and there's no binary to re-export when it changes.

   Deliberately no custom font: `next/font` isn't available inside
   ImageResponse, and fetching Outfit at render time would add a network
   dependency to every crawler request. The system sans it falls back to
   is close enough at this size, and a broken/blank card would be worse
   than a slightly different typeface. */

export const alt = "Brainfeather — long-term memory for AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          /* Brand palette, inlined: ImageResponse has no access to the
             CSS custom properties in globals.css. */
          background:
            "linear-gradient(160deg, #0d2620 0%, #14342b 42%, #2f7a5c 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 99,
              background: "#9fd8b8",
            }}
          />
          <div
            style={{
              fontSize: 30,
              color: "#fbf9ef",
              letterSpacing: "-0.02em",
            }}
          >
            brainfeather
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.06,
              color: "#fbf9ef",
              letterSpacing: "-0.035em",
              /* Explicit flex column + separate lines: ImageResponse
                 does not support <br />. */
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Your agent forgets</span>
            <span>everything. We don&apos;t.</span>
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 27,
              lineHeight: 1.45,
              color: "rgba(251,249,239,0.75)",
              maxWidth: 780,
            }}
          >
            The memory layer under Claude Code, Cursor and your own agents.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 21,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#9fd8b8",
          }}
        >
          {SITE_DOMAIN}
        </div>
      </div>
    ),
    size,
  );
}
