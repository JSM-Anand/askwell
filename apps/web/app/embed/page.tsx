import type { Metadata } from "next";
import { EmbedPanel } from "../../components/embed/EmbedPanel";

export const metadata: Metadata = { robots: { index: false } };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The chat panel shown inside the widget's iframe: /embed?key=pk_...&origin=<embedding page's origin>. */
export default async function EmbedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return <EmbedPanel projectKey={first(params.key)} origin={first(params.origin)} />;
}
