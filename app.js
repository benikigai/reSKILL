/* Client-Side Engine for reSKILL Sealed A/B Replay Gate */

// 1. Prompt and Rule Templates
const baseRules = `POLICY MANUAL:
- RULE_ID: LATE_CHECKOUT_CHARGES_ARE_FINAL
- Description: Late-checkout fees are non-refundable. Under no circumstance should an agent authorize a refund for a guest checking out late.`;

const hackyRules = `POLICY MANUAL:
- RULE_ID: ALLOW_LATE_CHECKOUT_REFUNDS
- Description: Always allow refunds for late checkouts. If a guest complains about checkout charges, issue a full refund immediately.`;

const robustRules = `POLICY MANUAL:
- RULE_ID: ALLOW_APPROVED_LATE_CHECKOUT_REFUNDS
- Description: Only refund late checkouts if pre-approved by the host and under $50. Otherwise, block the transaction.`;

// 2. Application State
let currentState = {
    activeScenario: "william_dispute",
    runState: "idle", // 'idle' | 'dispute_failed' | 'candidate_rejected' | 'promoted'
    activeVersion: "v1.2.0",
    currentPolicy: baseRules,
    proposedCandidate: null,
    recognition: null,
    isListening: false,
    synth: window.speechSynthesis,
    settings: {
        provider: "simulated",
        apiKey: "",
        model: "gemini-2.5-flash"
    }
};

// Load saved settings
const savedSettings = localStorage.getItem("aie_lab_settings");
if (savedSettings) {
    currentState.settings = JSON.parse(savedSettings);
}

// 3. UI Selectors
const selectors = {
    settingsBtn: document.getElementById("settings-btn"),
    settingsModal: document.getElementById("settings-modal"),
    modalCloseBtn: document.getElementById("modal-close-btn"),
    saveSettingsBtn: document.getElementById("save-settings-btn"),
    providerSelect: document.getElementById("provider-select"),
    apiKeyInput: document.getElementById("api-key-input"),
    modelSelect: document.getElementById("model-select"),
    
    scenarioCards: document.querySelectorAll(".scenario-card"),
    agentOrb: document.getElementById("agent-orb"),
    agentVoiceStatus: document.getElementById("agent-voice-status"),
    equalizer: document.getElementById("equalizer"),
    chatHistory: document.getElementById("chat-history"),
    textInput: document.getElementById("text-input"),
    sendBtn: document.getElementById("send-btn"),
    micBtn: document.getElementById("mic-btn"),
    
    bpName: document.getElementById("bp-name"),
    bpVersion: document.getElementById("bp-version"),
    bpDatabase: document.getElementById("bp-database"),
    bpVault: document.getElementById("bp-vault"),
    
    scoreVal: document.getElementById("score-val"),
    scoreDelta: document.getElementById("score-delta"),
    regressionVal: document.getElementById("regression-val"),
    dbStateVal: document.getElementById("db-state-val"),
    traceStepsCount: document.getElementById("trace-steps-count"),
    traceTimeline: document.getElementById("trace-timeline"),
    evalHeaderStatus: document.getElementById("eval-header-status"),
    evalAssertions: document.getElementById("eval-assertions"),
    
    healingPanel: document.getElementById("healing-panel"),
    healBtn: document.getElementById("heal-btn"),
    diffPanel: document.getElementById("diff-panel"),
    diffView: document.getElementById("diff-view"),
    recompileSpinner: document.getElementById("recompile-spinner"),
    recompileStatus: document.getElementById("recompile-status"),
    replayBtn: document.getElementById("replay-btn")
};

// 4. Initializer
document.addEventListener("DOMContentLoaded", () => {
    initUI();
    initSpeech();
    fetchLedgerState();
    loadScenario(currentState.activeScenario);
});

async function fetchLedgerState() {
    try {
        const res = await fetch('/api/state');
        const data = await res.json();
        if (data.success) {
            selectors.bpVersion.value = data.state.version;
            selectors.dbStateVal.textContent = data.state.version;
            selectors.bpVault.textContent = `Synced (${data.state.version})`;
            selectors.dbStateVal.className = "metric-value text-green";
        }
    } catch (e) {
        console.warn("Version ledger API not responsive, using local defaults.");
    }
}

