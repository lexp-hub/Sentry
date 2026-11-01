import assert from 'assert';
import { YapinAutoMod } from '../src/modules/yapinAutoMod.js';
import { YapinEconomy } from '../src/modules/yapinEconomy.js';
import { YapinFishing } from '../src/modules/yapinFishing.js';
import { YapinBlackjack } from '../src/modules/yapinBlackjack.js';
import { YapinLeveling } from '../src/modules/yapinLeveling.js';
import { YapinMinigames } from '../src/modules/yapinMinigames.js';
import { YapinLiveStats } from '../src/modules/yapinLiveStats.js';
import { DatabaseHelper } from '../../src/database/db.js';

console.log('🧪 Starting Yapin Sentry Test Suite...\n');

// Mock helper to build a fake context
function createMockCtx(userId = 'user_test_999', serverId = 'server_test_888', channelId = 'channel_test_777', argv = [], content = '') {
  let repliedText = '';
  let repliedEmbeds = [];
  let repliedComponents = [];
  
  const ctx = {
    user_id: userId,
    author_id: userId,
    server_id: serverId,
    channel_id: channelId,
    content: content || argv.join(' '),
    argv: argv,
    reply: async (text, opts = {}) => {
      repliedText = text;
      repliedEmbeds = opts.embeds || [];
      repliedComponents = opts.components || [];
      return { id: 'msg_reply_123', content: text, embeds: repliedEmbeds, components: repliedComponents };
    },
    say: async (text, opts = {}) => {
      repliedText = text;
      return { id: 'msg_say_123', content: text };
    },
    getReply: () => ({ text: repliedText, embeds: repliedEmbeds, components: repliedComponents })
  };

  const getContextData = () => ({
    msg: ctx,
    serverId: ctx.server_id,
    channelId: ctx.channel_id,
    authorId: ctx.author_id,
    content: ctx.content,
    argv: ctx.argv,
    args: ctx.argv.join(' ')
  });

  return { ctx, getContextData };
}

