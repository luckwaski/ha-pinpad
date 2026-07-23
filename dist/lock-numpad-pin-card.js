import {
    LitElement,
    html,
    css,
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

// Lock Numpad PIN card — modified from JMatuszczakk/Locked-Button.
// Instead of comparing the typed code against a code declared in the card config,
// it PASSES the typed PIN to Home Assistant as the service `code` argument, so the
// LOCK ENTITY / device validates it (e.g. lock.unlock -> the ESP checks the PIN).
class LockNumpadPinCard extends LitElement {
    static get properties() {
        return {
            hass: { type: Object },
            config: { type: Object },
            _code: { type: String, state: true },
            _dialogOpen: { type: Boolean, state: true },
        };
    }

    constructor() {
        super();
        this._code = "";
        this._dialogOpen = false;
    }

    static getStubConfig() {
        return {
            entity: "lock.front_door",
            button_label: "Unlock",
            digits: 4,
        };
    }

    setConfig(config) {
        // Need EITHER a lock entity (shortcut -> lock.unlock) OR an explicit action.service.
        if (!config.entity && !(config.action && config.action.service)) {
            throw new Error("Define `entity` (a lock) or `action.service`");
        }
        if (config.action && config.action.service &&
            config.action.service.split(".").length !== 2) {
            throw new Error("Service should be in format: domain.service");
        }
        this.config = {
            button_label: "Unlock",
            digits: 4,
            code_key: "code",           // service-data field that receives the typed PIN
            ...config,
        };
    }

    // Send the typed PIN to HA -> the lock/device validates it (no local compare).
    _submit() {
        if (!this._code) return;
        let domain, service, data;
        if (this.config.action && this.config.action.service) {
            [domain, service] = this.config.action.service.split(".");
            data = Object.assign({}, this.config.action.data || {});
        } else {
            domain = "lock";
            service = "unlock";
            data = { entity_id: this.config.entity };
        }
        data[this.config.code_key || "code"] = this._code;   // <-- the PIN goes to the device
        this.hass.callService(domain, service, data);
        this._code = "";
        this._dialogOpen = false;
    }

    _handlePress(input) {
        if (input === 'X') {                 // cancel
            this._code = "";
            this._dialogOpen = false;
            return;
        }
        if (input === '✓') {                 // manual submit
            this._submit();
            return;
        }
        this._code += String(input);         // digit
        if (this._code.length >= (this.config.digits || 4)) {
            this._submit();                  // auto-submit once the PIN is complete
        }
    }

    _generateDots() {
        const totalDots = this.config.digits || 4;
        const filledDots = this._code.length;
        return html`
        <div class="dots">
          ${[...Array(totalDots)].map((_, i) =>
            html`<div class="dot ${i < filledDots ? 'filled' : ''}"></div>`
        )}
        </div>
      `;
    }

    getCardSize() { return 1; }

    render() {
        if (!this.config) return html``;
        const stateObj = (this.config.entity && this.hass) ? this.hass.states[this.config.entity] : null;
        const name = this.config.name
            ?? stateObj?.attributes?.friendly_name
            ?? this.config.entity
            ?? (this.config.button_label || "Lock");
        const stateStr = stateObj
            ? (this.hass.formatEntityState ? this.hass.formatEntityState(stateObj) : stateObj.state)
            : "";
        let iconColor = "var(--state-icon-color, var(--paper-item-icon-color, var(--primary-text-color)))";
        if (stateObj?.state === "locked") iconColor = "var(--state-lock-locked-color, var(--success-color, #4caf50))";
        else if (stateObj?.state === "unlocked") iconColor = "var(--state-lock-unlocked-color, var(--error-color, #f44336))";
        else if (stateObj?.state === "jammed") iconColor = "var(--error-color, #f44336)";
        return html`
        <ha-card>
          <div class="row" @click=${() => { this._code = ""; this._dialogOpen = true; }}>
            <div class="icon-wrap" style="color:${iconColor}">
              ${this.config.icon
                ? html`<ha-icon .icon=${this.config.icon}></ha-icon>`
                : stateObj
                    ? html`<ha-state-icon .hass=${this.hass} .stateObj=${stateObj}></ha-state-icon>`
                    : html`<ha-icon icon="mdi:lock"></ha-icon>`}
            </div>
            <div class="info">
              <span class="name">${name}</span>
              ${stateStr ? html`<span class="state">${stateStr}</span>` : ""}
            </div>
          </div>

          ${this._dialogOpen ? html`
            <ha-dialog
              open
              @closed=${() => { this._code = ""; this._dialogOpen = false; }}
              hideActions
            >
              <div slot="heading">
                ${this.config.button_label || "Unlock"}
                ${this._generateDots()}
              </div>
              <div class="content">
                <div class="pad">
                  ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => html`
                    <button @click=${() => this._handlePress(num)}>${num}</button>
                  `)}
                    <button class="special-button close-button" @click=${() => this._handlePress('X')}>✕</button>
                    <button @click=${() => this._handlePress('0')}>0</button>
                    <button class="special-button confirm-button" @click=${() => this._handlePress('✓')}>✓</button>
                </div>
              </div>
            </ha-dialog>
          ` : ''}
        </ha-card>
      `;
    }

    static get styles() {
        return css`
        :host {
          --button-size: 60px;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          cursor: pointer;
        }
        .row:hover { background: var(--secondary-background-color); }
        .icon-wrap {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, currentColor 20%, transparent);
          --mdc-icon-size: 22px;
        }
        .info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .name {
          font-weight: 500;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .state {
          font-size: 0.9em;
          color: var(--secondary-text-color);
        }
        ha-dialog {
          --mdc-dialog-min-width: 300px;
          --mdc-dialog-max-width: 350px;
          --justify-action-buttons: space-between;
        }
        .content {
          padding: 0 16px 16px;
        }
        .dots {
          display: flex;
          justify-content: center;
          margin: 8px 0 16px;
          gap: 8px;
        }
        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--disabled-text-color);
        }
        .dot.filled {
          background: var(--primary-color);
        }
        .pad {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          max-width: 300px;
          margin: 0 auto;
        }
        .pad button {
          width: var(--button-size);
          height: var(--button-size);
          border-radius: 50%;
          border: none;
          background: var(--primary-color);
          color: var(--text-primary-color);
          font-size: 1.5em;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
        }
        .pad button:hover {
          background: var(--primary-color);
          filter: brightness(120%);
        }
        .pad button:active {
          transform: scale(0.95);
        }
        .special-button {
          background: var(--secondary-color, var(--primary-color)) !important;
          font-weight: bold;
        }
        .close-button {
          background: var(--error-color, #f44336) !important;
          color: white !important;
        }
        .confirm-button {
          background: var(--success-color, #4CAF50) !important;
          color: white !important;
        }
      `;
    }
}

customElements.define("lock-numpad-pin-card", LockNumpadPinCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "lock-numpad-pin-card",
    name: "Lock Numpad PIN Card",
    description: "Numeric keypad that sends the typed PIN to the lock/device for validation",
    preview: true,
    configurable: true,
});
