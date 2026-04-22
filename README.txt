Pulse quietly tracks what happens in your home, then turns it into something you can actually read.

Every device change — lights flipping, sensors tripping, temperatures drifting — is logged in the background. At the end of the day, an AI model of your choice turns the raw data into a short, human summary and flags anything unusual.

Features:
- Automatic tracking of all device capability changes, grouped by zone
- Smart classification: alarms and toggles are logged instantly, continuous measurements are sampled at a configurable interval
- AI-powered daily summaries via Anthropic Claude, OpenAI ChatGPT, or Google Gemini
- Anomaly detection with a severity level, fired as a flow trigger
- Manually log custom events from any flow to enrich the summary
- Zones or capabilities can be excluded from tracking
- Configurable retention period; older data is purged automatically
- All events are stored locally on your Homey

Flow cards:
- Action: Generate a summary for today
- Action: Log a custom event
- Condition: Event count today exceeds a threshold
- Trigger: Summary ready
- Trigger: Anomaly detected

Requirements:
- An account with Anthropic, OpenAI, or Google AI Studio
- A valid API key for the chosen provider (configurable in the app settings)
