# Recording script

status: draft, needs Cosmin's rewrite pass before publication

## Spoken script

I build physical AI simulation infrastructure and the specialized ground-truth rendering for robots, drones and autonomous vehicles.
That spans C++ engine architecture, GPU kernels, and GPU clustering work.

Large products accumulate thousands of decisions. We need to deeply understand the technical choices and customer scenarios that got us here, including models and implementations we cannot always inspect. When something changes, that context helps us decide which assumptions and checks need revisiting.

Impactor explores that problem in a delivery world.

I added conditions to the experiments stored in GBrain, and execution branches around Memorable's procedures: what ran, under which conditions, and what happened.

Change the cargo and the graph shows which experiments need retesting. A fresh agent recalls the saved experiments and procedure branches.

Jev selects the plan. The adapter I trained with River chooses corrections from simulated preflight checks.

The larger goal is to help humans and agents preserve the reasoning behind validation, then turn what they've learned into reliable automated checks.

## Screen sequence

- 0-13 seconds: Delivery world and physical-AI background.
- 13-28 seconds: Keep the world visible while explaining the accumulated decisions behind validation. Orbit gently.
- 28-41 seconds: Conditional memory, experiment conditions and procedure branches.
- 41-49 seconds: Change parcel weight and Show why. Do not click Fresh agent yet; it clears the current shift history.
- 49-57 seconds: Dispatch decisions, with Jev's plan and the actual River actions.
- 57-65 seconds: Return to the graph. Optionally click Fresh agent after showing the River results.

About 60-65 seconds at a natural pace. Prepare the completed River shift before recording; inference happens before the animation. See RECORDING-CLICKS.md for preparation.

The company-scale motivation comes from Cosmin's description of his work. The prototype demonstrates scoped experiments and procedure execution history in a synthetic delivery world. It does not yet reconstruct a company's design rationale or prove that a test suite is sufficient.

Verified public integration: six River decisions applied, six of six deliveries completed, one on time. River inference uses a small authenticated local relay. Keep that relay and tunnel running during the demo.
