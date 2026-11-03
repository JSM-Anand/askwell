/**
 * Askwell's own widget on the landing page: the same script tag a customer pastes. It carries the
 * project's public key, which identifies the project and nothing more. The /embed iframe it opens
 * stays untracked.
 */
export function LandingWidget({ widgetKey, origin }: { widgetKey: string; origin: string }) {
  return <script async src={`${origin}/widget.js`} data-key={widgetKey} />;
}
