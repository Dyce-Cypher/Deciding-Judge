# Deciding Judge

Deciding Judge is a small two-person WebSocket game. Each person chooses a color and joins the same room. When both players are connected, either person can call the judge and both browsers receive the same random winner.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:10000` in two browser windows. Choose the same room name in both windows, use different colors, and click **Call the judge**.

## Deploy on Render

Create a Render **Web Service** connected to this repository. The included `render.yaml` supplies:

- Build command: `npm install`
- Start command: `npm start`
- Health check: `/`

The server listens on Render's `PORT` value and `0.0.0.0`. The browser automatically uses `wss://` when the deployed page uses HTTPS.

Room state is intentionally held in memory for this class project. That is enough for one running service and keeps the WebSocket behavior easy to understand. A multi-instance production version would need shared storage.
