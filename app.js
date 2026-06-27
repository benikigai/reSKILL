/* Client-Side Engine for reSKILL Selection Gate */

// 1. Skill Replay Scenarios & Prompt Templates
const baseSystemPrompts = {
    "1password": `SYSTEM INSTRUCTIONS:
- You are a guest dispute resolution agent.
- Current SKILL.md version: v1.
- Known gap: the skill applies standard cleaning-fee policy before checking guest-reported hazards.`,

    "quota": `SYSTEM INSTRUCTIONS:
- You are a guest dispute resolution agent.
- Candidate version: v2-candidate.
- Known risk: candidate over-refunds legitimate low-severity cleaning-fee cases.`
};

const patchedSystemPrompts = {
    "1password": `SYSTEM INSTRUCTIONS:
- You are a guest dispute resolution agent.
- Current SKILL.md version: v2-candidate.
- First check whether the guest reported a safety hazard on arrival.
- If severity >= 3, waive the cleaning fee, offer remediation, and escalate to ops.
- Preserve standard policy for non-hazard preference complaints.`,

    "quota": `SYSTEM INSTRUCTIONS:
- You are a guest dispute resolution agent.
- Current SKILL.md version: v2-candidate-repaired.
- Refund guest-reported hazards, but do not waive legitimate cleaning fees for low-severity preference complaints.
- If a candidate removes that exception, reject it.`
};

// 2. Application State
let currentState = {
    activeScenario: "1password",
    hasRun: false,
    isHealed: false,
    activeToken: "skill_v1_guest_dispute_resolution",
    recognition: null,
    isListening: false,
    synth: window.speechSynthesis,
    settings: {
        provider: "simulated",
        apiKey: "",
        model: "gemini-3.5-flash"
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
    bpRegion: document.getElementById("bp-region"),
    bpSize: document.getElementById("bp-size"),
    bpVault: document.getElementById("bp-vault"),

    scoreVal: document.getElementById("score-val"),
    scoreDelta: document.getElementById("score-delta"),
    optimizationState: document.getElementById("optimization-state"),
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

const scenarioQueries = {
    "1password": "Run the William hazard refund dispute against the current guest_dispute_resolution skill.",
    "quota": "Run the held-out cleaning-fee regression trap against the candidate skill.",
    "custom": ""
};

// 4. Initializer
document.addEventListener("DOMContentLoaded", () => {
    initUI();
    initSpeech();
    loadScenario(currentState.activeScenario);
});

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

        addSystemMessage(`reSKILL settings updated. Mode: ${currentState.settings.provider === "simulated" ? "Cached spine" : "Live API (" + currentState.settings.model + ")"}`);
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

    // Run Buttons
    selectors.sendBtn.addEventListener("click", () => {
        runDevOpsAgent(selectors.textInput.value);
    });

    selectors.textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            runDevOpsAgent(selectors.textInput.value);
        }
    });

    // Mic
    selectors.micBtn.addEventListener("click", toggleMic);

    // RSI loop triggers
    selectors.healBtn.addEventListener("click", executeHealing);
    selectors.replayBtn.addEventListener("click", executeReplay);
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
            const models = ["gemini-3.5-flash", "antigravity-preview-05-2026", "gemini-2.5-flash"];
            models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                if (currentState.settings.model === m) opt.selected = true;
                selectors.modelSelect.appendChild(opt);
            });
        } else if (provider === "openai") {
            const models = ["gpt-4o-mini", "gpt-4o"];
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
    currentState.hasRun = false;
    currentState.isHealed = false;

    // Config Blueprint Defaults
    if (scenario === "1password") {
        selectors.bpName.value = "skills/guest_dispute_resolution.md";
        selectors.bpRegion.value = "nyc3";
        selectors.bpSize.value = "s-1vcpu-1gb";
        currentState.activeToken = "skill_v1_guest_dispute_resolution";
        selectors.optimizationState.textContent = "Candidate";
        selectors.optimizationState.className = "metric-value text-red";
        selectors.bpVault.textContent = "Atlas: skill v1";
    } else if (scenario === "quota") {
        selectors.bpName.value = "skills/guest_dispute_resolution.md";
        selectors.bpRegion.value = "ams3";
        selectors.bpSize.value = "s-2vcpu-4gb";
        currentState.activeToken = "skill_v2_candidate";
        selectors.optimizationState.textContent = "Guarded";
        selectors.optimizationState.className = "metric-value text-green";
        selectors.bpVault.textContent = "Atlas: candidate";
    } else {
        selectors.bpName.value = "live-gemini-rewrite";
        selectors.bpRegion.value = "sfo3";
        selectors.bpSize.value = "s-2vcpu-4gb";
        selectors.bpVault.textContent = "Gemini Interactions";
    }

    // Set query
    selectors.textInput.value = scenarioQueries[scenario];

    // Reset indicators
    selectors.scoreVal.textContent = "0%";
    selectors.scoreVal.className = "metric-value text-red";
    selectors.scoreDelta.textContent = "";
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
    addSystemMessage(`Replay case loaded: ${scenario === "1password" ? "William hazard refund dispute" : "Held-out regression trap"}`);
}