async function runTests() {
  const guildKey = 'yapin_server_test_888';
  const testUser = 'user_test_999';

  // 1. TEST ECONOMY
  console.log('1️⃣ Testing YapinEconomy...');
  {
    const { ctx, getContextData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777');
    await YapinEconomy.handleBalance(ctx, getContextData);
    let reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'Economy handleBalance should produce an embed');
    assert(reply.embeds[0].data.title.includes('Portafoglio'), 'Embed should mention Portafoglio');

    // Daily claim
    await YapinEconomy.handleDaily(ctx, getContextData);
    reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleDaily should produce an embed');

    // Pay
    const { ctx: payCtx, getContextData: payData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777', ['user_target_111', '50']);
    await YapinEconomy.handlePay(payCtx, payData);
    reply = payCtx.getReply();
    assert(reply.embeds.length > 0, 'handlePay should produce an embed');
    console.log('   ✅ YapinEconomy tests passed!');
  }

  // 2. TEST FISHING
  console.log('\n2️⃣ Testing YapinFishing...');
  {
    const { ctx, getContextData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777');
    await YapinFishing.handleFish(ctx, getContextData);
    let reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleFish should produce an embed');

    await YapinFishing.handleInventory(ctx, getContextData);
    reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleInventory should produce an embed');

    await YapinFishing.handleUpgrade(ctx, getContextData);
    reply = ctx.getReply();
    assert(reply.embeds.length > 0 || reply.text.length > 0, 'handleUpgrade should respond');
    console.log('   ✅ YapinFishing tests passed!');
  }

  // 3. TEST BLACKJACK
  console.log('\n3️⃣ Testing YapinBlackjack...');
  {
    const { ctx, getContextData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777', ['10']);
    await YapinBlackjack.handleBlackjack(ctx, getContextData);
    let reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleBlackjack should produce an embed');
    console.log('   ✅ YapinBlackjack start passed!');
  }

  // 4. TEST LEVELING & XP
  console.log('\n4️⃣ Testing YapinLeveling...');
  {
    const mockMsg = {
      author_id: testUser,
      server_id: 'server_test_888',
      channel_id: 'channel_test_777',
      content: 'Questo è un messaggio di test per guadagnare XP!'
    };
    const fakeBot = {
      channels: async () => [{ id: 'channel_test_777' }],
      sendEmbed: async () => {}
    };
    await YapinLeveling.handleIncomingMessage(fakeBot, mockMsg);
    
    const { ctx, getContextData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777');
    await YapinLeveling.handleRank(ctx, getContextData);
    let reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleRank should produce an embed');

    await YapinLeveling.handleLeaderboard(ctx, getContextData);
    reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleLeaderboard should produce an embed');
    console.log('   ✅ YapinLeveling tests passed!');
  }

  // 5. TEST AUTOMOD
  console.log('\n5️⃣ Testing YapinAutoMod...');
  {
    const cleanMsg = {
      id: 'msg_clean',
      author_id: 'regular_user',
      server_id: 'server_test_888',
      channel_id: 'channel_test_777',
      content: 'Ciao a tutti, benvenuti su Yapin!'
    };
    const fakeBot = {
      delete: async () => true,
      send: async () => true,
      timeout: async () => true
    };
    const flaggedClean = await YapinAutoMod.handleMessage(fakeBot, cleanMsg);
    assert.strictEqual(flaggedClean, false, 'Clean message should not be flagged');

    const badMsg = {
      id: 'msg_bad',
      author_id: 'spammer_user',
      server_id: 'server_test_888',
      channel_id: 'channel_test_777',
      content: 'Unisciti al nostro discord.gg/fake123 server adesso!'
    };
    const flaggedBad = await YapinAutoMod.handleMessage(fakeBot, badMsg);
    assert.strictEqual(flaggedBad, true, 'Discord invite should be flagged');
    console.log('   ✅ YapinAutoMod tests passed!');
  }

  // 6. TEST MINIGAMES
  console.log('\n6️⃣ Testing YapinMinigames...');
  {
    const { ctx: coinCtx, getContextData: coinData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777', ['heads', '10']);
    await YapinMinigames.handleCoinflip(coinCtx, coinData);
    let reply = coinCtx.getReply();
    assert(reply.embeds.length > 0, 'handleCoinflip should return an embed');

    const { ctx: diceCtx, getContextData: diceData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777', ['20']);
    await YapinMinigames.handleDice(diceCtx, diceData);
    reply = diceCtx.getReply();
    assert(reply.embeds.length > 0, 'handleDice should return an embed');

    const { ctx: countCtx, getContextData: countData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777', ['1']);
    await YapinMinigames.handleCount(countCtx, countData);
    console.log('   ✅ YapinMinigames tests passed!');
  }

  // 7. TEST LIVESTATS
  console.log('\n7️⃣ Testing YapinLiveStats...');
  {
    const fakeBot = {
      memberCounts: async () => ({ member_count: 42, online_count: 15 }),
      server: async () => ({ name: 'Realm of Heroes', description: 'Exclusive Yapin Realm' }),
      channels: async () => [
        { id: 'c1', name: 'generale', kind: 'text' },
        { id: 'c2', name: 'vocal-e2ee', kind: 'voice' }
      ],
      roles: async () => [{ id: 'r1', name: 'Admin' }]
    };
    const { ctx, getContextData } = createMockCtx(testUser, 'server_test_888', 'channel_test_777');
    await YapinLiveStats.handleLiveCount(fakeBot, ctx, getContextData);
    let reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleLiveCount should return an embed');

    await YapinLiveStats.handleRealmOverview(fakeBot, ctx, getContextData);
    reply = ctx.getReply();
    assert(reply.embeds.length > 0, 'handleRealmOverview should return an embed');
    console.log('   ✅ YapinLiveStats tests passed!');
  }

  // 8. TEST AI PROMPT EMPTY
  console.log('\n8️⃣ Testing YapinAI empty prompt check...');
  {
    const { YapinAI } = await import('../src/modules/yapinAI.js');
    const { ctx } = createMockCtx(testUser, 'server_test_888', 'channel_test_777');
    await YapinAI.handleQuery(ctx, '');
    const reply = ctx.getReply();
    assert(reply.text.includes('Chiedimi qualsiasi cosa'), 'Empty prompt should return advice');
    console.log('   ✅ YapinAI validation passed!');
  }

  console.log('\n🎉 ALL YAPIN UNIT TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