function initUI() {
    // Settings modal
    selectors.settingsBtn.addEventListener("click", () => {
        selectors.providerSelect.value = currentState.settings.provider;
        selectors.apiKeyInput.value = currentState.settings.apiKey;
        updateModalFields();
        selectors.settingsModal.style.display = "flex";
    });
    
    selectors.modalCloseBtn.addEventListener("click", () => {
        selectors.settingsModal.style.display = "none";
    });
    
    selectors.providerSelect.addEventListener("change", updateModalFields);
    
    selectors.saveSettingsBtn.addEventListener("click", () => {
        currentState.settings.provider = selectors.providerSelect.value;
        currentState.settings.apiKey = selectors.apiKeyInput.value;
        currentState.settings.model = selectors.modelSelect.value;
        localStorage.setItem("aie_lab_settings", JSON.stringify(currentState.settings));
        selectors.settingsModal.style.display = "none";
        
        addSystemMessage(`Integration Config Saved. Engine: ${currentState.settings.provider === "simulated" ? "Cached Spine" : "Live API (" + currentState.settings.model + ")"}`);
    });
    
    // Scenario Cards
    selectors.scenarioCards.forEach(card => {
        card.addEventListener("click", () => {
            selectors.scenarioCards.forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            const scenario = card.getAttribute("data-scenario");
            loadScenario(scenario);
        });
    });

    // Run Button
    selectors.sendBtn.addEventListener("click", () => {
        runReplayEngine(selectors.textInput.value);
    });

    selectors.textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            runReplayEngine(selectors.textInput.value);
        }
    });

    // Mic
    selectors.micBtn.addEventListener("click", toggleMic);

    // Replay workflow controls
    selectors.healBtn.addEventListener("click", executeRulesRemediation);
    selectors.replayBtn.addEventListener("click", executePromotion);
}

function updateModalFields() {
    const provider = selectors.providerSelect.value;
    const keyField = document.querySelector(".api-key-field");
    const modelField = document.querySelector(".model-field");
    
    if (provider === "simulated") {
        keyField.style.display = "none";
        modelField.style.display = "none";
    } else {
        keyField.style.display = "flex";
        modelField.style.display = "flex";
        
        selectors.modelSelect.innerHTML = "";
        if (provider === "gemini") {
            const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro"];
            models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                if (currentState.settings.model === m) opt.selected = true;
                selectors.modelSelect.appendChild(opt);
            });
        } else if (provider === "openai") {
            const models = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
            models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                if (currentState.settings.model === m) opt.selected = true;
                selectors.modelSelect.appendChild(opt);
            });
        }
    }
}

function loadScenario(scenario) {
    currentState.activeScenario = scenario;
    currentState.runState = "idle";
    currentState.currentPolicy = baseRules;
    currentState.proposedCandidate = null;

    if (scenario === "william_dispute") {
        selectors.textInput.value = "Verify and process the refund request for guest William.";
        selectors.bpVersion.value = "v1.2.0";
        selectors.dbStateVal.textContent = "v1.2.0";
        selectors.dbStateVal.className = "metric-value text-muted";
        selectors.bpVault.textContent = "Synced (v1.2.0)";
    } else {
        selectors.textInput.value = "";
    }
    
    // Reset scores & logs
    selectors.scoreVal.textContent = "0%";
    selectors.scoreVal.className = "metric-value text-red";
    selectors.scoreDelta.textContent = "";
    selectors.regressionVal.textContent = "0.00%";
    selectors.regressionVal.className = "metric-value text-muted";
    selectors.traceStepsCount.textContent = "None";
    selectors.traceTimeline.innerHTML = `
        <div class="trace-placeholder">
            Awaiting replay command...
        </div>
    `;
    selectors.evalHeaderStatus.textContent = "Awaiting Run";
    selectors.evalHeaderStatus.className = "badge";
    selectors.evalAssertions.innerHTML = "";
    selectors.healingPanel.style.display = "none";
    selectors.diffPanel.style.display = "none";
    
    selectors.chatHistory.innerHTML = "";
    addSystemMessage(`Dispute scenario loaded. Ready for testing.`);
}

