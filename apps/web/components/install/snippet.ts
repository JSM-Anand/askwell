/** The tag an owner pastes on their site. `defer` lets the page render first. */
export function buildSnippet(origin: string, publicKey: string): string {
  return `<script src="${origin}/widget.js" data-key="${publicKey}" defer></script>`;
}
