const Anthropic = require('@anthropic-ai/sdk');

console.log('Testing SDK...');

try {
  const client = new Anthropic({ 
    apiKey: process.env.ANTHROPIC_API_KEY 
  });
  
  console.log('Client created successfully');
  console.log('client.beta exists:', !!client.beta);
  
  if (client.beta) {
    console.log('client.beta.messages exists:', !!client.beta.messages);
    if (client.beta.messages) {
      console.log('client.beta.messages.create type:', typeof client.beta.messages.create);
    }
  } else {
    console.log('No beta API found');
  }
  
  console.log('client.messages exists:', !!client.messages);
  if (client.messages) {
    console.log('client.messages.create type:', typeof client.messages.create);
  }
  
} catch (error) {
  console.error('Error:', error.message);
}
