import { hasApiKey } from "@/lib/openrouter";
import { Shell } from "./shell";

// Server component: reads the key here and passes only a boolean to the client,
// so the key itself never reaches the browser.
export default function Page() {
  return <Shell apiKeyPresent={hasApiKey()} />;
}
