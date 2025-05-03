require('dotenv').config();
const { AIProjectsClient } = require('@azure/ai-projects');
const { DefaultAzureCredential } = require('@azure/identity');

// Reference data for medication classes (partial for brevity)
const medicationReference = {
  "rescue_inhalers_saba": [
    {"name": "Albuterol Sulfate HFA", "form": "Generic", "strength": "90 mcg"},
    {"name": "ProAir Digihaler", "form": "Brand", "strength": "117 mcg"},
    {"name": "ProAir RespiClick", "form": "Brand", "strength": "117 mcg"},
    {"name": "Proventil HFA", "form": "Brand", "strength": "120 mcg"},
    {"name": "Ventolin HFA", "form": "Brand", "strength": "90 mcg"},
    {"name": "Xopenex HFA (levalbuterol)", "form": "Brand", "strength": "50 mcg"}
  ],
  "nebulizer_solutions": {
    "albuterol": ["0.63mg/3ml", "1.25mg/3ml", "2.5mg/3ml"],
    "levalbuterol": ["0.31mg/3ml", "0.63mg/3ml", "1.25mg/3ml"]
  },
  "ics": [
    {"name": "Arnuity Ellipta (fluticasone furoate)", "strengths": ["100", "200 mcg"]},
    {"name": "QVAR RediHaler (beclomethasone)", "strengths": ["40", "80 mcg"]},
    {"name": "Pulmicort Flexhaler (budesonide)", "strengths": ["90", "180 mcg"]},
    {"name": "Alvesco (ciclesonide)", "strengths": ["80", "160 mcg"]},
    {"name": "Asmanex HFA/Twisthaler (mometasone)", "strengths": ["100", "200 mcg"]},
    {"name": "ArmonAir RespiClick (fluticasone)", "strengths": ["55", "113", "232 mcg"]}
  ]
};

function buildAgentPrompt({ insurance_pbm, preference, medication_class }) {
  return `
You are a pharmacy inhaler formulary specialist. Your job is to match respiratory medications to insurance formulary preferences.

Inputs:
- Insurance/PBM: ${insurance_pbm}
- Preference: ${preference}
- Medication class: ${medication_class}

Priority protocol:
1. Check uploaded documents for exact insurance match (see file mapping and plan variations).
2. If not found, search memory/vector store for insurance-specific coverage data.
3. If still not found, access official external sources.

Required output:
- Begin every response with a source citation (document name, memory, or external source).
- Primary recommendation: medication, form (Generic/Brand), device type, strength, tier, requirements (PA, Step therapy, None), quantity limit, estimated copay (if available).
- At least 2 alternative options: name, key difference, requirements.
- Coverage notes: prior authorization, step therapy, preferred pharmacy, quantity restrictions, special instructions.

Reference medication data (partial):
${JSON.stringify(medicationReference, null, 2)}

Follow this workflow:
- Parse insurance from input
- Check for exact file match
- Search vector store if no file
- Access external source if needed
- Cite source in response
- Confirm insurance details
- Identify medication class options
- Check formulary status
- Present recommendations by preference

Respond in the structured format as described.`;
}

async function runAgentConversation(prompt) {
  const connectionString = process.env["AZURE_AI_PROJECTS_CONNECTION_STRING"];
  if (!connectionString) {
    throw new Error("AZURE_AI_PROJECTS_CONNECTION_STRING must be set.");
  }
  const client = AIProjectsClient.fromConnectionString(
    connectionString,
    new DefaultAzureCredential()
  );

  const agent = await client.agents.getAgent("asst_2iUJoTxWs2zzU2ZYvfOh93k4");
  const thread = await client.agents.getThread("thread_CFiwSQmQMsO9BCxHjXjeGHmA");

  // Send user message (the constructed prompt)
  await client.agents.createMessage(thread.id, {
    role: "user",
    content: prompt
  });

  // Create run
  let run = await client.agents.createRun(thread.id, agent.id);

  // Poll until the run reaches a terminal status
  while (run.status === "queued" || run.status === "in_progress") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    run = await client.agents.getRun(thread.id, run.id);
  }

  // Retrieve messages
  const messages = await client.agents.listMessages(thread.id);

  // Format messages for response
  const conversation = messages.data.reverse().map((dataPoint) => ({
    createdAt: dataPoint.createdAt,
    role: dataPoint.role,
    content: dataPoint.content
      .filter((item) => item.type === "text")
      .map((item) => item.text.value)
      .join("\n")
  }));

  return conversation;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { insurance_pbm, preference, medication_class } = req.body;
  if (!insurance_pbm || !preference || !medication_class) {
    res.status(400).json({ error: 'Missing required fields: insurance_pbm, preference, medication_class' });
    return;
  }
  try {
    const prompt = buildAgentPrompt({ insurance_pbm, preference, medication_class });
    const conversation = await runAgentConversation(prompt);
    res.status(200).json({ conversation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}; 