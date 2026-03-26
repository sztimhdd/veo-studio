/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

/**
 * AIService handles the initialization of the Google GenAI SDK.
 * It ensures the API key is retrieved from the correct environment variable
 * and provides a centralized client instance.
 */
class AIService {
  private _client: GoogleGenAI | null = null;

  /**
   * Returns the GoogleGenAI client. 
   * Initializes it lazily on first access.
   */
  get client(): GoogleGenAI {
    if (this._client) return this._client;

    // In Vite, VITE_* env vars are inlined at build time via import.meta.env.
    // Fallback to process.env (defined in vite.config.ts define block) for Docker builds
    // where .env files are excluded via .dockerignore.
    const apiKey =
      import.meta.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY;

    if (!apiKey) {
      const errorMsg = 'Google API Key not found. Ensure GEMINI_API_KEY is set in GitHub Secrets.';
      console.error(`[AIService] ${errorMsg}`);
      // Throwing here will be caught by the pipeline's error handling
      throw new Error(errorMsg);
    }

    console.log('[AIService] Initializing GoogleGenAI SDK...');
    this._client = new GoogleGenAI({ apiKey });
    return this._client;
  }
}

export const aiService = new AIService();
