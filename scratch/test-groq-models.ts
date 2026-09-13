import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey });

async function checkModels() {
  const models = await groq.models.list();
  console.log('Available models:', models.data.map(m => m.id));
}

checkModels().catch(console.error);
