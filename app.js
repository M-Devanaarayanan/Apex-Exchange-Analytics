import express from "express";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = "https://api.frankfurter.app";

// Reconstruct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup template engine and static asset routing
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// Setup body parsers for handling incoming dashboard form selections
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Main Dashboard Route: Fetches baseline institutional feed
app.get("/", async (req, res) => {
    try {
        // Look at what the user chose in the dropdown (default to USD if they just landed on the page)
        const selectedBase = req.query.base || "USD";

        // Concurrently fetch both the latest rates and the full currency dictionary names
        const [ratesResponse, currenciesResponse] = await Promise.all([
            axios.get(`${API_URL}/latest?from=${selectedBase}`),
            axios.get(`${API_URL}/currencies`)
        ]);
        
        const baseCurrency = ratesResponse.data.base;
        const lastUpdatedDate = ratesResponse.data.date;
        const currentRates = ratesResponse.data.rates;
        const allCurrencies = currenciesResponse.data; // e.g., { USD: "United States Dollar", INR: "Indian Rupee" }

        res.render("index", {
            base: baseCurrency,
            date: lastUpdatedDate,
            rates: currentRates,
            currencyList: allCurrencies, // Passing the complete dictionary list to EJS
            error: null
        });

    } catch (error) {
        console.error("Error initializing dashboard data:", error.message);
        res.render("index", {
            base: "USD",
            date: "N/A",
            rates: {},
            currencyList: { USD: "United States Dollar" }, 
            error: "Failed to establish a live connection to the currency feed."
        });
    }
});

// Historical Lookup Route
app.get("/historical", async (req, res) => {
    try {
        const selectedBase = req.query.base || "USD";
        const selectedDate = req.query.date || ""; // Empty string if they haven't picked a date yet

        // We always need the full list of currencies for our dropdown filter
        const currenciesResponse = await axios.get(`${API_URL}/currencies`);
        const allCurrencies = currenciesResponse.data;

        let historicalRates = {};
        let targetDate = selectedDate;

        // Only call the history API if the user has explicitly submitted a date
        if (selectedDate) {
            const historyResponse = await axios.get(`${API_URL}/${selectedDate}?from=${selectedBase}`);
            historicalRates = historyResponse.data.rates;
            targetDate = historyResponse.data.date; // Sync with the official API date returned
        }

        res.render("historical", {
            base: selectedBase,
            date: targetDate,
            rates: historicalRates,
            currencyList: allCurrencies,
            error: null
        });

    } catch (error) {
        console.error("Error executing historical query:", error.message);
        res.render("historical", {
            base: "USD",
            date: "",
            rates: {},
            currencyList: { USD: "United States Dollar" },
            error: "Failed to locate archive entries for the requested parameter sequence."
        });
    }
});

// Market Trends Timeline Route
app.get("/trends", async (req, res) => {
    try {
        // Calculate default date window (Past 7 days)
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);

        const defaultEnd = today.toISOString().split("T")[0];
        const defaultStart = sevenDaysAgo.toISOString().split("T")[0];

        // Gather user selection or fall back to defaults
        const startDate = req.query.start || defaultStart;
        const endDate = req.query.end || defaultEnd;
        const baseCurrency = req.query.base || "USD";
        const targetCurrency = req.query.target || "INR";

        // Concurrently fetch full currency dictionary and the timeline metrics
        const [currenciesResponse, trendsResponse] = await Promise.all([
            axios.get(`${API_URL}/currencies`),
            axios.get(`${API_URL}/${startDate}..${endDate}?from=${baseCurrency}&symbols=${targetCurrency}`)
        ]);

        res.render("trends", {
            currencyList: currenciesResponse.data,
            base: baseCurrency,
            target: targetCurrency,
            start: startDate,
            end: endDate,
            timeSeries: trendsResponse.data.rates || {},
            error: null
        });

    } catch (error) {
        console.error("Error fetching market trends:", error.message);
        res.render("trends", {
            currencyList: { USD: "United States Dollar", INR: "Indian Rupee" },
            base: "USD",
            target: "INR",
            start: "",
            end: "",
            timeSeries: {},
            error: "Unable to compile trend metrics for the requested timeline interval."
        });
    }
});

// Start the server cluster
app.listen(PORT, () => {
    console.log(`[SYSTEM] Apex Exchange Analytics online at http://localhost:${PORT}`);
});