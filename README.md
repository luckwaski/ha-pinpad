# Lock Numpad PIN Card

A Home Assistant Lovelace card: a button that opens a numeric keypad popup and
**sends the typed PIN to your `lock` entity** (`lock.unlock` with `code`), so the
**device/entity validates the PIN** — the code is *not* stored in the card config.

> Modified from [JMatuszczakk/Locked-Button](https://github.com/JMatuszczakk/Locked-Button)
> (MIT). The original compared the entered code against a code declared in the
> card config and then fired a fixed action. This version removes the local
> comparison and instead **passes the entered code to the service call**, so a
> real lock (e.g. an ESP relay in "lock" mode over MQTT) checks the PIN itself.

## What changed vs the original

- ❌ no `code` in the card config (nothing secret in the dashboard);
- ✅ the typed PIN is injected into the service call as `code` (configurable via
  `code_key`) — e.g. `lock.unlock(entity_id: ..., code: "1234")`;
- ✅ `entity` shortcut → calls `lock.unlock` on that lock automatically;
- ✅ `digits` sets the PIN length (auto-submit + dot indicators);
- element renamed to `lock-numpad-pin-card` so it does not clash with the original.

## Installation

### HACS (custom repository)

1. HACS → three-dot menu → **Custom repositories**.
2. Repository: `https://github.com/luckwaski/ha-pinpad`, category **Lovelace/Dashboard**.
3. Install **Lock Numpad PIN Card**, then reload resources / hard-refresh (Ctrl-F5).

### Manual

1. Copy `dist/lock-numpad-pin-card.js` to your HA `config/www/`.
2. Settings → Dashboards → **Resources** → Add: URL `/local/lock-numpad-pin-card.js`, type **Module**.
3. Hard-refresh the browser.

## Usage

Simple — point at a lock; the card calls `lock.unlock` with the typed PIN:

```yaml
type: custom:lock-numpad-pin-card
entity: lock.front_door
button_label: "Unlock"
digits: 4
```

Advanced — any service, with the PIN injected under `code_key`:

```yaml
type: custom:lock-numpad-pin-card
button_label: "Unlock"
digits: 4
action:
  service: lock.unlock
  data: { entity_id: lock.front_door }
code_key: code
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | — | Lock entity; shortcut for `lock.unlock` on it. Required unless `action` is set. |
| `action.service` | string | — | `domain.service` to call instead of the `entity` shortcut. |
| `action.data` | object | `{}` | Extra service data (e.g. `entity_id`). |
| `code_key` | string | `code` | Service-data field that receives the typed PIN. |
| `digits` | number | `4` | PIN length: auto-submits and draws that many dots. |
| `button_label` | string | `Unlock` | Label on the card button / dialog heading. |

## Behaviour

- Type `digits` digits → the PIN is sent automatically; `✓` submits manually, `✕` cancels.
- The card does **not** know whether the PIN was correct (it does not hold the PIN).
  A wrong PIN is rejected by the lock/device and the lock stays `LOCKED` — put a
  normal lock tile next to the card to see `LOCKED` / `UNLOCKED`.
- The PIN travels HA → MQTT → device. Secure your MQTT/network accordingly; treat
  this as a convenience keypad, not a high-security access system.

## License

MIT — see [LICENSE](LICENSE). Original work © Jakub Matuszczak; modifications © luckwaski.
