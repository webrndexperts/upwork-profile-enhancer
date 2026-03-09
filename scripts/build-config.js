// scripts/build-config.js
// Build script to generate environment-specific configuration
// ─────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';

const ENVIRONMENTS = {
  development: 'config.local.js',
  staging: 'config.staging.js',
  production: 'config.js'
};

function buildConfig(env = 'production') {
  const configFile = ENVIRONMENTS[env];
  
  if (!configFile) {
    throw new Error(`Unknown environment: ${env}`);
  }
  
  const configPath = path.join(process.cwd(), 'config', configFile);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  
  // Read and validate config
  const configContent = fs.readFileSync(configPath, 'utf8');
  
  // Generate final config file
  const outputPath = path.join(process.cwd(), 'config', 'generated-config.js');
  const outputContent = `
// Auto-generated configuration for ${env} environment
// Generated at: ${new Date().toISOString()}
// ─────────────────────────────────────────────────────────────

${configContent.replace('export const CONFIG', 'export const GENERATED_CONFIG')}
`;
  
  fs.writeFileSync(outputPath, outputContent);
  console.log(`✅ Generated ${env} configuration: ${outputPath}`);
  
  return outputPath;
}

// CLI usage
if (process.argv[2]) {
  buildConfig(process.argv[2]);
}

export { buildConfig };
