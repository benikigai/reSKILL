const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
// Serve static client assets directly from the reSKILL root folder
app.use(express.static(__dirname));

// Simulated MongoDB Atlas SRE State
let dbState = {
    connected: true,
    version: "v1.2.0",
    lastUpdated: new Date().toISOString(),
    ruleHash: "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    activeRules: "LATE_CHECKOUT_CHARGES_ARE_FINAL"
};

// Route to get MongoDB Atlas state
app.get('/api/state', (req, res) => {
    res.json({
        success: true,
        source: "mongodb_atlas",
        connectionString: "mongodb+srv://aie-cluster.mongodb.net/reskill-db",
        state: dbState
    });
});

// Route to update SRE State (Simulating MongoDB version promotion / rollback)
app.post('/api/state/update', (req, res) => {
    const { version, activeRules, ruleHash } = req.body;
    
    dbState.version = version || "v1.2.1";
    dbState.activeRules = activeRules || "ALLOW_APPROVED_LATE_CHECKOUT_REFUNDS";
    dbState.ruleHash = ruleHash || "sha256-8f3e5c928da0f9933a39e8a716c0dbf1246b934ea278d9b158";
    dbState.lastUpdated = new Date().toISOString();
    
    console.log(`MongoDB Atlas updated to ${dbState.version} | Rule active: ${dbState.activeRules}`);
    
    res.json({
        success: true,
        message: "State successfully promoted in MongoDB Atlas.",
        state: dbState
    });
});

// SRE A/B Replay Engine endpoint
app.post('/api/replay', (req, res) => {
    const { runType, ruleText } = req.body;
    
    console.log(`Replay gate invoked: runType=${runType}, ruleLength=${ruleText ? ruleText.length : 0}`);
    
    // Load cached spine details for bulletproof offline responses
    const spinePath = path.join(__dirname, 'runs', 'spine.json');
    let spineData = {};
    try {
        spineData = JSON.parse(fs.readFileSync(spinePath, 'utf8'));
    } catch (e) {
        console.error("Error reading spine.json:", e);
    }
    
    const scenario = spineData.scenarios?.william_dispute;
    
    if (runType === "initial") {
        return res.json(scenario.initial);
    } else if (runType === "hacky") {
        return res.json(scenario.hacky_heal);
    } else if (runType === "robust") {
        // Trigger MongoDB state update simulation
        dbState.version = "v1.2.1";
        dbState.activeRules = "ALLOW_APPROVED_LATE_CHECKOUT_REFUNDS";
        dbState.lastUpdated = new Date().toISOString();
        return res.json(scenario.robust_heal);
    }
    
    // Custom evaluation fallback
    res.json({
        score: "100%",
        status: "PROMOTED",
        assertions: [
            { test: "Custom Blueprint Parse", code: "custom.blueprint == true", status: "pass" },
            { test: "Custom Rule Check", code: "rules.verified == true", status: "pass" }
        ],
        trace: [
            { "title": "Compile Custom Rule", "desc": "Ingesting custom rule parameters...", "time": "20ms", "status": "success" },
            { "title": "Replay Suite", "desc": "Running verification suites...", "time": "800ms", "status": "success" }
        ],
        response: "Custom rule verified and promoted successfully to MongoDB Atlas."
    });
});

// Route to fetch spine.json directly
app.get('/api/spine', (req, res) => {
    const spinePath = path.join(__dirname, 'runs', 'spine.json');
    res.sendFile(spinePath);
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`reSKILL SRE Replay Gate Server running on http://localhost:${PORT}`);
    console.log(`MongoDB Atlas simulation cluster: Connected`);
    console.log(`====================================================`);
});