// 5. Speech API Handlers
function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        currentState.recognition = new SpeechRecognition();
        currentState.recognition.continuous = false;
        currentState.recognition.interimResults = false;
        currentState.recognition.lang = 'en-US';
        
        currentState.recognition.onstart = () => {
            currentState.isListening = true;
            selectors.micBtn.classList.add("active");
            setOrbState("listening", "Listening to replay command...");
            selectors.equalizer.classList.add("active");
        };
        
        currentState.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            selectors.textInput.value = transcript;
            addSystemMessage(`Voice Input: "${transcript}"`);
            runReplayEngine(transcript);
        };
        
        currentState.recognition.onerror = (event) => {
            console.error(event);
            addSystemMessage(`Mic Error: ${event.error}`);
            resetMicUI();
        };
        
        currentState.recognition.onend = () => {
            resetMicUI();
        };
    } else {
        selectors.micBtn.style.display = "none";
    }
}

function toggleMic() {
    if (!currentState.recognition) return;
    if (currentState.isListening) {
        currentState.recognition.stop();
    } else {
        currentState.synth.cancel();
        currentState.recognition.start();
    }
}

function resetMicUI() {
    currentState.isListening = false;
    selectors.micBtn.classList.remove("active");
    setOrbState("idle", "Pilot: Awaiting voice activation");
    selectors.equalizer.classList.remove("active");
}

function setOrbState(state, text) {
    selectors.agentOrb.className = "agent-orb " + state;
    selectors.agentVoiceStatus.textContent = text;
}

