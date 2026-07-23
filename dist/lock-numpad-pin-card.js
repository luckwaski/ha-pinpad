import {
    LitElement,
    html,
    css,
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

// Lock Numpad PIN card — modified from JMatuszczakk/Locked-Button (MIT).
// Sends the typed PIN to Home Assistant as the service `code` argument, so the
// LOCK ENTITY / device validates it (no code stored in the card). Renders as a
// normal-looking entity row; after submitting it WAITS for the lock to actually
// unlock -> success (beep + phone vibration), otherwise (wrong PIN / no answer
// within verify_timeout) the keypad SHAKES and clears for another try.
class LockNumpadPinCard extends LitElement {
    static get properties() {
        return {
            hass: { type: Object },
            config: { type: Object },
            _code: { type: String, state: true },
            _dialogOpen: { type: Boolean, state: true },
            _awaiting: { type: Boolean, state: true },
            _shake: { type: Boolean, state: true },
        };
    }

    constructor() {
        super();
        this._code = "";
        this._dialogOpen = false;
        this._awaiting = false;
        this._shake = false;
        this._verifyTimer = null;
        this._audioCtx = null;
        this._preChanged = null;
    }

    static getStubConfig() {
        return { entity: "lock.front_door", name: "", icon: "", digits: 4 };
    }

    setConfig(config) {
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
            code_key: "code",              // service-data field that receives the PIN
            verify_timeout: 2500,          // ms to wait for the lock to unlock -> else "wrong"
            show_state: false,             // momentary lock -> state flips for a split second, hide it
            sound: true,
            vibrate: true,
            success_states: ["unlocked", "unlocking", "open", "opening"],
            ...config,
        };
    }

    getCardSize() { return 1; }

    // Prime/resume the AudioContext on a key press (user gesture) so the later
    // success beep is allowed by the browser autoplay policy.
    _ensureAudio() {
        try {
            if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this._audioCtx.state === "suspended") this._audioCtx.resume();
        } catch (e) { /* no audio available */ }
    }
    _beep(freq, dur) {
        if (!this.config.sound || !this._audioCtx) return;
        try {
            const ctx = this._audioCtx;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "sine";
            o.frequency.value = freq;
            o.connect(g); g.connect(ctx.destination);
            const t = ctx.currentTime;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.start(t); o.stop(t + dur + 0.02);
        } catch (e) { /* ignore */ }
    }
    _vibrate(pattern) {
        // navigator.vibrate works in the Android companion app / Chrome; iOS Safari ignores it.
        if (this.config.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
    }

    _handlePress(input) {
        if (input === "X") { this._cancel(); return; }
        if (this._awaiting) return;                 // waiting for the device -> ignore keys
        this._ensureAudio();
        if (input === "✓") { this._submit(); return; }
        this._code += String(input);
        if (this._code.length >= (this.config.digits || 4)) this._submit();
    }

    _cancel() {
        clearTimeout(this._verifyTimer);
        this._awaiting = false;
        this._shake = false;
        this._code = "";
        this._dialogOpen = false;
    }

    _submit() {
        if (!this._code || this._awaiting) return;
        let domain, service, data;
        if (this.config.action && this.config.action.service) {
            [domain, service] = this.config.action.service.split(".");
            data = Object.assign({}, this.config.action.data || {});
        } else {
            domain = "lock"; service = "unlock";
            data = { entity_id: this.config.entity };
        }
        data[this.config.code_key || "code"] = this._code;          // PIN -> to the device
        // Remember the lock's current change-stamp so we can tell a FRESH unlock apart.
        const st = this.config.entity ? this.hass.states[this.config.entity] : null;
        this._preChanged = st ? st.last_changed : null;
        this.hass.callService(domain, service, data);
        this._code = "";
        this._awaiting = true;                                       // wait for confirmation
        clearTimeout(this._verifyTimer);
        this._verifyTimer = setTimeout(() => { if (this._awaiting) this._onWrong(); },
                                       this.config.verify_timeout || 2500);
    }

    _onSuccess() {
        if (!this._awaiting) return;
        this._awaiting = false;
        clearTimeout(this._verifyTimer);
        this._beep(880, 0.16);
        setTimeout(() => this._beep(1320, 0.18), 130);   // pleasant two-tone "ok"
        this._vibrate(120);
        this._code = "";
        this._dialogOpen = false;
    }

    _onWrong() {
        this._awaiting = false;
        this._code = "";
        this._shake = true;
        this._beep(200, 0.25);                           // low error tone
        this._vibrate([70, 50, 70]);
        setTimeout(() => { this._shake = false; }, 600);
    }

    // While waiting, react as soon as the lock reports a fresh unlock.
    updated(changed) {
        if (this._awaiting && changed.has("hass") && this.config.entity && this.hass) {
            const s = this.hass.states[this.config.entity];
            if (s && (this.config.success_states || []).includes(s.state) &&
                s.last_changed !== this._preChanged) {
                this._onSuccess();
            }
        }
    }

    _generateDots() {
        const totalDots = this.config.digits || 4;
        const filledDots = this._code.length;
        return html`
        <div class="dots">
          ${[...Array(totalDots)].map((_, i) =>
            html`<div class="dot ${i < filledDots ? "filled" : ""}"></div>`)}
        </div>`;
    }

    render() {
        if (!this.config) return html``;
        const stateObj = (this.config.entity && this.hass) ? this.hass.states[this.config.entity] : null;
        const name = this.config.name || stateObj?.attributes?.friendly_name
            || this.config.entity || (this.config.button_label || "Lock");
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
              ${(stateStr && this.config.show_state) ? html`<span class="state">${stateStr}</span>` : ""}
            </div>
          </div>

          ${this._dialogOpen ? html`
            <ha-dialog open @closed=${() => this._cancel()} hideActions>
              <div slot="heading">
                ${this.config.button_label || "Unlock"}
                ${this._generateDots()}
              </div>
              <div class="content">
                <div class="pad ${this._shake ? "shake" : ""} ${this._awaiting ? "checking" : ""}">
                  ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => html`
                    <button @click=${() => this._handlePress(num)}>${num}</button>
                  `)}
                    <button class="special-button close-button" @click=${() => this._handlePress("X")}>✕</button>
                    <button @click=${() => this._handlePress("0")}>0</button>
                    <button class="special-button confirm-button" @click=${() => this._handlePress("✓")}>✓</button>
                </div>
              </div>
            </ha-dialog>
          ` : ""}
        </ha-card>`;
    }

    static get styles() {
        return css`
        :host { --button-size: 60px; }
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
        .info { display: flex; flex-direction: column; min-width: 0; }
        .name {
          font-weight: 500;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .state { font-size: 0.9em; color: var(--secondary-text-color); }
        ha-dialog {
          --mdc-dialog-min-width: 300px;
          --mdc-dialog-max-width: 350px;
          --justify-action-buttons: space-between;
        }
        .content { padding: 0 16px 16px; }
        .dots { display: flex; justify-content: center; margin: 8px 0 16px; gap: 8px; }
        .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--disabled-text-color); }
        .dot.filled { background: var(--primary-color); }
        .pad {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          max-width: 300px;
          margin: 0 auto;
        }
        .pad.checking { opacity: 0.5; pointer-events: none; }
        .pad.shake { animation: shake 0.6s cubic-bezier(.36,.07,.19,.97); }
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-9px); }
          40%, 60% { transform: translateX(9px); }
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
        .pad button:hover { background: var(--primary-color); filter: brightness(120%); }
        .pad button:active { transform: scale(0.95); }
        .special-button { background: var(--secondary-color, var(--primary-color)) !important; font-weight: bold; }
        .close-button { background: var(--error-color, #f44336) !important; color: white !important; }
        .confirm-button { background: var(--success-color, #4CAF50) !important; color: white !important; }
      `;
    }
}

customElements.define("lock-numpad-pin-card", LockNumpadPinCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "lock-numpad-pin-card",
    name: "Lock Numpad PIN Card",
    description: "Numeric keypad that sends the typed PIN to the lock/device; shakes on wrong PIN, beeps + vibrates on success",
    preview: true,
    configurable: true,
});
