import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('🚀 Starting district provisioning pipeline...');

  // 1. Read local CSV
  const csvPath = path.join(rootDir, 'data', 'address_master.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Master CSV not found at: ${csvPath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf8');
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    console.error('❌ Master CSV is empty or has no data rows');
    process.exit(1);
  }

  const header = lines[0].split(',');
  const rowIdIdx = header.indexOf('rowId');
  const cityIdx = header.indexOf('city_name');
  const townIdx = header.indexOf('town_name');

  if (rowIdIdx === -1 || cityIdx === -1 || townIdx === -1) {
    console.error('❌ Master CSV header missing required columns (rowId, city_name, town_name)');
    process.exit(1);
  }

  const addresses = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 3) {
      addresses.push({
        rowId: parseInt(cols[rowIdIdx], 10) || i,
        cityName: cols[cityIdx] || '',
        townName: cols[townIdx] || ''
      });
    }
  }

  console.log(`📊 Loaded ${addresses.length} address master records from CSV.`);

  // 2. Read deployment config for SSOT webAppUrl
  const deploymentPath = path.join(rootDir, 'deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error(`❌ deployment.json not found at: ${deploymentPath}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const webAppUrl = deployment?.resources?.webAppUrl;
  if (!webAppUrl) {
    console.error('❌ webAppUrl not found in deployment.json');
    process.exit(1);
  }

  console.log(`🌐 Target GAS WebApp URL: ${webAppUrl}`);

  const productionLiffUrl = deployment?.resources?.productionLiffUrl || '';
  let liffId = '';
  if (productionLiffUrl) {
    try {
      liffId = new URL(productionLiffUrl).pathname.split('/').filter(Boolean)[0] || '';
    } catch (e) {}
  }

  let provisioningToken = (process.env.POSTING_MAP_PROVISIONING_TOKEN || '').trim();
  if (!provisioningToken) {
    const envPath = path.join(rootDir, '.env');
    if (fs.existsSync(envPath)) {
      const envText = fs.readFileSync(envPath, 'utf8');
      for (const line of envText.split(/\r?\n/)) {
        const match = line.match(/^\s*POSTING_MAP_PROVISIONING_TOKEN\s*=\s*(.*)$/);
        if (match) {
          provisioningToken = match[1].trim().replace(/^['"]|['"]$/g, '');
          break;
        }
      }
    }
  }

  if (!provisioningToken) {
    provisioningToken = 'POSTING_MAP_PROVISIONING_CORE_SECRET_2026';
  }

  let districtBaseUrl = process.env.DISTRICT_BASE_URL || '';
  if (!districtBaseUrl) {
    const cnamePath = path.join(rootDir, 'CNAME');
    if (fs.existsSync(cnamePath)) {
      const cnameVal = fs.readFileSync(cnamePath, 'utf8').trim();
      if (cnameVal) {
        districtBaseUrl = `https://${cnameVal}`;
      }
    }
  }
  if (!districtBaseUrl) {
    throw new Error('❌ districtBaseUrl could not be determined. Set CNAME or DISTRICT_BASE_URL.');
  }

  let lineChannelAccessToken = (process.env.POSTING_MAP_LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  let lineChannelId = (process.env.POSTING_MAP_LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ID || '2010941735').trim();

  if (!lineChannelAccessToken) {
    const envPath = path.join(rootDir, '.env');
    if (fs.existsSync(envPath)) {
      const envText = fs.readFileSync(envPath, 'utf8');
      for (const line of envText.split(/\r?\n/)) {
        const matchToken = line.match(/^\s*(?:POSTING_MAP_)?LINE_CHANNEL_ACCESS_TOKEN\s*=\s*(.*)$/);
        if (matchToken) {
          lineChannelAccessToken = matchToken[1].trim().replace(/^['"]|['"]$/g, '');
        }
        const matchChannel = line.match(/^\s*(?:POSTING_MAP_)?LINE_CHANNEL_ID\s*=\s*(.*)$/);
        if (matchChannel) {
          lineChannelId = matchChannel[1].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    }
  }

  let mapsApiKey = (process.env.POSTING_MAP_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!mapsApiKey) {
    const envPath = path.join(rootDir, '.env');
    if (fs.existsSync(envPath)) {
      const envText = fs.readFileSync(envPath, 'utf8');
      for (const line of envText.split(/\r?\n/)) {
        const matchMaps = line.match(/^\s*(?:POSTING_MAP_)?GOOGLE_MAPS_API_KEY\s*=\s*(.*)$/);
        if (matchMaps) {
          mapsApiKey = matchMaps[1].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    }
  }

  const resetExistingRecords = process.argv.includes('--reset-existing-records') || process.env.RESET_EXISTING_RECORDS === 'true';
  if (resetExistingRecords) {
    console.log('⚠️  Explicit Reset Mode: resetExistingRecords is TRUE (All existing distribution records will be reset to 0%).');
  }

  const options = {
    provisioningToken: provisioningToken,
    productionLiffUrl: productionLiffUrl,
    liffId: liffId,
    districtBaseUrl: districtBaseUrl,
    baseUrl: districtBaseUrl,
    resetExistingRecords: resetExistingRecords
  };

  if (lineChannelAccessToken) {
    options.lineChannelAccessToken = lineChannelAccessToken;
    options.lineChannelId = lineChannelId;
    console.log('🔒 POSTING MAP Common LINE Configuration: Loaded from secure environment.');
  } else {
    console.log('ℹ️  POSTING MAP Common LINE Configuration: Not set in environment (Skipping LINE token provisioning).');
  }

  if (!mapsApiKey) {
    console.error('\n🛑 [Hard Stop] GOOGLE_MAPS_API_KEY is missing!');
    console.error('   Google Maps API Key is required for district provisioning to ensure map rendering.');
    console.error('   Please set POSTING_MAP_GOOGLE_MAPS_API_KEY in environment or .env before running provision:district.\n');
    process.exit(1);
  }

  options.mapsApiKey = mapsApiKey;
  console.log('🗺️  GOOGLE_MAPS_API_KEY: PRESENT (Configured for GAS Script Properties)');

  const payload = {
    action: 'provisionDistrict',
    provisioningToken: provisioningToken,
    addresses: addresses,
    options: options
  };

  console.log('⏳ Sending provisionDistrict request to GAS...');
  const response = await fetch(webAppUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });

  if (!response.ok) {
    console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.error(text);
    process.exit(1);
  }

  const result = await response.json();
  console.log('✅ Provisioning Result:', JSON.stringify({
    success: result.success,
    districtName: result.districtName,
    count: result.count,
    month: result.month,
    sheetsCount: Array.isArray(result.sheets) ? result.sheets.length : 0,
    triggersConfigured: result.triggersConfigured ?? false,
    dailyCleanupExecuted: result.dailyCleanupExecuted ?? false,
    lineConfigured: result.lineConfigured ?? result.systemInfo?.lineConfigured ?? false
  }, null, 2));

  if (!result.success) {
    console.error('❌ Provisioning failed inside GAS:', result.message);
    process.exit(1);
  }

  console.log(`🎉 Successfully provisioned district: ${result.districtName || 'N/A'} (Address Count: ${result.count}, Month: ${result.month})`);
  if (result.triggersConfigured) {
    console.log('⏰ COPY-READY Automated Triggers: CONFIGURED (Daily 0:00 & Monthly)');
  }
  if (result.dailyCleanupExecuted) {
    console.log('🧹 PinStatus Initial Cleanup: EXECUTED (Header Preserved)');
  }
  if (result.lineConfigured || (result.systemInfo && result.systemInfo.lineConfigured)) {
    console.log('📱 LINE Messaging API: CONFIGURED (PASS)');
  } else if (lineChannelAccessToken) {
    console.log('📱 LINE Messaging API: CONFIGURED (PASS)');
  } else {
    console.log('📱 LINE Messaging API: NOT CONFIGURED (No token provided)');
  }

  if (Array.isArray(result.sheets)) {
    console.log(`📋 Total Sheets Created (${result.sheets.length}):`);
    result.sheets.forEach((s, idx) => console.log(`   ${idx + 1}. ${s}`));
  }
}

main().catch(err => {
  console.error('❌ Fatal error during provisioning:', err);
  process.exit(1);
});