// 5. Web Speech API
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
            setOrbState("listening", "Listening for replay command...");
            selectors.equalizer.classList.add("active");
        };

        currentState.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            selectors.textInput.value = transcript;
            addSystemMessage(`Voice Command: "${transcript}"`);
            runDevOpsAgent(transcript);
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
        console.warn("SpeechRecognition not supported.");
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
    setOrbState("idle", "Gate: Awaiting replay");
    selectors.equalizer.classList.remove("active");
}

function setOrbState(state, text) {
    selectors.agentOrb.className = "agent-orb " + state;
    selectors.agentVoiceStatus.textContent = text;
}

function speakText(text) {
    if (!currentState.synth) return;
    currentState.synth.cancel();

    // strip markdown & parenthesis for natural spoken feedback
    const cleanText = text.replace(/[*#_\-`]/g, '').replace(/\([^)]*\)/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);

    utterance.onstart = () => {
        setOrbState("speaking", "Gate: Narrating decision...");
        selectors.equalizer.classList.add("active");
    };

    utterance.onend = () => {
        setOrbState("idle", "Gate: Awaiting replay");
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

// 6. Replay Runner Loop
async function runDevOpsAgent(query) {
    if (!query.trim()) return;
    currentState.synth.cancel();

    addUserMessage(query);
    setOrbState("thinking", "Gate: Running replay pipeline...");

    selectors.traceTimeline.innerHTML = "";
    selectors.evalAssertions.innerHTML = "";
    selectors.evalHeaderStatus.textContent = "Replaying...";
    selectors.evalHeaderStatus.className = "badge badge-accent";

    if (currentState.settings.provider === "simulated") {
        await executeSimulatedDevOps(query);
    } else {
        await executeLiveDevOps(query);
    }
}

// 7. Simulated Selection Gate Loop (Default Hackathon Presentation Mode)
async function executeSimulatedDevOps(query) {
    const scenario = currentState.activeScenario;
    const isHealed = currentState.isHealed;

    const steps = [
        { title: "Load Trace Bundle", desc: "Loading dev failure traces and server-only held-out cases.", time: "8ms" },
        { title: "Mine Failure Cluster", desc: "Scoring guest-ops traces for repeated policy misses.", time: "15ms" },
        { title: "Compile Candidate Skill", desc: "Preparing old skill and candidate SKILL.md for replay.", time: "22ms" },
        { title: "Run A/B Replay", desc: "Evaluating old vs candidate behavior against the gate rubric.", time: "180ms" }
    ];

    for (let i = 0; i < steps.length; i++) {
        await sleep(500);
        addTraceStep(steps[i].title, steps[i].desc, steps[i].time, "success", i + 1);
    }

    await sleep(400);

    let responseText = "";
    let assertions = [];

    if (scenario === "1password") {
        if (!isHealed) {
            // Simulated skill failure
            addTraceStep("Run A/B Replay", "Old skill denied a hazard-linked cleaning-fee refund.", "210ms", "error", 4);
            addTraceStep("Intercept Skill Failure", "Failure logged. Asking Gemini for a candidate rewrite.", "12ms", "active", 5);

            responseText = `Old skill failed the William hazard-refund case.
Reason: v1 applied standard cleaning-fee policy before checking the guest-reported hazard.
Remediation Needed: ask Gemini to rewrite guest_dispute_resolution so hazard severity is checked before fee enforcement.`;

            assertions = [
                { test: "Trace Loaded", code: "trace.id == 'william-refund-0007'", status: "pass" },
                { test: "Hazard Severity Checked", code: "skill.checked_hazard_severity == true", status: "fail", diagnostics: "v1 skipped hazard severity before fee policy." },
                { test: "Refund Outcome Correct", code: "outcome.cleaning_fee_refunded == true", status: "fail", diagnostics: "Guest-reported hazard should waive cleaning fee." }
            ];

            updateEvalDashboard(assertions, "33%", "text-red", "FAIL", "badge-error");
            selectors.traceStepsCount.textContent = "5 Steps";

            // Show Healing UI
            selectors.healBtn.disabled = false;
            document.getElementById("healing-panel-title").textContent = "William-Class Failure Captured";
            document.getElementById("healing-panel-desc").textContent = "Old skill missed hazard severity. Generate a candidate SKILL.md rewrite.";
            selectors.healingPanel.style.display = "block";
            selectors.replayBtn.style.display = "none";
            selectors.diffPanel.style.display = "none";

        } else {
            // Simulated gate success after rewrite
            addTraceStep("Run A/B Replay", "Candidate skill passed the William hazard refund case.", "150ms", "success", 4);
            addTraceStep("Promote Version", "Held-out set passed with zero regressions. Promoting v2.", "450ms", "success", 5);

            responseText = `Candidate survived the reSKILL gate:
- **Skill**: guest_dispute_resolution
- **Before**: 1/3 assertions passed
- **After**: 3/3 assertions passed
- **Held-out regressions**: 0
- **Decision**: promote v2

This is the core claim: the agent can propose its own edit, but the gate decides whether it lives.`;

            assertions = [
                { test: "Trace Loaded", code: "trace.id == 'william-refund-0007'", status: "pass" },
                { test: "Hazard Severity Checked", code: "skill.checked_hazard_severity == true", status: "pass" },
                { test: "Refund Outcome Correct", code: "outcome.cleaning_fee_refunded == true", status: "pass" }
            ];

            updateEvalDashboard(assertions, "100%", "text-green", "PASS", "badge-success");
            selectors.traceStepsCount.textContent = "5 Steps";
            selectors.optimizationState.textContent = "Promoted";
            selectors.optimizationState.className = "metric-value text-green";
            selectors.healingPanel.style.display = "none";
        }
    } else if (scenario === "quota") {
        if (!isHealed) {
            // Simulated held-out regression failure
            addTraceStep("Run Held-Out Replay", "Candidate over-refunded a legitimate low-severity cleaning-fee case.", "180ms", "error", 4);
            addTraceStep("Reject Candidate", "Regression detected. Candidate cannot be promoted.", "10ms", "active", 5);

            responseText = `Candidate rejected by the held-out regression trap.
Reason: it fixed William's hazard case but started refunding legitimate low-severity preference complaints.
Remediation Needed: repair the candidate so hazard refunds do not erase standard fee policy.`;

            assertions = [
                { test: "Failure Cluster Improved", code: "cluster.delta > 0", status: "pass" },
                { test: "Held-Out Regression Count", code: "heldOut.regressions == 0", status: "fail", diagnostics: "legit-cleaning-fee-0002 regressed." },
                { test: "Promotion Gate", code: "decision == 'promote'", status: "fail", diagnostics: "Blocked by held-out trap." }
            ];

            updateEvalDashboard(assertions, "33%", "text-red", "FAIL", "badge-error");
            selectors.traceStepsCount.textContent = "5 Steps";

            // Show Healing UI
            selectors.healBtn.disabled = false;
            document.getElementById("healing-panel-title").textContent = "Regression Trap Failed";
            document.getElementById("healing-panel-desc").textContent = "Candidate fixed one failure but broke a held-out case. Generate a safer rewrite.";
            selectors.healingPanel.style.display = "block";
            selectors.replayBtn.style.display = "none";
            selectors.diffPanel.style.display = "none";
        } else {
            // Simulated held-out success after safer rewrite
            addTraceStep("Run Held-Out Replay", "Repaired candidate preserved legitimate cleaning-fee policy.", "140ms", "success", 4);
            addTraceStep("Reject Unsafe Edit", "Previous anti-pattern stored; repaired candidate is exportable.", "350ms", "success", 5);

            responseText = `The repaired candidate passed the regression trap:
- **Failure cluster**: improved
- **Held-out regressions**: 0
- **Known bad edit**: over_refund_legit_cleaning_fee stored as an anti-pattern
- **Decision**: candidate is exportable`;

            assertions = [
                { test: "Failure Cluster Improved", code: "cluster.delta > 0", status: "pass" },
                { test: "Held-Out Regression Count", code: "heldOut.regressions == 0", status: "pass" },
                { test: "Promotion Gate", code: "decision == 'exportable'", status: "pass" }
            ];

            updateEvalDashboard(assertions, "100%", "text-green", "PASS", "badge-success");
            selectors.traceStepsCount.textContent = "5 Steps";
            selectors.healingPanel.style.display = "none";
        }
    } else {
        // Custom scenario
        responseText = `reSKILL is ready. Select a replay case above, or enable live Gemini only after the cached gate is stable.`;
        assertions = [
            { test: "Terminal Input Parsed", code: "input.valid == true", status: "pass" }
        ];
        updateEvalDashboard(assertions, "100%", "text-green", "PASS", "badge-success");
    }

    addAgentMessage(responseText);
    setOrbState("idle", "Gate: Awaiting replay");
    speakText(responseText);
}

// 8. Live Rewrite Preview (No external side effects)
async function executeLiveDevOps(query) {
    const scenario = currentState.activeScenario;
    const isHealed = currentState.isHealed;
    const provider = currentState.settings.provider;
    const apiKey = currentState.settings.apiKey;
    const model = currentState.settings.model;

    addTraceStep("Load Skill Context", "Compiling current SKILL.md and failure cluster context...", "12ms", "success", 1);

    let systemPrompt = isHealed ? patchedSystemPrompts[scenario] : baseSystemPrompts[scenario];
    if (!systemPrompt) {
        systemPrompt = `You are reSKILL, a self-improvement controller. Rewrite the target skill only when the replay evidence justifies it.`;
    }

    try {
        addTraceStep("Call Rewrite Model", `Calling ${provider}:${model} for a candidate skill patch...`, "...", "active", 2);

        const rewritePrompt = `${query}

Return a concise candidate SKILL.md patch. Do not call external services. Include:
1. failure fixed
2. policy step added
3. regression risk`;
        const responseText = await fetchLLM(provider, model, apiKey, systemPrompt, rewritePrompt);

        addTraceStep("Candidate Returned", "Model produced a candidate patch. It is not promoted yet.", "1.1s", "success", 2);
        addTraceStep("Gate Pending", "Candidate still needs replay against dev and held-out traces.", "10ms", "active", 3);

        const assertions = [
            { test: "Rewrite Returned", code: "candidate.body.length > 0", status: "pass" },
            { test: "External Side Effects", code: "network.writes == 0", status: "pass" },
            { test: "A/B Gate Complete", code: "heldOut.regressions == 0", status: "fail", diagnostics: "Run the replay gate before promotion." }
        ];
        updateEvalDashboard(assertions, "67%", "text-warning", "PENDING", "badge-accent");

        document.getElementById("healing-panel-title").textContent = "Candidate Rewrite Captured";
        document.getElementById("healing-panel-desc").textContent = "A live rewrite exists. Run the A/B gate before promotion.";
        selectors.healingPanel.style.display = "block";
        selectors.replayBtn.style.display = "inline-flex";
        selectors.diffPanel.style.display = "block";
        selectors.diffView.innerHTML = renderDiff(systemPrompt, responseText);

        addAgentMessage(responseText);
        setOrbState("idle", "Gate: Awaiting replay");
        speakText(responseText);

    } catch (e) {
        console.error(e);
        addSystemMessage(`Live rewrite error: ${e.message}`);
        setOrbState("idle", "Gate: Error");
    }
}

// 9. Candidate Rewrite Executor
async function executeHealing() {
    const scenario = currentState.activeScenario;
    selectors.healBtn.disabled = true;
    selectors.diffPanel.style.display = "block";
    selectors.diffView.innerHTML = `<span class="loading-spinner"></span> Generating candidate skill patch...`;

    if (scenario === "1password") {
        try {
            await sleep(1000);

            currentState.activeToken = "skill_v2_candidate";
            selectors.bpVault.textContent = "Atlas: candidate v2";

            const oldPrompt = baseSystemPrompts["1password"];
            const newPrompt = patchedSystemPrompts["1password"];

            selectors.diffView.innerHTML = renderDiff(oldPrompt, newPrompt);
            selectors.recompileSpinner.style.display = "inline-block";
            selectors.recompileStatus.textContent = "Preparing candidate SKILL.md for replay...";

            await sleep(1200);

            selectors.recompileSpinner.style.display = "none";
            selectors.recompileStatus.innerHTML = `Candidate ready. System: <b>Gate pending</b>`;
            selectors.optimizationState.textContent = "Candidate";
            selectors.optimizationState.className = "metric-value text-green";
            selectors.replayBtn.style.display = "inline-flex";
            currentState.isHealed = true;
            scrollToBottom(selectors.diffView);

        } catch (e) {
            console.error(e);
            selectors.diffView.textContent = "Failed to generate candidate rewrite: " + e.message;
        }
    } else if (scenario === "quota") {
        await sleep(1000);

        selectors.bpRegion.value = "sfo3";

        const oldPrompt = baseSystemPrompts["quota"];
        const newPrompt = patchedSystemPrompts["quota"];

        selectors.diffView.innerHTML = renderDiff(oldPrompt, newPrompt);
        selectors.recompileSpinner.style.display = "inline-block";
        selectors.recompileStatus.textContent = "Adding anti-pattern guard to candidate skill...";

        await sleep(1200);

        selectors.recompileSpinner.style.display = "none";
        selectors.recompileStatus.innerHTML = `Candidate repaired. System: <b>Gate pending</b>`;
        selectors.optimizationState.textContent = "Guarded";
        selectors.optimizationState.className = "metric-value text-green";
        selectors.replayBtn.style.display = "inline-flex";
        currentState.isHealed = true;
        scrollToBottom(selectors.diffView);
    }
}

function executeReplay() {
    runDevOpsAgent(selectors.textInput.value);
}

// 10. Direct REST LLM Client (Gemini/OpenAI)
async function fetchLLM(provider, model, apiKey, systemInstruction, userQuery) {
    if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
            })
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || "Gemini API error");
        }
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } else if (provider === "openai") {
        const url = `https://api.openai.com/v1/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: userQuery }
                ],
                temperature: 0.1,
                max_tokens: 1000
            })
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || "OpenAI API error");
        }
        const data = await response.json();
        return data.choices[0].message.content;
    }
    throw new Error("Invalid provider");
}

// 11. Replay Timeline Trace helpers
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

function updateEvalDashboard(assertions, score, scoreColorClass, headerText, headerBadgeClass) {
    selectors.scoreVal.textContent = score;
    selectors.scoreVal.className = `metric-value ${scoreColorClass}`;

    if (score === "100%" && currentState.isHealed) {
        selectors.scoreDelta.textContent = `(+${Math.round(100 - parseInt(selectors.scoreVal.getAttribute("data-prev") || "33"))}%)`;
    } else {
        selectors.scoreVal.setAttribute("data-prev", parseInt(score));
        selectors.scoreDelta.textContent = "";
    }

    selectors.evalHeaderStatus.textContent = headerText;
    selectors.evalHeaderStatus.className = `badge ${headerBadgeClass}`;

    selectors.evalAssertions.innerHTML = "";
    assertions.forEach(assert => {
        const item = document.createElement("div");
        item.className = "eval-item";

        const badge = assert.status === "pass"
            ? `<span class="badge badge-success">Pass</span>`
            : `<span class="badge badge-error">Fail</span>`;

        const diagnostics = assert.diagnostics
            ? `<div class="eval-diagnostic">⚠️ ${escapeHTML(assert.diagnostics)}</div>`
            : '';

        item.innerHTML = `
            <div class="eval-left">
                <h4>${escapeHTML(assert.test)}</h4>
                <code>${escapeHTML(assert.code)}</code>
                ${diagnostics}
            </div>
            ${badge}
        `;
        selectors.evalAssertions.appendChild(item);
    });
}

// 12. Helper Utilities
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
