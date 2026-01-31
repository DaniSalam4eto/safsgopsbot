const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const BOT_TOKEN = '';

const GUILD_ID = '1321492497494577203';
const ROLE_IDS = {
  arff: '1322056228792303743',
  const: '1322056287780999229',
  construction: '1322056287780999229',
  airside: '1322056343720431698',
  tech: '1326591796406653049',
  technical: '1326591796406653049'
};

const GUILD_ID_SECONDARY = '726482823321747636';
const ROLE_IDS_SECONDARY = {
  arff: '1325139889783574639',
  const: '1325140030947332147',
  construction: '1325140030947332147',
  airside: '1325140245615743006',
  tech: '1326540339321897003',
  technical: '1326540339321897003'
};

const TEST_TO_ROLE = {
  'safs': 'airside',
  'safs_aol': 'airside',
  'default': 'airside',
  'swissport_arff': 'arff',
  'swissport_construction': 'const',
  'swissport_technical': 'tech',
  'dnata_arff': 'arff',
  'dnata_construction': 'const',
  'dnata_technical': 'tech',
  'dnata_aol': 'airside',
  'menzies_arff': 'arff',
  'menzies_construction': 'const',
  'menzies_technical': 'tech',
  'menzies_aol': 'airside'
};

const API_PORT = process.env.PORT || 3001;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log(`📡 Bot is in ${client.guilds.cache.size} servers`);

  client.guilds.cache.forEach(guild => {
    console.log(`   - ${guild.name} (ID: ${guild.id})`);
  });
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: client.user ? client.user.tag : 'Not connected',
    uptime: process.uptime()
  });
});

app.post('/assign-role', async (req, res) => {
  try {
    const { userId, testType, score } = req.body;

    console.log(`\n📥 Role assignment request received:`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Test Type: ${testType}`);
    console.log(`   Score: ${score}%`);

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    if (!testType) {
      return res.status(400).json({ error: 'Missing testType' });
    }

    if (score < 80) {
      return res.status(400).json({ error: 'Score too low - must be 80% or higher to receive role' });
    }

    const roleKey = TEST_TO_ROLE[testType.toLowerCase()] || TEST_TO_ROLE['default'];
    const roleIdPrimary = ROLE_IDS[roleKey];
    const roleIdSecondary = ROLE_IDS_SECONDARY[roleKey];

    if (!roleIdPrimary) {
      return res.status(400).json({ error: `Unknown test type: ${testType}` });
    }

    console.log(`   Role to assign: ${roleKey} (primary: ${roleIdPrimary}, secondary: ${roleIdSecondary || 'n/a'})`);

    const reason = `Passed ${testType} test with score ${score}%`;
    const headers = {
      'Authorization': `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Audit-Log-Reason': reason
    };

    try {
      const urlPrimary = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleIdPrimary}`;
      const resPrimary = await fetch(urlPrimary, { method: 'PUT', headers });

      if (resPrimary.status === 204 || resPrimary.status === 201) {
        console.log(`✅ Successfully assigned ${roleKey} role to user ${userId} (primary)`);
        return res.json({
          success: true,
          message: `Successfully assigned ${roleKey} role`,
          role: roleKey,
          userId: userId
        });
      }

      if (resPrimary.status === 403) {
        const errText = await resPrimary.text();
        console.error(`❌ Permission denied (primary):`, errText);
        return res.status(403).json({ error: 'Bot lacks permission (check role hierarchy)' });
      }

      if (resPrimary.status === 404 && roleIdSecondary) {
        const urlSecondary = `https://discord.com/api/v10/guilds/${GUILD_ID_SECONDARY}/members/${userId}/roles/${roleIdSecondary}`;
        const resSecondary = await fetch(urlSecondary, { method: 'PUT', headers });

        if (resSecondary.status === 204 || resSecondary.status === 201) {
          console.log(`✅ Successfully assigned ${roleKey} role to user ${userId} (secondary)`);
          return res.json({
            success: true,
            message: `Successfully assigned ${roleKey} role (secondary server)`,
            role: roleKey,
            userId: userId
          });
        }
        if (resSecondary.status === 404) {
          console.error(`❌ User ${userId} not found in either guild`);
          return res.status(404).json({ error: 'User not found in either Discord server - join one of them first' });
        }
        if (resSecondary.status === 403) {
          return res.status(403).json({ error: 'Bot lacks permission on secondary server (check role hierarchy)' });
        }
        const errText2 = await resSecondary.text();
        console.error(`❌ Discord API error (secondary) ${resSecondary.status}:`, errText2);
        return res.status(500).json({ error: 'Failed to assign role on secondary server', details: errText2 });
      }

      if (resPrimary.status === 404) {
        console.error(`❌ User ${userId} not found in guild (user must be in the server)`);
        return res.status(404).json({ error: 'User not found in the Discord server' });
      }

      const errText = await resPrimary.text();
      console.error(`❌ Discord API error ${resPrimary.status}:`, errText);
      return res.status(500).json({ error: 'Failed to assign role', details: errText });
    } catch (roleError) {
      console.error(`❌ Failed to assign role:`, roleError.message);
      return res.status(500).json({ error: 'Failed to assign role', details: roleError.message });
    }

  } catch (error) {
    console.error('❌ Error processing request:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/roles', (req, res) => {
  res.json({
    primary: { guildId: GUILD_ID, roleIds: ROLE_IDS },
    secondary: { guildId: GUILD_ID_SECONDARY, roleIds: ROLE_IDS_SECONDARY },
    testMapping: TEST_TO_ROLE
  });
});

async function start() {
  console.log('🚀 Starting GOPS Test Discord Bot...\n');

  if (GUILD_ID === 'YOUR_GUILD_ID_HERE') {
    console.warn('⚠️  WARNING: GUILD_ID is not configured!');
    console.warn('   Edit index.js and set GUILD_ID to your Discord server ID\n');
  }

  app.listen(API_PORT, () => {
    console.log(`🌐 HTTP API running on port ${API_PORT}`);
    console.log(`   POST /assign-role - Assign a role to a user`);
    console.log(`   GET /health - Health check`);
    console.log(`   GET /roles - List role configuration\n`);
  });

  try {
    await client.login(BOT_TOKEN);
  } catch (loginError) {
    console.error('❌ Failed to login to Discord:', loginError.message);
    console.error('   Make sure the bot token is correct');
    process.exit(1);
  }
}

start();
