# Recording script

status: draft, needs Cosmin's rewrite pass before publication

## Spoken script

I work on physical AI: simulation and ground-truth rendering for robots, drones and autonomous vehicles.
My day is C++ engines and GPU kernels across hundreds of environments, including lidar and radar, tuned to each customer's hardware and workload.

Every change raises the same question: which results still apply, and what needs checking again?

I built Impactor to make that visible through delivery robots dealing with rain, heavy cargo and limited battery.

I extended GBrain with experiments that carry their conditions. Before reusing a result, Impactor checks whether those conditions still match.

Around Memorable's procedures, I added execution branches: each shift's conditions, actions and outcomes. A fresh agent retrieves that experience without reconstructing the investigation.

Change paint and the contexts still match. Change cargo and the graph shows which experiments need retesting.

Jev selects the plan. The adapter I fine-tuned with River now chooses dispatch corrections from simulated preflight checks, and those actions change what the robots do.

## Screen sequence

- 0-13 seconds: Delivery world and physical-AI background.
- 13-24 seconds: Rain, cargo and battery controls.
- 24-37 seconds: Conditional memory and GBrain's experiment conditions.
- 37-48 seconds: Procedure branches and Fresh agent.
- 48-55 seconds: Change only paint, then change parcel weight.
- 55-65 seconds: Select River · fine-tuned, then show a completed shift's Dispatch decisions and River training results.

About 60-65 seconds at a natural pace. For a shorter take, omit the second background sentence. Run the River shift before recording its results; six requests took about 27 seconds in the verified storm run, followed by the animation.

Verified on the public app: six River checkpoint decisions applied, six of six deliveries completed, one on time. That run is a demonstration of integration, not proof of broad policy quality. Inference runs on River GPUs through a small authenticated local relay. Keep the relay and tunnel running during the demo.
