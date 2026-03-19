const { createDb } = require('./packages/db/dist/client.js');
const { agents } = require('./packages/db/dist/schema/index.js');
const { eq } = require('drizzle-orm');

const agentId = '5d16319f-e026-462b-bb1e-72cc5d9a8cef';

async function recoverCEO() {
  const dbUrl = process.env.DATABASE_URL || 'postgres://paperclip:paperclip@127.0.0.1:54329/paperclip';
  const db = createDb(dbUrl);
  
  console.log('🔍 Looking up CEO agent:', agentId);
  
  const current = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  
  if (!current.length) {
    console.error('❌ Agent not found');
    process.exit(1);
  }
  
  const agent = current[0];
  console.log(`\n📋 Current state:`);
  console.log(`   Name: ${agent.name}`);
  console.log(`   Role: ${agent.role}`);
  console.log(`   Status: ${agent.status}`);
  
  if (agent.status !== 'terminated') {
    console.log(`\n✓ Agent is not terminated. No recovery needed.`);
    process.exit(0);
  }
  
  console.log(`\n⚙️  Restoring agent...`);
  
  const restored = await db
    .update(agents)
    .set({ status: 'idle', updatedAt: new Date() })
    .where(eq(agents.id, agentId))
    .returning();
  
  if (restored.length) {
    console.log(`✅ CEO recovered successfully!`);
    console.log(`   New status: ${restored[0].status}`);
    console.log(`   Updated at: ${restored[0].updatedAt}`);
  } else {
    console.error('❌ Recovery failed - no rows updated');
    process.exit(1);
  }
}

recoverCEO().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
