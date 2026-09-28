import { ArrowDown, ChevronDown, Mic } from "lucide-react";
import scriptSource from "../../VIDEO-SCRIPT.md?raw";

const spokenScript = scriptSource
  .split("## Spoken script\n\n")[1]
  .split("\n## Screen sequence")[0]
  .trim();

export function StoryHeader() {
  return (
    <section className="story-header" aria-labelledby="story-title">
      <div className="story-overview">
        <div className="story-heading">
          <p className="story-eyebrow">Why I built Impactor</p>
          <h1 id="story-title">
            Can I still use <span>this result?</span>
          </h1>
        </div>
        <div className="story-context">
          <p>
            Changing rain, cargo or bridge capacity can make an earlier delivery
            plan fail. Impactor compares current conditions with saved experiments
            and shows which need retesting.
          </p>
          <a className="story-jump" href="#delivery-lab">
            Explore the delivery world <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      <details className="story-script">
        <summary>
          <span className="story-script-label">
            <Mic size={16} aria-hidden="true" /> Read the one-minute story
          </span>
          <ChevronDown size={17} className="story-chevron" aria-hidden="true" />
        </summary>
        <div className="story-script-body">
          <p className="story-script-byline">Cosmin Bararu · Recording script</p>
          {spokenScript.split(/\n\s*\n/).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </details>
    </section>
  );
}
