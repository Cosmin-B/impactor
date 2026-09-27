# Conditional memory in Impactor

status: draft, needs Cosmin's rewrite pass before publication

A successful run teaches an agent something about the conditions of that run. If the weather, parcel weight or available battery changes, the old result can still be historically correct while being a poor basis for the next decision.

Impactor adds a context check around recalled memories. The public example is an invented delivery district. All times, battery costs, routes and jobs come from its simulator.

## GBrain: store the experiment with its conditions

Each remembered relationship contains the factor changed, its two trial values, the measured outcome differences and the surrounding world settings, tested strategy and already-known model inputs. GBrain stores and retrieves these records. Impactor checks their scope before adding a factor to its forecast model.

For example, testing rain while holding parcel weight fixed can reveal an energy dependency. Changing parcel weight then marks that remembered rain experiment as needing a retest. The graph still shows the historical relationship. The forecast stops treating it as applicable until another experiment covers the new context.

Paint is a negative control. It has no effect in this simulator and does not invalidate physical relationships. The application makes that distinction explicitly in its context comparison.

## Memorable: retain branches of a recalled procedure

The bridge experiment records a procedure through Memorable's CLI. The cloud app uses Memorable's embedding API to retrieve from an exported library containing only that app-owned procedure.

When a procedure was recalled and Jev dispatch decisions are enabled, Impactor saves the goal, world settings, six actions and observed outcomes as a procedure branch. These branches are stored in GBrain. On the next forecast, applicable branches are ranked ahead of historical branches and supplied to Jev with the recalled procedure.

This extension adds conditional execution history around Memorable's procedure retrieval. It does not modify Memorable's upstream implementation or claim that Memorable itself extracted these branches.

## Decisions and predictions

Jev chooses one of four strategies from simulated forecasts. Before each delivery, a second typed decision can charge, detour, dispatch normally or hold. Each decision receives only jobs completed before that dispatch time. Jobs still in flight are excluded. The code applies its selected action before calculating the next outcome.

The forecast is recorded before those interventions. The results page compares it with the completed shift under the same settings. A fleet-size chart reruns the forecast with different robot counts. It measures this simulator's schedule, not real robot or general agent-swarm performance.

The 3D view replays the calculated route timeline after the API calls finish. It does not depict API calls happening during the animation.
