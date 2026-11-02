import { start } from "./loader";

// currentScript is only set while the script first runs, so read it now.
const script = document.currentScript;
if (script instanceof HTMLScriptElement) void start(script);
