# Demo walkthrough

status: draft, needs Cosmin's rewrite pass before publication

Open https://impactor.cosminbararu.com. The main page is a 3D delivery simulation. The earlier bridge experiment is available at `/bridge`.

1. Select Storm + heavy cargo and click Forecast with Jev. The forecast uses baseline assumptions for factors without an applicable saved relationship.
2. Run the shift. Inspect the forecast and observed results, then open Jev decisions to see the action taken before each delivery.
3. Click Find relationships. The simulator runs two controlled trials for each of nine factors and saves the results in GBrain.
4. Open Conditional memory. Each relationship shows whether its surrounding conditions match the current world. The procedure section shows the actions and outcomes attached to the Memorable procedure.
5. Click Fresh agent. Its local run history is empty. It retrieves the stored relationships and procedure branches from GBrain, then uses them in its next forecast.
6. Change parcel weight. Previously tested relationships involving other factors now need a retest because their context changed. Changing only robot paint leaves the physical context applicable.

The example is synthetic. The problem it models comes from real simulation workflows: after inputs change, agents can reuse checks whose conclusions no longer apply.

## The bridge experiment

At `/bridge`, click Reset, then run the light parcel across the bridge. Increase its weight and run again. The old load check can be reused because the agent has not learned that weight is a dependency. Teach that dependency, rerun, and inspect the new load check and detour. A fresh agent retrieves the dependency from GBrain and a checking procedure from Memorable.

## Planning across teams

Open `/workplace` after the delivery demo. Choose a customer rollout, software release, campaign or incident. Move from 3 to 100 simulated agents and compare finishing times as build and review capacity stay fixed.

Click Remember completed checks, then change Code v1. Matching task conditions are reused while changed tasks and their dependents run again. At the default 12 workstreams, this code change preserves 48 of 121 task results. Click a task to inspect its prerequisites and the conditions behind its result.

The role panel asks Jev whether a previous engineering, GTM or technical account conclusion still applies. It recommends a next action without executing workplace tasks. The delivery lab uses Jev in the dispatch loop.

Cost comparisons use editable assumptions for input tokens and handoffs. The timeline comes from the scheduler, not measured human productivity or a live 100-agent run.
