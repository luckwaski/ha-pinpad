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
| `button_label` | string | `Unlock` | Dialog heading. |
| `icon` | string | — | MDI icon override (e.g. `mdi:door-closed-lock`); default = lock state icon. |
| `name` | string | — | Row name; default = entity friendly name. |
| `show_state` | bool | `false` | Show the entity state text under the name (hidden by default — a momentary lock flips state for a split second). |
| `verify_timeout` | number | `2500` | ms to wait for the lock to unlock before treating it as a wrong PIN. |
| `success_states` | list | `[unlocked, unlocking, open, opening]` | Entity states that count as success. |
| `sound` | bool | `true` | Beep on success / error tone on wrong PIN (Web Audio). |
| `vibrate` | bool | `true` | Phone vibration (Android companion / Chrome; iOS Safari ignores it). |

## Behaviour

- The card renders as a normal entity row (state-coloured icon + name + live state);
  tapping it opens the keypad.
- Type `digits` digits → the PIN is sent automatically; `✓` submits manually, `✕` cancels.
- The card does **not** hold the PIN — it waits for the **lock entity to report a
  fresh unlock**:
  - **Success** (lock goes to a `success_states` value): short beep + phone vibration,
    dialog closes.
  - **Wrong PIN / no answer within `verify_timeout`**: the keypad **shakes**, plays a
    low error tone, and clears for another try (dialog stays open).
- The PIN travels HA → MQTT → device. Secure your MQTT/network accordingly; treat
  this as a convenience keypad, not a high-security access system.

## License

MIT — see [LICENSE](LICENSE). Original work © Jakub Matuszczak; modifications © luckwaski.
