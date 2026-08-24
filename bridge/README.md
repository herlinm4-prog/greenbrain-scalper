# GreenBrain MT5 Demo Bridge

Run this service only on a Windows machine or VPS with the official MetaTrader 5 terminal installed and already signed into the allowlisted demo account. The bridge never accepts an MT5 password.

1. Install Python 3.11+ and copy `.env.example` values into Windows environment variables.
2. Create a virtual environment and install `requirements.txt`.
3. Start with `uvicorn mt5_bridge:app --host 127.0.0.1 --port 8765`.
4. Publish it only through an authenticated HTTPS reverse proxy or private tunnel. Never expose port 8765 directly.
5. Confirm `/v1/status`, `/v1/account`, and a tick endpoint before enabling demo orders.

The service rejects non-demo accounts, changed login/server identity, symbols outside the allowlist, excessive lot size, invalid stops, wrong magic number, failed `order_check`, and repeated order IDs.
