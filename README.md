# Impactor

A delivery simulator for exploring when an agent can reuse a remembered result. Change the weather, load, fleet size or deadlines, compare a forecast with the completed shift, and inspect the decisions that changed the outcome.

Live app: https://impactor.cosminbararu.com

The main view uses Three.js, a deterministic TypeScript simulator, GBrain memory, Memorable semantic procedure retrieval, and TypeSafe Jev decisions before each delivery. Cloudflare Workers serves the app and D1 stores browser workspace state. The earlier bridge experiment is available at `/bridge`.

See [the demo walkthrough](DEMO.md) and [conditional memory design](MEMORY-EXTENSIONS.md) for the workflow and integration boundaries.

## Run locally

You need Node.js 22 or newer and GBrain and TypeSafe credentials. Memorable credentials enable procedure retrieval.

Set `GBRAIN_TOKEN`, `TYPESAFE_API_KEY`, and optionally `MEMORABLE_API_KEY` in the server environment before starting the app.

```sh
npm install
npm test
npm run build
npm start
```

Open http://127.0.0.1:4173. Existing local GBrain and Memorable configuration can also supply those two credentials. Credentials stay on the server.

## Deploy

The checked-in Wrangler configuration targets the demo's Cloudflare account and domain. For your own deployment, change those values and create a D1 database before running:

```sh
npx wrangler d1 execute impactor-state --remote --file cloudflare/schema.sql
npx wrangler secret put GBRAIN_TOKEN
npx wrangler secret put TYPESAFE_API_KEY
npx wrangler secret put MEMORABLE_API_KEY
npm run build
npx wrangler deploy
```

## Train the experimental dispatch policy

The `training` directory contains a simulator-generated dataset, an SFT script for River, and the latest run report. The task selects a corrective dispatch action from a simulated baseline outcome. It is separate from the deployed Jev controller.

```sh
npx tsx training/make-dataset.ts
uv run --python 3.12 --with river-client --with transformers training/river-sft.py
```

Set `RIVER_API_KEY` before running the training script. The script uses 27 training examples and nine held-out examples. The completed run took 290 seconds and matched all nine held-out action labels. The base model failed the strict response format, so this test measures whether the model returns the required action label. A second comparison without the newline stop also produced nine exact action labels from the saved checkpoint. Inspect `training/result.json` and `training/checkpoint-evaluation.json` for the measurements.

All public scenarios are invented. No private project traces or source code are included.

## Workplace simulation

Open [/workplace](https://impactor.cosminbararu.com/workplace) to compare 3 to 100 simulated agents across engineering, quality, GTM, technical accounts and review. Choose a software release, campaign, incident or customer rollout. Task prerequisites, build capacity and reviewer availability constrain the schedule.

Remember completed checks to save their input conditions in GBrain. Change a code, offer or customer configuration revision to rerun affected tasks and their dependents. A separate Jev assessment recommends reuse, source refresh, a focused rerun or clarification for the displayed work context.

Cost and finishing-time comparisons are simulation estimates with editable assumptions. The app does not launch 100 paid agents. Memorable procedure retrieval and River training are demonstrated in the delivery lab.

The one-minute recording draft and screen cues are in [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md).
