/**
 * EnvLoader - Environment variable loading with multiple fallback locations
 * Based on a2s2 implementation - handles package usage from different directories
 */

import fs from 'fs';
import path from 'path';

export class EnvLoader {
  private static loaded = false;

  static load(): void {
    if (this.loaded) return;

    // Try loading from .env files in multiple locations
    const possibleEnvFiles = [
      ".env",
      ".env.local", 
      path.join(process.env.HOME || "~", ".keen.env"),
      // Also try parent directories for when installed as package
      path.join(process.cwd(), ".env"),
      path.join(process.cwd(), "../.env"),
      path.join(process.cwd(), "../../.env"),
    ];

    for (const envFile of possibleEnvFiles) {
      try {
        if (fs.existsSync(envFile)) {
          this.loadFromFile(envFile);
          console.debug(`Loaded environment variables from ${envFile}`);
        }
      } catch (error) {
        console.warn(`Failed to load ${envFile}:`, (error as Error).message);
      }
    }

    this.loaded = true;
  }

  private static loadFromFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            // Only set if not already set (don't override existing env vars)
            if (!process.env[key]) {
              const value = valueParts.join("=").replace(/^['"]|['"]$/g, ""); // Remove quotes
              process.env[key] = value;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse env file ${filePath}:`, (error as Error).message);
    }
  }

  static createGlobalEnvFile(): void {
    const envFile = path.join(process.env.HOME || "~", ".keen.env");
    
    if (fs.existsSync(envFile)) {
      console.log(`Global keen environment file already exists at ${envFile}`);
      return;
    }

    // Read the current .env file for template
    const localEnvFile = path.join(process.cwd(), ".env");
    let templateContent = "";
    
    try {
      if (fs.existsSync(localEnvFile)) {
        templateContent = fs.readFileSync(localEnvFile, "utf8");
      } else {
        // Minimal template if no local .env exists
        templateContent = `# Keen Platform Configuration
# Anthropic API Configuration
ANTHROPIC_API_KEY=your-api-key-here

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=keen_development
DB_USER=keen_user
DB_PASSWORD=secure_password

# Admin Configuration  
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin-password

# JWT Configuration
JWT_SECRET=your-jwt-secret-here
`;
      }
    } catch (error) {
      console.warn("Could not read template .env file:", (error as Error).message);
    }

    try {
      fs.writeFileSync(envFile, templateContent);
      console.log(`✅ Created global keen environment file at ${envFile}`);
      console.log(`Please edit this file to set your configuration.`);
    } catch (error) {
      console.error(`Failed to create global env file at ${envFile}:`, (error as Error).message);
    }
  }

  static getEnvFilePaths(): string[] {
    return [
      ".env",
      ".env.local", 
      path.join(process.env.HOME || "~", ".keen.env"),
      path.join(process.cwd(), "../../.env"),
    ];
  }
}