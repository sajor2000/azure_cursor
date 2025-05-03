require('dotenv').config();
const { AIProjectsClient } = require('@azure/ai-projects');
const { DefaultAzureCredential } = require('@azure/identity');

async function testAzureConnection() {
  const connectionString = process.env["AZURE_AI_PROJECTS_CONNECTION_STRING"];
  if (!connectionString) {
    throw new Error("AZURE_AI_PROJECTS_CONNECTION_STRING must be set.");
  }
  const client = AIProjectsClient.fromConnectionString(
    connectionString,
    new DefaultAzureCredential()
  );
  try {
    // Try to list agents as a simple test
    const agents = await client.agents.listAgents();
    console.log("Azure connection successful. Agents:", agents.data.map(a => a.name));
  } catch (err) {
    console.error("Azure connection failed:", err.message);
  }
}

testAzureConnection(); 