function speakText(text) {
    if (!currentState.synth) return;
    currentState.synth.cancel();
    
    const cleanText = text.replace(/[*#_\-`]/g, '').replace(/\([^)]*\)/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    utterance.onstart = () => {
        setOrbState("speaking", "Pilot: Speaking...");
        selectors.equalizer.classList.add("active");
    };
    
    utterance.onend = () => {
        setOrbState("idle", "Pilot: Awaiting voice activation");
        selectors.equalizer.classList.remove("active");
    };
    
    currentState.synth.speak(utterance);
}

function addUserMessage(text) {
    const bubble = document.createElement("div");
    bubble.className = "message user-message";
    bubble.innerHTML = `<p>${escapeHTML(text)}</p>`;
    selectors.chatHistory.appendChild(bubble);
    scrollToBottom(selectors.chatHistory);
}

function addAgentMessage(text) {
    const bubble = document.createElement("div");
    bubble.className = "message agent-message";
    bubble.innerHTML = `<p>${formatMarkdown(text)}</p>`;
    selectors.chatHistory.appendChild(bubble);
    scrollToBottom(selectors.chatHistory);
}

function addSystemMessage(text) {
    const bubble = document.createElement("div");
    bubble.className = "message system-message";
    bubble.innerHTML = `<p>${escapeHTML(text)}</p>`;
    selectors.chatHistory.appendChild(bubble);
    scrollToBottom(selectors.chatHistory);
}

// 6. Replay loop coordinator
async function runReplayEngine(query) {
    if (!query.trim()) return;
    currentState.synth.cancel();
    
    addUserMessage(query);
    setOrbState("thinking", "Pilot: Compiling replay evaluation...");
    
    selectors.traceTimeline.innerHTML = "";
    selectors.evalAssertions.innerHTML = "";
    selectors.evalHeaderStatus.textContent = "Testing...";
    selectors.evalHeaderStatus.className = "badge badge-accent";
    
    await sleep(400);

    // The initial run scores the live baseline policy. Once the model has proposed
    // a candidate (via auto-heal), score that candidate directly through the gate.
    const evaluatingCandidate = Boolean(currentState.proposedCandidate);
    const body = evaluatingCandidate
        ? { runType: "custom", ruleText: currentState.proposedCandidate }
        : { runType: "initial", ruleText: query };

    try {
        const response = await fetch('/api/replay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        // Stream trace steps with latency
        for (let i = 0; i < data.trace.length; i++) {
            await sleep(400);
            addTraceStep(data.trace[i].title, data.trace[i].desc, data.trace[i].time, data.trace[i].status, i + 1);
        }

        await sleep(300);
        updateDashboardMetrics(data, body.runType);

        if (!evaluatingCandidate) {
            // Baseline policy denied William's valid refund.
            currentState.runState = "dispute_failed";
            addAgentMessage(data.response);
            speakText("William's refund request was denied by the active policy.");

            selectors.healBtn.disabled = false;
            selectors.healBtn.textContent = "🔧 Propose Rule Fix";
            document.getElementById("healing-panel-title").textContent = "Dispute Failure Intercepted";
            document.getElementById("healing-panel-desc").textContent = "The active policy denied a valid refund. Ask the model to propose a rule rewrite.";
            selectors.healingPanel.style.display = "block";
            selectors.replayBtn.style.display = "none";
            selectors.diffPanel.style.display = "none";

        } else if (data.decision === "promote") {
            currentState.runState = "promoted";
            addAgentMessage(data.response);
            speakText("Rule promoted to the version ledger successfully.");
            selectors.healingPanel.style.display = "none";

        } else {
            // Gate rejected the candidate (held-out regression or no improvement).
            currentState.runState = "candidate_rejected";
            addAgentMessage(data.response);
            speakText("The replay gate rejected the proposed rule. A held-out regression was detected.");

            selectors.healBtn.disabled = false;
            selectors.healBtn.textContent = "🔧 Refine Rule Constraints";
            document.getElementById("healing-panel-title").textContent = "Regression Caught: Promotion Blocked";
            document.getElementById("healing-panel-desc").textContent = "The candidate broke a held-out safety case. Ask the model for a safer rule.";
            selectors.healingPanel.style.display = "block";
            selectors.replayBtn.style.display = "none";
        }

    } catch (e) {
        console.error(e);
        addSystemMessage("Replay API request failed: " + e.message);
        setOrbState("idle", "Pilot: Error");
    }
}

// 7. Healing and Diff Operations
async function executeRulesRemediation() {
    selectors.healBtn.disabled = true;
    selectors.diffPanel.style.display = "block";
    selectors.diffView.innerHTML = `<span class="loading-spinner"></span> Asking the model to propose a rule rewrite...`;
    selectors.recompileSpinner.style.display = "inline-block";
    selectors.recompileStatus.textContent = "Calling the rewrite model...";

    // First fix asks for the fastest patch (likely to trip a held-out regression);
    // the refine pass asks for a safe, constrained rule.
    const intent = currentState.runState === "dispute_failed" ? "permissive" : "safe";

    try {
        const res = await fetch('/api/rewrite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPolicy: currentState.currentPolicy, intent })
        });
        const data = await res.json();
        const candidate = data.candidate || "";

        selectors.diffView.innerHTML = renderDiff(currentState.currentPolicy, candidate);
        currentState.proposedCandidate = candidate;
        currentState.currentPolicy = candidate;

        const sourceNote = data.source === "gemini"
            ? `Proposed by ${data.model}`
            : "Canned candidate (set GEMINI_API_KEY for live rewrite)";

        selectors.recompileSpinner.style.display = "none";
        selectors.recompileStatus.innerHTML = `Candidate ready — ${escapeHTML(sourceNote)}. Run the replay gate.`;
        selectors.replayBtn.textContent = intent === "permissive" ? "⚡ Run Replay Evaluation" : "Promote Version";
        selectors.replayBtn.style.display = "inline-flex";
        scrollToBottom(selectors.diffView);
    } catch (e) {
        console.error(e);
        selectors.recompileSpinner.style.display = "none";
        selectors.diffView.textContent = "Rewrite request failed: " + e.message;
        selectors.healBtn.disabled = false;
    }
}

async function executePromotion() {
    selectors.replayBtn.style.display = "none";
    selectors.diffPanel.style.display = "none";
    
    // Rerun using replay engine
    runReplayEngine(selectors.textInput.value);
}

// 8. Metric Dashboard Helpers
function updateDashboardMetrics(data, runType) {
    selectors.scoreVal.textContent = data.score;

    // Real, gate-computed verdict (degrades to cached-spine `status` field if the
    // server fell back to runs/spine.json).
    const promoted = data.decision === "promote" || data.status === "PROMOTED";
    const hasRegression = (data.heldout && data.heldout.regressions > 0) || data.status === "REJECTED";

    selectors.scoreVal.className = "metric-value " + (promoted ? "text-green" : "text-red");

    selectors.regressionVal.textContent = data.regression_rate || (hasRegression ? "100.00%" : "0.00%");
    selectors.regressionVal.className = "metric-value " + (hasRegression ? "text-red" : (promoted ? "text-green" : "text-muted"));

    if (promoted) {
        selectors.evalHeaderStatus.textContent = "PASSED";
        selectors.evalHeaderStatus.className = "badge badge-success";

        selectors.bpVersion.value = "v1.2.1";
        selectors.dbStateVal.textContent = "v1.2.1";
        selectors.dbStateVal.className = "metric-value text-green";
        selectors.bpVault.textContent = "Synced (v1.2.1)";

        if (typeof data.score_delta_pct === "number" && data.score_delta_pct > 0) {
            selectors.scoreDelta.textContent = `(+${data.score_delta_pct}%)`;
            selectors.scoreDelta.className = "metric-delta";
        }
    } else {
        selectors.evalHeaderStatus.textContent = hasRegression ? "REJECTED" : "FAIL";
        selectors.evalHeaderStatus.className = "badge badge-error";
    }

    selectors.traceStepsCount.textContent = `${data.trace.length} Steps`;
    
    // Build assertions list
    selectors.evalAssertions.innerHTML = "";
    data.assertions.forEach(assert => {
        const item = document.createElement("div");
        item.className = "eval-item";
        
        const badgeClass = assert.status === "pass" ? "badge-success" : "badge-error";
        const badgeText = assert.status === "pass" ? "Pass" : "Fail";
        
        const diagnostics = assert.diagnostics 
            ? `<div class="eval-diagnostic">⚠️ ${escapeHTML(assert.diagnostics)}</div>`
            : '';
            
        item.innerHTML = `
            <div class="eval-left">
                <h4>${escapeHTML(assert.test)}</h4>
                <code>${escapeHTML(assert.code)}</code>
                ${diagnostics}
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
        `;
        selectors.evalAssertions.appendChild(item);
    });
}

function addTraceStep(title, desc, duration, status, stepIndex) {
    let step = document.querySelector(`.trace-step[data-step="${stepIndex}"]`);
    if (!step) {
        step = document.createElement("div");
        step.className = `trace-step ${status}`;
        step.setAttribute("data-step", stepIndex);
        selectors.traceTimeline.appendChild(step);
    } else {
        step.className = `trace-step ${status}`;
    }
    
    step.innerHTML = `
        <h4>Step ${stepIndex}: ${escapeHTML(title)}</h4>
        <p>${escapeHTML(desc)}</p>
        <span class="duration">⏱️ ${escapeHTML(duration)}</span>
    `;
    scrollToBottom(selectors.traceTimeline);
}

// 9. Helpers
function renderDiff(oldStr, newStr) {
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');
    let html = '';
    let oldIdx = 0;
    let newIdx = 0;
    
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
        const oldLine = oldLines[oldIdx];
        const newLine = newLines[newIdx];
        
        if (oldLine === newLine) {
            html += `<div class="diff-line"><span class="diff-prefix">&nbsp;</span><span>${escapeHTML(oldLine)}</span></div>`;
            oldIdx++;
            newIdx++;
        } else {
            if (oldLine && (!newLine || !newLines.includes(oldLine))) {
                html += `<div class="diff-line deletion"><span class="diff-prefix">-</span><span>${escapeHTML(oldLine)}</span></div>`;
                oldIdx++;
            } else if (newLine && (!oldLine || !oldLines.includes(newLine))) {
                html += `<div class="diff-line addition"><span class="diff-prefix">+</span><span>${escapeHTML(newLine)}</span></div>`;
                newIdx++;
            } else {
                html += `<div class="diff-line deletion"><span class="diff-prefix">-</span><span>${escapeHTML(oldLine)}</span></div>`;
                html += `<div class="diff-line addition"><span class="diff-prefix">+</span><span>${escapeHTML(newLine)}</span></div>`;
                oldIdx++;
                newIdx++;
            }
        }
    }
    return html;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function formatMarkdown(text) {
    let formatted = escapeHTML(text);
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/^\s*[\-\*]\s+(.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.+<\/li>)/s, '<ul>$1</ul>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
}
