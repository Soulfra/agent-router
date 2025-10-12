// This will later take multiple responses and rank or compare them
function argue(responses) {
  return responses.map((r, i) => ({ agent: r.agent, confidence: Math.random() }));
}

module.exports = { argue };
