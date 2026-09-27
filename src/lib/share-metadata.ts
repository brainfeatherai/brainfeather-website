import type { Metadata } from "next";

/* Link-preview metadata, built in one place.

   Next merges metadata SHALLOWLY: a page that sets its own `openGraph`
   replaces the root layout's object wholesale rather than extending it.
   Every public page sets `openGraph.url` (it has to — see the canonical
   note in layout.tsx), so each one was silently dropping og:image,
   og:type, og:site_name and og:locale. The same rule meant pages that
   never set `twitter` inherited the homepage's title and description,
   so /privacy shared on X was captioned as the homepage.

   The image is named explicitly because the file-based
   app/opengraph-image only attaches to the segment it lives in once a
   child overrides `openGraph`. */

export const SITE_TITLE = "Brainfeather — Long-term memory for AI agents";
export const SITE_DESCRIPTION =
  "The memory layer that sits under Claude Code, Cursor and your own agents: it records the facts that matter and hands them back on the next run.";

const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Brainfeather — long-term memory for AI agents",
};

export const baseOpenGraph = {
  type: "website",
  siteName: "Brainfeather",
  locale: "en_GB",
  images: [SHARE_IMAGE],
} satisfies Metadata["openGraph"];

export const baseTwitter = {
  card: "summary_large_image",
  images: [SHARE_IMAGE],
} satisfies Metadata["twitter"];

/* `title` is the bare page name; the layout's title template adds the
   brand to <title>, but templates do not apply inside openGraph/twitter,
   so the suffixed form is spelled out for those. */
export function pageMetadata({
  path,
  title,
  description,
}: {
  path: string;
  title?: string;
  description?: string;
}): Metadata {
  const shareTitle = title ? `${title} — Brainfeather` : SITE_TITLE;
  const shareDescription = description ?? SITE_DESCRIPTION;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: { ...baseOpenGraph, url: path, title: shareTitle, description: shareDescription },
    twitter: { ...baseTwitter, title: shareTitle, description: shareDescription },
  };
}
